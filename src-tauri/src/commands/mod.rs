//! Tauri 命令入口：参数校验与任务提交，不含 FFmpeg 拼装逻辑（DESIGN §5.3）。
pub mod crop;
pub mod cut;
pub mod history;
pub mod media;
pub mod merge;
pub mod pipeline;
pub mod rotate;

use std::path::Path;

/// FNV-1a 64：为字符串生成稳定哈希（代理缓存 / 临时文件命名，跨进程一致）。
pub(crate) fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

/// 源文件大小；元数据读不到按 0 处理（预检跳过，交给 ffmpeg 自行失败）。
pub(crate) fn file_size(p: &str) -> u64 {
    std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)
}

/// 磁盘空间预检（B2/M8，DESIGN §8.2）：空间不足在编码开始前失败，
/// 不再中途断掉留半成品。估算规则按任务类型见 DESIGN §8.2 表；
/// 在任务作业线程内调用（运行时检查，排队期间磁盘状态可能变化）。
pub(crate) fn require_disk_space(dir: &Path, estimate_bytes: u64) -> Result<(), String> {
    if estimate_bytes == 0 {
        return Ok(());
    }
    let available = fs4::available_space(dir).unwrap_or(u64::MAX);
    if available < estimate_bytes {
        return Err(format!(
            "输出磁盘空间不足：预计需要约 {:.2} GB，可用 {:.2} GB",
            estimate_bytes as f64 / 1e9,
            available as f64 / 1e9
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disk_precheck_skips_zero_estimate() {
        assert!(require_disk_space(&std::env::temp_dir(), 0).is_ok());
    }

    #[test]
    fn disk_precheck_passes_tiny_estimate() {
        assert!(require_disk_space(&std::env::temp_dir(), 1).is_ok());
    }

    #[test]
    fn disk_precheck_rejects_impossible_estimate() {
        let err = require_disk_space(&std::env::temp_dir(), u64::MAX).unwrap_err();
        assert!(err.contains("磁盘空间不足"), "实际信息：{err}");
    }
}
