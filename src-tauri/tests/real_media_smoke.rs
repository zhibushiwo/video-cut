//! 真实素材冒烟（`#[ignore]` 门控 —— 默认 `cargo test` 不会跑，只编译）。
//!
//! 与 `e2e.rs` 的区别：e2e 用 6 秒 320×240 合成夹具，本文件用 `video/` 下的
//! 真实 1080p60 素材（含 1GB / 264s 长片），覆盖合成夹具测不到的东西：
//! 真实 GOP 布局下的极速剪切落点、concat 接缝可播放性、1GB 文件探测、
//! 元数据旋转是否真的零重编码、工作台多片段合成链路。
//!
//! 运行（约 3.5 分钟，产物写 `%TEMP%\video-cut-real-<pid>`；缺 `video/` 素材自动跳过）：
//!
//! ```text
//! cargo test --test real_media_smoke -- --ignored --nocapture --test-threads=1
//! ```
//!
//! 全部走 `command.rs` 的真实参数构建器；断言全部独立用 ffprobe 复核。

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use serde_json::Value;
use video_cut_lib::ffmpeg::command as cmd;
use video_cut_lib::ffmpeg::probe;
use video_cut_lib::QualityPreset;

struct Env {
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
    dir: PathBuf,
    a: PathBuf,
    b: PathBuf,
    small: PathBuf,
    big: PathBuf,
}

static E: OnceLock<Option<Env>> = OnceLock::new();

fn fx() -> Option<&'static Env> {
    E.get_or_init(|| {
        let ffmpeg = cmd::resolve_sidecar("ffmpeg").ok()?;
        let ffprobe = cmd::resolve_sidecar("ffprobe").ok()?;
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("video");
        let a = root.join("merge_test_a.mp4");
        let b = root.join("merge_test_b.mp4");
        let small = root.join("123.mp4");
        let big = root.join("极乐净土 1080p ultra.mp4");
        for p in [&a, &b, &small, &big] {
            if !p.exists() {
                eprintln!("skip: 缺素材 {}", p.display());
                return None;
            }
        }
        let dir = std::env::temp_dir().join(format!("video-cut-real-{}", std::process::id()));
        std::fs::create_dir_all(&dir).ok()?;
        eprintln!("== 产物目录：{}", dir.display());
        Some(Env {
            ffmpeg,
            ffprobe,
            dir,
            a,
            b,
            small,
            big,
        })
    })
    .as_ref()
}

fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

fn run(e: &Env, args: &[String], what: &str) -> Duration {
    let t = Instant::now();
    let out = Command::new(&e.ffmpeg)
        .args(args)
        .output()
        .expect("ffmpeg 启动失败");
    let d = t.elapsed();
    assert!(
        out.status.success(),
        "{what} 失败：{}",
        String::from_utf8_lossy(&out.stderr)
    );
    println!("  [ok] {what}  {:.2}s", d.as_secs_f64());
    d
}

fn ffprobe_json(e: &Env, p: &Path) -> Value {
    let out = Command::new(&e.ffprobe)
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
        ])
        .arg(p)
        .output()
        .expect("ffprobe 启动失败");
    assert!(
        out.status.success(),
        "ffprobe 失败：{}",
        String::from_utf8_lossy(&out.stderr)
    );
    serde_json::from_slice(&out.stdout).expect("ffprobe JSON 解析失败")
}

fn streams_of<'a>(v: &'a Value, kind: &str) -> Vec<&'a Value> {
    v["streams"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter(|s| s["codec_type"].as_str() == Some(kind))
                .collect()
        })
        .unwrap_or_default()
}

fn duration_of(v: &Value) -> f64 {
    v["format"]["duration"]
        .as_str()
        .unwrap_or("0")
        .parse()
        .unwrap_or(0.0)
}

fn video_dims(v: &Value) -> (i64, i64) {
    let st = streams_of(v, "video");
    let f = st.first().expect("无视频流");
    (
        f["width"].as_i64().unwrap_or(0),
        f["height"].as_i64().unwrap_or(0),
    )
}

fn display_rotation(v: &Value) -> Option<f64> {
    streams_of(v, "video")
        .first()?
        .get("side_data_list")?
        .as_array()?
        .iter()
        .find(|d| {
            d["side_data_type"]
                .as_str()
                .map(|x| x.contains("Display Matrix"))
                .unwrap_or(false)
        })?
        .get("rotation")?
        .as_f64()
}

