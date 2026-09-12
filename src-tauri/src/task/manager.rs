//! 任务队列与状态机（DESIGN §8.1/§8.2）。
//!
//! M0 提供可复用骨架：提交 / 取消 / 快照 / 事件推送。ffmpeg 子进程接入在 M1。

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Emitter;

use crate::{TaskSnapshot, TaskStatus};

/// 任务作业：执行期间通过 [`TaskContext`] 上报进度、检查取消、登记产物。
pub type Job = Box<dyn FnOnce(&TaskContext) -> Result<(), String> + Send>;

/// 事件推送抽象：生产环境发 Tauri 事件，测试环境收集断言。
pub trait EventSink: Send + Sync {
    fn emit_status(&self, payload: &StatusPayload);
    fn emit_progress(&self, payload: &ProgressPayload);
}

/// `task-status` 事件负载（DESIGN §5.4）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusPayload {
    pub task_id: String,
    pub status: TaskStatus,
    pub error: Option<String>,
    pub outputs: Vec<String>,
}

/// `task-progress` 事件负载（DESIGN §5.4）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub task_id: String,
    pub percent: f64,
    pub speed: Option<String>,
    pub eta_seconds: Option<f64>,
}

/// Tauri 事件通道实现。
#[allow(dead_code)] // M1 起由各 submit 命令构造
pub struct TauriEmitter(pub tauri::AppHandle);

impl EventSink for TauriEmitter {
    fn emit_status(&self, payload: &StatusPayload) {
        let _ = self.0.emit("task-status", payload);
    }
    fn emit_progress(&self, payload: &ProgressPayload) {
        let _ = self.0.emit("task-progress", payload);
    }
}

/// 任务句柄：状态与控制的单一事实来源。
pub struct TaskHandle {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub status: Mutex<TaskStatus>,
    pub progress: Mutex<Option<f64>>,
    pub error: Mutex<Option<String>>,
    pub outputs: Mutex<Vec<String>>,
    pub cancelled: AtomicBool,
}

impl TaskHandle {
    fn snapshot(&self) -> TaskSnapshot {
        TaskSnapshot {
            id: self.id.clone(),
            kind: self.kind.clone(),
            label: self.label.clone(),
            status: *self.status.lock().unwrap(),
            progress: *self.progress.lock().unwrap(),
            error: self.error.lock().unwrap().clone(),
            outputs: self.outputs.lock().unwrap().clone(),
        }
    }
}

/// 任务执行上下文：作业通过它上报进度、检查取消、登记产物。
pub struct TaskContext {
    pub handle: Arc<TaskHandle>,
    sink: Arc<dyn EventSink>,
}

impl TaskContext {
    pub(crate) fn new(handle: Arc<TaskHandle>, sink: Arc<dyn EventSink>) -> Self {
        Self { handle, sink }
    }

    pub fn is_cancelled(&self) -> bool {
        self.handle.cancelled.load(Ordering::Relaxed)
    }

    /// 上报进度（0.0~1.0）。节流约 200ms，由作业侧负责（DESIGN §5.4）。
    pub fn set_progress(&self, percent: f64) {
        let p = percent.clamp(0.0, 1.0);
        *self.handle.progress.lock().unwrap() = Some(p);
        self.sink.emit_progress(&ProgressPayload {
            task_id: self.handle.id.clone(),
            percent: p,
            speed: None,
            eta_seconds: None,
        });
    }

    /// 登记成功产物路径，任务完成后展示给用户。
    #[allow(dead_code)] // M1 起由各任务作业调用
    pub fn add_output(&self, path: String) {
        self.handle.outputs.lock().unwrap().push(path);
    }

    pub(crate) fn emit_status(&self) {
        let handle = &self.handle;
        self.sink.emit_status(&StatusPayload {
            task_id: handle.id.clone(),
            status: *handle.status.lock().unwrap(),
            error: handle.error.lock().unwrap().clone(),
            outputs: handle.outputs.lock().unwrap().clone(),
        });
    }
}

