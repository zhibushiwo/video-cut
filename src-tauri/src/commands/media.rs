//! 媒体探测、代理生成与任务查询命令（DESIGN §5.4）。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::ffmpeg::{command, probe};
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::task::worker;
use crate::{AppTasks, EnvironmentInfo, MediaInfo, TaskSnapshot};

use super::fnv1a;

/// 检查内置 ffmpeg/ffprobe 可用性与版本（DESIGN §6.1、§13）。
#[tauri::command]
pub async fn check_environment(app: AppHandle) -> EnvironmentInfo {
    let info = command::check_environment(&app).await;
    log::info!("环境检查 ok={}", info.ok);
    info
}

/// 解析媒体信息（DESIGN §3.1）。
#[tauri::command]
pub async fn probe_media(app: AppHandle, input: String) -> Result<MediaInfo, String> {
    let info = probe::probe_media(&app, &input).await?;
    log::debug!(
        "probe {}：{} {}×{}（{:.3}s）",
        input,
        info.video.codec,
        info.video.width,
        info.video.height,
        info.duration_sec
    );
    Ok(info)
}

/// 前端错误转发落盘（DESIGN §12.1）：window.onerror / unhandledrejection 捕获后调用。
#[tauri::command]
pub fn append_frontend_log(level: String, message: String) {
    let lvl = match level.as_str() {
        "error" => log::Level::Error,
        "warn" => log::Level::Warn,
        "info" => log::Level::Info,
        _ => log::Level::Debug,
    };
    log::log!(lvl, "[frontend] {message}");
}

/// 目标路径是否已存在（导出名"同名才追加时间戳"判定用，DESIGN §8.3 / 决策 #19）。
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

/// 支持的视频扩展名（与前端 services/tauri.ts 的 VIDEO_EXTENSIONS 一致）。
const VIDEO_EXTS: &[&str] = &["mp4", "mov", "mkv", "avi", "webm", "m4v", "ts", "flv", "wmv"];

fn is_video_file(p: &std::path::Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| VIDEO_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// 递归收集目录下的视频文件；跳过隐藏项，深度上限防符号链接环。
fn collect_videos(dir: &std::path::Path, depth: usize, out: &mut Vec<String>) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_videos(&path, depth + 1, out);
        } else if is_video_file(&path) {
            out.push(path.to_string_lossy().into_owned());
        }
    }
}

/// 拖入路径展开（M7-7）：视频文件原样保留，目录递归扫描其中的视频文件，
/// 结果按路径排序。前端 drop 一律经此展开（纯非视频拖入返回空）。
#[tauri::command]
pub fn expand_video_inputs(paths: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for p in &paths {
        let path = std::path::Path::new(p);
        if path.is_dir() {
            collect_videos(path, 0, &mut out);
        } else if path.is_file() && is_video_file(path) {
            out.push(p.clone());
        }
    }
    out.sort();
    out
}

/// 缓存占用（M4-8，DESIGN §9.9）：代理与缩略图两个缓存目录。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheUsage {
    pub proxy_bytes: u64,
    pub thumb_bytes: u64,
}

/// 缓存清理结果：被占用跳过的文件数（Windows 文件占用常态）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheClearResult {
    pub removed: u32,
    pub skipped: u32,
}

fn dir_size(dir: &std::path::Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                }
            }
        }
    }
    total
}

#[tauri::command]
pub fn cache_usage(app: AppHandle) -> Result<CacheUsage, String> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法定位缓存目录：{e}"))?;
    Ok(CacheUsage {
        proxy_bytes: dir_size(&cache.join("proxy")),
        thumb_bytes: dir_size(&cache.join("thumbs")),
    })
}

#[tauri::command]
pub fn clear_cache(app: AppHandle) -> Result<CacheClearResult, String> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法定位缓存目录：{e}"))?;
    let mut removed = 0u32;
    let mut skipped = 0u32;
    for dir in [cache.join("proxy"), cache.join("thumbs")] {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            match std::fs::remove_file(entry.path()) {
                Ok(()) => removed += 1,
                Err(_) => skipped += 1,
            }
        }
    }
    Ok(CacheClearResult { removed, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn is_video_file_matches_extension_case_insensitively() {
        assert!(is_video_file(Path::new("a.MP4")));
        assert!(is_video_file(Path::new("b.mkv")));
        assert!(is_video_file(Path::new("c.Wmv")));
        assert!(!is_video_file(Path::new("d.txt")));
        assert!(!is_video_file(Path::new("无扩展名")));
    }
}

/// 打开日志文件夹（资源管理器，DESIGN §12.1 的任务面板入口）。
#[tauri::command]
pub fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("无法定位日志目录：{e}"))?;
    tauri_plugin_opener::open_path(dir, None::<&str>)
        .map_err(|e| format!("打开日志文件夹失败：{e}"))
}

