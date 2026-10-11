//! 应用内自动更新（M20，FR-398，`ADR-046` + M20-4 修订注）。
//!
//! M20-4 修订：检查阶段**自研直连 `api.github.com`**（解析 `tag_name` 比版本号，
//! 原始响应体写入日志——被网络污染也可诊断，`BUG-029` 根因）；确认有新版后把该版本
//! 的 Release 资产直链 latest.json 作为**动态端点**交给官方更新器执行下载/安装
//! （minisign 签名校验不变）——"检查"与"下载"分离，检查不再依赖易被污染的
//! github.io / objects 域名。

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_updater::UpdaterExt;

const RELEASE_API: &str = "https://api.github.com/repos/zhibushiwo/video-cut/releases/latest";
const OWNER: &str = "zhibushiwo";
const REPO: &str = "video-cut";

/// 截断字符串用于日志（原始响应体可能很大/含乱码）
fn truncate_for_log(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut end = max;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…（共 {} 字节）", &s[..end], s.len())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    /// 最新版本号（tag 去 `v` 前缀）；None = 已是最新
    pub latest: Option<String>,
    /// Release 说明（GitHub Release body）
    pub notes: String,
    /// 当前版本（供前端展示）
    pub current: String,
}

/// 检查更新（M20-4）：直连 GitHub API 解析 `tag_name`，与当前版本做 semver 比较。
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("video-cut/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("HTTP 客户端构建失败：{e}"))?;
    let resp = client
        .get(RELEASE_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| {
            log::warn!("[update] api.github.com 请求失败：{e}");
            format!("网络请求失败（api.github.com）：{e}")
        })?;
    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败：{e}"))?;
    if !status.is_success() {
        log::warn!(
            "[update] api.github.com 返回 {status}，响应体：{}",
            truncate_for_log(&body, 300)
        );
        return Err(format!("更新检查失败（HTTP {status}）"));
    }
    let json: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            log::warn!(
                "[update] 响应不是合法 JSON（疑似网络污染），响应体：{}",
                truncate_for_log(&body, 300)
            );
            return Err(format!("更新检查失败：响应被污染（{e}），详情见日志"));
        }
    };
    let tag = match json.get("tag_name").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => {
            log::warn!(
                "[update] 响应缺少 tag_name（疑似网络污染），响应体：{}",
                truncate_for_log(&body, 300)
            );
            return Err("更新检查失败：响应缺少 tag_name（疑似网络污染），详情见日志".to_string());
        }
    };
    let latest = tag.trim_start_matches('v').to_string();
    let notes = json
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let current = app.package_info().version.to_string();

    let has_update = match (
        semver::Version::parse(&latest),
        semver::Version::parse(&current),
    ) {
        (Ok(l), Ok(c)) => l > c,
        // 非 semver tag（自备 tag 命名）：回退字符串不等比较，宁误报不漏报
        _ => latest != current,
    };
    Ok(if has_update {
        UpdateCheckResult {
            latest: Some(latest),
            notes,
            current,
        }
    } else {
        UpdateCheckResult {
            latest: None,
            notes,
            current,
        }
    })
}

/// 下载并安装更新（动态端点 = 指定版本 Release 资产直链的 latest.json，签名校验由
/// 更新器执行）；下载进度经 `update-progress` 事件推送（0~100，节流 5%）。
/// Windows 上安装器拉起后应用退出（`on_before_exit` 语义），前端无需再重启。
#[tauri::command]
pub async fn install_update<R: Runtime>(app: AppHandle<R>, tag: String) -> Result<(), String> {
    let tag = tag.trim_start_matches('v').to_string();
    let url = format!("https://github.com/{OWNER}/{REPO}/releases/download/v{tag}/latest.json");
    let endpoint: url::Url = url.parse().map_err(|e| format!("端点 URL 非法：{e}"))?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| format!("端点配置失败：{e}"))?
        .build()
        .map_err(|e| format!("更新器构建失败：{e}"))?;
    let update = updater
        .check()
        .await
        .map_err(|e| {
            log::warn!("[update] 读取更新清单失败：{e}");
            format!("读取更新清单失败：{e}（详情见日志）")
        })?
        .ok_or_else(|| "该版本清单无可用更新".to_string())?;

    let emitter = app.clone();
    let mut last_reported = 0u32;
    update
        .download_and_install(
            |chunk, total| {
                if let Some(total) = total.filter(|t| *t > 0) {
                    let percent = (chunk.min(total as usize) as f64 / total as f64 * 100.0) as u32;
                    // 5% 节流，避免事件风暴
                    if percent >= last_reported + 5 || percent >= 100 {
                        last_reported = percent;
                        let _ = emitter.emit("update-progress", percent);
                    }
                }
            },
            || {},
        )
        .await
        .map_err(|e| {
            log::error!("[update] 下载/安装失败：{e}");
            format!("下载/安装失败：{e}（详情见日志）")
        })?;
    Ok(())
}
