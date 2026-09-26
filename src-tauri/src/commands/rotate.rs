//! 旋转：元数据级无损优先，重编码为高级选项（DESIGN §3.4、§6.3⑤⑥）。
//! 支持旋转与水平/垂直翻转任意组合。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, State};

use super::ProgressThrottle;
use crate::ffmpeg::probe;
use crate::ffmpeg::{command};
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::task::worker;
use crate::{AppTasks, QualityPreset};

pub fn submit_rotate(
    app: AppHandle,
    state: &State<'_, AppTasks>,
    input: String,
    rotate_deg: i32,
    hflip: bool,
    vflip: bool,
    output: String,
    transcode: bool,
    quality: QualityPreset,
    locked_encoder: Option<String>,
) -> Result<String, String> {
    if !Path::new(&input).is_file() {
        return Err(format!("输入文件不存在：{input}"));
    }
    // 输出不得落在输入上（同一性比较走 fs::same_path 的归一化，见 R3-7）
    crate::fs::reject_if_input_equals(Path::new(&output), &[&input])?;
    // ADR-033：元数据旋转是 copy（容器跟随源）；重编码旋转统一 mp4。最终名按容器校正（含同名不覆盖兜底）
    let container_ext = if transcode {
        "mp4".to_string()
    } else {
        crate::fs::source_container_ext(&input)
    };
    let out = crate::fs::output_path_for(&PathBuf::from(&output), &container_ext);
    crate::fs::reject_if_input_equals(&out, &[&input])?;
    let out_dir = out
        .parent()
        .ok_or_else(|| "输出路径无效".to_string())?
        .to_path_buf();
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("无法创建输出目录：{e}"))?;
    let ffmpeg = command::resolve_sidecar("ffmpeg")?;
    let ffprobe = command::resolve_sidecar("ffprobe")?;

    let in_name = Path::new(&input)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&input)
        .to_string();
    let out_name = out
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "输出文件名无效".to_string())?
        .to_string();
    // 半成品与成品**共用同一容器扩展名**（ADR-033 ④；ffmpeg 靠扩展名推断封装）+ 提交级令牌
    let token = super::pipeline::temp_token(&output);
    let part = out_dir.join(format!("{out_name}.part.{token}.{container_ext}"));

    let label = if transcode {
        format!("旋转（重编码）{in_name}")
    } else {
        format!("旋转（无损）{in_name}")
    };

    let job_input = input.clone();
    let job_out_dir = out_dir.clone();
    let job: Job = Box::new(move |ctx: &TaskContext| {
        // 磁盘空间预检（DESIGN §8.2）：remux ≈ 源大小；重编码同码率量级，同一上界
        super::require_disk_space(&job_out_dir, super::file_size(&job_input))?;

        let facts = probe::probe_merge_facts_sync(&ffprobe, &job_input)
            .map_err(|e| format!("{}：{e}", in_name))?;
        let duration = facts.info.duration_sec;
        let pix_fmt = facts.info.video.pix_fmt.clone();

        let args = if transcode {
            let encoder = command::effective_encoder(locked_encoder.as_deref(), &pix_fmt);
            command::rotate_transcode_args(
                rotate_deg,
                hflip,
                vflip,
                &job_input,
                &part.to_string_lossy(),
                &encoder,
                quality,
            )
        } else {
            // 绝角度 = 源 metadata 旋转 + 用户增量（-display_rotation 为覆盖语义）
            let current = facts.info.rotation.unwrap_or(0);
            let abs = (current + rotate_deg).rem_euclid(360);
            command::rotate_remux_args_deg(
                abs,
                hflip,
                vflip,
                &job_input,
                &part.to_string_lossy(),
            )
        };

        let throttle = ProgressThrottle::new();
        let r = worker::run_ffmpeg(ctx, &ffmpeg, &args, duration, &|local, speed| {
            if throttle.update(local) {
                ctx.set_progress(local, speed);
            }
        });

        match r {
            Ok(()) => {
                // 原子替换：不得先删旧产物再改名，否则 rename 失败时两头空（`BUG-002`）
                crate::fs::atomic_replace(&part, &out)?;
                ctx.add_output(out.to_string_lossy().into_owned());
                Ok(())
            }
            Err(e) => {
                let _ = std::fs::remove_file(&part);
                Err(e)
            }
        }
    });

    Ok(state.0.submit(Arc::new(TauriEmitter(app)), "rotate", &label, job))
}
