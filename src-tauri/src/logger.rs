//! 日志系统（DESIGN §12.1）：`log` 门面 + `fern` 实现，按天一个文件、启动清理 7 天前旧日志。
//! 写文件为同步追加（事件频率低，无性能顾虑）；跨天不切文件（下次启动切换），属已知简化。

use std::fs;
use std::time::Duration;

use tauri::Manager;

const KEEP_DAYS: u64 = 7;

pub fn init(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("无法定位日志目录：{e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建日志目录：{e}"))?;
    cleanup_old(&dir);

    let file = fern::log_file(dir.join(today_file_name()))
        .map_err(|e| format!("无法打开日志文件：{e}"))?;

    // release 默认 info，debug 构建默认 debug；VIDEO_CUT_LOG=debug|trace 可覆盖
    let level = match std::env::var("VIDEO_CUT_LOG").as_deref() {
        Ok("trace") => log::LevelFilter::Trace,
        Ok("debug") => log::LevelFilter::Debug,
        Ok("info") => log::LevelFilter::Info,
        _ if cfg!(debug_assertions) => log::LevelFilter::Debug,
        _ => log::LevelFilter::Info,
    };

    fern::Dispatch::new()
        .level(level)
        .format(|out, message, record| {
            out.finish(format_args!(
                "{} [{:5}] [{}] {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.level(),
                record.target(),
                message
            ))
        })
        .chain(file)
        .apply()
        .map_err(|e| format!("日志初始化失败：{e}"))?;
    Ok(())
}

fn today_file_name() -> String {
    format!("video-cut.{}.log", chrono::Local::now().format("%Y-%m-%d"))
}

/// 按修改时间清理 7 天前的旧日志（文件名即日期，mtime 语义等价且实现简单）。
fn cleanup_old(dir: &std::path::Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("log") {
            continue;
        }
        let age = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok());
        if let Some(age) = age {
            if age > Duration::from_secs(KEEP_DAYS * 86400) {
                let _ = fs::remove_file(&path);
            }
        }
    }
}