fn first_video_pts(e: &Env, p: &Path) -> f64 {
    let out = Command::new(&e.ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "packet=pts_time",
            "-of",
            "csv=p=0",
            "-read_intervals",
            "%+#1",
        ])
        .arg(p)
        .output()
        .unwrap();
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .parse()
        .unwrap_or(f64::NAN)
}

/// 全帧可解码（与 e2e.rs 同口径：放行 concat copy 接缝的 dts 重复告警）。
fn assert_decodable(e: &Env, p: &Path) {
    let t = Instant::now();
    let out = Command::new(&e.ffmpeg)
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
    println!(
        "  [ok] 全帧解码 {}  {:.2}s",
        p.file_name().unwrap().to_string_lossy(),
        t.elapsed().as_secs_f64()
    );
}

/// 解码某个时间窗口，专抓 concat 接缝处的时间戳损坏。
fn assert_decodable_window(e: &Env, p: &Path, from: f64, dur: f64) {
    let out = Command::new(&e.ffmpeg)
        .args([
            "-v",
            "error",
            "-ss",
            &format!("{from:.3}"),
            "-t",
            &format!("{dur:.3}"),
            "-i",
        ])
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
        "窗口 {from:.2}~{:.2} 解码失败：{}",
        from + dur,
        fatal.join("\n")
    );
}

/// 关键帧时间点：走 probe::parse_keyframes（与产品同一条解析路径）。
fn keyframes(e: &Env, p: &Path) -> Vec<f64> {
    let out = Command::new(&e.ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-skip_frame",
            "nokey",
            "-show_entries",
            "frame=pts_time",
            "-of",
            "csv=p=0",
        ])
        .arg(p)
        .output()
        .unwrap();
    probe::parse_keyframes(&String::from_utf8_lossy(&out.stdout))
}

/// ffprobe 原始行（不解析），用于对照解析结果。
fn keyframes_raw(e: &Env, p: &Path) -> Vec<String> {
    String::from_utf8_lossy(
        &Command::new(&e.ffprobe)
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-skip_frame",
                "nokey",
                "-show_entries",
                "frame=pts_time",
                "-of",
                "csv=p=0",
            ])
            .arg(p)
            .output()
            .unwrap()
            .stdout,
    )
    .lines()
    .map(|l| l.to_string())
    .collect()
}

// ---------------------------------------------------------------- t1

/// 真实 1080p60 无损合并：时长=片段和、双流保留、编码未变、接缝处可 seek 可解码。
/// 这条直接压 DESIGN §6.3③ 与「时长对但 seek 坏」那个历史陷阱。
#[test]
#[ignore = "需 video/ 真实素材，约 40s"]
fn t1_real_lossless_merge_and_seam() {
    let Some(e) = fx() else { return };
    let merged = e.dir.join("t1_merged.mp4");
    let list = e.dir.join("t1_concat.txt");

    let da = probe::probe_duration_sync(&e.ffprobe, &s(&e.a)).unwrap();
    let db = probe::probe_duration_sync(&e.ffprobe, &s(&e.b)).unwrap();
    println!("  源：a={da:.3}s  b={db:.3}s  期望合计={:.3}s", da + db);

    std::fs::write(&list, cmd::concat_list_content(&[s(&e.a), s(&e.b)])).unwrap();
    run(
        e,
        &cmd::concat_args(&s(&list), &s(&merged)),
        "concat 无损合并（210MB 源）",
    );

    let v = ffprobe_json(e, &merged);
    let got = duration_of(&v);
    println!(
        "  实测：{got:.3}s  大小={:.1}MB",
        merged.metadata().unwrap().len() as f64 / 1e6
    );
    assert!(
        (got - (da + db)).abs() <= 0.6,
        "时长 {got:.3}s 偏离 {:.3}±0.6s",
        da + db
    );

    let (vs, asu) = (streams_of(&v, "video"), streams_of(&v, "audio"));
    assert_eq!(vs.len(), 1, "视频流数量应保持 1");
    assert_eq!(asu.len(), 1, "音频流数量应保持 1");
    assert_eq!(
        vs[0]["codec_name"].as_str(),
        Some("h264"),
        "视频编码应原样 copy"
    );
    assert_eq!(
        asu[0]["codec_name"].as_str(),
        Some("aac"),
        "音频编码应原样 copy"
    );
    assert_eq!(video_dims(&v), (1920, 1080));

    // 接缝前后各 1s：时间戳若被 concat 弄坏，这里必炸
    assert_decodable_window(e, &merged, da - 1.0, 2.0);
    assert_decodable(e, &merged);
}

