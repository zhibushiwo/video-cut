//! 文件系统助手：输出收尾的**原子替换**（AGENTS.md §3 第 19 条 · NFR-007 · `BUG-002`）
//! 与**输出容器/扩展名口径**（`ADR-033` · NFR-007）。

use std::path::{Path, PathBuf};

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

/// 输出**容器扩展名**（`ADR-033` ①）：copy 类跟随源容器，取不到扩展名时退回 `mp4`。
///
/// 只做取扩展名这一件事——**该跟源还是该固定 mp4 由命令决定**（重编码类一律传 `"mp4"`）。
pub fn source_container_ext(input: &str) -> String {
    Path::new(input)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_else(|| "mp4".to_string())
}

/// 把输出路径的扩展名**校正为**容器扩展名（`ADR-033` ③）。
///
/// 用户/前端可以给任何名字（默认 `merged.mp4`、跟随源扩展名、手打 `xx.mkv`），但封装由
/// 命令决定：copy 类跟随源容器、重编码类固定 mp4。名字与封装打架时以**封装**为准——
/// 否则会出现"文件名叫 `.mkv`、内容其实是 MP4"这种名实不符（`ADR-033` 要消除的正是它）。
pub fn with_container_ext(requested: &Path, ext: &str) -> PathBuf {
    let mut p = requested.to_path_buf();
    p.set_extension(ext);
    p
}

/// 输出路径**不得落在输入文件上**——命令的提交期检查（请求路径）与扩容器校正后的复查都走这里。
///
/// 提交期只检查了**用户请求的**路径；扩展名校正可能把它改成另一个已存在的输入文件，而
/// `atomic_replace` 会直接替换掉目标 —— 那就把源文件删了。所以校正后要再挡一次。
/// 两处守卫**共用这一份实现**（同一性比较见 [`same_path`]），避免口径分叉。
pub fn reject_if_input_equals(final_path: &Path, inputs: &[&str]) -> Result<(), String> {
    if let Some(hit) = inputs
        .iter()
        .find(|i| !i.is_empty() && same_path(Path::new(i), final_path))
    {
        return Err(format!(
            "输出路径与输入文件相同：{}（与输入 {hit} 撞车，已阻止以免覆盖源文件）",
            final_path.display()
        ));
    }
    Ok(())
}

/// 两个路径是否指向**同一个文件**（`R3-6` 第二条 / `R3-7`）。
///
/// 守卫的用途是"输出不得落在输入上"，**逐字符比较会失效**：Windows 上 `C:\a\b.mp4`、
/// `c:/a/b.mp4`、`C:\a\..\a\b.mp4` 是同一个文件，只比字面就会放行——随后 `atomic_replace`
/// 会把**用户的源文件**替换掉（不可逆的数据丢失）。
///
/// 做法：`std::fs::canonicalize` 解析两侧（消大小写、斜杠形式、`.`/`..`）；输出路径常常**还不存在**，
/// 此时退回"父目录 canonicalize + 文件名"；父目录也解析不了才退回原始比较。
/// **输入一侧必定可解析**（调用方此前已校验 `is_file`），所以退回分支实际只在输出父目录尚不存在时走到。
pub fn same_path(a: &Path, b: &Path) -> bool {
    match (resolve_for_compare(a), resolve_for_compare(b)) {
        (Some(x), Some(y)) => path_eq(&x, &y),
        _ => a == b,
    }
}

