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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
