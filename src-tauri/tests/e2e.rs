//! 核心链路 e2e（B14/M8，DESIGN §6.6）：真实 sidecar ffmpeg/ffprobe 跑通
//! 「剪切 → 合并 → pipeline」主链路，全部走 command.rs 真实构建器。
//! sidecar 缺失（未跑 fetch-ffmpeg）时打印 skip 并直接通过。

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use video_cut_lib::QualityPreset;
use video_cut_lib::ffmpeg::command as cmd;
use video_cut_lib::ffmpeg::probe;

/// 夹具：两个参数一致（可无损 concat）、内容不同的 320×240 H.264+AAC 源，
/// `-g 30` 保证每秒一个关键帧（copy 剪切落点确定）。
struct Fixtures {
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
    dir: PathBuf,
    src_a: PathBuf,
    src_b: PathBuf,
}

static FX: OnceLock<Option<Fixtures>> = OnceLock::new();

fn setup() -> Option<&'static Fixtures> {
    FX.get_or_init(build_fixtures).as_ref()
}

fn build_fixtures() -> Option<Fixtures> {
    let ffmpeg = cmd::resolve_sidecar("ffmpeg").ok()?;
    let ffprobe = cmd::resolve_sidecar("ffprobe").ok()?;
    let dir = std::env::temp_dir().join(format!("video-cut-e2e-{}", std::process::id()));
    std::fs::create_dir_all(&dir).ok()?;

    for (name, freq) in [("src_a.mp4", "440"), ("src_b.mp4", "660")] {
        let out = dir.join(name);
        let testsrc = format!("testsrc=duration=6:size=320x240:rate=30");
        let sine = format!("sine=frequency={freq}:duration=6");
        let r = Command::new(&ffmpeg)
            .args(["-hide_banner", "-loglevel", "error", "-y"])
            .args(["-f", "lavfi", "-i", &testsrc])
            .args(["-f", "lavfi", "-i", &sine])
            .args(["-c:v", "libx264", "-preset", "veryfast", "-g", "30", "-pix_fmt", "yuv420p"])
            .args(["-c:a", "aac", "-b:a", "96k", "-shortest"])
            .arg(&out)
            .output();
        match r {
            Ok(o) if o.status.success() => {}
            other => {
                eprintln!(
                    "skip: 夹具生成失败（{}）：{}",
                    name,
                    other.map(|o| String::from_utf8_lossy(&o.stderr).into_owned()).unwrap_or_default()
                );
                return None;
            }
        }
    }
    let (src_a, src_b) = (dir.join("src_a.mp4"), dir.join("src_b.mp4"));
    // 源本身可探测，双保险
    probe::probe_duration_sync(&ffprobe, &src_a.to_string_lossy()).ok()?;
    Some(Fixtures { ffmpeg, ffprobe, dir, src_a, src_b })
}

fn run_ffmpeg(fx: &Fixtures, args: &[String], what: &str) {
    let out = Command::new(&fx.ffmpeg).args(args).output().expect("启动 ffmpeg 失败");
    assert!(
        out.status.success(),
        "{what} 失败：{}",
        String::from_utf8_lossy(&out.stderr)
    );
}

/// 时长断言，返回实测值。ffprobe 走 probe.rs（顺带覆盖 B1 缓存路径）。
fn assert_duration(fx: &Fixtures, p: &Path, want: f64, tol: f64) -> f64 {
    let got = probe::probe_duration_sync(&fx.ffprobe, &p.to_string_lossy())
        .unwrap_or_else(|e| panic!("{} 探测失败：{e}", p.display()));
    assert!(
        (got - want).abs() <= tol,
        "{}：时长 {got:.3}s，期望 {want:.3}±{tol}s",
        p.display()
    );
    got
}

