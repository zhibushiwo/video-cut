//! 任务队列与状态机（DESIGN §8.1/§8.2）。
//!
//! M0 提供可复用骨架：提交 / 取消 / 快照 / 事件推送。ffmpeg 子进程接入在 M1。

use parking_lot::{Condvar, Mutex};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
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

/// 任务排队优先级（M12-2）：用户任务 = `Normal`，缓存类内部任务（`proxy` / 渲染即预览）= `Low`。
/// 调度**优先挑选普通任务**，低优先级只在没有普通任务待跑时才启动，且**不抢占**已在跑的任务。
/// **仅内部概念**——不进 `StatusPayload` / `TaskSnapshot`，前端契约不变。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    Normal,
    Low,
}

/// 排队项（M12-2 起队列带优先级，见 [`Priority`]）。
struct Queued {
    id: String,
    job: Job,
    priority: Priority,
}

/// 事件推送抽象：生产环境发 Tauri 事件，测试环境收集断言。
pub trait EventSink: Send + Sync {
    fn emit_status(&self, payload: &StatusPayload);
    fn emit_progress(&self, payload: &ProgressPayload);
}

/// `task-status` 事件负载（DESIGN §5.4）。`internal` = 内部任务（R3-3）：事件照常
/// 派发（useProxyPreview 等订阅方依赖完成事件），任务面板凭它跳过展示。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusPayload {
    pub task_id: String,
    pub status: TaskStatus,
    pub error: Option<String>,
    pub outputs: Vec<String>,
    pub internal: bool,
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
    /// 内部任务（R3-3，如代理生成）：不进 `snapshot()`（任务面板补元数据与关闭守卫
    /// 均不可见），事件照常派发。经 [`TaskManager::submit_internal`] 提交时为 true。
    pub internal: bool,
    /// 排队优先级（M12-2，见 [`Priority`]）：只影响调度挑选顺序，不改变任务语义。
    pub priority: Priority,
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
        *self.killer.lock() = None;
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
            status: *self.status.lock(),
            progress: *self.progress.lock(),
            error: self.error.lock().clone(),
            outputs: self.outputs.lock().clone(),
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

    /// 上报进度（0.0~1.0）与当前编码速度（`-progress` 的 `speed=`，倍速）。
    /// 节流由作业体侧的 [`crate::commands::ProgressThrottle`] 负责，本方法不节流
    /// （worker 收尾推满 1.0 必须直通）；`speed` 随报随传（R3-4 接通前端速度列）。
    /// ETA（FR-361 预计剩余）由已耗时长与当前百分比调和推算：剩余 ≈ 已耗 × (1−p)/p，
    /// p < 5% 时噪声过大不报、p ≥ 1.0 无剩余不报。
    pub fn set_progress(&self, percent: f64, speed: Option<f64>) {
        let p = percent.clamp(0.0, 1.0);
        *self.handle.progress.lock() = Some(p);
        let eta_seconds = self.estimate_eta(p);
        self.sink.emit_progress(&ProgressPayload {
            task_id: self.handle.id.clone(),
            percent: p,
            speed: speed.map(|s| format!("{s:.2}")),
            eta_seconds,
        });
    }

    fn estimate_eta(&self, p: f64) -> Option<f64> {
        if !(0.05..1.0).contains(&p) {
            return None;
        }
        let started = *self.handle.started_at.lock();
        if started == 0 {
            return None;
        }
        let elapsed = (crate::history::now_ms() - started) as f64 / 1000.0;
        Some(elapsed * (1.0 - p) / p)
    }

    /// 登记成功产物路径，任务完成后展示给用户。
    pub fn add_output(&self, path: String) {
        self.handle.outputs.lock().push(path);
    }

    /// 注册立即终止手段（kill 子进程）。运行中任务被取消时由 cancel() 触发。
    pub fn set_killer(&self, killer: crate::task::manager::Killer) {
        *self.handle.killer.lock() = Some(killer);
    }

    pub(crate) fn emit_status(&self) {
        let handle = &self.handle;
        self.sink.emit_status(&StatusPayload {
            task_id: handle.id.clone(),
            status: *handle.status.lock(),
            error: handle.error.lock().clone(),
            outputs: handle.outputs.lock().clone(),
            internal: handle.internal,
        });
    }
}

struct TaskEntry {
    handle: Arc<TaskHandle>,
    sink: Arc<dyn EventSink>,
    /// 终态清理钩子，执行前 take 走（幂等）。
    cleanup: Option<Cleanup>,
}

