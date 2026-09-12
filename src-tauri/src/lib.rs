mod commands;
mod ffmpeg;
mod task;

use serde::{Deserialize, Serialize};
use task::manager::TaskManager;

/// 环境检测结果（DESIGN §6.1）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentInfo {
    pub ok: bool,
    pub ffmpeg_version: Option<String>,
    pub ffprobe_version: Option<String>,
    pub message: Option<String>,
}

/// 任务状态机（DESIGN §8.1）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Probing,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// 任务快照：`list_tasks` 返回值与事件推送共用（DESIGN §7）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSnapshot {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub status: TaskStatus,
    pub progress: Option<f64>,
    pub error: Option<String>,
    pub outputs: Vec<String>,
}

/// 视频流信息（DESIGN §7）。字段与 ffprobe JSON 对齐。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStreamInfo {
    pub codec: String,
    pub profile: Option<String>,
    pub width: u32,
    pub height: u32,
    pub pix_fmt: String,
    pub frame_rate: f64,
    pub bitrate: Option<u64>,
    pub bit_depth: Option<u32>,
}

/// 音频流信息（DESIGN §7）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamInfo {
    pub codec: String,
    pub sample_rate: u32,
    pub channels: u32,
    pub bitrate: Option<u64>,
}

/// 媒体信息：probe_media 返回值（DESIGN §7）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub container: String,
    pub duration_sec: f64,
    pub size_bytes: u64,
    pub bitrate: Option<u64>,
    pub video: VideoStreamInfo,
    pub audio: Vec<AudioStreamInfo>,
    pub subtitle_count: u32,
    pub rotation: Option<i32>,
}

/// 剪切区间，约定为 [start, end)（DESIGN §7）。时间单位：秒。
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub start_sec: f64,
    pub end_sec: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CutMode {
    Fast,
    Precise,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Rotation {
    Cw90,
    Ccw90,
    R180,
    HFlip,
    VFlip,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QualityPreset {
    High,
    Balanced,
    Small,
}

/// 统一任务定义：前端 submit_task 的入参（DESIGN §7）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VideoTask {
    #[serde(rename_all = "camelCase")]
    Cut {
        input: String,
        segments: Vec<Segment>,
        output_dir: String,
        mode: CutMode,
    },
    #[serde(rename_all = "camelCase")]
    Merge {
        inputs: Vec<String>,
        output: String,
        force_transcode: bool,
    },
    #[serde(rename_all = "camelCase")]
    Rotate {
        input: String,
        rotation: Rotation,
        output: String,
        transcode: bool,
    },
    #[serde(rename_all = "camelCase")]
    CropZoom {
        input: String,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        out_width: Option<u32>,
        out_height: Option<u32>,
        quality: QualityPreset,
        output: String,
    },
}

/// 全局任务管理器，经 tauri State 注入（DESIGN §8.2）。
pub struct AppTasks(pub TaskManager);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppTasks(TaskManager::new(2)))
        .invoke_handler(tauri::generate_handler![
            commands::media::check_environment,
            commands::media::list_tasks,
            commands::media::probe_media,
            commands::media::list_keyframes,
            commands::media::generate_proxy,
            commands::media::cancel_task,
            commands::media::generate_thumbnails,
            commands::merge::check_merge,
            commands::cut::submit_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
