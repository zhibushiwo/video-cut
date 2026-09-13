//! FFmpeg 命令构建器：全项目唯一拼装 ffmpeg 参数的地方（DESIGN §6.2/§6.3）。

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::{EnvironmentInfo, QualityPreset};

// ---------- 二进制定位 ----------

/// 同步解析 sidecar 二进制路径，与 Tauri sidecar 约定一致：
/// 主程序同目录 + `{name}-{target-triple}.exe`（tauri-build 在构建时复制到该位置）。
/// 任务作业线程使用（异步命令则走 shell 插件 API）。
/// 同步解析 sidecar 二进制路径，与 tauri-plugin-shell 行为一致：
/// 主程序同目录 + `{name}.exe`（tauri-build 复制 sidecar 时会去掉 target-triple 后缀，
/// 开发与打包后的运行目录布局相同）；cargo test 的测试二进制位于 deps/，需上溯一级。
pub fn resolve_sidecar(name: &str) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法定位程序目录：{e}"))?;
    let mut dir = exe.parent().ok_or_else(|| "程序目录缺失".to_string())?.to_path_buf();
    if dir.ends_with("deps") {
        dir = dir.parent().map(PathBuf::from).unwrap_or(dir);
    }
    let path = dir.join(format!("{name}.exe"));
    if !path.exists() {
        return Err(format!("未找到 {name}（期望位置：{}）", path.display()));
    }
    Ok(path)
}