// ---------------------------------------------------------------- t2

/// 真实长片（1GB / 264s）极速剪切：必须仍是 stream copy，且时长偏差不超过一个 GOP。
#[test]
#[ignore = "需 video/ 真实素材，约 10s"]
fn t2_real_fast_cut_snaps_within_one_gop() {
    let Some(e) = fx() else { return };
    let out = e.dir.join("t2_cut.mp4");

    let kfs = keyframes(e, &e.big);
    let max_gop = kfs.windows(2).map(|w| w[1] - w[0]).fold(0.0_f64, f64::max);
    println!(
        "  极乐净土：{} 个关键帧，最大 GOP={max_gop:.3}s，首帧={:.3}",
        kfs.len(),
        kfs[0]
    );

    let t = run(
        e,
        &cmd::cut_args(30.0, 5.0, &s(&e.big), &s(&out)),
        "极速剪切 30.0s+5.0s（1GB 源）",
    );
    println!("  耗时 {:.2}s（copy 应接近磁盘速度）", t.as_secs_f64());

    let v = ffprobe_json(e, &out);
    let got = duration_of(&v);
    assert_eq!(streams_of(&v, "video").len(), 1);
    assert_eq!(streams_of(&v, "audio").len(), 1, "多流必须由 -map 0 保留");
    assert_eq!(
        streams_of(&v, "video")[0]["codec_name"].as_str(),
        Some("h264"),
        "极速剪切不得重编码"
    );
    assert_eq!(video_dims(&v), (1920, 1080));

    // 时长下界：源里 30.0 前的最近关键帧；上界：请求时长 + 一个 GOP 余量
    let lower = 5.0 - max_gop - 0.5;
    assert!(
        got >= lower && got <= 5.5,
        "时长 {got:.3}s 超出 [{lower:.3}, 5.5]（最大 GOP={max_gop:.3}s）"
    );

    // 输出应从 0 开始（-avoid_negative_ts make_zero）。实测为 0.053s（≈3 帧）：
    // B 帧重排 + 音频 priming 的固有量级，与 e2e 的 ±0.1s 口径一致，非缺陷。
    let pts = first_video_pts(e, &out);
    assert!(pts.abs() < 0.1, "首帧 pts 应接近 0，实测 {pts}");
    assert_decodable(e, &out);
    println!("  [ok] 实测时长={got:.3}s，首帧 pts={pts:.3}，期望区间 [{lower:.3}, 5.5]");
}

// ---------------------------------------------------------------- t3

/// 帧率非整数（avg 24000/401）的素材走精确剪切，时长应精确。
#[test]
#[ignore = "需 video/ 真实素材，约 17s"]
fn t3_real_precise_cut_is_accurate() {
    let Some(e) = fx() else { return };
    let out = e.dir.join("t3_precise.mp4");
    run(
        e,
        &cmd::precise_cut_args(
            2.0,
            3.0,
            &s(&e.small),
            &s(&out),
            "libx264",
            QualityPreset::Balanced,
        ),
        "精确剪切 2.0s+3.0s",
    );
    let v = ffprobe_json(e, &out);
    let got = duration_of(&v);
    assert!((got - 3.0).abs() <= 0.2, "时长 {got:.3}s 偏离 3.0±0.2s");
    assert_eq!(streams_of(&v, "audio").len(), 1, "音频应 copy 保留");
    assert_eq!(video_dims(&v), (1920, 1080));
    assert_decodable(e, &out);
}

// ---------------------------------------------------------------- t4

/// 元数据旋转必须是"零重编码"：像素编码数据原样、分辨率不变、只写显示矩阵。
#[test]
#[ignore = "需 video/ 真实素材，约 15s"]
fn t4_real_rotate_remux_is_pixel_identity() {
    let Some(e) = fx() else { return };
    let out = e.dir.join("t4_rot90.mp4");

    let before = ffprobe_json(e, &e.a);
    run(
        e,
        &cmd::rotate_remux_args_deg(90, false, false, &s(&e.a), &s(&out)),
        "元数据旋转 90°（remux）",
    );

    let after = ffprobe_json(e, &out);
    assert_eq!(
        video_dims(&after),
        video_dims(&before),
        "remux 不应改变编码分辨率"
    );
    assert_eq!(
        display_rotation(&after),
        Some(90.0),
        "应写入 Display Matrix rotation=90"
    );
    assert_eq!(streams_of(&after, "audio").len(), 1);
    assert_eq!(
        streams_of(&after, "video")[0]["codec_name"].as_str(),
        Some("h264")
    );
    let (db, da) = (duration_of(&before), duration_of(&after));
    assert!(
        (da - db).abs() <= 0.05,
        "remux 时长应不变：{db:.3}s → {da:.3}s"
    );
    assert_decodable(e, &out);
}

