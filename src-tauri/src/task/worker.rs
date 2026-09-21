//! 任务执行器：状态流转与 ffmpeg 子进程生命周期（DESIGN §8.2）。

use std::any::Any;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::panic::AssertUnwindSafe;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use super::manager::{EventSink, Job, Shared, TaskContext, TaskHandle};
use crate::ffmpeg::command;
use crate::ffmpeg::progress::ProgressParser;
use crate::TaskStatus;

/// 运行一个 ffmpeg 子进程并解析 `-progress pipe:1` 输出（DESIGN §6.4）。
///
/// `on_progress(local_percent, speed)`：local_percent 为本进程输出时间 / total_sec；
/// total_sec ≤ 0 时不计算百分比（如代理任务的时长未知场景）。
///
/// 取消：作业线程在读行循环中检查取消标记并 kill；取消标记置位后由 cancel()
/// 通过注册的 killer 立即 kill（即使正阻塞在 read 上）。
pub(crate) fn run_ffmpeg(
    ctx: &TaskContext,
    ffmpeg: &Path,
    args: &[String],
    total_sec: f64,
    on_progress: &dyn Fn(f64, Option<f64>),
) -> Result<(), String> {
    let mut spawn_cmd = Command::new(ffmpeg);
    // GUI 子系统下防 CMD 弹窗（DESIGN §6.2）
    command::spawn_hidden(&mut spawn_cmd);
    log::debug!("ffmpeg argv：{} {}", ffmpeg.display(), args.join(" "));
    let mut child = spawn_cmd
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 ffmpeg：{e}"))?;

    // stderr 单独线程排空，只保留尾部若干行用于失败提示，避免管道缓冲区写满阻塞
    let stderr_tail: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));
    if let Some(stderr) = child.stderr.take() {
        let tail = stderr_tail.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let mut t = tail.lock().unwrap();
                if t.len() >= 30 {
                    t.pop_front();
                }
                t.push_back(line);
            }
        });
    }

    let stdout = child.stdout.take();
    let child = Arc::new(Mutex::new(child));
    {
        let c = child.clone();
        ctx.set_killer(Box::new(move || {
            let _ = c.lock().unwrap().kill();
        }));
    }

    let mut parser = ProgressParser::new();
    if let Some(out) = stdout {
        for line in BufReader::new(out).lines() {
            if ctx.is_cancelled() {
                let mut c = child.lock().unwrap();
                let _ = c.kill();
                let _ = c.wait();
                return Err("已取消".into());
            }
            let Ok(line) = line else { break };
            if let Some(upd) = parser.feed(&line) {
                if upd.done {
                    break;
                }
                if let Some(t) = upd.out_time_sec {
                    let local = if total_sec > 0.0 {
                        (t / total_sec).clamp(0.0, 1.0)
                    } else {
                        0.0
                    };
                    on_progress(local, upd.speed);
                }
            }
        }
    }

    let status = child
        .lock()
        .unwrap()
        .wait()
        .map_err(|e| format!("等待 ffmpeg 退出失败：{e}"))?;
    if ctx.is_cancelled() {
        return Err("已取消".into());
    }
    if !status.success() {
        let tail = {
            let t = stderr_tail.lock().unwrap();
            t.iter().map(String::as_str).collect::<Vec<_>>().join("\n")
        };
        return Err(if tail.trim().is_empty() {
            format!("ffmpeg 以非零状态退出（{:?}）", status.code())
        } else {
            format!("ffmpeg 失败：\n{}", tail.trim())
        });
    }
    Ok(())
}

/// 任务状态流转：Pending(已由提交时上报) → Running → Completed/Failed/Cancelled。
///
/// 作业体经 [`run_job_isolated`] 调用：panic 被收敛成普通失败，本函数负责的终态流转
/// （状态写入 / 进度 / `record_terminal` / `run_cleanup` / `task_finished`）**必须照常走完**。
pub(crate) fn run(
    shared: Arc<Shared>,
    handle: Arc<TaskHandle>,
    sink: Arc<dyn EventSink>,
    job: Job,
) {
    let ctx = TaskContext::new(handle, sink);
    if !ctx.is_cancelled() {
        *ctx.handle.status.lock().unwrap() = TaskStatus::Running;
        *ctx.handle.started_at.lock().unwrap() = crate::history::now_ms();
        ctx.emit_status();

        let result = run_job_isolated(&ctx, job);

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
        // 成功才把进度推满；失败/取消保留实际进度，便于用户看到卡在哪里
        if final_status == TaskStatus::Completed {
            ctx.set_progress(1.0);
        }
        ctx.emit_status();
        shared.record_terminal(&ctx.handle);
    } else {
        // 排队期间被取消但未及出队：兜底置为 Cancelled
        *ctx.handle.status.lock().unwrap() = TaskStatus::Cancelled;
        ctx.emit_status();
        shared.record_terminal(&ctx.handle);
    }
    ctx.handle.clear_killer();
    // 终态清理钩子：运行路径（完成/失败/运行中取消）在此兜底；排队中取消由 cancel 侧兜底
    shared.run_cleanup(&ctx.handle.id);
    shared.task_finished();
}

/// 作业体 panic 隔离（R4-1 / `BUG-001`）。
///
/// `job` 是各 submit 命令闭包，内部任何 `unwrap`/切片越界都会 unwind。不拦的话 unwind 会
/// 直接穿过 [`run`]：状态停在 Running、`record_terminal`/`run_cleanup`/`task_finished` 全被跳过，
/// 并发槽永不归还——连续两次 panic 即冻结整个队列（作业体里再补回收也救不回来，因为根本走不到）。
/// 这里把 panic 收敛成一个普通 `Err`，让 [`run`] 的既有终态路径照常执行。
///
/// 发布版同样生效：`[profile.release]` 的 `panic` 保留 `"unwind"`（不采用 Tauri 体积建议里的
/// `"abort"`——那会让 `catch_unwind` 在打包版失效、panic 变成整个程序退出）。
/// 见 `docs/DECISIONS.md` 的 `ADR-034`。
fn run_job_isolated(ctx: &TaskContext, job: Job) -> Result<(), String> {
    match std::panic::catch_unwind(AssertUnwindSafe(move || job(ctx))) {
        Ok(result) => result,
        Err(payload) => {
            // 注意必须显式 `&*payload`：`&payload` 会走 unsize 而不是 deref，参数里拿到的
            // 具体类型会变成 `Box<dyn Any + Send>` 本身，所有 downcast 静默落空（踩过一次）。
            let detail = panic_payload(&*payload);
            log::error!("任务 {} 作业体 panic：{}", ctx.handle.id, detail);
            Err(format!("任务内部错误：{detail}"))
        }
    }
}

/// 从 panic 载荷里取一段可读文字：`panic!("…")`（`&str`）/ `panic!("{}", …)`（`String`）
/// 覆盖日常全部来源，其余（含 `unwrap` 的标准载荷）走兜底文案。
fn panic_payload(payload: &(dyn Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "未知 panic（详见日志）".to_string()
    }
}