/// 全帧可解码判定：`-v error -f null -` 退出码 0 且 stderr 无解码错误（DESIGN §6.6）。
/// 例外：concat copy 的接缝处可能出现 dts 重复（null muxer 投诉但帧全部正常解码，
/// 播放器均容忍）——该行放行，其余任何 stderr 输出都视为失败。
fn assert_decodable(fx: &Fixtures, p: &Path) {
    let out = Command::new(&fx.ffmpeg)
        .args(["-v", "error", "-i"])
        .arg(p)
        .args(["-f", "null", "-"])
        .output()
        .unwrap();
    let stderr = String::from_utf8_lossy(&out.stderr);
    let fatal: Vec<_> = stderr
        .lines()
        .filter(|l| !l.contains("non monotonically increasing dts to muxer"))
        .collect();
    assert!(
        out.status.success() && fatal.is_empty(),
        "{} 存在解码错误：{}",
        p.display(),
        fatal.join("\n")
    );
}

fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

/// 链路 1+3：极速剪切 ×2 → concat 无损合并，总时长 = 片段和。
#[test]
fn fast_cut_and_merge_chain() {
    let Some(fx) = setup() else {
        eprintln!("skip: 未找到 sidecar ffmpeg/ffprobe（先运行 scripts/fetch-ffmpeg.ps1）");
        return;
    };
    let cut1 = fx.dir.join("e2e_cut1.mp4");
    let cut2 = fx.dir.join("e2e_cut2.mp4");
    let merged = fx.dir.join("e2e_merged.mp4");
    let list = fx.dir.join("e2e_concat.txt");

    // g=30 → 1.0/0.0 恰为关键帧，copy 输出时长 ≈ 请求值（音频 priming ±0.1s）
    run_ffmpeg(fx, &cmd::cut_args(1.0, 2.0, &s(&fx.src_a), &s(&cut1)), "极速剪切 A");
    let d1 = assert_duration(fx, &cut1, 2.0, 0.3);
    assert_decodable(fx, &cut1);

    run_ffmpeg(fx, &cmd::cut_args(0.0, 3.0, &s(&fx.src_b), &s(&cut2)), "极速剪切 B");
    let d2 = assert_duration(fx, &cut2, 3.0, 0.3);
    assert_decodable(fx, &cut2);

    std::fs::write(&list, cmd::concat_list_content(&[s(&cut1), s(&cut2)])).unwrap();
    run_ffmpeg(fx, &cmd::concat_args(&s(&list), &s(&merged)), "concat 合并");
    assert_duration(fx, &merged, d1 + d2, 0.5);
    assert_decodable(fx, &merged);
}

/// 链路 2：精确剪切（重编码）时长精确、可解码。
#[test]
fn precise_cut_is_accurate_and_decodable() {
    let Some(fx) = setup() else {
        eprintln!("skip: 未找到 sidecar ffmpeg/ffprobe");
        return;
    };
    let out = fx.dir.join("e2e_precise.mp4");
    run_ffmpeg(
        fx,
        &cmd::precise_cut_args(1.0, 2.0, &s(&fx.src_a), &s(&out), "libx264", QualityPreset::Balanced),
        "精确剪切",
    );
    assert_duration(fx, &out, 2.0, 0.3);
    assert_decodable(fx, &out);
}