// ---------------------------------------------------------------- t5

/// 重编码旋转应真正交换宽高（1920×1080 → 1080×1920）。
#[test]
#[ignore = "需 video/ 真实素材，约 80s（最慢的一条）"]
fn t5_real_rotate_transcode_swaps_dims() {
    let Some(e) = fx() else { return };
    let out = e.dir.join("t5_rot90_baked.mp4");
    run(
        e,
        &cmd::rotate_transcode_args(
            90,
            false,
            false,
            &s(&e.small),
            &s(&out),
            "libx264",
            QualityPreset::Balanced,
        ),
        "重编码旋转 90°",
    );
    let v = ffprobe_json(e, &out);
    assert_eq!(video_dims(&v), (1080, 1920), "重编码旋转后宽高应交换");
    assert_decodable(e, &out);
}

// ---------------------------------------------------------------- t6

/// 工作台多片段全链：copy 片段 + 重编码片段（旋转 180 + 裁剪放大）→ normalize → concat。
/// 重点是 timescale 对齐后成品仍可全帧解码、时长=片段和。
#[test]
#[ignore = "需 video/ 真实素材，约 40s"]
fn t6_real_workbench_pipeline_end_to_end() {
    let Some(e) = fx() else { return };
    let seg1 = e.dir.join("t6_seg1.mp4");
    let seg2 = e.dir.join("t6_seg2.mp4");
    let seg2n = e.dir.join("t6_seg2n.mp4");
    let final_out = e.dir.join("t6_final.mp4");
    let list = e.dir.join("t6_concat.txt");

    run(
        e,
        &cmd::pipeline_copy_args(Some((0.0, 6.0)), 0, false, false, &s(&e.a), &s(&seg1)),
        "片段1 copy 0..6s",
    );
    let d1 = duration_of(&ffprobe_json(e, &seg1));

    let facts_a = probe::probe_merge_facts_sync(&e.ffprobe, &s(&e.a)).unwrap();
    let base_ts = cmd::parse_timescale(&facts_a.video_time_base);
    assert_eq!(base_ts, 60000, "真实素材 tb 应为 1/60000");

    run(
        e,
        &cmd::pipeline_transcode_args(
            Some((1.0, 3.0)),
            180,
            false,
            false,
            Some((0, 0, 960, 540, 1920, 1080)),
            "libx264",
            QualityPreset::Balanced,
            base_ts,
            &s(&e.b),
            &s(&seg2),
        ),
        "片段2 转码（180° + 裁剪放大 + timescale 对齐）",
    );
    let d2 = duration_of(&ffprobe_json(e, &seg2));
    assert!((d2 - 3.0).abs() <= 0.35, "片段2 时长 {d2:.3}s 偏离 3.0");
    assert_eq!(video_dims(&ffprobe_json(e, &seg2)), (1920, 1080));
    assert_decodable(e, &seg2);

    let f1 = probe::probe_merge_facts_sync(&e.ffprobe, &s(&seg1)).unwrap();
    run(
        e,
        &cmd::normalize_args(
            &s(&seg2),
            f1.info.video.width,
            f1.info.video.height,
            f1.info.video.frame_rate,
            &f1.info.video.pix_fmt,
            cmd::parse_timescale(&f1.video_time_base),
            &s(&seg2n),
        ),
        "normalize 定向统一",
    );
    let d2n = duration_of(&ffprobe_json(e, &seg2n));
    assert!((d2n - 3.0).abs() <= 0.35, "归一化后时长 {d2n:.3}s 偏离 3.0");

    std::fs::write(&list, cmd::concat_list_content(&[s(&seg1), s(&seg2n)])).unwrap();
    run(
        e,
        &cmd::concat_args(&s(&list), &s(&final_out)),
        "成品 concat",
    );

    let v = ffprobe_json(e, &final_out);
    let total = duration_of(&v);
    println!(
        "  片段 {d1:.3}s + {d2n:.3}s = {:.3}s，成品 {total:.3}s",
        d1 + d2n
    );
    assert!(
        (total - (d1 + d2n)).abs() <= 0.6,
        "成品时长 {total:.3}s 偏离 {:.3}±0.6s",
        d1 + d2n
    );
    assert_eq!(video_dims(&v), (1920, 1080), "成品分辨率应与首片段一致");
    assert_eq!(streams_of(&v, "audio").len(), 1);
    assert_decodable_window(e, &final_out, d1 - 1.0, 2.0);
    assert_decodable(e, &final_out);
}

