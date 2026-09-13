//! 旋转：元数据级无损优先，重编码为高级选项（DESIGN §3.4、§6.3⑤⑥）。
//! 支持旋转与水平/垂直翻转任意组合。

use std::cell::Cell;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, State};

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
    if Path::new(&input) == Path::new(&output) {
        return Err("输出文件不能与输入文件相同".into());
    }
    let out = PathBuf::from(&output);
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
    // 半成品保留真实扩展名 + 提交级令牌，防并发任务互写（DESIGN §8.2）
    let token = super::pipeline::temp_token(&output);
    let part = out_dir.join(format!("{out_name}.part.{token}.mp4"));

    let label = if transcode {
        format!("旋转（重编码）{in_name}")
    } else {
        format!("旋转（无损）{in_name}")
    };

    let job_input = input.clone();
    let job: Job = Box::new(move |ctx: &TaskContext| {
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

        let last = Cell::new(Instant::now() - Duration::from_millis(250));
        let r = worker::run_ffmpeg(ctx, &ffmpeg, &args, duration, &|local, _| {
            let now = Instant::now();
            if now.duration_since(last.get()) >= Duration::from_millis(200) || local >= 1.0 {
                last.set(now);
                ctx.set_progress(local);
            }
        });

        match r {
            Ok(()) => {
                let _ = std::fs::remove_file(&out);
                std::fs::rename(&part, &out).map_err(|e| format!("重命名输出失败：{e}"))?;
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
