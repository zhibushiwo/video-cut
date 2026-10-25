//! 剪切任务提交：极速（stream copy）与精确（重编码）双模式（DESIGN §3.2、§6.3①②）。
//! 同时是四类任务的统一提交入口（§5.4）。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, State};

use super::{file_name, ProgressThrottle};
use crate::ffmpeg::{command, probe};
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::task::worker;
use crate::{AppTasks, CutMode, VideoTask};

/// 统一任务入口：按类型分发（DESIGN §5.4）。crop 需要预校验选区，故为 async。
#[tauri::command]
pub async fn submit_task(
    app: AppHandle,
    state: State<'_, AppTasks>,
    task: VideoTask,
) -> Result<String, String> {
    // 任务提交载荷全量入日志（DESIGN §12.1），排查"导出结果不对"类问题
    log::info!(
        "任务提交：{}",
        serde_json::to_string(&task).unwrap_or_else(|_| format!("{task:?}"))
    );
    match task {
        VideoTask::Cut {
            input,
            segments,
            output_dir,
            mode,
            encoder,
        } => submit_cut(app, &state, input, segments, output_dir, mode, encoder),
        VideoTask::Merge {
            inputs,
            output,
            force_transcode,
        } => super::merge::submit_merge(app, &state, inputs, output, force_transcode),
        VideoTask::Rotate {
            input,
            rotate_deg,
            hflip,
            vflip,
            output,
            transcode,
            quality,
            encoder,
        } => super::rotate::submit_rotate(
            app, &state, input, rotate_deg, hflip, vflip, output, transcode, quality, encoder,
        ),
        VideoTask::CropZoom {
            input,
            x,
            y,
            width,
            height,
            out_width,
            out_height,
            quality,
            output,
            encoder,
        } => {
            let rect = super::crop::validate_crop_rect(
                &app, &input, x, y, width, height, out_width, out_height,
            )
            .await?;
            super::crop::submit_crop(app, &state, input, rect, quality, output, encoder)
        }
        VideoTask::Pipeline {
            items,
            output,
            quality,
            encoder,
            preview,
        } => {
            super::pipeline::submit_pipeline(app, &state, items, output, quality, encoder, preview)
                .await
        }
        VideoTask::Subtitle {
            input,
            model_id,
            language,
            backend,
            output_dir,
        } => super::subtitle::submit_subtitle(
            app, &state, input, model_id, language, backend, output_dir,
        ),
        VideoTask::SubtitleBurn {
            input,
            subtitle_path,
            output,
            quality,
            encoder,
            style,
        } => super::subtitle::submit_subtitle_burn(
            app,
            &state,
            input,
            subtitle_path,
            output,
            quality,
            encoder,
            style,
        ),
        VideoTask::SubtitleMux {
            input,
            subtitle_path,
            output,
        } => super::subtitle::submit_subtitle_mux(app, &state, input, subtitle_path, output),
        VideoTask::Gif {
            input,
            start_sec,
            end_sec,
            output,
            fps,
        } => submit_gif(app, &state, input, start_sec, end_sec, output, fps).await,
    }
}