// ---------------------------------------------------------------- t7

/// 1GB 长片的探测：结果正确且命中缓存（第二次显著更快）。
#[test]
#[ignore = "需 video/ 真实素材"]
fn t7_real_big_probe_is_correct_and_cached() {
    let Some(e) = fx() else { return };
    let path = s(&e.big);

    let t1 = Instant::now();
    let d1 = probe::probe_duration_sync(&e.ffprobe, &path).unwrap();
    let e1 = t1.elapsed();

    let t2 = Instant::now();
    let d2 = probe::probe_duration_sync(&e.ffprobe, &path).unwrap();
    let e2 = t2.elapsed();

    println!(
        "  1GB 探测：{d1:.3}s 用时 {:.1}ms → {d2:.3}s 用时 {:.1}ms",
        e1.as_secs_f64() * 1e3,
        e2.as_secs_f64() * 1e3
    );
    assert!((d1 - 264.554).abs() <= 0.5, "时长 {d1:.3}s 偏离 264.554");
    assert_eq!(d1, d2, "两次探测结果应一致");
    assert!(
        e2 <= e1 + Duration::from_millis(5),
        "第二次探测应命中缓存（{e1:?} → {e2:?}）"
    );

    let facts = probe::probe_merge_facts_sync(&e.ffprobe, &path).unwrap();
    assert_eq!(
        (facts.info.video.width, facts.info.video.height),
        (1920, 1080)
    );
    assert_eq!(facts.video_time_base, "1/60000");
    println!(
        "  合并事实：{}×{} @ {:.3}fps {} tb={}",
        facts.info.video.width,
        facts.info.video.height,
        facts.info.video.frame_rate,
        facts.info.video.pix_fmt,
        facts.video_time_base
    );
}

// ---------------------------------------------------------------- t8

/// 关键帧解析完整性（UI 吸附与时间轴刻度都吃这份数据）。
///
/// ffprobe 对**部分**帧会多输出一个空 CSV 字段（实测：极乐净土第 1 行 `0.000000,`、
/// `123.mp4` 第 3 行 `5.753333,`；`merge_test_a/b` 不出现），而 `parse_keyframes`
/// 用整行 `parse::<f64>()` 解析 → 这些行被静默丢弃。
/// 本用例断言"解析条数 == ffprobe 原始行数"，丢一条就红。
#[test]
#[ignore = "需 video/ 真实素材"]
fn t8_real_keyframe_parse_completeness() {
    let Some(e) = fx() else { return };

    let raw = keyframes_raw(e, &e.big);
    let t = Instant::now();
    let parsed = keyframes(e, &e.big);
    let scan = t.elapsed();

    let comma_lines: Vec<&String> = raw.iter().filter(|l| l.contains(',')).collect();
    println!(
        "  ffprobe 原始 {} 行，解析得到 {} 行；带多余字段的行={:?}",
        raw.len(),
        parsed.len(),
        comma_lines
    );
    println!("  首帧：ffprobe={} 解析后={:?}", raw[0], parsed.first());
    println!("  扫描耗时 {:.2}s", scan.as_secs_f64());

    assert!(
        !comma_lines.is_empty(),
        "本素材不应出现多余字段（前提变了，用例需重写）"
    );
    assert_eq!(
        parsed.len(),
        raw.len(),
        "关键帧被丢弃：ffprobe {} 行 → 解析 {} 行，缺 {:?}",
        raw.len(),
        parsed.len(),
        raw.iter()
            .filter(|l| l
                .split(',')
                .next()
                .unwrap_or("")
                .trim()
                .parse::<f64>()
                .is_ok())
            .filter(|l| l.trim().parse::<f64>().is_err())
            .collect::<Vec<_>>()
    );
    assert_eq!(parsed.first().copied(), Some(0.0), "首个关键帧应为 0.0");
    assert!(
        parsed.windows(2).all(|w| w[1] > w[0]),
        "关键帧时间点应严格升序"
    );
    assert!(scan < Duration::from_secs(60), "关键帧扫描过慢：{scan:?}");
}
