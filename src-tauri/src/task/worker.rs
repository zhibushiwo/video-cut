//! 任务执行器：状态流转与收尾。ffmpeg 子进程生命周期管理在 M1 扩展（DESIGN §8.2）。

use std::sync::Arc;

use super::manager::{EventSink, Job, Shared, TaskContext, TaskHandle};
use crate::TaskStatus;

pub(crate) fn run(
    shared: Arc<Shared>,
    handle: Arc<TaskHandle>,
    sink: Arc<dyn EventSink>,
    job: Job,
) {
    let ctx = TaskContext::new(handle, sink);
    if !ctx.is_cancelled() {
        *ctx.handle.status.lock().unwrap() = TaskStatus::Running;
        ctx.emit_status();

        let result = job(&ctx);

        let final_status = if ctx.is_cancelled() {
            TaskStatus::Cancelled
        } else if result.is_ok() {
            TaskStatus::Completed
        } else {
            TaskStatus::Failed
        };
        if let Err(err) = result {
            *ctx.handle.error.lock().unwrap() = Some(err);
        }
        *ctx.handle.status.lock().unwrap() = final_status;
        ctx.emit_status();
    }

    shared.task_finished();
}