impl TaskEntry {
    fn is_active(&self) -> bool {
        matches!(
            *self.handle.status.lock(),
            TaskStatus::Pending | TaskStatus::Running
        )
    }
}

/// 终态回调：历史记录等订阅者经此接入，任务模块保持与 Tauri 解耦。
pub(crate) type OnTerminal = Box<dyn Fn(&TaskHandle) + Send + Sync>;

struct Inner {
    tasks: HashMap<String, TaskEntry>,
    order: Vec<String>,
    queue: VecDeque<Queued>,
    running: usize,
    /// kind 维度去重登记表（R3-2）：(kind, dedup_key) → task_id。由 [`TaskManager::
    /// submit_internal`] 登记，条目回收统一在 [`Shared::run_cleanup`]（全部终态路径都经过它，
    /// 含排队中被取消）——替代调用方自建 HashMap + cleanup 钩子的手工簿记。
    dedup: HashMap<(String, String), String>,
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
        let mut inner = self.inner.lock();
        inner.running -= 1;
        drop(inner);
        self.cv.notify_all();
    }

    /// 执行并消费任务的终态清理钩子（幂等：只有第一个调用者拿到闭包）。
    /// 同时回收该任务的去重登记条目（R3-2）——所有终态路径（完成/失败/取消，
    /// 含排队中被取消）都会走到这里，提交方无需自建回收逻辑。
    pub(crate) fn run_cleanup(&self, id: &str) {
        let cb = {
            let mut inner = self.inner.lock();
            inner.dedup.retain(|_, v| v != id);
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
        let status = *handle.status.lock();
        let started = *handle.started_at.lock();
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
                    handle.outputs.lock()
                );
            }
            TaskStatus::Failed => {
                log::error!(
                    "任务失败（{elapsed}）：{}：{}",
                    handle.label,
                    handle.error.lock().as_deref().unwrap_or("未知错误")
                );
            }
            TaskStatus::Cancelled => {
                log::info!("任务取消：{}", handle.label);
            }
            _ => {}
        }
        // 回调必须在**锁外**执行（T-003）：旧写法 `if let Some(cb) = self.on_terminal.lock().as_ref()`
        // 的临时 MutexGuard 会持锁到块尾，回调内任何再触 on_terminal 的路径（再次
        // record_terminal / set_on_terminal）都会自死锁——parking_lot 的 Mutex 不可重入。
        // take 出来调用后放回；若回调期间被 set_on_terminal 覆盖则不回写（后来者优先）。
        let cb = self.on_terminal.lock().take();
        if let Some(cb) = cb {
            cb(handle);
            let mut slot = self.on_terminal.lock();
            if slot.is_none() {
                *slot = Some(cb);
            }
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
                dedup: HashMap::new(),
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
        *self.shared.on_terminal.lock() = Some(cb);
    }

    /// 提交任务：立即返回 TaskId，作业由调度线程在并发配额内执行（DESIGN §8.2）。
    pub fn submit(&self, sink: Arc<dyn EventSink>, kind: &str, label: &str, job: Job) -> String {
        self.submit_with_cleanup(sink, kind, label, job, Box::new(|_| {}))
    }

    /// 带清理钩子的提交（R1-3）：需要回收簿记的调用方用此入口，
    /// 保证「排队中被取消」也能回收——该路径不执行作业体。
    pub fn submit_with_cleanup(
        &self,
        sink: Arc<dyn EventSink>,
        kind: &str,
        label: &str,
        job: Job,
        cleanup: Cleanup,
    ) -> String {
        self.submit_core(
            sink,
            kind,
            label,
            None,
            false,
            Priority::Normal,
            false,
            job,
            Some(cleanup),
        )
    }

    /// 内部任务的统一提交入口（R3-2/R3-3，当前用户：代理生成、渲染即预览）：
    ///
    /// - **kind + key 去重**：同 `(kind, dedup_key)` 已有活动任务时**不重复提交**，
    ///   直接返回既有 taskId（调用方拿到的是同一任务，事件订阅天然共享）；条目由
    ///   TaskManager 在任务到终态时统一回收（见 [`Shared::run_cleanup`]），残留条目
    ///   （理论上不应有）按活性自愈一次。
    /// - **面板与关闭守卫不可见**：internal 任务不进 [`TaskManager::snapshot`]
    ///   （list_tasks → 任务面板补元数据、关闭窗口确认都看不到），但 task-status /
    ///   task-progress 事件照常派发，payload 带 `internal` 标记供前端过滤展示（R3-3）。
    ///
    /// 备注：本入口按**普通优先级**入队；缓存类任务（代理生成 / 渲染即预览）走
    /// [`TaskManager::submit_internal_low`]。
    pub fn submit_internal(
        &self,
        sink: Arc<dyn EventSink>,
        kind: &str,
        label: &str,
        dedup_key: &str,
        job: Job,
    ) -> String {
        self.submit_core(
            sink,
            kind,
            label,
            Some(dedup_key),
            true,
            Priority::Normal,
            false,
            job,
            None,
        )
    }

    /// **低优先级**内部任务（M12-2）：缓存类任务（代理生成、渲染即预览）用此入口——
    /// 调度只在没有普通任务待跑时才启动它们，保证"不抢导出并发位"。
    pub fn submit_internal_low(
        &self,
        sink: Arc<dyn EventSink>,
        kind: &str,
        label: &str,
        dedup_key: &str,
        job: Job,
    ) -> String {
        self.submit_core(
            sink,
            kind,
            label,
            Some(dedup_key),
            true,
            Priority::Low,
            false,
            job,
            None,
        )
    }

    /// **同源单例**提交（M12-2，渲染即预览专用）：与 [`TaskManager::submit_internal`] 的区别是
    /// **新内容取代旧任务**，而不是复用——
    ///
    /// - 同 `(kind, key)` 且旧任务仍活动 → 复用旧 taskId（React StrictMode 双提交幂等）；
    /// - 否则取消**同 kind 的全部活动内部任务**（不限于同 key），再登记新任务。这条是
    ///   "新编辑取代旧 preview"的落点：key = 时间线内容签名，编辑后 key 必变，只按
    ///   `(kind, key)` 查表根本找不到旧任务。
    /// - 取消动作在**同一临界区内**完成（置 cancelled + 出队 + 取 killer），保证不出现
    ///   "两个活动预览"的窗口；旧任务的终态事件 / 历史 / 清理放到**出锁后**补，避免在临界区里回调。
    /// - 与其它缓存类任务一样按**低优先级**排队。
    pub fn submit_internal_singleton(
        &self,
        sink: Arc<dyn EventSink>,
        kind: &str,
        label: &str,
        dedup_key: &str,
        job: Job,
    ) -> String {
        self.submit_core(
            sink,
            kind,
            label,
            Some(dedup_key),
            true,
            Priority::Low,
            true,
            job,
            None,
        )
    }

    #[allow(clippy::too_many_arguments)] // 私有核心：参数已按语义分组，拆结构体反而更难读
    fn submit_core(
        &self,
        sink: Arc<dyn EventSink>,
        kind: &str,
        label: &str,
        dedup_key: Option<&str>,
        internal: bool,
        priority: Priority,
        replace_same_kind: bool,
        job: Job,
        cleanup: Option<Cleanup>,
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
            internal,
            priority,
            killer: Mutex::new(None),
            created_at: crate::history::now_ms(),
            started_at: Mutex::new(0),
            terminal_recorded: AtomicBool::new(false),
        });
        // 被取代的旧任务：(handle, sink, 是否"排队中就被取代")；终态补齐在出锁后做
        let mut superseded: Vec<(Arc<TaskHandle>, Arc<dyn EventSink>, bool)> = Vec::new();
        let mut killers: Vec<Killer> = Vec::new();
        let mut inner = self.shared.inner.lock();
        if let Some(key) = dedup_key {
            let entry_key = (kind.to_string(), key.to_string());
            if let Some(existing) = inner.dedup.get(&entry_key).cloned() {
                if inner.tasks.get(&existing).is_some_and(TaskEntry::is_active) {
                    // 同 key 仍活动 = 同一份内容（含 StrictMode 双提交）→ 复用，不重跑
                    return existing;
                }
                // 残留条目自愈：理论上 run_cleanup 已回收，防御一次（R1-3 同思路）
                inner.dedup.remove(&entry_key);
            }
            if replace_same_kind {
                let victims: Vec<String> = inner
                    .order
                    .iter()
                    .filter(|oid| {
                        inner.tasks.get(*oid).is_some_and(|e| {
                            e.handle.internal && e.handle.kind == kind && e.is_active()
                        })
                    })
                    .cloned()
                    .collect();
                for victim in victims {
                    let (old_handle, old_sink, was_pending, killer) = {
                        let Some(entry) = inner.tasks.get(&victim) else {
                            continue;
                        };
                        let old_handle = entry.handle.clone();
                        let old_sink = entry.sink.clone();
                        old_handle.cancelled.store(true, Ordering::Relaxed);
                        let was_pending = *old_handle.status.lock() == TaskStatus::Pending;
                        let killer = old_handle.killer.lock().take();
                        (old_handle, old_sink, was_pending, killer)
                    };
                    if let Some(k) = killer {
                        killers.push(k);
                    }
                    if was_pending {
                        *old_handle.status.lock() = TaskStatus::Cancelled;
                        inner.queue.retain(|q| q.id != victim);
                    }
                    superseded.push((old_handle, old_sink, was_pending));
                }
            }
            inner.dedup.insert(entry_key, id.clone());
        }
        inner.order.push(id.clone());
        inner.tasks.insert(
            id.clone(),
            TaskEntry {
                handle: handle.clone(),
                sink: sink.clone(),
                cleanup,
            },
        );
        inner.queue.push_back(Queued {
            id: id.clone(),
            job,
            priority,
        });
        drop(inner);
        // 旧任务收尾（出锁后）：先 kill 子进程，再补"排队中就被取代、不会经过执行器"的终态
        for k in killers {
            k();
        }
        for (old_handle, old_sink, was_pending) in superseded {
            if was_pending {
                TaskContext::new(old_handle.clone(), old_sink).emit_status();
                // 与 cancel 的 Pending 分支同口径：补记终态日志/历史与清理钩子
                self.shared.record_terminal(&old_handle);
                self.shared.run_cleanup(&old_handle.id);
            }
        }
        TaskContext::new(handle, sink).emit_status();
        self.shared.cv.notify_all();
        id
    }

    /// 取消任务：排队中直接置 Cancelled；运行中置标记并触发 killer（kill 子进程）。
    pub fn cancel(&self, id: &str) -> bool {
        let (handle, sink, killer, pending) = {
            let mut inner = self.shared.inner.lock();
            let Some(entry) = inner.tasks.get(id) else {
                return false;
            };
            let handle = entry.handle.clone();
            let sink = entry.sink.clone();
            handle.cancelled.store(true, Ordering::Relaxed);
            let pending = *handle.status.lock() == TaskStatus::Pending;
            let killer = handle.killer.lock().take();
            if pending {
                *handle.status.lock() = TaskStatus::Cancelled;
                inner.queue.retain(|q| q.id != id);
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
        let mut inner = self.shared.inner.lock();
        let keep: Vec<String> = inner
            .order
            .iter()
            .filter(|id| inner.tasks.get(*id).is_some_and(TaskEntry::is_active))
            .cloned()
            .collect();
        let removed = inner.order.len() - keep.len();
        let keep_set: std::collections::HashSet<String> = keep.iter().cloned().collect();
        inner.tasks.retain(|id, _| keep_set.contains(id));
        inner.order = keep;
        removed
    }

    /// 用户可见的任务快照（R3-3）：internal 任务不进列表——任务面板补元数据与
    /// 关闭窗口确认（listTasks 的两个消费方）都不应看到后台代理等内部任务；
    /// 事件通道不受影响（订阅方凭 payload 的 internal 标记自行过滤展示）。
    pub fn snapshot(&self) -> Vec<TaskSnapshot> {
        let inner = self.shared.inner.lock();
        inner
            .order
            .iter()
            .filter_map(|id| inner.tasks.get(id))
            .filter(|e| !e.handle.internal)
            .map(|e| e.handle.snapshot())
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
            let mut inner = shared.inner.lock();
            loop {
                // 排队期间被取消的任务直接出队丢弃，不占用并发配额
                if let Some(pos) = inner.queue.iter().position(|q| {
                    inner
                        .tasks
                        .get(&q.id)
                        .is_some_and(|e| e.handle.cancelled.load(Ordering::Relaxed))
                }) {
                    inner.queue.remove(pos);
                    continue;
                }
                if inner.running < shared.max_concurrent {
                    // 优先挑选普通任务（M12-2）：低优先级（proxy / 渲染即预览）只在没有普通
                    // 任务待跑时才启动——保证"不抢导出并发位"；同类内保持 FIFO，不做抢占。
                    let idx = inner
                        .queue
                        .iter()
                        .position(|q| q.priority == Priority::Normal)
                        .unwrap_or(0);
                    if let Some(q) = inner.queue.remove(idx) {
                        if let Some(entry) = inner.tasks.get(&q.id) {
                            let handle = entry.handle.clone();
                            let sink = entry.sink.clone();
                            inner.running += 1;
                            break (q.id, handle, sink, q.job);
                        }
                    }
                }
                shared.cv.wait(&mut inner);
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
        progresses: Mutex<Vec<ProgressPayload>>,
    }

    impl EventSink for CollectSink {
        fn emit_status(&self, p: &StatusPayload) {
            self.statuses.lock().push((p.task_id.clone(), p.status));
        }
        fn emit_progress(&self, p: &ProgressPayload) {
            self.progresses.lock().push(p.clone());
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
    fn terminal_callback_runs_outside_on_terminal_lock() {
        // T-003：终态回调必须在**锁外**执行。旧实现 `if let` 的临时 MutexGuard 持锁到块尾，
        // 回调内再触 on_terminal 的任何路径（这里用 set_on_terminal 复现）即自死锁
        // （parking_lot 不可重入）。用通道 + 超时把"死锁挂起"转成确定失败。
        let mgr = Arc::new(TaskManager::new(1));
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let cb_mgr = mgr.clone();
        mgr.set_on_terminal(Box::new(move |_handle| {
            cb_mgr.set_on_terminal(Box::new(|_| {})); // 持锁执行 → 自死锁 → 消息永不送达
            let _ = tx.send(());
        }));
        let sink = Arc::new(CollectSink::default());
        let id = mgr.submit(sink, "test", "锁外回调", Box::new(|_ctx| Ok(())));
        wait_terminal(&mgr, &[&id], Duration::from_secs(5));
        rx.recv_timeout(Duration::from_secs(5))
            .expect("终态回调未在时限内完成（疑似在持锁状态下自死锁）");
    }

    #[test]
    fn eta_gated_by_progress_floor_and_ceiling() {
        let mgr = TaskManager::new(1);
        let sink = Arc::new(CollectSink::default());
        let id = mgr.submit(
            sink.clone(),
            "test",
            "ETA 门限",
            Box::new(|ctx| {
                ctx.set_progress(0.01, None); // < 5%：噪声过大不报
                ctx.set_progress(1.0, None); // 收尾：无剩余不报
                Ok(())
            }),
        );
        wait_terminal(&mgr, &[&id], Duration::from_secs(5));
        let all = sink.progresses.lock();
        assert!(
            all.iter()
                .filter(|p| p.task_id == id)
                .all(|p| p.eta_seconds.is_none()),
            "p<5% 与 p=1.0 都不得带 ETA"
        );
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
                ctx.set_progress(0.5, Some(2.5));
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
        // 作业过程中上报过 0.5（speed 格式化为 "2.50"；ETA = 已耗 ×(1-p)/p，p=0.5 时等于已耗时长）
        let reported = sink
            .progresses
            .lock()
            .iter()
            .find(|p| p.task_id == id1 && p.percent == 0.5)
            .cloned();
        assert!(reported.is_some());
        let reported = reported.unwrap();
        assert_eq!(reported.speed.as_deref(), Some("2.50"));
        assert!(
            reported.eta_seconds.unwrap_or(-1.0) >= 0.0,
            "p=0.5 应带 ETA"
        );
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

    // ---------- 内部任务（R3-2 去重登记 / R3-3 快照过滤） ----------

    #[test]
    fn internal_task_hidden_from_snapshot_but_events_flow() {
        let mgr = TaskManager::new(1);
        let sink = Arc::new(CollectSink::default());
        let ran = Arc::new(AtomicUsize::new(0));
        let ran2 = ran.clone();
        let id = mgr.submit_internal(
            sink.clone(),
            "proxy",
            "内部任务",
            "C:/a.mp4",
            Box::new(move |_| {
                ran2.fetch_add(1, Ordering::Relaxed);
                Ok(())
            }),
        );
        // 提交即派发 task-status（订阅方靠事件知道任务存在）
        assert!(
            sink.statuses.lock().iter().any(|(tid, _)| tid == &id),
            "internal 任务的 task-status 事件必须照常派发"
        );
        // job 确实执行了；snapshot 看不到 internal 任务，不能走 wait_terminal
        let start = Instant::now();
        while ran.load(Ordering::Relaxed) == 0 && start.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(ran.load(Ordering::Relaxed), 1);
        assert!(
            mgr.snapshot().iter().all(|s| s.id != id),
            "internal 任务不得出现在 snapshot（任务面板/关闭守卫不可见）"
        );
    }

    #[test]
    fn submit_internal_dedups_same_key_while_active() {
        let mgr = TaskManager::new(2);
        let sink: Arc<dyn EventSink> = Arc::new(CollectSink::default());
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let id1 = mgr.submit_internal(
            sink.clone(),
            "proxy",
            "第一个",
            "key-a",
            Box::new(move |_| {
                let _ = rx.recv();
                Ok(())
            }),
        );
        // 活动（排队或运行中）期间同 key 再提交 → 复用既有任务，不重复入队
        let id2 = mgr.submit_internal(
            sink.clone(),
            "proxy",
            "第二个",
            "key-a",
            Box::new(|_| Ok(())),
        );
        assert_eq!(id1, id2, "同 key 活动期间应复用既有任务");
        // 不同 key 各自独立
        let id3 = mgr.submit_internal(
            sink.clone(),
            "proxy",
            "第三个",
            "key-b",
            Box::new(|_| Ok(())),
        );
        assert_ne!(id1, id3);
        tx.send(()).unwrap();
    }

    #[test]
    fn dedup_entry_recycled_after_terminal() {
        let mgr = TaskManager::new(1);
        let sink: Arc<dyn EventSink> = Arc::new(CollectSink::default());
        let id1 = mgr.submit_internal(
            sink.clone(),
            "proxy",
            "先跑一次",
            "key-r",
            Box::new(|_| {
                std::thread::sleep(Duration::from_millis(30));
                Ok(())
            }),
        );
        // 终态回收后同 key 再提交 → 新任务（回收异步于 job 结束，poll 到换新即止）
        let start = Instant::now();
        loop {
            let id2 = mgr.submit_internal(
                sink.clone(),
                "proxy",
                "再跑一次",
                "key-r",
                Box::new(|_| Ok(())),
            );
            if id2 != id1 {
                break;
            }
            assert!(
                start.elapsed() < Duration::from_secs(5),
                "终态后去重条目未被回收"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn queued_internal_cancel_recycles_dedup_entry() {
        let mgr = TaskManager::new(1);
        let sink: Arc<dyn EventSink> = Arc::new(CollectSink::default());
        // 占满唯一并发位，让 internal 任务停留在排队中
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let blocker = mgr.submit(
            sink.clone(),
            "test",
            "占位",
            Box::new(move |_| {
                let _ = rx.recv();
                Ok(())
            }),
        );
        let queued = mgr.submit_internal(
            sink.clone(),
            "proxy",
            "排队中取消",
            "key-q",
            Box::new(|_| Ok(())),
        );
        assert_ne!(blocker, queued);
        assert!(mgr.cancel(&queued));
        // 排队中取消不执行作业体（R1-3），去重条目也必须已被回收（R3-2）——
        // 直接再提交：拿到新 id 即证明回收完成
        let again = mgr.submit_internal(
            sink.clone(),
            "proxy",
            "重新提交",
            "key-q",
            Box::new(|_| Ok(())),
        );
        assert_ne!(again, queued, "排队取消后同 key 应可重新提交");
        tx.send(()).unwrap();
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
        assert_eq!(
            s1.status,
            TaskStatus::Failed,
            "panic 应记为失败，而不是停在 Running"
        );
        assert_eq!(s1.progress, None, "失败保留实际进度（本次从未上报）");
        let err = s1.error.clone().unwrap_or_default();
        assert!(
            err.contains("任务内部错误"),
            "文案应表明是任务内部错误，实际：{err}"
        );
        assert!(
            err.contains("模拟作业体 panic"),
            "文案应带上 panic 内容，实际：{err}"
        );

        // 第二次 panic + 一个正常任务：并发位只有 1 个，泄漏的话 id3 会永远排不上。
        // 这次的 panic 走 `panic!("{}", …)` 形态（载荷是 String，与上面的 &str 分支不同），
        // 顺带锁住 panic_payload 对两类载荷都能取到文案。
        let id2 = mgr.submit(
            sink.clone(),
            "test",
            "panic 任务 2",
            Box::new(|_| panic!("{}", "再来一次")),
        );
        let id3 = mgr.submit(sink, "test", "正常任务", Box::new(|_| Ok(())));
        let snaps = wait_terminal(&mgr, &[&id2, &id3], Duration::from_secs(5));
        let s2 = snaps.iter().find(|s| s.id == id2).unwrap();
        assert_eq!(s2.status, TaskStatus::Failed);
        assert!(
            s2.error.clone().unwrap_or_default().contains("再来一次"),
            "格式化 panic 的文案也要能取到，实际：{:?}",
            s2.error
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

    // ---------- M12-2：优先级挑选与同源单例（渲染即预览） ----------

    /// internal 任务不进 `snapshot()`，故按**事件流**等终态（与 `wait_terminal` 同用途）。
    fn wait_terminal_event(sink: &CollectSink, id: &str, timeout: Duration) -> TaskStatus {
        let start = Instant::now();
        loop {
            if let Some(st) = sink
                .statuses
                .lock()
                .iter()
                .rev()
                .find(|(tid, st)| {
                    tid == id
                        && matches!(
                            st,
                            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled
                        )
                })
                .map(|(_, st)| *st)
            {
                return st;
            }
            assert!(
                start.elapsed() < timeout,
                "任务未在时限内到达终态（事件流）"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn normal_priority_selected_before_low() {
        // 单并发位：谁能上完全取决于优先级挑选，而不是提交顺序
        let mgr = TaskManager::new(1);
        let sink: Arc<dyn EventSink> = Arc::new(CollectSink::default());
        let order: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let (tx, rx) = std::sync::mpsc::channel::<()>();

        let blocker = mgr.submit(
            sink.clone(),
            "test",
            "阻塞",
            Box::new(move |_| {
                let _ = rx.recv();
                Ok(())
            }),
        );
        let mark = |v: &'static str| {
            let o = order.clone();
            move |_: &TaskContext| {
                o.lock().push(v);
                Ok(())
            }
        };
        // 低优先级**先**提交，普通任务**后**提交 → 普通任务必须先跑
        let low = mgr.submit_internal_low(
            sink.clone(),
            "proxy",
            "低",
            "low-key",
            Box::new(mark("low")),
        );
        let normal = mgr.submit(sink.clone(), "test", "普通", Box::new(mark("normal")));

        tx.send(()).unwrap(); // 放行阻塞任务
        let start = Instant::now();
        while order.lock().len() < 2 && start.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(
            *order.lock(),
            vec!["normal", "low"],
            "普通任务必须先于低优先级任务启动（不抢导出并发位）"
        );
        wait_terminal(&mgr, &[&blocker, &normal], Duration::from_secs(5));
        let _ = low;
    }

    #[test]
    fn low_priority_runs_when_no_normal() {
        let mgr = TaskManager::new(1);
        let sink = Arc::new(CollectSink::default());
        let ran = Arc::new(AtomicUsize::new(0));
        let r2 = ran.clone();
        let id = mgr.submit_internal_low(
            sink.clone(),
            "proxy",
            "低",
            "k",
            Box::new(move |_| {
                r2.fetch_add(1, Ordering::Relaxed);
                Ok(())
            }),
        );
        assert_eq!(
            wait_terminal_event(&sink, &id, Duration::from_secs(5)),
            TaskStatus::Completed
        );
        assert_eq!(
            ran.load(Ordering::Relaxed),
            1,
            "没有普通任务待跑时低优先级任务必须能启动（不得饿死）"
        );
    }

    #[test]
    fn singleton_same_key_reuses_active() {
        let mgr = TaskManager::new(2);
        let sink = Arc::new(CollectSink::default());
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let id1 = mgr.submit_internal_singleton(
            sink.clone(),
            "pipeline",
            "预览",
            "sig-1",
            Box::new(move |_| {
                let _ = rx.recv();
                Ok(())
            }),
        );
        let id2 = mgr.submit_internal_singleton(
            sink.clone(),
            "pipeline",
            "预览",
            "sig-1",
            Box::new(|_| Ok(())),
        );
        assert_eq!(id1, id2, "同签名仍活动时必须复用（StrictMode 双提交幂等）");
        tx.send(()).unwrap();
        assert_eq!(
            wait_terminal_event(&sink, &id1, Duration::from_secs(5)),
            TaskStatus::Completed
        );
    }

    #[test]
    fn singleton_new_key_cancels_old() {
        let mgr = TaskManager::new(2);
        let sink = Arc::new(CollectSink::default());
        // 旧预览：等被取消才退出（保证定位在"旧任务仍活动"的路径上）
        let old = mgr.submit_internal_singleton(
            sink.clone(),
            "pipeline",
            "预览",
            "sig-1",
            Box::new(|ctx| {
                let start = Instant::now();
                while !ctx.is_cancelled() && start.elapsed() < Duration::from_secs(5) {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Ok(())
            }),
        );
        let new_id = mgr.submit_internal_singleton(
            sink.clone(),
            "pipeline",
            "预览",
            "sig-2",
            Box::new(|_| Ok(())),
        );
        assert_ne!(old, new_id);
        assert_eq!(
            wait_terminal_event(&sink, &old, Duration::from_secs(5)),
            TaskStatus::Cancelled,
            "被取代的旧预览必须置 Cancelled"
        );
        assert_eq!(
            wait_terminal_event(&sink, &new_id, Duration::from_secs(5)),
            TaskStatus::Completed,
            "新预览必须正常完成"
        );
    }

    #[test]
    fn singleton_replace_keeps_new_dedup_entry() {
        let mgr = TaskManager::new(2);
        let sink = Arc::new(CollectSink::default());
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        // 旧预览保持活动，确保发生"取代"
        let _old = mgr.submit_internal_singleton(
            sink.clone(),
            "pipeline",
            "预览",
            "sig-1",
            Box::new(|ctx| {
                let start = Instant::now();
                while !ctx.is_cancelled() && start.elapsed() < Duration::from_secs(5) {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Ok(())
            }),
        );
        let new_id = mgr.submit_internal_singleton(
            sink.clone(),
            "pipeline",
            "预览",
            "sig-2",
            Box::new(move |_| {
                let _ = rx.recv();
                Ok(())
            }),
        );
        // 旧任务的 run_cleanup 可能在新登记之后才跑：它按 value 比对，绝不能删掉 sig-2 的条目
        let again = mgr.submit_internal_singleton(
            sink.clone(),
            "pipeline",
            "预览",
            "sig-2",
            Box::new(|_| Ok(())),
        );
        assert_eq!(
            new_id, again,
            "取代后新签名的登记必须仍在（旧任务的 run_cleanup 不得误删）"
        );
        tx.send(()).unwrap();
        assert_eq!(
            wait_terminal_event(&sink, &new_id, Duration::from_secs(5)),
            TaskStatus::Completed
        );
    }

    #[test]
    fn queued_singleton_cancel_runs_no_job() {
        let mgr = TaskManager::new(1);
        let sink = Arc::new(CollectSink::default());
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        // 占满唯一并发位，让后面的预览只能排队
        let blocker = mgr.submit(
            sink.clone(),
            "test",
            "阻塞",
            Box::new(move |_| {
                let _ = rx.recv();
                Ok(())
            }),
        );
        let ran = Arc::new(AtomicUsize::new(0));
        let r2 = ran.clone();
        let old = mgr.submit_internal_singleton(
            sink.clone(),
            "pipeline",
            "预览",
            "sig-1",
            Box::new(move |_| {
                r2.fetch_add(1, Ordering::Relaxed);
                Ok(())
            }),
        );
        assert_eq!(
            ran.load(Ordering::Relaxed),
            0,
            "并发位被占，该任务应还在排队"
        );
        let new_id = mgr.submit_internal_singleton(
            sink.clone(),
            "pipeline",
            "预览",
            "sig-2",
            Box::new(|_| Ok(())),
        );
        assert_eq!(
            wait_terminal_event(&sink, &old, Duration::from_secs(5)),
            TaskStatus::Cancelled
        );
        assert_eq!(
            ran.load(Ordering::Relaxed),
            0,
            "排队中被取代的任务不得执行作业体"
        );
        tx.send(()).unwrap();
        wait_terminal(&mgr, &[&blocker], Duration::from_secs(5));
        assert_eq!(
            wait_terminal_event(&sink, &new_id, Duration::from_secs(5)),
            TaskStatus::Completed
        );
    }

    #[test]
    fn internal_pipeline_hidden_from_snapshot() {
        // 预览沿用 kind = "pipeline"（在白名单里），必须靠 internal 而非 kind 从面板/历史排除
        let mgr = TaskManager::new(1);
        let sink = Arc::new(CollectSink::default());
        let id = mgr.submit_internal_singleton(
            sink.clone(),
            "pipeline",
            "预览",
            "sig",
            Box::new(|_| Ok(())),
        );
        assert!(
            mgr.snapshot().iter().all(|s| s.id != id),
            "internal 的 pipeline 任务必须不进 snapshot（否则会出现在任务面板）"
        );
        assert_eq!(
            wait_terminal_event(&sink, &id, Duration::from_secs(5)),
            TaskStatus::Completed
        );
    }
}
