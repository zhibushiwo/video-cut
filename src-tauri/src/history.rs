//! 任务历史（DESIGN §12 / M4-2）：终态任务追加落盘到 `history.json`，
//! 历史页读取后可重新定位输出文件。内部任务（代理预览）不入库（白名单在 lib.rs 接线处）。

use parking_lot::Mutex;
use std::fs;
use std::io;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::TaskStatus;

/// 历史上限：超过后丢弃最旧的（含被裁剪条目，写回时一次完成）。
pub const MAX_ENTRIES: usize = 200;

/// 写串行化锁：终态回调可能从多个任务线程并发到达，
/// append 是"读改写全文件"，无锁会互相覆盖丢条目（code review P1）。
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// 单条历史记录（camelCase 与前端 HistoryEntry 对齐）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub status: TaskStatus,
    pub outputs: Vec<String>,
    pub error: Option<String>,
    /// 提交时间（unix ms）
    pub created_at: u64,
    /// 开始执行时间（unix ms）；排队即被取消时等于 created_at
    pub started_at: u64,
    /// 终态时间（unix ms）
    pub finished_at: u64,
}

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 读取全部历史；文件缺失或损坏时返回空（历史是尽力而为的展示数据，不阻塞主流程）。
pub fn load(path: &Path) -> Vec<HistoryEntry> {
    let Ok(bytes) = fs::read(path) else {
        return Vec::new();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

/// 追加一条并裁剪到 [`MAX_ENTRIES`]；原子写（.tmp + rename），损坏不影响原文件。
/// 与 [`clear`] 共用写锁，避免并发读改写互相覆盖。
pub fn append(path: &Path, entry: HistoryEntry) -> io::Result<()> {
    let _guard = WRITE_LOCK.lock();
    let mut all = load(path);
    all.push(entry);
    if all.len() > MAX_ENTRIES {
        let overflow = all.len() - MAX_ENTRIES;
        all.drain(..overflow);
    }
    write_all(path, &all)
}

/// 清空历史。与 [`append`] 共用写锁。
pub fn clear(path: &Path) -> io::Result<()> {
    let _guard = WRITE_LOCK.lock();
    write_all(path, &[])
}

fn write_all(path: &Path, entries: &[HistoryEntry]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(entries)?)?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TaskStatus::{Cancelled, Completed, Failed};

    fn entry(id: &str, status: TaskStatus) -> HistoryEntry {
        HistoryEntry {
            id: id.into(),
            kind: "cut".into(),
            label: format!("剪切 {id}.mp4"),
            status,
            outputs: vec![format!("C:/out/{id}.mp4")],
            error: (status == Failed).then(|| "ffmpeg 失败".into()),
            created_at: 1_000,
            started_at: 1_100,
            finished_at: 1_900,
        }
    }

    #[test]
    fn missing_file_loads_empty_then_roundtrips() {
        let dir = std::env::temp_dir().join(format!("vc_hist_{}", std::process::id()));
        let path = dir.join("history.json");
        let _ = fs::remove_file(&path);

        assert!(load(&path).is_empty());
        append(&path, entry("a", Completed)).unwrap();
        let all = load(&path);
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "a");
        assert_eq!(all[0].status, Completed);
        assert_eq!(all[0].outputs, vec!["C:/out/a.mp4".to_string()]);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn append_trims_oldest_beyond_cap() {
        let dir = std::env::temp_dir().join(format!("vc_hist_cap_{}", std::process::id()));
        let path = dir.join("history.json");
        let _ = fs::remove_file(&path);

        for i in 0..(MAX_ENTRIES + 10) {
            append(&path, entry(&format!("t{i}"), Completed)).unwrap();
        }
        let all = load(&path);
        assert_eq!(all.len(), MAX_ENTRIES);
        assert_eq!(all[0].id, format!("t10"));
        assert_eq!(all.last().unwrap().id, format!("t{}", MAX_ENTRIES + 9));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn clear_resets_to_empty() {
        let dir = std::env::temp_dir().join(format!("vc_hist_clr_{}", std::process::id()));
        let path = dir.join("history.json");
        let _ = fs::remove_file(&path);

        append(&path, entry("a", Failed)).unwrap();
        append(&path, entry("b", Cancelled)).unwrap();
        clear(&path).unwrap();
        assert!(load(&path).is_empty());
        let _ = fs::remove_file(&path);
    }
}
