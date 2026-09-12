//! FFmpeg 命令构建器：全项目唯一拼装 ffmpeg 参数的地方（DESIGN §6.2/§6.3）。
//!
//! M0 仅含 sidecar 解析与环境检查；剪切/合并/旋转/放大的命令构建在 M1~M3 落地。

use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::EnvironmentInfo;

/// 运行 sidecar 二进制的 `-version`，解析首行 "xx version <v> ..." 中的版本号。
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