struct TaskEntry {
    handle: Arc<TaskHandle>,
    sink: Arc<dyn EventSink>,
}

struct Inner {
    tasks: HashMap<String, TaskEntry>,
    order: Vec<String>,
    queue: VecDeque<(String, Job)>,
    running: usize,
}

pub(crate) struct Shared {
    inner: Mutex<Inner>,
    cv: Condvar,
    max_concurrent: usize,
}

impl Shared {
    /// 作业线程收尾：归还并发配额并唤醒调度器。
    pub(crate) fn task_finished(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.running -= 1;
        drop(inner);
        self.cv.notify_all();
    }
}

pub struct TaskManager {
    shared: Arc<Shared>,
    seq: AtomicU64,
}

impl TaskManager {
    pub fn new(max_concurrent: usize) -> Self {
        let shared = Arc::new(Shared {
            inner: Mutex::new(Inner {
                tasks: HashMap::new(),
                order: Vec::new(),
                queue: VecDeque::new(),
                running: 0,
            }),
            cv: Condvar::new(),
            max_concurrent,
        });
        std::thread::Builder::new()
            .name("task-scheduler".into())
            .spawn({
                let shared = shared.clone();
                move || scheduler_loop(shared)
            })
            .expect("启动任务调度线程失败");
        Self {
            shared,
            seq: AtomicU64::new(0),
        }
    }

    /// 提交任务：立即返回 TaskId，作业由调度线程在并发配额内执行（DESIGN §8.2）。
    #[allow(dead_code)] // M1 起由 commands/cut.rs 等调用
    pub fn submit(&self, sink: Arc<dyn EventSink>, kind: &str, label: &str, job: Job) -> String {
        let id = self.next_id();
        let handle = Arc::new(TaskHandle {
            id: id.clone(),
            kind: kind.to_string(),
            label: label.to_string(),
            status: Mutex::new(TaskStatus::Pending),
            progress: Mutex::new(None),
            error: Mutex::new(None),
            outputs: Mutex::new(Vec::new()),
            cancelled: AtomicBool::new(false),
        });
        let mut inner = self.shared.inner.lock().unwrap();
        inner.order.push(id.clone());
        inner.tasks.insert(
            id.clone(),
            TaskEntry {
                handle: handle.clone(),
                sink: sink.clone(),
            },
        );
        inner.queue.push_back((id.clone(), job));
        drop(inner);
        TaskContext::new(handle, sink).emit_status();
        self.shared.cv.notify_all();
        id
    }

    /// 取消任务：排队中直接置 Cancelled；运行中置标记，由作业侧响应（DESIGN §8.2）。
    #[allow(dead_code)]
    pub fn cancel(&self, id: &str) -> bool {
        let mut inner = self.shared.inner.lock().unwrap();
        let Some(entry) = inner.tasks.get(id) else {
            return false;
        };
        let handle = entry.handle.clone();
        let sink = entry.sink.clone();
        handle.cancelled.store(true, Ordering::Relaxed);
        if *handle.status.lock().unwrap() == TaskStatus::Pending {
            *handle.status.lock().unwrap() = TaskStatus::Cancelled;
            inner.queue.retain(|(qid, _)| qid != id);
            drop(inner);
            TaskContext::new(handle, sink).emit_status();
        }
        true
    }

    pub fn snapshot(&self) -> Vec<TaskSnapshot> {
        let inner = self.shared.inner.lock().unwrap();
        inner
            .order
            .iter()
            .filter_map(|id| inner.tasks.get(id).map(|e| e.handle.snapshot()))
            .collect()
    }

    fn next_id(&self) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let seq = self.seq.fetch_add(1, Ordering::Relaxed);
        format!("t{nanos:x}{seq:02x}")
    }
}

