//! 历史记录命令（DESIGN §12 / M4-2）：读取 / 清空 `history.json`。

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::history::{self, HistoryEntry};

/// 历史文件位置：app_data_dir/history.json（lib.rs 的终态回调也写这里）。
pub(crate) fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录：{e}"))?;
    Ok(dir.join("history.json"))
}

#[tauri::command]
pub fn list_history(app: AppHandle) -> Result<Vec<HistoryEntry>, String> {
    Ok(history::load(&history_path(&app)?))
}

#[tauri::command]
pub fn clear_history(app: AppHandle) -> Result<(), String> {
    history::clear(&history_path(&app)?).map_err(|e| format!("无法清空历史：{e}"))
}
