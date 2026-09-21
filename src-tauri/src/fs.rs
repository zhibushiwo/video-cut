//! 文件系统助手：输出收尾的**原子替换**（AGENTS.md §3 第 19 条 · NFR-007 · `BUG-002`）。

use std::path::Path;

/// 把作业产物从 `.part` 搬到最终路径，**绝不出现"旧文件已删、新产物还没到位"的窗口**。
///
/// 旧写法是"先 `remove_file(最终路径)` 再 `rename(part, 最终路径)`"，且删除错误被 `let _ =` 吞掉：
/// 一旦 rename 失败（目标被别的程序占着、只读、跨卷），用户**旧文件已经没了、新产物还躺在 `.part`**，
/// 错误信息里又不带 `.part` 路径，等于两头空（`BUG-002`）。
///
/// 现在只做一次 `rename`：`std::fs::rename` 在 Windows 上走
/// `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`、在 Unix 上走 `rename(2)`，**目标已存在时由系统替换**，
/// 失败则两个文件都原样保留（不会先删掉谁）。所以既不需要"先删目标"，也不需要中间备份名——
/// 少一步就少一个失败窗口。
///
/// 错误信息一律带 `.part` 的完整路径：用户至少要能找回刚跑出来的新产物、并知道旧文件还在。
pub fn atomic_replace(part: &Path, final_path: &Path) -> Result<(), String> {
    std::fs::rename(part, final_path).map_err(|e| {
        format!(
            "替换输出失败：{e}；旧文件保持不变，新产物仍在 {}",
            part.display()
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// 每个用例一个干净目录，名字带 pid + 标签，避免并行互相踩。
    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("video-cut-fs-{}-{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).expect("建临时目录失败");
        d
    }

    /// TC-020：目标已存在时被**替换**（不是先删再建），旧内容不残留。
    #[test]
    fn replaces_existing_file() {
        let d = tmp_dir("replace");
        let part = d.join("out.mp4.part.t01");
        let final_path = d.join("out.mp4");
        std::fs::write(&part, b"NEW").unwrap();
        std::fs::write(&final_path, b"OLD-LONGER-CONTENT").unwrap();

        atomic_replace(&part, &final_path).expect("替换应成功");

        assert_eq!(std::fs::read(&final_path).unwrap(), b"NEW");
        assert!(!part.exists(), "`.part` 应已被搬走");
    }

    /// TC-020：目标不存在时直接落地。
    #[test]
    fn creates_when_target_absent() {
        let d = tmp_dir("create");
        let part = d.join("out.mp4.part.t02");
        let final_path = d.join("out.mp4");
        std::fs::write(&part, b"NEW").unwrap();

        atomic_replace(&part, &final_path).expect("落地应成功");

        assert_eq!(std::fs::read(&final_path).unwrap(), b"NEW");
    }

    /// TC-020 的失败分支：目标**不可替换**时，旧文件与新产物都必须还在，且错误信息带 `.part` 完整路径。
    ///
    /// 用"目标是非空目录"制造不可替换（Windows 的 `MoveFileExW` 与 Unix 的 `rename(2)` 都拒绝），
    /// 这是唯一能跨平台稳定复现"替换失败"的构造——比抢文件句柄可靠（Rust 开文件默认允许共享删除）。
    #[test]
    fn keeps_old_file_and_part_when_replace_fails() {
        let d = tmp_dir("keep");
        let part = d.join("out.mp4.part.t03");
        let final_path = d.join("out.mp4");
        std::fs::write(&part, b"NEW").unwrap();
        std::fs::create_dir_all(final_path.join("occupied")).unwrap();

        let err = atomic_replace(&part, &final_path).expect_err("目标不可替换，必须报错");

        assert!(
            err.contains(&part.to_string_lossy().to_string()),
            "错误信息必须带 `.part` 完整路径，实际：{err}"
        );
        assert!(part.exists(), "`.part` 不能被搬走或删掉（新产物还在里面）");
        assert!(
            final_path.join("occupied").is_dir(),
            "旧文件（此处为目录）必须原样保留"
        );
    }
}
