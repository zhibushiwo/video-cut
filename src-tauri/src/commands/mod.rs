//! Tauri 命令入口：参数校验与任务提交，不含 FFmpeg 拼装逻辑（DESIGN §5.3）。
pub mod crop;
pub mod cut;
pub mod media;
pub mod merge;
pub mod pipeline;
pub mod rotate;

/// FNV-1a 64：为字符串生成稳定哈希（代理缓存 / 临时文件命名，跨进程一致）。
pub(crate) fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}