/// 扫描关键帧时间点（DESIGN §3.1、§6.5）。长视频可能耗时数秒。
#[tauri::command]
pub async fn list_keyframes(app: AppHandle, input: String) -> Result<Vec<f64>, String> {
    probe::list_keyframes(&app, &input).await
}

/// 代理生成任务启动结果。`task_id` 为 None 表示缓存已存在，可直接使用 `proxy_path`。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStart {
    pub task_id: Option<String>,
    pub proxy_path: String,
}

/// 缩略图结果：输入路径 → 缓存图路径。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileThumbnail {
    pub input: String,
    pub thumb_path: String,
}

/// 同源代理生成中去重表：input → taskId（code review P2）。
fn pending_proxies() -> &'static Mutex<HashMap<String, String>> {
    static PENDING: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 生成预览代理（DESIGN §3.7、§6.3⑧）。已有缓存时直接复用；
/// 同源代理已在生成中时复用其 taskId，不重复提交（code review P2）。
#[tauri::command]
pub fn generate_proxy(
    app: AppHandle,
    state: State<'_, AppTasks>,
    input: String,
) -> Result<ProxyStart, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法定位缓存目录：{e}"))?
        .join("proxy");
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("无法创建缓存目录：{e}"))?;

    let output = cache_dir.join(format!("{:016x}.proxy.mp4", fnv1a(input.as_bytes())));
    if output.exists() {
        return Ok(ProxyStart {
            task_id: None,
            proxy_path: path_to_string(&output),
        });
    }

    // 进行中去重：同源代理生成中 → 返回既有 taskId，前端监听同一任务的完成事件
    {
        let mut pending = pending_proxies().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(running_id) = pending.get(&input) {
            return Ok(ProxyStart {
                task_id: Some(running_id.clone()),
                proxy_path: path_to_string(&output),
            });
        }
    }

    let ffmpeg = command::resolve_sidecar("ffmpeg")?;
    let ffprobe = command::resolve_sidecar("ffprobe")?;
    // 半成品保留真实扩展名（.part.mp4），否则 ffmpeg 无法推断封装格式
    let part = PathBuf::from(format!("{}.part.mp4", output.display()));
    let job_output = output.clone();
    let label = format!(
        "生成预览代理 {}",
        std::path::Path::new(&input)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&input)
    );

    let job_input = input.clone();
    let job: Job = Box::new(move |ctx: &TaskContext| {
        let result = (|| -> Result<(), String> {
            let total_sec = probe::probe_duration_sync(&ffprobe, &job_input).unwrap_or(0.0);
            let last = std::cell::Cell::new(
                std::time::Instant::now() - std::time::Duration::from_millis(250),
            );
            if let Err(e) = worker::run_ffmpeg(
                ctx,
                &ffmpeg,
                &command::proxy_args(&job_input, &part.to_string_lossy()),
                total_sec,
                &|local, _| {
                    if total_sec <= 0.0 {
                        return;
                    }
                    let now = std::time::Instant::now();
                    if now.duration_since(last.get()) >= std::time::Duration::from_millis(200)
                        || local >= 1.0
                    {
                        last.set(now);
                        ctx.set_progress(local);
                    }
                },
            ) {
                let _ = std::fs::remove_file(&part);
                return Err(e);
            }
            let _ = std::fs::remove_file(&job_output);
            std::fs::rename(&part, &job_output).map_err(|e| format!("重命名代理文件失败：{e}"))?;
            ctx.add_output(path_to_string(&job_output));
            Ok(())
        })();
        pending_proxies()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&job_input);
        result
    });

    let task_id = state.0.submit(Arc::new(TauriEmitter(app)), "proxy", &label, job);
    pending_proxies()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(input, task_id.clone());
    Ok(ProxyStart {
        task_id: Some(task_id),
        proxy_path: path_to_string(&output),
    })
}

/// 取消任务（DESIGN §8.2）。
#[tauri::command]
pub fn cancel_task(state: State<'_, AppTasks>, task_id: String) -> bool {
    state.0.cancel(&task_id)
}