fn scheduler_loop(shared: Arc<Shared>) {
    loop {
        let (id, handle, sink, job) = {
            let mut inner = shared.inner.lock().unwrap();
            loop {
                // 排队期间被取消的任务直接出队丢弃，不占用并发配额
                if let Some(pos) = inner.queue.iter().position(|(id, _)| {
                    inner
                        .tasks
                        .get(id)
                        .is_some_and(|e| e.handle.cancelled.load(Ordering::Relaxed))
                }) {
                    inner.queue.remove(pos);
                    continue;
                }
                if inner.running < shared.max_concurrent {
                    if let Some((id, job)) = inner.queue.pop_front() {
                        if let Some(entry) = inner.tasks.get(&id) {
                            let handle = entry.handle.clone();
                            let sink = entry.sink.clone();
                            inner.running += 1;
                            break (id, handle, sink, job);
                        }
                    }
                }
                inner = shared.cv.wait(inner).unwrap();
            }
        };
        let s2 = shared.clone();
        std::thread::Builder::new()
            .name(format!("task-{id}"))
            .spawn(move || crate::task::worker::run(s2, handle, sink, job))
            .expect("启动任务线程失败");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[derive(Default)]
    struct CollectSink {
        statuses: Mutex<Vec<(String, TaskStatus)>>,
    }

    impl EventSink for CollectSink {
        fn emit_status(&self, p: &StatusPayload) {
            self.statuses
                .lock()
                .unwrap()
                .push((p.task_id.clone(), p.status));
        }
        fn emit_progress(&self, _: &ProgressPayload) {}
    }

    fn wait_terminal(mgr: &TaskManager, ids: &[&str], timeout: Duration) -> Vec<TaskSnapshot> {
        let start = Instant::now();
        loop {
            let snaps = mgr.snapshot();
            let all_done = ids.iter().all(|id| {
                snaps.iter().find(|s| s.id == **id).is_some_and(|s| {
                    matches!(
                        s.status,
                        TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled
                    )
                })
            });
            if all_done {
                return snaps;
            }
            assert!(start.elapsed() < timeout, "任务未在时限内结束");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn tasks_run_and_reach_final_status() {
        let mgr = TaskManager::new(1);
        let sink: Arc<dyn EventSink> = Arc::new(CollectSink::default());
        let id1 = mgr.submit(
            sink.clone(),
            "test",
            "成功",
            Box::new(|ctx| {
                ctx.set_progress(0.5);
                Ok(())
            }),
        );
        let id2 = mgr.submit(sink, "test", "失败", Box::new(|_ctx| Err("boom".into())));

        let snaps = wait_terminal(&mgr, &[&id1, &id2], Duration::from_secs(5));
        let s1 = snaps.iter().find(|s| s.id == id1).unwrap();
        let s2 = snaps.iter().find(|s| s.id == id2).unwrap();
        assert_eq!(s1.status, TaskStatus::Completed);
        assert_eq!(s1.progress, Some(0.5));
        assert_eq!(s2.status, TaskStatus::Failed);
        assert_eq!(s2.error.as_deref(), Some("boom"));
    }

    #[test]
    fn running_task_can_be_cancelled() {
        let mgr = TaskManager::new(2);
        let sink: Arc<dyn EventSink> = Arc::new(CollectSink::default());
        let id = mgr.submit(
            sink,
            "test",
            "长任务",
            Box::new(|ctx| {
                let start = Instant::now();
                while !ctx.is_cancelled() && start.elapsed() < Duration::from_secs(5) {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Ok(())
            }),
        );

        // 等待任务进入 Running 再取消
        let start = Instant::now();
        loop {
            let s = mgr.snapshot().into_iter().find(|s| s.id == id).unwrap();
            if s.status == TaskStatus::Running || start.elapsed() > Duration::from_secs(5) {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(mgr.cancel(&id));

        let snaps = wait_terminal(&mgr, &[&id], Duration::from_secs(5));
        assert_eq!(
            snaps.iter().find(|s| s.id == id).unwrap().status,
            TaskStatus::Cancelled
        );
    }
}