/// 链路 4：pipeline 全链——copy 片段 + 带裁剪/翻转的重编码片段（timescale 对齐）
/// → normalize → concat，成品时长 = 片段和且全帧可解码。
#[test]
fn pipeline_full_chain() {
    let Some(fx) = setup() else {
        eprintln!("skip: 未找到 sidecar ffmpeg/ffprobe");
        return;
    };
    let seg1 = fx.dir.join("e2e_pipe_seg1.mp4");
    let seg2 = fx.dir.join("e2e_pipe_seg2.mp4");
    let seg2n = fx.dir.join("e2e_pipe_seg2n.mp4");
    let final_out = fx.dir.join("e2e_pipe_final.mp4");
    let list = fx.dir.join("e2e_pipe_concat.txt");

    // copy 片段：整段直通
    run_ffmpeg(
        fx,
        &cmd::pipeline_copy_args(Some((0.0, 2.0)), 0, false, false, &s(&fx.src_a), &s(&seg1)),
        "pipeline copy 片段",
    );
    let d1 = assert_duration(fx, &seg1, 2.0, 0.3);

    // 重编码片段：剪切 + 裁剪放大（160×120 → 320×240）+ 水平翻转，timescale 对齐源
    let facts_a = probe::probe_merge_facts_sync(&fx.ffprobe, &s(&fx.src_a)).unwrap();
    let base_ts = cmd::parse_timescale(&facts_a.video_time_base);
    run_ffmpeg(
        fx,
        &cmd::pipeline_transcode_args(
            Some((1.0, 2.0)),
            0,
            true,
            false,
            Some((0, 0, 160, 120, 320, 240)),
            "libx264",
            QualityPreset::Balanced,
            base_ts,
            &s(&fx.src_a),
            &s(&seg2),
        ),
        "pipeline 重编码片段",
    );
    assert_duration(fx, &seg2, 2.0, 0.3);
    assert_decodable(fx, &seg2);

    // 定向统一：以 seg1 为基准归一化 seg2（即使参数已一致也验证 normalize 链路可用）
    let facts1 = probe::probe_merge_facts_sync(&fx.ffprobe, &s(&seg1)).unwrap();
    run_ffmpeg(
        fx,
        &cmd::normalize_args(
            &s(&seg2),
            facts1.info.video.width,
            facts1.info.video.height,
            facts1.info.video.frame_rate,
            &facts1.info.video.pix_fmt,
            cmd::parse_timescale(&facts1.video_time_base),
            &s(&seg2n),
        ),
        "normalize 归一化",
    );
    let d2 = assert_duration(fx, &seg2n, 2.0, 0.3);

    std::fs::write(&list, cmd::concat_list_content(&[s(&seg1), s(&seg2n)])).unwrap();
    run_ffmpeg(fx, &cmd::concat_args(&s(&list), &s(&final_out)), "pipeline concat");
    assert_duration(fx, &final_out, d1 + d2, 0.5);
    assert_decodable(fx, &final_out);
}

/// 输出收尾（`TC-020` / `BUG-002`）：目标路径已存在旧产物时，替换必须是**系统级替换**，
/// 不是"先删旧文件再改名"——后者的失败窗口会让用户旧文件丢失、新产物只剩 `.part`。
///
/// 真实链路：ffmpeg 产出到 `.part` → `fs::atomic_replace` 收尾 → 断言最终文件是新产物、无 `.part` 残留。
#[test]
fn output_replace_over_existing_file() {
    let Some(fx) = setup() else {
        eprintln!("skip: 未找到 sidecar ffmpeg/ffprobe");
        return;
    };
    let final_path = fx.dir.join("e2e_replace.mp4");
    // 与 pipeline.rs 的 `.part.<令牌>.mp4` 命名保持一致：扩展名留在最后，ffmpeg 才能推断封装格式
    let part = fx.dir.join("e2e_replace.part.t99.mp4");

    // 先造一个"上一次导出"的旧产物（内容与时长都和新产物不同）
    run_ffmpeg(fx, &cmd::cut_args(0.0, 4.0, &s(&fx.src_b), &s(&final_path)), "准备旧产物");
    let old_dur = assert_duration(fx, &final_path, 4.0, 0.3);

    run_ffmpeg(fx, &cmd::cut_args(1.0, 2.0, &s(&fx.src_a), &s(&part)), "新产物写 .part");
    video_cut_lib::fs::atomic_replace(&part, &final_path).expect("替换必须成功");

    let new_dur = assert_duration(fx, &final_path, 2.0, 0.3);
    assert!(
        (new_dur - old_dur).abs() > 1.0,
        "最终文件必须是新产物（{new_dur:.2}s）而不是旧文件（{old_dur:.2}s）"
    );
    assert_decodable(fx, &final_path);
    assert!(!part.exists(), "`.part` 不得残留");
}
