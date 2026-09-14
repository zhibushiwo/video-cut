//! 局部放大：crop + scale 放大输出（DESIGN §3.5、§6.3⑦）。必然重编码。

use std::cell::Cell;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, State};

use crate::ffmpeg::probe;
use crate::ffmpeg::command;
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::task::worker;
use crate::{AppTasks, MediaInfo, QualityPreset};

/// 校验并偶数对齐选区。返回 (x, y, w, h, out_w, out_h)。
pub(crate) fn normalize_crop_rect(
    info: &MediaInfo,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    out_width: Option<u32>,
    out_height: Option<u32>,
) -> Result<(u32, u32, u32, u32, u32, u32), String> {
    align_rect(
        info.video.width,
        info.video.height,
        x,
        y,
        width,
        height,
        out_width,
        out_height,
    )
}

/// 选区校验核心（偶数对齐 + 越界检查），坐标系由调用方决定
/// （源空间或工作台的显示空间）。
pub(crate) fn align_rect(
    src_w: u32,
    src_h: u32,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    out_width: Option<u32>,
    out_height: Option<u32>,
) -> Result<(u32, u32, u32, u32, u32, u32), String> {
    // 偶数对齐：向内取整（yuv420p 编码要求偶数尺寸）
    let even = |v: u32| v - (v % 2);
    let width = even(width);
    let height = even(height);
    let x = even(x);
    let y = even(y);
    if width == 0 || height == 0 {
        return Err("裁剪区域宽高为 0".into());
    }
    if x + width > src_w || y + height > src_h {
        return Err(format!(
            "裁剪区域越界：({x}+{width}, {y}+{height}) 超出画面 {src_w}×{src_h}"
        ));
    }
    let (out_w, out_h) = match (out_width, out_height) {
        (Some(w), Some(h)) => (even(w), even(h)),
        _ => (src_w, src_h), // 默认放大回源分辨率
    };
    if out_w == 0 || out_h == 0 {
        return Err("输出尺寸无效".into());
    }
    Ok((x, y, width, height, out_w, out_h))
}

#[allow(clippy::too_many_arguments)]
pub async fn validate_crop_rect(
    app: &AppHandle,
    input: &str,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    out_width: Option<u32>,
    out_height: Option<u32>,
) -> Result<(u32, u32, u32, u32, u32, u32), String> {
    let info = probe::probe_media(app, input).await?;
    normalize_crop_rect(&info, x, y, width, height, out_width, out_height)
}

#[allow(clippy::too_many_arguments)]
pub fn submit_crop(
    app: AppHandle,
    state: &State<'_, AppTasks>,
    input: String,
    rect: (u32, u32, u32, u32, u32, u32),
    quality: QualityPreset,
    output: String,
    locked_encoder: Option<String>,
) -> Result<String, String> {
    let (x, y, width, height, out_w, out_h) = rect;
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

    let label = format!("局部放大 {in_name}");

    let job_input = input.clone();
    let job_out_dir = out_dir.clone();
    let job: Job = Box::new(move |ctx: &TaskContext| {
        // 磁盘空间预检（DESIGN §8.2）：重编码输出与源同码率量级
        super::require_disk_space(&job_out_dir, super::file_size(&job_input))?;

        let facts = probe::probe_merge_facts_sync(&ffprobe, &job_input)
            .map_err(|e| format!("{}：{e}", in_name))?;
        let duration = facts.info.duration_sec;
        let pix_fmt = facts.info.video.pix_fmt.clone();

        let encoder = command::effective_encoder(locked_encoder.as_deref(), &pix_fmt);
        let args = command::crop_zoom_args(
            &job_input,
            x,
            y,
            width,
            height,
            out_w,
            out_h,
            &encoder,
            quality,
            &part.to_string_lossy(),
        );

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

    Ok(state.0.submit(Arc::new(TauriEmitter(app)), "crop_zoom", &label, job))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn info_1080p() -> MediaInfo {
        let v = json!({
            "streams": [{ "codec_name": "h264", "codec_type": "video",
                "width": 1920, "height": 1080, "pix_fmt": "yuv420p", "avg_frame_rate": "30/1" }],
            "format": { "format_name": "mp4", "duration": "10.0", "size": "1000" }
        });
        probe::parse_media_json(&v).unwrap()
    }

    #[test]
    fn rect_aligns_to_even_and_keeps_defaults() {
        let (x, y, w, h, ow, oh) =
            normalize_crop_rect(&info_1080p(), 101, 201, 801, 601, None, None).unwrap();
        assert_eq!((x, y, w, h), (100, 200, 800, 600));
        assert_eq!((ow, oh), (1920, 1080)); // 默认放大回源分辨率
    }

    #[test]
    fn rect_rejects_out_of_bounds() {
        assert!(normalize_crop_rect(&info_1080p(), 1900, 0, 800, 600, None, None).is_err());
        assert!(normalize_crop_rect(&info_1080p(), 0, 0, 0, 600, None, None).is_err());
    }

    #[test]
    fn rect_accepts_custom_out_size() {
        let (.., ow, oh) = normalize_crop_rect(&info_1080p(), 0, 0, 800, 600, Some(1281), Some(721)).unwrap();
        assert_eq!((ow, oh), (1280, 720));
    }
}
