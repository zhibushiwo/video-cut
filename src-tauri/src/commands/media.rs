//! 媒体探测、代理生成与任务查询命令（DESIGN §5.4）。

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::ffmpeg::{command, probe};
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::task::worker;
use crate::{AppTasks, EnvironmentInfo, MediaInfo, TaskSnapshot};

/// 检查内置 ffmpeg/ffprobe 可用性与版本（DESIGN §6.1、§13）。
#[tauri::command]
pub async fn check_environment(app: AppHandle) -> EnvironmentInfo {
    command::check_environment(&app).await
}

/// 解析媒体信息（DESIGN §3.1）。
#[tauri::command]
pub async fn probe_media(app: AppHandle, input: String) -> Result<MediaInfo, String> {
    probe::probe_media(&app, &input).await
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

/// 生成预览代理（DESIGN §3.7、§6.3⑧）。已有缓存时直接复用。
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
        let total_sec = probe::probe_duration_sync(&ffprobe, &job_input).unwrap_or(0.0);
        let last = std::cell::Cell::new(
            std::time::Instant::now() - std::time::Duration::from_millis(250),
        );
        let result = worker::run_ffmpeg(
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
        );
        match result {
            Ok(()) => {
                let _ = std::fs::remove_file(&job_output);
                std::fs::rename(&part, &job_output)
                    .map_err(|e| format!("重命名代理文件失败：{e}"))?;
                ctx.add_output(path_to_string(&job_output));
                Ok(())
            }
            Err(e) => {
                let _ = std::fs::remove_file(&part);
                Err(e)
            }
        }
    });

    let task_id = state.0.submit(Arc::new(TauriEmitter(app)), "proxy", &label, job);
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

/// 返回当前任务列表快照。
#[tauri::command]
pub fn list_tasks(state: State<'_, AppTasks>) -> Vec<TaskSnapshot> {
    state.0.snapshot()
}

fn path_to_string(p: &PathBuf) -> String {
    p.to_string_lossy().into_owned()
}

/// FNV-1a 64：为源文件路径生成稳定缓存名（跨进程/跨版本一致）。
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}