/// 尽量把路径解析成可比较的形式：整体 canonicalize；文件不存在时用"父目录 + 文件名"。
fn resolve_for_compare(p: &Path) -> Option<PathBuf> {
    if let Ok(c) = std::fs::canonicalize(p) {
        return Some(c);
    }
    let name = p.file_name()?;
    let parent = p
        .parent()
        .filter(|d| !d.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    std::fs::canonicalize(parent).ok().map(|dir| dir.join(name))
}

/// Windows 的文件系统不区分大小写，比较时也不区分（仅 ASCII 折叠）；其他平台按原样比较。
///
/// 只在"两侧都解析不出来"的退化情形下这条折叠才起作用——能 canonicalize 时 Windows 会给出
/// 磁盘上的真实大小写，本来就已经一致。
fn path_eq(a: &Path, b: &Path) -> bool {
    #[cfg(windows)]
    {
        a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        a == b
    }
}

/// 输出路径 = **校正容器扩展名** + **同名不静默覆盖**（`ADR-033` ③ + 决策 #19）。
///
/// 前端按它自己算出的名字做过一次"同名才追加时间戳"检查，但扩展名校正发生在后端——
/// 用户把名字打成 `merged.mkv` 而实际封装是 mp4 时，校正出来的 `merged.mp4` 可能已经存在，
/// 而前端从来没检查过这个名字。这条路径若不管，就成了"静默覆盖既有文件"（违背决策 #19）。
///
/// 因此：**只有"因校正而改名"且校正后的名字已存在**时，这里才补时间戳（格式与前端
/// `fileTimestamp` 一致：`stem_yyyyMMdd_HHmmss.ext`）。未发生校正的情形仍由前端负责
/// （避免两处各追加一次时间戳）。
pub fn output_path_for(requested: &Path, ext: &str) -> PathBuf {
    let corrected = with_container_ext(requested, ext);
    if corrected == requested || !corrected.exists() {
        return corrected;
    }
    let stem = corrected
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let parent = corrected.parent().unwrap_or(Path::new(""));
    let ts = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let ext = corrected.extension().and_then(|e| e.to_str()).unwrap_or("mp4");
    parent.join(format!("{stem}_{ts}.{ext}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `ADR-033` ③：最终名的扩展名按容器校正（含无扩展名与大小写）。
    #[test]
    fn output_name_takes_container_extension() {
        assert_eq!(with_container_ext(Path::new("d/x.mkv"), "mp4"), PathBuf::from("d/x.mp4"));
        assert_eq!(with_container_ext(Path::new("d/x.mp4"), "mkv"), PathBuf::from("d/x.mkv"));
        assert_eq!(with_container_ext(Path::new("d/x"), "mp4"), PathBuf::from("d/x.mp4"));
        assert_eq!(with_container_ext(Path::new("d/X.MP4"), "mkv"), PathBuf::from("d/X.mkv"));
        assert_eq!(with_container_ext(Path::new("d/x.tar.gz"), "mp4"), PathBuf::from("d/x.tar.mp4"));
    }

    /// `ADR-033` ①：copy 类跟随源容器；取不到扩展名时退回 `mp4`。
    #[test]
    fn source_container_ext_follows_source_and_falls_back() {
        assert_eq!(source_container_ext("a/b.MKV"), "mkv");
        assert_eq!(source_container_ext("a/b.mov"), "mov");
        assert_eq!(source_container_ext("a/b"), "mp4");
        assert_eq!(source_container_ext("a.b/c"), "mp4");
    }

    /// 校正后的路径撞上输入文件时必须报错（否则会把源文件替换掉）。
    #[test]
    fn rejects_corrected_path_equal_to_input() {
        let d = tmp_dir("hit-input");
        let src = d.join("movie.mkv");
        std::fs::write(&src, b"src").unwrap();
        let final_path = with_container_ext(&d.join("movie.mp4"), "mkv");
        assert_eq!(final_path, src);

        let err = reject_if_input_equals(&final_path, &[&src.to_string_lossy()])
            .expect_err("撞上输入文件必须报错");
        assert!(err.contains("与输入文件相同"), "实际信息：{err}");
        // 不同路径时放行
        assert!(reject_if_input_equals(&d.join("other.mkv"), &[&src.to_string_lossy()]).is_ok());
    }

    /// `R3-7`：同一性比较必须归一化——把输出写成 `<dir>/sub/../movie.mkv` 这种"绕行"形式
    /// 就能绕过逐字符比较，随后 `atomic_replace` 会把**源文件**替换掉（数据丢失）。
    #[test]
    fn same_path_normalizes_dotdot_detour() {
        let d = tmp_dir("same-path-detour");
        std::fs::create_dir_all(d.join("sub")).unwrap();
        let src = d.join("movie.mkv");
        std::fs::write(&src, b"src").unwrap();
        let detour = d.join("sub").join("..").join("movie.mkv");

        assert_ne!(detour, src, "构造前提：两条路径字面必须不同");
        assert!(detour.exists(), "构造前提：该写法指向同一个已存在的文件");
        assert!(same_path(&detour, &src), "归一化后必须判为同一文件");
        assert!(same_path(&src, &detour), "比较应当是对称的");

        let err = reject_if_input_equals(&detour, &[&src.to_string_lossy()])
            .expect_err("绕行写法撞上输入文件也必须报错");
        assert!(err.contains("与输入文件相同"), "实际信息：{err}");
    }

    /// 不同文件必须放行；解析不了的路径**不得 panic**（退回原始比较）。
    #[test]
    fn same_path_distinguishes_and_never_panics() {
        let d = tmp_dir("same-path-distinct");
        std::fs::write(d.join("a.mkv"), b"a").unwrap();

        assert!(!same_path(&d.join("a.mkv"), &d.join("b.mkv")));
        // 同名但不同目录，且该目录不存在（走不通解析分支 → 退回原始比较）
        assert!(!same_path(&d.join("a.mkv"), &d.join("nodir").join("a.mkv")));
        // 空路径 / 只有文件名的相对路径都不得 panic
        assert!(!same_path(Path::new(""), &d.join("a.mkv")));
        assert!(!same_path(Path::new("a.mkv"), &d.join("a.mkv")));
    }

    /// Windows 文件系统不区分大小写：`<dir>/NEW.MP4` 与 `<dir>/new.mp4` 是同一个文件。
    /// 这里两者都不存在，正好检验"父目录 + 文件名"分支里的大小写折叠。
    #[cfg(windows)]
    #[test]
    fn same_path_ignores_case_on_windows() {
        let d = tmp_dir("same-path-case");
        assert!(!d.join("new.mp4").exists(), "构造前提：目标文件不存在");

        assert!(same_path(&d.join("new.mp4"), &d.join("NEW.MP4")));
        assert!(!same_path(&d.join("new.mp4"), &d.join("OLD.MP4")), "名字不同仍应放行");
    }

    /// Windows 会剥掉文件名末尾的点/空格：`<dir>/movie.mp4.` 与 `<dir>/movie.mp4` 是**同一个文件**
    /// （实测 `canonicalize` 两者都解析到真实路径，且往 `movie.mp4.` 写入确实改到了 `movie.mp4`）
    /// ——这条也必须在守卫覆盖范围内。
    #[cfg(windows)]
    #[test]
    fn same_path_catches_windows_trailing_dot_and_space() {
        let d = tmp_dir("same-path-trailing");
        let real = d.join("movie.mp4");
        std::fs::write(&real, b"real").unwrap();

        assert!(same_path(&d.join("movie.mp4."), &real), "末尾点指向同一文件");
        assert!(same_path(&d.join("movie.mp4 "), &real), "末尾空格同理");
        assert!(
            reject_if_input_equals(&d.join("movie.mp4."), &[&real.to_string_lossy()]).is_err(),
            "守卫必须拦下这种写法"
        );
    }

    /// 校正扩展名 + 同名不静默覆盖（`ADR-033` ③ + 决策 #19）。
    #[test]
    fn output_path_guards_against_silent_overwrite() {
        let d = tmp_dir("outname");
        // ① 未发生校正 → 原样返回（同名与否交给前端负责，避免重复追加时间戳）
        let same = d.join("x.mkv");
        std::fs::write(&same, b"old").unwrap();
        assert_eq!(output_path_for(&same, "mkv"), same);

        // ② 发生校正、校正后不存在 → 直接用校正结果
        assert_eq!(output_path_for(&d.join("y.mkv"), "mp4"), d.join("y.mp4"));

        // ③ 发生校正、校正后**已存在** → 追加时间戳，不覆盖既有文件
        let taken = d.join("z.mp4");
        std::fs::write(&taken, b"old").unwrap();
        let got = output_path_for(&d.join("z.mkv"), "mp4");
        assert_ne!(got, taken, "既有文件不得被静默覆盖");
        assert_eq!(got.extension().and_then(|e| e.to_str()), Some("mp4"));
        let name = got.file_name().and_then(|n| n.to_str()).unwrap();
        assert!(
            name.starts_with("z_") && name.len() == "z_20260923_235959.mp4".len(),
            "应追加 yyyyMMdd_HHmmss 时间戳，实际：{name}"
        );
    }

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