/// 批量提取首帧缩略图（合并列表辨识用）。带缓存；整体跑在阻塞线程池，不卡 UI。
#[tauri::command]
pub async fn generate_thumbnails(
    app: AppHandle,
    inputs: Vec<String>,
) -> Result<Vec<FileThumbnail>, String> {
    tauri::async_runtime::spawn_blocking(move || generate_thumbnails_sync(&app, &inputs))
        .await
        .map_err(|e| format!("缩略图任务失败：{e}"))?
}

fn generate_thumbnails_sync(
    app: &AppHandle,
    inputs: &[String],
) -> Result<Vec<FileThumbnail>, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法定位缓存目录：{e}"))?
        .join("thumbs");
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("无法创建缓存目录：{e}"))?;
    let ffmpeg = command::resolve_sidecar("ffmpeg")?;

    let mut out = Vec::with_capacity(inputs.len());
    for input in inputs {
        let path = cache_dir.join(format!("{:016x}.jpg", fnv1a(input.as_bytes())));
        if !path.exists() {
            let mut cmd = std::process::Command::new(&ffmpeg);
            command::spawn_hidden(&mut cmd);
            let status = cmd
                .args(command::thumbnail_args(
                    input,
                    1.0,
                    &path.to_string_lossy(),
                ))
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .map_err(|e| format!("无法启动 ffmpeg：{e}"))?;
            if !status.success() || !path.exists() {
                return Err(format!("生成缩略图失败：{}", file_display(input)));
            }
        }
        out.push(FileThumbnail {
            input: input.clone(),
            thumb_path: path_to_string(&path),
        });
    }
    Ok(out)
}

fn file_display(p: &str) -> &str {
    std::path::Path::new(p)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(p)
}

/// 片段起点帧缩略图请求（M6-8）：源路径 + 取帧时间。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipThumbRequest {
    pub input: String,
    pub time_sec: f64,
}

/// 片段起点帧缩略图：失败的单个跳过（装饰性资源，不阻塞）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipThumbnail {
    pub input: String,
    pub time_sec: f64,
    pub thumb_path: String,
}

/// 批量生成片段起点帧缩略图（M6-8，缓存命中即时返回；缓存 key = 路径@时间两位小数）。
#[tauri::command]
pub async fn generate_clip_thumbnails(
    app: AppHandle,
    requests: Vec<ClipThumbRequest>,
) -> Result<Vec<ClipThumbnail>, String> {
    tauri::async_runtime::spawn_blocking(move || generate_clip_thumbs_sync(&app, &requests))
        .await
        .map_err(|e| format!("缩略图任务失败：{e}"))?
}

fn generate_clip_thumbs_sync(
    app: &AppHandle,
    requests: &[ClipThumbRequest],
) -> Result<Vec<ClipThumbnail>, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法定位缓存目录：{e}"))?
        .join("thumbs");
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("无法创建缓存目录：{e}"))?;
    let ffmpeg = command::resolve_sidecar("ffmpeg")?;

    let mut out = Vec::with_capacity(requests.len());
    for r in requests {
        let key = format!("{}@{:.2}", r.input, r.time_sec);
        let path = cache_dir.join(format!("{:016x}.jpg", fnv1a(key.as_bytes())));
        if !path.exists() {
            let mut cmd = std::process::Command::new(&ffmpeg);
            command::spawn_hidden(&mut cmd);
            let status = cmd
                .args(command::thumbnail_args(
                    &r.input,
                    r.time_sec,
                    &path.to_string_lossy(),
                ))
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .map_err(|e| format!("无法启动 ffmpeg：{e}"))?;
            if !status.success() || !path.exists() {
                continue; // 单个失败跳过
            }
        }
        out.push(ClipThumbnail {
            input: r.input.clone(),
            time_sec: r.time_sec,
            thumb_path: path_to_string(&path),
        });
    }
    Ok(out)
}

/// 返回当前任务列表快照。
#[tauri::command]
pub fn list_tasks(state: State<'_, AppTasks>) -> Vec<TaskSnapshot> {
    state.0.snapshot()
}

/// 清除已到终态的任务记录（DESIGN §5.4），返回清除数。
#[tauri::command]
pub fn clear_finished_tasks(state: State<'_, AppTasks>) -> usize {
    state.0.clear_finished()
}

fn path_to_string(p: &PathBuf) -> String {
    p.to_string_lossy().into_owned()
}
