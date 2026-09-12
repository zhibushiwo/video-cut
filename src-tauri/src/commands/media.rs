//! 媒体探测与环境检查命令（DESIGN §5.4）。

use tauri::State;

use crate::ffmpeg::command;
use crate::{AppTasks, EnvironmentInfo, TaskSnapshot};

/// 检查内置 ffmpeg/ffprobe 可用性与版本（DESIGN §6.1、§13）。
#[tauri::command]
pub async fn check_environment(app: tauri::AppHandle) -> EnvironmentInfo {
    command::check_environment(&app).await
}

/// 返回当前任务列表快照（DESIGN §5.4）。
#[tauri::command]
pub fn list_tasks(state: State<'_, AppTasks>) -> Vec<TaskSnapshot> {
    state.0.snapshot()
}