/// 提交 GIF 短片段导出（M23，FR-401，ADR-049）：作用于剪切页**当前选区**；
/// scale 由探测尺寸计算（长边 ≤480 等比取偶），产物容器 gif（`ADR-033`② 显式例外）。
pub(crate) async fn submit_gif(
    app: AppHandle,
    state: &State<'_, AppTasks>,
    input: String,
    start_sec: f64,
    end_sec: f64,
    output: String,
    fps: u32,
) -> Result<String, String> {
    if !Path::new(&input).is_file() {
        return Err(format!("输入文件不存在：{input}"));
    }
    if !(1..=30).contains(&fps) {
        return Err(format!("GIF 帧率超出范围（1~30）：{fps}"));
    }
    if !super::valid_segment_span(start_sec, end_sec) {
        return Err(format!("GIF 区间无效：{} ~ {}", start_sec, end_sec));
    }
    let info = probe::probe_media(&app, &input)
        .await
        .map_err(|e| format!("{}：{e}", input))?;
    let Some(v) = info.video.as_ref() else {
        return Err("GIF 需要视频流（纯音频文件不支持）".into());
    };
    // 出点钳制到源时长；钳制后复查最小区间
    let end = if info.duration_sec > 0.0 {
        end_sec.min(info.duration_sec)
    } else {
        end_sec
    };
    if !super::valid_segment_span(start_sec, end) {
        return Err(format!("GIF 区间无效（钳制后）：{} ~ {}", start_sec, end));
    }
    let dur = end - start_sec;

    // scale：长边 ≤480 等比，宽高取偶（缩放器友好）
    let long = v.width.max(v.height) as f64;
    let k = if long > 480.0 { 480.0 / long } else { 1.0 };
    let scale_w = ((v.width as f64 * k).round() as u32).max(2) & !1;
    let scale_h = ((v.height as f64 * k).round() as u32).max(2) & !1;

    crate::fs::reject_if_input_equals(Path::new(&output), &[input.as_str()])?;
    // 容器口径（ADR-049③）：gif 固定；前端名校正 + 同名不静默覆盖兜底（决策 #19）
    let out = crate::fs::output_path_for(Path::new(&output), "gif");
    crate::fs::reject_if_input_equals(&out, &[input.as_str()])?;
    let super::PreparedOutput {
        out_dir,
        out_name,
        token,
        ffmpeg,
        ..
    } = super::prepare_output(&out, &output)?;
    let part = out_dir.join(format!("{out_name}.part.{token}.gif"));

    let job_input = input.clone();
    let job_part = part.to_string_lossy().into_owned();
    let job_final = out.clone();
    let label = format!("GIF {}", file_name(&input));

    let job: Job = Box::new(move |ctx: &TaskContext| {
        // 磁盘空间预检（DESIGN §8.2）：GIF 产物通常远小于源，按源体积预估即安全
        super::require_disk_space(
            Path::new(&job_final)
                .parent()
                .ok_or_else(|| "输出路径无效".to_string())?,
            super::file_size(&job_input),
        )?;
        let args = command::gif_args(start_sec, dur, &job_input, &job_part, fps, scale_w, scale_h);
        let throttle = ProgressThrottle::new();
        let r = worker::run_ffmpeg(ctx, &ffmpeg, &args, dur, &|local, speed| {
            if throttle.update(local) {
                ctx.set_progress(local, speed);
            }
        });
        if r.is_err() {
            let _ = std::fs::remove_file(&job_part);
        }
        r?;
        // 原子落位：`.part` → 最终产物（`BUG-002` 同口径）
        crate::fs::atomic_replace(Path::new(&job_part), Path::new(&job_final))?;
        ctx.add_output(job_final.to_string_lossy().into_owned());
        Ok(())
    });
    Ok(state
        .0
        .submit(Arc::new(TauriEmitter(app)), "gif", &label, job))
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
    mode: CutMode,
    locked_encoder: Option<String>,
) -> Result<String, String> {
    let precise = mode == CutMode::Precise;
    // ---------- 校验（DESIGN §13） ----------
    if !Path::new(&input).is_file() {
        return Err(format!("输入文件不存在：{input}"));
    }
    if segments.is_empty() {
        return Err("请至少添加一个剪切片段".into());
    }
    for s in &segments {
        if !super::valid_segment_span(s.start_sec, s.end_sec) {
            return Err(format!("片段区间无效：{} ~ {}", s.start_sec, s.end_sec));
        }
    }
    std::fs::create_dir_all(&output_dir).map_err(|e| format!("无法创建输出目录：{e}"))?;
    let ffmpeg = command::resolve_sidecar("ffmpeg")?;
    let ffprobe = command::resolve_sidecar("ffprobe")?;
    // 纯音频文件拒绝剪切（DESIGN §14 错误表既有规格行；探测命中 LRU 缓存，代价可忽略）
    let probe_info =
        probe::probe_merge_facts_sync(&ffprobe, &input).map_err(|e| format!("{}：{e}", input))?;
    if probe_info.info.video.is_none() {
        return Err("剪切需要视频流（纯音频文件不支持）".into());
    }

    let src = Path::new(&input);
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output")
        .to_string();
    // ADR-033：极速剪切是 stream copy → 容器跟随源；精确剪切是重编码 → 容器统一 mp4
    let ext = if precise {
        "mp4".to_string()
    } else {
        crate::fs::source_container_ext(&input)
    };
    let out_dir = PathBuf::from(&output_dir);

    let items: Vec<CutItem> = {
        // 提交级令牌：同名输出的并发任务不再互写半成品（DESIGN §8.2）
        let token = super::temp_token(&input);
        // 同名才追加时间戳（DESIGN §8.3 / 决策 #19）：上次导出的分片还在时不静默覆盖
        let ts = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let part_name = |i: usize| -> String {
            let base = format!("{stem}_part_{i:03}.{ext}");
            if out_dir.join(&base).exists() {
                format!("{stem}_part_{i:03}_{ts}.{ext}")
            } else {
                base
            }
        };
        segments
            .iter()
            .enumerate()
            .map(|(i, s)| {
                let name = part_name(i + 1);
                CutItem {
                    final_path: out_dir.join(&name),
                    // 半成品与成品共用同一容器扩展名（ADR-033 ④），否则 ffmpeg 无法推断封装格式
                    part: out_dir.join(format!(
                        "{}_part_{:03}.{}.part.{}",
                        stem,
                        i + 1,
                        token,
                        ext
                    )),
                    start: s.start_sec,
                    dur: s.end_sec - s.start_sec,
                }
            })
            .collect()
    };

    let mode_label = if precise {
        "精确剪切（重编码）"
    } else {
        "剪切"
    };
    let label = format!(
        "{mode_label} {}（{} 个片段）",
        src.file_name().and_then(|n| n.to_str()).unwrap_or(&input),
        items.len()
    );
    let total_segments = items.len();

    let job_input = input.clone();
    let job_out_dir = out_dir.clone();
    let job: Job = Box::new(move |ctx: &TaskContext| {
        // 磁盘空间预检（DESIGN §8.2）：估算 ≈ 源大小 × 片段时长占比
        let total_duration = probe::probe_duration_sync(&ffprobe, &job_input).unwrap_or(0.0);
        if total_duration > 0.0 {
            let want_sec: f64 = items.iter().map(|it| it.dur).sum();
            let estimate =
                (super::file_size(&job_input) as f64 * (want_sec / total_duration).min(1.0)) as u64;
            super::require_disk_space(&job_out_dir, estimate)?;
        }

        // 精确模式：优先设置中锁定的编码器，否则按源像素格式自动探测（10bit → HEVC 路径）
        let encoder = if precise {
            let facts = probe::probe_merge_facts_sync(&ffprobe, &job_input)
                .map_err(|e| format!("{}：{e}", file_name(&job_input)))?;
            Some(command::effective_encoder(
                locked_encoder.as_deref(),
                &facts
                    .info
                    .video
                    .as_ref()
                    .map(|v| v.pix_fmt.clone())
                    .unwrap_or_default(),
            ))
        } else {
            None
        };

        for (i, item) in items.iter().enumerate() {
            if ctx.is_cancelled() {
                let _ = std::fs::remove_file(&item.part);
                return Err("已取消".into());
            }
            let _ = std::fs::remove_file(&item.part);

            let throttle = ProgressThrottle::new();
            let args = if precise {
                command::precise_cut_args(
                    item.start,
                    item.dur,
                    &job_input,
                    &item.part.to_string_lossy(),
                    encoder.as_deref().unwrap_or("libx264"),
                    crate::QualityPreset::Balanced,
                )
            } else {
                command::cut_args(
                    item.start,
                    item.dur,
                    &job_input,
                    &item.part.to_string_lossy(),
                )
            };
            let r = worker::run_ffmpeg(ctx, &ffmpeg, &args, item.dur, &|local, speed| {
                if throttle.update(local) {
                    ctx.set_progress((i as f64 + local) / total_segments as f64, speed);
                }
            });

            match r {
                Ok(()) => {
                    // 原子替换：不得先删旧产物再改名，否则 rename 失败时两头空（`BUG-002`）
                    crate::fs::atomic_replace(&item.part, &item.final_path)?;
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

    Ok(state
        .0
        .submit(Arc::new(TauriEmitter(app)), "cut", &label, job))
}

/// 单帧截图（M24，`FR-403`）：同步命令——单帧秒级以内，不进任务面板（红线 7 的
/// "长耗时"不适用）；走 `spawn_hidden`（红线 3）与 `.part` → `atomic_replace`（红线 5/19）。
#[tauri::command]
pub async fn extract_frame(input: String, time_sec: f64, output: String) -> Result<String, String> {
    if !Path::new(&input).is_file() {
        return Err(format!("输入文件不存在：{input}"));
    }
    if !time_sec.is_finite() || time_sec < 0.0 {
        return Err(format!("截图时刻无效：{time_sec}"));
    }
    crate::fs::reject_if_input_equals(Path::new(&output), &[input.as_str()])?;

    tauri::async_runtime::spawn_blocking(move || {
        let ffmpeg = command::resolve_sidecar("ffmpeg")?;
        let token = super::temp_token(&output);
        let part = PathBuf::from(format!("{}.part.{token}.png", output));
        let result = (|| -> Result<(), String> {
            let mut cmd = std::process::Command::new(&ffmpeg);
            cmd.args(command::frame_png_args(
                time_sec,
                &input,
                &part.to_string_lossy(),
            ));
            command::spawn_hidden(&mut cmd);
            let out = cmd.output().map_err(|e| format!("ffmpeg 启动失败：{e}"))?;
            if !out.status.success() {
                let stderr = String::from_utf8_lossy(&out.stderr);
                let tail: String = stderr
                    .chars()
                    .rev()
                    .take(300)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect();
                return Err(format!("截图失败：{tail}"));
            }
            // 原子替换：不得先删旧产物再改名，否则 rename 失败时两头空（`BUG-002`）
            crate::fs::atomic_replace(&part, Path::new(&output))
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&part);
        }
        result.map(|_| output)
    })
    .await
    .map_err(|e| format!("截图任务失败：{e}"))?
}
