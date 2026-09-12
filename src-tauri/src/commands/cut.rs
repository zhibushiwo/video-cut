//! 剪切任务提交（DESIGN §3.2、§6.3①、§8.1）。
//!
//! 多片段 = 一个任务内串行执行 N 个 ffmpeg 子进程，进度按已完成片段数汇总。

use std::cell::Cell;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, State};

use crate::ffmpeg::{command, probe};
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::task::worker;
use crate::{AppTasks, CutMode, VideoTask};

#[tauri::command]
pub fn submit_task(
    app: AppHandle,
    state: State<'_, AppTasks>,
    task: VideoTask,
) -> Result<String, String> {
    match task {
        VideoTask::Cut {
            input,
            segments,
            output_dir,
            mode,
        } => {
            if mode != CutMode::Fast {
                return Err("精确剪切将在后续版本提供，当前请使用极速剪切".into());
            }
            submit_cut(app, &state, input, segments, output_dir)
        }
        _ => Err("该任务类型尚未实现".into()),
    }
}

struct CutItem {
    part: PathBuf,
    final_path: PathBuf,
    start: f64,
    dur: f64,
}

fn submit_cut(
    app: AppHandle,
    state: &State<'_, AppTasks>,
    input: String,
    segments: Vec<crate::Segment>,
    output_dir: String,
) -> Result<String, String> {
    // ---------- 校验（DESIGN §13） ----------
    if !Path::new(&input).is_file() {
        return Err(format!("输入文件不存在：{input}"));
    }
    if segments.is_empty() {
        return Err("请至少添加一个剪切片段".into());
    }
    for s in &segments {
        if !(s.start_sec >= 0.0 && s.end_sec > s.start_sec + 0.05) {
            return Err(format!(
                "片段区间无效：{} ~ {}",
                s.start_sec, s.end_sec
            ));
        }
    }
    std::fs::create_dir_all(&output_dir).map_err(|e| format!("无法创建输出目录：{e}"))?;
    let ffmpeg = command::resolve_sidecar("ffmpeg")?;
    let ffprobe = command::resolve_sidecar("ffprobe")?;

    let src = Path::new(&input);
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output")
        .to_string();
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4")
        .to_string();
    let out_dir = PathBuf::from(&output_dir);

    let items: Vec<CutItem> = segments
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let name = format!("{}_part_{:03}.{}", stem, i + 1, ext);
            CutItem {
                final_path: out_dir.join(&name),
                // 半成品保留真实扩展名（xxx.part.mp4），否则 ffmpeg 无法推断封装格式
                part: out_dir.join(format!("{}_part_{:03}.part.{}", stem, i + 1, ext)),
                start: s.start_sec,
                dur: s.end_sec - s.start_sec,
            }
        })
        .collect();

    let label = format!("剪切 {}（{} 个片段）", src.file_name().and_then(|n| n.to_str()).unwrap_or(&input), items.len());
    let total_segments = items.len();

    let job_input = input.clone();
    let job: Job = Box::new(move |ctx: &TaskContext| {
        // 磁盘空间预检（DESIGN §8.2）：估算 ≈ 源大小 × 片段时长占比
        let source_size = std::fs::metadata(&job_input)
            .map(|m| m.len())
            .unwrap_or(0);
        let total_duration =
            probe::probe_duration_sync(&ffprobe, &job_input).unwrap_or(0.0);
        if source_size > 0 && total_duration > 0.0 {
            let want_sec: f64 = items.iter().map(|it| it.dur).sum();
            let estimate = (source_size as f64 * (want_sec / total_duration).min(1.0)) as u64;
            let available = fs4::available_space(&out_dir).unwrap_or(u64::MAX);
            if available < estimate {
                return Err(format!(
                    "输出磁盘空间不足：预计需要约 {:.2} GB，可用 {:.2} GB",
                    estimate as f64 / 1e9,
                    available as f64 / 1e9
                ));
            }
        }

        for (i, item) in items.iter().enumerate() {
            if ctx.is_cancelled() {
                let _ = std::fs::remove_file(&item.part);
                return Err("已取消".into());
            }
            let _ = std::fs::remove_file(&item.part);

            let last = Cell::new(Instant::now() - Duration::from_millis(250));
            let result = worker::run_ffmpeg(
                ctx,
                &ffmpeg,
                &command::cut_args(item.start, item.dur, &job_input, &item.part.to_string_lossy()),
                item.dur,
                &|local, _| {
                    let now = Instant::now();
                    if now.duration_since(last.get()) >= Duration::from_millis(200)
                        || local >= 1.0
                    {
                        last.set(now);
                        ctx.set_progress((i as f64 + local) / total_segments as f64);
                    }
                },
            );

            match result {
                Ok(()) => {
                    let _ = std::fs::remove_file(&item.final_path);
                    std::fs::rename(&item.part, &item.final_path)
                        .map_err(|e| format!("重命名输出失败：{e}"))?;
                    ctx.add_output(item.final_path.to_string_lossy().into_owned());
                }
                Err(e) => {
                    let _ = std::fs::remove_file(&item.part);
                    return Err(e);
                }
            }
        }
        Ok(())
    });

    Ok(state.0.submit(Arc::new(TauriEmitter(app)), "cut", &label, job))
}
