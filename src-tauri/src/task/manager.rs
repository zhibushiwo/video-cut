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

/// 立即终止任务的后台动作（如 kill ffmpeg 子进程），cancel 时触发。
pub type Killer = Box<dyn FnOnce() + Send>;

/// 任务级终态清理钩子（R1-3）：收到任务 ID，在任务到达终态后**只执行一次**。
/// 由执行器（完成/失败）与 `cancel`（排队中取消）两侧兜底调用——后者不执行作业体，
/// 提交方写在作业体里的簿记回收会被整体跳过，故必须由任务系统统一触发。
pub type Cleanup = Box<dyn FnOnce(&str) + Send>;

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
    killer: Mutex<Option<Killer>>,
    /// 提交时间（unix ms，供 [`crate::history::HistoryEntry`] 使用）。
    pub(crate) created_at: u64,
    /// 开始执行时间（unix ms）；0 = 尚未开始（排队即被取消）。
    pub(crate) started_at: Mutex<u64>,
    /// 终态防重标记：取消与执行器可能并发到达终态，历史只记首次。
    terminal_recorded: AtomicBool,
}

impl TaskHandle {
    /// 任务结束（正常/失败/取消）后清空 killer，避免残留闭包。
    pub(crate) fn clear_killer(&self) {
        *self.killer.lock().unwrap() = None;
    }

    /// 首次到达终态时返回 true（并发到达时只有一个赢家）。
    pub(crate) fn mark_terminal(&self) -> bool {
        self.terminal_recorded
            .compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed)
            .is_ok()
    }
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

    /// 注册立即终止手段（kill 子进程）。运行中任务被取消时由 cancel() 触发。
    pub fn set_killer(&self, killer: crate::task::manager::Killer) {
        *self.handle.killer.lock().unwrap() = Some(killer);
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
    /// 终态清理钩子，执行前 take 走（幂等）。
    cleanup: Option<Cleanup>,
}

/// 终态回调：历史记录等订阅者经此接入，任务模块保持与 Tauri 解耦。
pub(crate) type OnTerminal = Box<dyn Fn(&TaskHandle) + Send + Sync>;

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
    on_terminal: Mutex<Option<OnTerminal>>,
}

impl Shared {
    /// 作业线程收尾：归还并发配额并唤醒调度器。
    pub(crate) fn task_finished(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.running -= 1;
        drop(inner);
        self.cv.notify_all();
    }

    /// 执行并消费任务的终态清理钩子（幂等：只有第一个调用者拿到闭包）。
    pub(crate) fn run_cleanup(&self, id: &str) {
        let cb = {
            let mut inner = self.inner.lock().unwrap();
            inner.tasks.get_mut(id).and_then(|e| e.cleanup.take())
        };
        if let Some(cb) = cb {
            cb(id);
        }
    }

