//! FFmpeg 命令构建器：全项目唯一拼装 ffmpeg 参数的地方（DESIGN §6.2/§6.3）。

use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::EnvironmentInfo;

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

/// 参数统一转码（DESIGN §6.3④）：scale + fps + format，libx264 + aac 192k。
#[allow(dead_code)] // M2 起由 commands/merge.rs 使用
pub fn normalize_args(
    input: &str,
    width: u32,
    height: u32,
    fps: f64,
    pix_fmt: &str,
    output: &str,
) -> Vec<String> {
    let vf = format!("scale={width}:{height}:flags=lanczos,fps={fps:.3},format={pix_fmt}");
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
        &vf,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-y",
        output,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
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
        let args = normalize_args("in.mkv", 1920, 1080, 29.97, "yuv420p", "out.mp4");
        let vf_pos = args.iter().position(|a| a == "-vf").unwrap();
        assert_eq!(args[vf_pos + 1], "scale=1920:1080:flags=lanczos,fps=29.970,format=yuv420p");
        assert!(args.iter().any(|a| a == "libx264"));
        assert!(args.iter().any(|a| a == "192k"));
    }
}