async fn probe_version(app: &AppHandle, name: &str) -> Result<String, String> {
    let cmd = app
        .shell()
        .sidecar(name)
        .map_err(|e| format!("未找到 {name}：{e}"))?;
    let out = cmd
        .arg("-version")
        .output()
        .await
        .map_err(|e| format!("无法启动 {name}：{e}"))?;
    if !out.status.success() {
        return Err(format!("{name} 以非零状态退出"));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    stdout
        .lines()
        .next()
        .and_then(|line| line.split("version").nth(1))
        .map(|rest| {
            rest.trim()
                .split_whitespace()
                .next()
                .unwrap_or(rest.trim())
                .to_string()
        })
        .ok_or_else(|| format!("{name} -version 输出无法解析"))
}

/// 检查 ffmpeg / ffprobe 可用性。失败不阻塞应用，由 UI 呈现就绪状态。
pub async fn check_environment(app: &AppHandle) -> EnvironmentInfo {
    let ffmpeg = probe_version(app, "ffmpeg").await;
    let ffprobe = probe_version(app, "ffprobe").await;
    match (ffmpeg, ffprobe) {
        (Ok(f), Ok(p)) => EnvironmentInfo {
            ok: true,
            ffmpeg_version: Some(f),
            ffprobe_version: Some(p),
            message: None,
        },
        (Err(e), _) | (_, Err(e)) => EnvironmentInfo {
            ok: false,
            ffmpeg_version: None,
            ffprobe_version: None,
            message: Some(e),
        },
    }
}

// ---------- 参数构建（DESIGN §6.2 统一规则） ----------

fn fmt_sec(sec: f64) -> String {
    format!("{:.3}", sec.max(0.0))
}

/// 极速剪切（stream copy，DESIGN §6.3①）。
///
/// `-ss` 在 `-i` 前（输入侧 seek，落点=≤start 的关键帧）；`-t` 用时长避免时间基准歧义；
/// `-map 0` 保留全部流；`-avoid_negative_ts make_zero` 修正时间戳。
pub fn cut_args(start_sec: f64, duration_sec: f64, input: &str, output: &str) -> Vec<String> {
    [
        "-hide_banner",
        "-nostats",
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        "-stats_period",
        "0.2",
        "-ss",
        &fmt_sec(start_sec),
        "-i",
        input,
        "-t",
        &fmt_sec(duration_sec),
        "-map",
        "0",
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        "-y",
        output,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// 代理预览生成（DESIGN §6.3⑧）：720p 上限（不放大）、H.264 + AAC、yuv420p。
pub fn proxy_args(input: &str, output: &str) -> Vec<String> {
    [
        "-hide_banner",
        "-nostats",
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        "-stats_period",
        "0.2",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        "scale=-2:min(720\\,ih),format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-y",
        output,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// 解析 ffprobe 的 time_base 字符串（"1/60000"）为 mp4 timescale（60000）。
/// 非 "1/N" 形式返回 0（调用方省略 timescale 控制）。
pub fn parse_timescale(video_time_base: &str) -> u32 {
    let (num, den) = video_time_base
        .split_once('/')
        .map(|(a, b)| (a.trim(), b.trim()))
        .unwrap_or(("", ""));
    match (num.parse::<u64>(), den.parse::<u64>()) {
        (Ok(1), Ok(d)) if d > 0 && d <= u32::MAX as u64 => d as u32,
        _ => 0,
    }
}

/// 参数统一转码（DESIGN §6.3④）：scale + fps + format，libx264 + aac 192k。
/// `video_timescale` > 0 时强制视频轨 timescale，保证与基准片段 time_base 一致
/// （concat demuxer 对 tb 不一致的 copy 拼接会错乱第二段的时间戳，见 §6.3⑨⑩）。
#[allow(dead_code)] // M2 起由 commands/merge.rs 使用
pub fn normalize_args(
    input: &str,
    width: u32,
    height: u32,
    fps: f64,
    pix_fmt: &str,
    video_timescale: u32,
    output: &str,
) -> Vec<String> {
    let vf = format!("scale={width}:{height}:flags=lanczos,fps={fps:.3},format={pix_fmt}");
    let mut args: Vec<String> = [
        "-hide_banner",
        "-nostats",
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        "-stats_period",
        "0.2",
        "-i",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    args.push(input.into());
    args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "0:a:0?".into()]);
    args.extend(["-vf".into(), vf, "-c:v".into(), "libx264".into()]);
    args.extend(["-preset".into(), "medium".into(), "-crf".into(), "20".into()]);
    args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "192k".into()]);
    if video_timescale > 0 {
        args.extend(["-video_track_timescale".into(), video_timescale.to_string()]);
    }
    args.extend(["-y".into(), output.into()]);
    args
}

/// 合并 concat 列表内容（DESIGN §6.3③）：正斜杠 + 单引号包裹 + 单引号双写转义。
pub fn concat_list_content(paths: &[String]) -> String {
    let mut s = String::new();
    for p in paths {
        let normalized = p.replace('\\', "/");
        let escaped = normalized.replace('\'', "'\\''");
        s.push_str(&format!("file '{escaped}'\n"));
    }
    s
}

/// 无损合并（concat demuxer + stream copy，DESIGN §6.3③）。
pub fn concat_args(list_file: &str, output: &str) -> Vec<String> {    [
        "-hide_banner",
        "-nostats",
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        "-stats_period",
        "0.2",
        "-f",
        "concat",
        "-safe",
        "0",
        "-fflags",
        "+genpts",
        "-i",
        list_file,
        "-map",
        "0",
        "-c",
        "copy",
        "-y",
        output,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// 首帧缩略图提取（合并列表辨识用）：取 ~1s 处一帧，缩到 160px 宽。
pub fn thumbnail_args(input: &str, output: &str) -> Vec<String> {
    [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "1",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-vf",
        "scale=160:-2",
        "-q:v",
        "4",
        "-y",
        output,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

// ---------- 编码器探测与质量档位（DESIGN §3.5、§10） ----------

/// 试跑一个极短编码判断硬件编码器在本机是否可用（结果缓存，进程内只探测一次）。
fn encoder_works(encoder: &str) -> bool {
    let Ok(ffmpeg) = resolve_sidecar("ffmpeg") else {
        return false;
    };
    Command::new(&ffmpeg)
        .args([
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=320x240:d=0.1",
            "-frames:v",
            "3",
            "-c:v",
            encoder,
            "-f",
            "null",
            "-",
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn first_working(candidates: &[&str]) -> Option<String> {
    candidates
        .iter()
        .find(|c| encoder_works(c))
        .map(|c| c.to_string())
}

/// 按像素格式选择编码器：10/12bit 优先 HEVC（硬编 → libx265），否则 H.264（硬编 → libx264）。
/// 硬件探测结果缓存在 OnceLock，进程生命周期内只试跑一次（DESIGN §3.5、§14-M3-9）。
pub fn resolve_encoder(pix_fmt: &str) -> String {
    static H264: OnceLock<Option<String>> = OnceLock::new();
    static HEVC: OnceLock<Option<String>> = OnceLock::new();
    let high_depth = pix_fmt.contains("10le") || pix_fmt.contains("12le");
    if high_depth {
        HEVC.get_or_init(|| first_working(&["hevc_nvenc", "hevc_qsv", "hevc_amf"]))
            .clone()
            .unwrap_or_else(|| "libx265".to_string())
    } else {
        H264.get_or_init(|| first_working(&["h264_nvenc", "h264_qsv", "h264_amf"]))
            .clone()
            .unwrap_or_else(|| "libx264".to_string())
    }
}

/// 设置中可锁定的编码器全集（DESIGN §3.5/§12，与前端 EncoderChoice 对齐）。
pub const LOCKABLE_ENCODERS: [&str; 5] =
    ["h264_nvenc", "h264_qsv", "h264_amf", "libx264", "libx265"];

/// 任务显式锁定编码器时校验并采用；None 或非法值回退像素格式自动探测。
pub fn effective_encoder(locked: Option<&str>, pix_fmt: &str) -> String {
    match locked {
        Some(e) if LOCKABLE_ENCODERS.contains(&e) => e.to_string(),
        _ => resolve_encoder(pix_fmt),
    }
}

/// 质量档位 → 编码参数（集中映射，DESIGN §3.5：高质量/平衡/小体积）。
pub fn encoder_quality_args(encoder: &str, quality: QualityPreset) -> Vec<String> {
    let (cq, amf_quality, crf, preset): (&str, &str, &str, &str) = match quality {
        QualityPreset::High => ("19", "quality", "16", "slow"),
        QualityPreset::Balanced => ("24", "balanced", "20", "medium"),
        QualityPreset::Small => ("28", "speed", "26", "fast"),
    };
    if encoder.ends_with("nvenc") {
        vec!["-rc".into(), "vbr".into(), "-cq".into(), cq.into(), "-b:v".into(), "0".into()]
    } else if encoder.ends_with("qsv") {
        vec!["-global_quality".into(), cq.into()]
    } else if encoder.ends_with("amf") {
        vec!["-quality".into(), amf_quality.into()]
    } else {
        // libx264 / libx265
        vec!["-crf".into(), crf.into(), "-preset".into(), preset.into()]
    }
}

// ---------- 旋转（DESIGN §3.4、§6.3⑤⑥） ----------

/// 元数据级旋转（无损 remux，DESIGN §6.3⑤）：只改显示矩阵，像素原样复制。
/// `display_deg` 为绝对角度（0/90/180/270，正=顺时针）；翻转用独立开关。
pub fn rotate_remux_args_deg(
    display_deg: i32,
    hflip: bool,
    vflip: bool,
    input: &str,
    output: &str,
) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostats".into(),
        "-loglevel".into(),
        "error".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-stats_period".into(),
        "0.2".into(),
        "-display_rotation".into(),
        display_deg.to_string(),
    ];
    if hflip {
        args.push("-display_hflip".into());
    }
    if vflip {
        args.push("-display_vflip".into());
    }
    args.extend([
        "-i".into(),
        input.into(),
        "-map".into(),
        "0".into(),
        "-c".into(),
        "copy".into(),
        "-avoid_negative_ts".into(),
        "make_zero".into(),
        "-y".into(),
        output.into(),
    ]);
    args
}

/// 重编码变换的滤镜链（DESIGN §6.3⑥）：翻转先作用（源空间），再旋转。
/// 返回空串表示无变换（调用方省略 -vf）。
fn transform_filter(delta_deg: i32, hflip: bool, vflip: bool) -> String {
    let mut parts: Vec<&str> = Vec::new();
    if hflip {
        parts.push("hflip");
    }
    if vflip {
        parts.push("vflip");
    }
    match delta_deg.rem_euclid(360) {
        90 => parts.push("transpose=1"),
        180 => {
            parts.push("hflip");
            parts.push("vflip");
        }
        270 => parts.push("transpose=2"),
        _ => {}
    }
    parts.join(",")
}

/// 重编码变换（高级选项）：transpose/hflip/vflip 逐帧变换，音频 copy。
/// 滤镜链为空时不加 -vf。
pub fn rotate_transcode_args(
    delta_deg: i32,
    hflip: bool,
    vflip: bool,
    input: &str,
    output: &str,
    encoder: &str,
    quality: QualityPreset,
) -> Vec<String> {
    let vf = transform_filter(delta_deg, hflip, vflip);
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostats".into(),
        "-loglevel".into(),
        "error".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-stats_period".into(),
        "0.2".into(),
        "-i".into(),
        input.into(),
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a".into(),
    ];
    if !vf.is_empty() {
        args.extend(["-vf".into(), vf]);
    }
    args.extend(["-c:v".into(), encoder.into()]);
    args.extend(encoder_quality_args(encoder, quality));
    args.extend(["-c:a".into(), "copy".into(), "-y".into(), output.into()]);
    args
}

// ---------- 局部放大（DESIGN §3.5、§6.3⑦） ----------

/// crop + scale(lanczos) 链。rect 必须已做偶数对齐与越界校验（submit 层负责）。
pub fn crop_zoom_args(
    input: &str,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    out_width: u32,
    out_height: u32,
    encoder: &str,
    quality: QualityPreset,
    output: &str,
) -> Vec<String> {
    let vf = format!(
        "crop={width}:{height}:{x}:{y},scale={out_width}:{out_height}:flags=lanczos"
    );
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostats".into(),
        "-loglevel".into(),
        "error".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-stats_period".into(),
        "0.2".into(),
        "-i".into(),
        input.into(),
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a".into(),
        "-vf".into(),
        vf,
        "-c:v".into(),
        encoder.into(),
    ];
    args.extend(encoder_quality_args(encoder, quality));
    args.extend(["-c:a".into(), "copy".into(), "-y".into(), output.into()]);
    args
}

// ---------- 精确剪切（DESIGN §3.2、§6.3②） ----------

/// 精确剪切（重编码）：`-ss` 在 `-i` 后（输出侧 seek，解码到帧后精确开始）；
/// 音频 copy 不转码；字幕流无法与重编码视频对齐，丢弃（UI 已提示）。
pub fn precise_cut_args(
    start_sec: f64,
    duration_sec: f64,
    input: &str,
    output: &str,
    encoder: &str,
    quality: QualityPreset,
) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostats".into(),
        "-loglevel".into(),
        "error".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-stats_period".into(),
        "0.2".into(),
        "-i".into(),
        input.into(),
        "-ss".into(),
        fmt_sec(start_sec),
        "-t".into(),
        fmt_sec(duration_sec),
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a".into(),
        "-c:v".into(),
        encoder.into(),
    ];
    args.extend(encoder_quality_args(encoder, quality));
    args.extend(["-c:a".into(), "copy".into(), "-y".into(), output.into()]);
    args
}

// ---------- 工作台流水线（DESIGN §3.8、§6.3⑨⑩） ----------

/// 工作台无损片段：剪切（可选）+ 元数据旋转（可选）一条 copy 命令完成。
/// `-display_rotation`（覆盖语义）与 `-ss` 同为输入选项，必须都在 `-i` 之前。
pub fn pipeline_copy_args(
    segment: Option<(f64, f64)>,
    display_deg: i32,
    hflip: bool,
    vflip: bool,
    input: &str,
    output: &str,
) -> Vec<String> {
    let mut args: Vec<String> = [
        "-hide_banner",
        "-nostats",
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        "-stats_period",
        "0.2",
        "-display_rotation",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    args.push(display_deg.to_string());
    if hflip {
        args.push("-display_hflip".into());
    }
    if vflip {
        args.push("-display_vflip".into());
    }
    if let Some((start, _)) = segment {
        args.extend(["-ss".into(), fmt_sec(start)]);
    }
    args.extend(["-i".into(), input.into()]);
    if let Some((_, dur)) = segment {
        args.extend(["-t".into(), fmt_sec(dur)]);
    }
    args.extend([
        "-map".into(),
        "0".into(),
        "-c".into(),
        "copy".into(),
        "-avoid_negative_ts".into(),
        "make_zero".into(),
        "-y".into(),
        output.into(),
    ]);
    args
}

/// 工作台重编码片段：精确剪切（可选）+ 像素变换（可选）+ 裁剪放大（可选），
/// 单次编码完成。`-display_rotation 0` 剥离源方向矩阵（防双重旋转）；
/// 滤镜顺序固定：翻转（源像素空间）→ 旋转 → 裁剪（显示空间）→ 缩放。
/// `video_timescale` > 0 时强制视频轨 timescale 与基准片段一致
/// （concat demuxer 对 tb 不一致的 copy 拼接会错乱后续段时间戳，DESIGN §6.3⑨⑩）。
#[allow(clippy::too_many_arguments)]
pub fn pipeline_transcode_args(
    segment: Option<(f64, f64)>,
    bake_deg: i32,
    bake_hflip: bool,
    bake_vflip: bool,
    crop: Option<(u32, u32, u32, u32, u32, u32)>, // (x, y, w, h, out_w, out_h) 显示空间
    encoder: &str,
    quality: QualityPreset,
    video_timescale: u32,
    input: &str,
    output: &str,
) -> Vec<String> {
    let mut args: Vec<String> = [
        "-hide_banner",
        "-nostats",
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        "-stats_period",
        "0.2",
        "-display_rotation",
        "0",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    args.extend(["-i".into(), input.into()]);
    if let Some((start, dur)) = segment {
        args.extend(["-ss".into(), fmt_sec(start), "-t".into(), fmt_sec(dur)]);
    }
    args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "0:a".into()]);

    let mut vf_parts: Vec<String> = Vec::new();
    let transform = transform_filter(bake_deg, bake_hflip, bake_vflip);
    if !transform.is_empty() {
        vf_parts.push(transform);
    }
    if let Some((x, y, w, h, out_w, out_h)) = crop {
        vf_parts.push(format!("crop={w}:{h}:{x}:{y}"));
        vf_parts.push(format!("scale={out_w}:{out_h}:flags=lanczos"));
    }
    if !vf_parts.is_empty() {
        args.extend(["-vf".into(), vf_parts.join(",")]);
    }
    args.extend(["-c:v".into(), encoder.into()]);
    args.extend(encoder_quality_args(encoder, quality));
    args.extend(["-c:a".into(), "copy".into()]);
    if video_timescale > 0 {
        args.extend(["-video_track_timescale".into(), video_timescale.to_string()]);
    }
    args.extend(["-y".into(), output.into()]);
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cut_args_follows_design_template() {
        let args = cut_args(30.0, 20.0, "in.mp4", "out.mp4");
        assert_eq!(
            args,
            vec![
                "-hide_banner",
                "-nostats",
                "-loglevel",
                "error",
                "-progress",
                "pipe:1",
                "-stats_period",
                "0.2",
                "-ss",
                "30.000",
                "-i",
                "in.mp4",
                "-t",
                "20.000",
                "-map",
                "0",
                "-c",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                "-y",
                "out.mp4",
            ]
        );
    }

    #[test]
    fn cut_args_negative_start_clamped() {
        let args = cut_args(-1.0, 5.0, "a.mkv", "b.mkv");
        assert_eq!(args[args.iter().position(|a| a == "-ss").unwrap() + 1], "0.000");
    }

    #[test]
    fn proxy_args_uses_escaped_filter_expression() {
        let args = proxy_args("in.avi", "proxy.mp4");
        assert!(
            args.iter().any(|a| a == "scale=-2:min(720\\,ih),format=yuv420p"),
            "缺少滤镜参数，实际 {args:?}"
        );
    }

    #[test]
    fn sidecar_binaries_resolve_in_dev() {
        let ffmpeg = resolve_sidecar("ffmpeg").unwrap();
        assert!(ffmpeg.exists(), "ffmpeg sidecar 不存在：{}", ffmpeg.display());
        let ffprobe = resolve_sidecar("ffprobe").unwrap();
        assert!(ffprobe.exists());
    }

    #[test]
    fn concat_args_follows_design_template() {
        let args = concat_args("list.txt", "out.mp4");
        assert_eq!(
            args,
            vec![
                "-hide_banner",
                "-nostats",
                "-loglevel",
                "error",
                "-progress",
                "pipe:1",
                "-stats_period",
                "0.2",
                "-f",
                "concat",
                "-safe",
                "0",
                "-fflags",
                "+genpts",
                "-i",
                "list.txt",
                "-map",
                "0",
                "-c",
                "copy",
                "-y",
                "out.mp4",
            ]
        );
    }

    #[test]
    fn concat_list_escapes_quotes_and_backslashes() {
        let content = concat_list_content(&[
            "D:\\videos\\我的 视频.mp4".to_string(),
            "D:/music/it's a song.mp4".to_string(),
        ]);
        assert_eq!(
            content,
            "file 'D:/videos/我的 视频.mp4'\nfile 'D:/music/it'\\''s a song.mp4'\n"
        );
    }

    #[test]
    fn normalize_args_builds_filter_chain() {
        let args = normalize_args("in.mkv", 1920, 1080, 29.97, "yuv420p", 0, "out.mp4");
        let vf_pos = args.iter().position(|a| a == "-vf").unwrap();
        assert_eq!(args[vf_pos + 1], "scale=1920:1080:flags=lanczos,fps=29.970,format=yuv420p");
        assert!(args.iter().any(|a| a == "libx264"));
        assert!(args.iter().any(|a| a == "192k"));
        assert!(!args.contains(&"-video_track_timescale".to_string()));
        // 指定 timescale 时写入对齐参数
        let args = normalize_args("in.mkv", 1920, 1080, 29.97, "yuv420p", 60000, "out.mp4");
        let ts = args.iter().position(|a| a == "-video_track_timescale").unwrap();
        assert_eq!(args[ts + 1], "60000");
    }

    #[test]
    fn parse_timescale_handles_fraction_strings() {
        assert_eq!(parse_timescale("1/60000"), 60000);
        assert_eq!(parse_timescale("1/15360"), 15360);
        assert_eq!(parse_timescale("0/0"), 0);
        assert_eq!(parse_timescale(""), 0);
        assert_eq!(parse_timescale("2/60000"), 0);
    }

    #[test]
    fn rotate_remux_places_display_rotation_before_input() {
        let args = rotate_remux_args_deg(90, false, false, "in.mp4", "out.mp4");
        let rot_pos = args.iter().position(|a| a == "-display_rotation").unwrap();
        assert_eq!(args[rot_pos + 1], "90");
        let i_pos = args.iter().position(|a| a == "-i").unwrap();
        assert!(rot_pos < i_pos, "-display_rotation 必须在 -i 之前");
        // 无损：-c copy 且 -map 0
        assert!(args.windows(2).any(|w| w[0] == "-c" && w[1] == "copy"));
        assert!(args.contains(&"0".to_string()));
    }

    #[test]
    fn rotate_remux_zero_resets_metadata() {
        let args = rotate_remux_args_deg(0, false, false, "in.mp4", "out.mp4");
        let rot_pos = args.iter().position(|a| a == "-display_rotation").unwrap();
        assert_eq!(args[rot_pos + 1], "0");
    }

    #[test]
    fn rotate_remux_flip_uses_dedicated_flag() {
        let args = rotate_remux_args_deg(0, true, false, "in.mp4", "out.mp4");
        assert!(args.contains(&"-display_hflip".to_string()));
        assert!(!args.contains(&"-display_vflip".to_string()));
    }

    #[test]
    fn rotate_transcode_uses_transpose_filter() {
        let args = rotate_transcode_args(270, false, false, "in.mp4", "out.mp4", "libx264", QualityPreset::Balanced);
        let vf_pos = args.iter().position(|a| a == "-vf").unwrap();
        assert_eq!(args[vf_pos + 1], "transpose=2");
        // 音频 copy
        let ca = args.iter().position(|a| a == "-c:a").unwrap();
        assert_eq!(args[ca + 1], "copy");
    }

    #[test]
    fn rotate_transcode_composes_flip_then_rotate() {
        let args = rotate_transcode_args(90, true, false, "in.mp4", "out.mp4", "libx264", QualityPreset::Balanced);
        let vf_pos = args.iter().position(|a| a == "-vf").unwrap();
        // 翻转先作用（源空间），再旋转
        assert_eq!(args[vf_pos + 1], "hflip,transpose=1");
    }

    #[test]
    fn rotate_transcode_flip_only_omits_vf_when_no_transform() {
        let args = rotate_transcode_args(0, false, false, "in.mp4", "out.mp4", "libx264", QualityPreset::Balanced);
        assert!(!args.contains(&"-vf".to_string()));
    }

    #[test]
    fn crop_args_build_crop_scale_chain() {
        let args = crop_zoom_args("in.mp4", 400, 200, 800, 800, 1920, 1080, "h264_nvenc", QualityPreset::High, "out.mp4");
        let vf_pos = args.iter().position(|a| a == "-vf").unwrap();
        assert_eq!(args[vf_pos + 1], "crop=800:800:400:200,scale=1920:1080:flags=lanczos");
        let cv = args.iter().position(|a| a == "-c:v").unwrap();
        assert_eq!(args[cv + 1], "h264_nvenc");
        // nvenc 质量档位：vbr + cq
        let rc = args.iter().position(|a| a == "-rc").unwrap();
        assert_eq!(args[rc + 1], "vbr");
        let cq = args.iter().position(|a| a == "-cq").unwrap();
        assert_eq!(args[cq + 1], "19");
    }

    #[test]
    fn precise_cut_seeks_after_input() {
        let args = precise_cut_args(13.0, 7.0, "in.mp4", "out.mp4", "libx264", QualityPreset::Small);
        let i_pos = args.iter().position(|a| a == "-i").unwrap();
        let ss_pos = args.iter().position(|a| a == "-ss").unwrap();
        assert!(ss_pos > i_pos, "精确剪切 -ss 必须在 -i 之后（输出侧 seek）");
        assert_eq!(args[ss_pos + 1], "13.000");
        let ca = args.iter().position(|a| a == "-c:a").unwrap();
        assert_eq!(args[ca + 1], "copy");
    }

    #[test]
    fn quality_args_per_encoder_family() {
        assert_eq!(
            encoder_quality_args("libx264", QualityPreset::Balanced),
            vec!["-crf", "20", "-preset", "medium"]
        );
        assert_eq!(
            encoder_quality_args("hevc_nvenc", QualityPreset::Small),
            vec!["-rc", "vbr", "-cq", "28", "-b:v", "0"]
        );
        assert_eq!(
            encoder_quality_args("h264_qsv", QualityPreset::High),
            vec!["-global_quality", "19"]
        );
        assert_eq!(
            encoder_quality_args("hevc_amf", QualityPreset::Balanced),
            vec!["-quality", "balanced"]
        );
    }

    #[test]
    fn pipeline_copy_combines_cut_and_metadata_rotation() {
        let args = pipeline_copy_args(Some((5.0, 10.0)), 90, true, false, "in.mp4", "out.mp4");
        let rot = args.iter().position(|a| a == "-display_rotation").unwrap();
        let ss = args.iter().position(|a| a == "-ss").unwrap();
        let i = args.iter().position(|a| a == "-i").unwrap();
        assert!(rot < ss && ss < i, "输入选项（display_rotation/ss）必须在 -i 之前");
        assert_eq!(args[rot + 1], "90");
        assert_eq!(args[ss + 1], "5.000");
        let t = args.iter().position(|a| a == "-t").unwrap();
        assert!(t > i, "-t 在 -i 之后");
        assert_eq!(args[t + 1], "10.000");
        assert!(args.contains(&"-display_hflip".to_string()));
        assert!(args.windows(2).any(|w| w[0] == "-c" && w[1] == "copy"));
    }

    #[test]
    fn pipeline_copy_whole_file_omits_seek() {
        let args = pipeline_copy_args(None, 0, false, false, "in.mp4", "out.mp4");
        assert!(!args.contains(&"-ss".to_string()));
        assert!(!args.contains(&"-t".to_string()));
        assert!(args.contains(&"-display_rotation".to_string()));
    }

    #[test]
    fn pipeline_transcode_chains_transform_then_crop_then_scale() {
        // 旋转 90 + 水平翻转 + 裁剪（显示空间坐标）
        let args = pipeline_transcode_args(
            Some((2.0, 3.0)),
            90,
            true,
            false,
            Some((10, 20, 300, 200, 600, 400)),
            "libx264",
            QualityPreset::Balanced,
            60000,
            "in.mp4",
            "out.mp4",
        );
        let vf = &args[args.iter().position(|a| a == "-vf").unwrap() + 1];
        assert_eq!(vf, "hflip,transpose=1,crop=300:200:10:20,scale=600:400:flags=lanczos");
        // -ss 在 -i 之后（输出侧精确 seek）
        let i = args.iter().position(|a| a == "-i").unwrap();
        let ss = args.iter().position(|a| a == "-ss").unwrap();
        assert!(ss > i);
        // 剥离源方向矩阵
        let dr = args.iter().position(|a| a == "-display_rotation").unwrap();
        assert_eq!(args[dr + 1], "0");
        assert!(dr < i, "-display_rotation 是输入选项");
        let ca = args.iter().position(|a| a == "-c:a").unwrap();
        assert_eq!(args[ca + 1], "copy");
        // timescale 对齐参数在 -y 之前
        let ts = args.iter().position(|a| a == "-video_track_timescale").unwrap();
        assert_eq!(args[ts + 1], "60000");
        assert!(ts < args.iter().position(|a| a == "-y").unwrap());
    }

    #[test]
    fn pipeline_transcode_crop_only_matches_zoom_template() {
        let args = pipeline_transcode_args(
            None,
            0,
            false,
            false,
            Some((0, 0, 800, 600, 1920, 1080)),
            "libx264",
            QualityPreset::High,
            0,
            "in.mp4",
            "out.mp4",
        );
        let vf = &args[args.iter().position(|a| a == "-vf").unwrap() + 1];
        assert_eq!(vf, "crop=800:600:0:0,scale=1920:1080:flags=lanczos");
        assert!(!args.contains(&"-video_track_timescale".to_string()));
    }

    #[test]
    fn resolve_encoder_falls_back_to_software() {
        // 本机若无任何硬编（试跑失败），应回退软件编码器；有硬编则返回硬编名
        let enc = resolve_encoder("yuv420p");
        assert!(
            enc == "h264_nvenc" || enc == "h264_qsv" || enc == "h264_amf" || enc == "libx264",
            "非法编码器：{enc}"
        );
        let enc10 = resolve_encoder("yuv420p10le");
        assert!(
            enc10 == "hevc_nvenc" || enc10 == "hevc_qsv" || enc10 == "hevc_amf" || enc10 == "libx265",
            "10bit 应走 HEVC 路径：{enc10}"
        );
    }

    #[test]
    fn effective_encoder_honors_lock_and_rejects_unknown() {
        assert_eq!(effective_encoder(Some("libx265"), "yuv420p"), "libx265");
        assert_eq!(effective_encoder(Some("h264_nvenc"), "yuv420p10le"), "h264_nvenc");
        // 非法值与 None 都回退自动探测
        let auto = effective_encoder(Some("not-an-encoder"), "yuv420p");
        assert!(LOCKABLE_ENCODERS.contains(&auto.as_str()) || auto == "libx264");
        assert_eq!(effective_encoder(None, "yuv420p10le"), resolve_encoder("yuv420p10le"));
    }
}