    /// 终态落历史：仅首次到达生效（防取消与执行器并发双记）。
    pub(crate) fn record_terminal(&self, handle: &TaskHandle) {
        if !handle.mark_terminal() {
            return;
        }
        // 终态全量入日志（DESIGN §12.1）：成功记输出与耗时，失败记 stderr 尾部全文
        let status = *handle.status.lock().unwrap();
        let started = *handle.started_at.lock().unwrap();
        let elapsed = if started > 0 {
            format!("{}s", (crate::history::now_ms() - started) / 1000)
        } else {
            "未执行".into()
        };
        match status {
            TaskStatus::Completed => {
                log::info!(
                    "任务完成（耗时 {elapsed}）：{}，输出：{:?}",
                    handle.label,
                    handle.outputs.lock().unwrap()
                );
            }
            TaskStatus::Failed => {
                log::error!(
                    "任务失败（{elapsed}）：{}：{}",
                    handle.label,
                    handle.error.lock().unwrap().as_deref().unwrap_or("未知错误")
                );
            }
            TaskStatus::Cancelled => {
                log::info!("任务取消：{}", handle.label);
            }
            _ => {}
        }
        if let Some(cb) = self.on_terminal.lock().unwrap().as_ref() {
            cb(handle);
        }
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
            on_terminal: Mutex::new(None),
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

    /// 注册终态回调（历史记录）：须在提交任何任务前调用（App setup 阶段）。
    pub fn set_on_terminal(&self, cb: OnTerminal) {
        *self.shared.on_terminal.lock().unwrap() = Some(cb);
    }

    /// 提交任务：立即返回 TaskId，作业由调度线程在并发配额内执行（DESIGN §8.2）。
    #[allow(dead_code)] // M1 起由 commands/cut.rs 等调用
    pub fn submit(&self, sink: Arc<dyn EventSink>, kind: &str, label: &str, job: Job) -> String {
        self.submit_with_cleanup(sink, kind, label, job, Box::new(|_| {}))
    }

    /// 带清理钩子的提交（R1-3）：需要回收簿记（如同源代理去重表条目）的调用方用此入口，
    /// 保证「排队中被取消」也能回收——该路径不执行作业体。
    pub fn submit_with_cleanup(
        &self,
        sink: Arc<dyn EventSink>,
        kind: &str,
        label: &str,
        job: Job,
        cleanup: Cleanup,
    ) -> String {
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
            killer: Mutex::new(None),
            created_at: crate::history::now_ms(),
            started_at: Mutex::new(0),
            terminal_recorded: AtomicBool::new(false),
        });
        let mut inner = self.shared.inner.lock().unwrap();
        inner.order.push(id.clone());
        inner.tasks.insert(
            id.clone(),
            TaskEntry {
                handle: handle.clone(),
                sink: sink.clone(),
                cleanup: Some(cleanup),
            },
        );
        inner.queue.push_back((id.clone(), job));
        drop(inner);
        TaskContext::new(handle, sink).emit_status();
        self.shared.cv.notify_all();
        id
    }

    /// 任务是否仍在排队/运行（R1-3）：提交方登记簿记前用它挡掉「已终结」的登记。
    pub fn is_active(&self, id: &str) -> bool {
        let inner = self.shared.inner.lock().unwrap();
        inner.tasks.get(id).is_some_and(|e| {
            matches!(
                *e.handle.status.lock().unwrap(),
                TaskStatus::Pending | TaskStatus::Probing | TaskStatus::Running
            )
        })
    }

    /// 取消任务：排队中直接置 Cancelled；运行中置标记并触发 killer（kill 子进程）。
    #[allow(dead_code)]
    pub fn cancel(&self, id: &str) -> bool {
        let (handle, sink, killer, pending) = {
            let mut inner = self.shared.inner.lock().unwrap();
            let Some(entry) = inner.tasks.get(id) else {
                return false;
            };
            let handle = entry.handle.clone();
            let sink = entry.sink.clone();
            handle.cancelled.store(true, Ordering::Relaxed);
            let pending = *handle.status.lock().unwrap() == TaskStatus::Pending;
            let killer = handle.killer.lock().unwrap().take();
            if pending {
                *handle.status.lock().unwrap() = TaskStatus::Cancelled;
                inner.queue.retain(|(qid, _)| qid != id);
            }
            (handle, sink, killer, pending)
        };
        if let Some(k) = killer {
            k();
        }
        if pending {
            TaskContext::new(handle.clone(), sink).emit_status();
            // 排队中直接取消不会经过执行器，这里补记终态历史
            self.shared.record_terminal(&handle);
            // 同样补跑清理钩子：作业体被丢弃，簿记回收只能由这里兜底（R1-3）
            self.shared.run_cleanup(id);
        }
        true
    }

    /// 清除已到终态（完成/失败/取消）的任务记录，返回清除数（DESIGN §5.4 clear_finished_tasks）。
    /// 运行中/排队中的任务不受影响。
    pub fn clear_finished(&self) -> usize {
        let mut inner = self.shared.inner.lock().unwrap();
        let keep: Vec<String> = inner
            .order
            .iter()
            .filter(|id| {
                inner.tasks.get(*id).is_some_and(|e| {
                    matches!(
                        *e.handle.status.lock().unwrap(),
                        TaskStatus::Pending | TaskStatus::Probing | TaskStatus::Running
                    )
                })
            })
            .cloned()
            .collect();
        let removed = inner.order.len() - keep.len();
        let keep_set: std::collections::HashSet<String> = keep.iter().cloned().collect();
        inner.tasks.retain(|id, _| keep_set.contains(id));
        inner.order = keep;
        removed
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
    use std::sync::atomic::AtomicUsize;
    use std::time::{Duration, Instant};

    #[derive(Default)]
    struct CollectSink {
        statuses: Mutex<Vec<(String, TaskStatus)>>,
        progresses: Mutex<Vec<(String, f64)>>,
    }

    impl EventSink for CollectSink {
        fn emit_status(&self, p: &StatusPayload) {
            self.statuses
                .lock()
                .unwrap()
                .push((p.task_id.clone(), p.status));
        }
        fn emit_progress(&self, p: &ProgressPayload) {
            self.progresses.lock().unwrap().push((p.task_id.clone(), p.percent));
        }
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
        let sink = Arc::new(CollectSink::default());
        let id1 = mgr.submit(
            sink.clone(),
            "test",
            "成功",
            Box::new(|ctx| {
                ctx.set_progress(0.5);
                Ok(())
            }),
        );
        let id2 = mgr.submit(
            sink.clone() as Arc<dyn EventSink>,
            "test",
            "失败",
            Box::new(|_ctx| Err("boom".into())),
        );

        let snaps = wait_terminal(&mgr, &[&id1, &id2], Duration::from_secs(5));
        let s1 = snaps.iter().find(|s| s.id == id1).unwrap();
        let s2 = snaps.iter().find(|s| s.id == id2).unwrap();
        assert_eq!(s1.status, TaskStatus::Completed);
        // 成功完成时进度被推满
        assert_eq!(s1.progress, Some(1.0));
        // 作业过程中上报过 0.5
        assert!(sink.progresses.lock().unwrap().iter().any(|(id, p)| id == &id1 && *p == 0.5));
        assert_eq!(s2.status, TaskStatus::Failed);
        assert_eq!(s2.error.as_deref(), Some("boom"));
    }

    #[test]
    fn completed_task_runs_cleanup_once() {
        let mgr = TaskManager::new(1);
        let sink: Arc<dyn EventSink> = Arc::new(CollectSink::default());
        let cleaned = Arc::new(AtomicUsize::new(0));
        let c2 = cleaned.clone();
        let id = mgr.submit_with_cleanup(
            sink,
            "test",
            "正常完成",
            Box::new(|_| Ok(())),
            Box::new(move |_| {
                c2.fetch_add(1, Ordering::Relaxed);
            }),
        );
        wait_terminal(&mgr, &[&id], Duration::from_secs(5));
        // 清理钩子在终态之后执行，poll 等它跑完
        let start = Instant::now();
        while cleaned.load(Ordering::Relaxed) == 0 && start.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(cleaned.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn queued_cancel_runs_cleanup_once() {
        let mgr = TaskManager::new(1);
        let sink: Arc<dyn EventSink> = Arc::new(CollectSink::default());
        // 占满唯一并发位，让后续任务停留在排队中
        let blocker = mgr.submit(
            sink.clone(),
            "test",
            "阻塞",
            Box::new(|ctx| {
                let start = Instant::now();
                while !ctx.is_cancelled() && start.elapsed() < Duration::from_secs(5) {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Ok(())
            }),
        );
        let ran = Arc::new(AtomicUsize::new(0));
        let cleaned = Arc::new(AtomicUsize::new(0));
        let ran2 = ran.clone();
        let cleaned2 = cleaned.clone();
        let queued = mgr.submit_with_cleanup(
            sink,
            "proxy",
            "排队中取消",
            Box::new(move |_| {
                ran2.fetch_add(1, Ordering::Relaxed);
                Ok(())
            }),
            Box::new(move |_| {
                cleaned2.fetch_add(1, Ordering::Relaxed);
            }),
        );
        assert!(mgr.cancel(&queued));
        // 排队中被取消：作业体不执行，但清理钩子必须跑一次（R1-3 泄漏点）
        assert_eq!(ran.load(Ordering::Relaxed), 0);
        assert_eq!(cleaned.load(Ordering::Relaxed), 1);
        // 重复取消不重复清理（钩子只执行一次）
        assert!(mgr.cancel(&queued));
        assert_eq!(cleaned.load(Ordering::Relaxed), 1);
        // 收尾：放开阻塞任务，避免线程悬挂
        assert!(mgr.cancel(&blocker));
        wait_terminal(&mgr, &[&blocker], Duration::from_secs(5));
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

    /// TC-019 / `BUG-001`：作业体 panic 不得冻结队列。
    ///
    /// 并发位取 1 —— 槽位一旦泄漏，后续任务会永远停在排队中，测试即刻失败。
    /// 注：panic 发生在任务线程，消息会直接打到 stderr（测试并行跑，不做 panic hook 屏蔽）。
    #[test]
    fn panicking_job_fails_task_and_returns_slot() {
        let mgr = TaskManager::new(1);
        let sink: Arc<dyn EventSink> = Arc::new(CollectSink::default());
        let cleaned = Arc::new(AtomicUsize::new(0));
        let c = cleaned.clone();

        let id1 = mgr.submit_with_cleanup(
            sink.clone(),
            "test",
            "panic 任务",
            Box::new(|_| panic!("模拟作业体 panic")),
            Box::new(move |_| {
                c.fetch_add(1, Ordering::Relaxed);
            }),
        );
        let snaps = wait_terminal(&mgr, &[&id1], Duration::from_secs(5));
        let s1 = snaps.iter().find(|s| s.id == id1).unwrap();
        assert_eq!(s1.status, TaskStatus::Failed, "panic 应记为失败，而不是停在 Running");
        assert_eq!(s1.progress, None, "失败保留实际进度（本次从未上报）");
        let err = s1.error.clone().unwrap_or_default();
        assert!(err.contains("任务内部错误"), "文案应表明是任务内部错误，实际：{err}");
        assert!(err.contains("模拟作业体 panic"), "文案应带上 panic 内容，实际：{err}");

        // 第二次 panic + 一个正常任务：并发位只有 1 个，泄漏的话 id3 会永远排不上
        let id2 = mgr.submit(
            sink.clone(),
            "test",
            "panic 任务 2",
            Box::new(|_| panic!("再来一次")),
        );
        let id3 = mgr.submit(sink, "test", "正常任务", Box::new(|_| Ok(())));
        let snaps = wait_terminal(&mgr, &[&id2, &id3], Duration::from_secs(5));
        assert_eq!(
            snaps.iter().find(|s| s.id == id2).unwrap().status,
            TaskStatus::Failed
        );
        assert_eq!(
            snaps.iter().find(|s| s.id == id3).unwrap().status,
            TaskStatus::Completed
        );

        // 终态路径没被 panic 跳过：清理钩子照常执行一次
        let start = Instant::now();
        while cleaned.load(Ordering::Relaxed) == 0 && start.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(cleaned.load(Ordering::Relaxed), 1);
    }
}
