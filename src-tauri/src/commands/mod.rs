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

/// 片段区间的提交期校验（cut / pipeline 共用，DESIGN §8.2 前置）：起点非负且跨度
/// 大于最短有效片段（`MIN_SEG_DURATION_SEC` 0.05s，M6-8 空段口径）。
///
/// `BUG-012` 裁决（2026-09-25）：前端命令层切割/修剪的下限已抬到与该阈值对齐
/// （`minSegSec = max(1帧, 0.05s)`），**恰好钳到 0.05s 的段必须可提交**——判定带 1µs
/// 浮点容差吸收钳制边界的 1ulp 差，否则整单导出会硬失败。与前端
/// `src/utils/undo/commands.ts::exportSegmentOf` 同式同源，改动必须两侧同批。
pub(crate) fn valid_segment_span(start_sec: f64, end_sec: f64) -> bool {
    start_sec >= 0.0 && end_sec - start_sec > 0.05 - 1e-6
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

    #[test]
    fn segment_span_accepts_exact_floor_and_tolerates_float_ulp() {
        // BUG-012：恰钳到 0.05s 下限的段必须可提交（旧谓词 `> start + 0.05` 会硬拒）；
        // 1ulp 级浮点差在容差内；真空段 / 负起点 / NaN 拒绝
        assert!(valid_segment_span(0.0, 0.05));
        assert!(valid_segment_span(2.0, 2.05));
        assert!(valid_segment_span(1.0, 1.05 - 1e-9));
        assert!(!valid_segment_span(0.0, 0.04));
        assert!(!valid_segment_span(0.0, 0.0));
        assert!(!valid_segment_span(-0.1, 1.0));
        assert!(!valid_segment_span(f64::NAN, 1.0));
    }
}
