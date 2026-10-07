//! 核心链路 e2e（B14/M8，DESIGN §6.6）：真实 sidecar ffmpeg/ffprobe 跑通
//! 「剪切 → 合并 → pipeline」主链路，全部走 command.rs 真实构建器。
//! sidecar 缺失（未跑 fetch-ffmpeg）时打印 skip 并直接通过。

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use video_cut_lib::ffmpeg::command as cmd;
use video_cut_lib::ffmpeg::probe;
use video_cut_lib::whisper_cli_args;
use video_cut_lib::QualityPreset;

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
            .args([
                "-c:v", "libx264", "-preset", "veryfast", "-g", "30", "-pix_fmt", "yuv420p",
            ])
            .args(["-c:a", "aac", "-b:a", "96k", "-shortest"])
            .arg(&out)
            .output();
        match r {
            Ok(o) if o.status.success() => {}
            other => {
                eprintln!(
                    "skip: 夹具生成失败（{}）：{}",
                    name,
                    other
                        .map(|o| String::from_utf8_lossy(&o.stderr).into_owned())
                        .unwrap_or_default()
                );
                return None;
            }
        }
    }
    let (src_a, src_b) = (dir.join("src_a.mp4"), dir.join("src_b.mp4"));
    // 源本身可探测，双保险
    probe::probe_duration_sync(&ffprobe, &src_a.to_string_lossy()).ok()?;
    Some(Fixtures {
        ffmpeg,
        ffprobe,
        dir,
        src_a,
        src_b,
    })
}

fn run_ffmpeg(fx: &Fixtures, args: &[String], what: &str) {
    let out = Command::new(&fx.ffmpeg)
        .args(args)
        .output()
        .expect("启动 ffmpeg 失败");
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
    run_ffmpeg(
        fx,
        &cmd::cut_args(1.0, 2.0, &s(&fx.src_a), &s(&cut1)),
        "极速剪切 A",
    );
    let d1 = assert_duration(fx, &cut1, 2.0, 0.3);
    assert_decodable(fx, &cut1);

    run_ffmpeg(
        fx,
        &cmd::cut_args(0.0, 3.0, &s(&fx.src_b), &s(&cut2)),
        "极速剪切 B",
    );
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
        &cmd::precise_cut_args(
            1.0,
            2.0,
            &s(&fx.src_a),
            &s(&out),
            "libx264",
            QualityPreset::Balanced,
        ),
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
            false,
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
            false,
        ),
        "normalize 归一化",
    );
    let d2 = assert_duration(fx, &seg2n, 2.0, 0.3);

    std::fs::write(&list, cmd::concat_list_content(&[s(&seg1), s(&seg2n)])).unwrap();
    run_ffmpeg(
        fx,
        &cmd::concat_args(&s(&list), &s(&final_out)),
        "pipeline concat",
    );
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
    run_ffmpeg(
        fx,
        &cmd::cut_args(0.0, 4.0, &s(&fx.src_b), &s(&final_path)),
        "准备旧产物",
    );
    let old_dur = assert_duration(fx, &final_path, 4.0, 0.3);

    run_ffmpeg(
        fx,
        &cmd::cut_args(1.0, 2.0, &s(&fx.src_a), &s(&part)),
        "新产物写 .part",
    );
    video_cut_lib::fs::atomic_replace(&part, &final_path).expect("替换必须成功");

    let new_dur = assert_duration(fx, &final_path, 2.0, 0.3);
    assert!(
        (new_dur - old_dur).abs() > 1.0,
        "最终文件必须是新产物（{new_dur:.2}s）而不是旧文件（{old_dur:.2}s）"
    );
    assert_decodable(fx, &final_path);
    assert!(!part.exists(), "`.part` 不得残留");
}

/// ffprobe 读容器名（`format_name`），断言包含期望片段（matroska / mp4 …）。
fn assert_container(fx: &Fixtures, p: &Path, want: &str) {
    let out = Command::new(&fx.ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=format_name",
            "-of",
            "csv=p=0",
        ])
        .arg(p)
        .output()
        .expect("启动 ffprobe 失败");
    let got = String::from_utf8_lossy(&out.stdout).trim().to_string();
    assert!(
        got.contains(want),
        "{} 的容器应含 {want}，实际：{got}",
        p.display()
    );
}

/// 抽单帧为 raw RGB24 字节（`-ss t` 输入侧 seek + 只取 1 帧）。
///
/// 用途：`removal_keeps_copy_chain` 的**零残留**断言——copy 产物某一段的首帧，必须与源在
/// 对应时刻的帧**逐字节一致**（同一段码流解出来的像素是确定的，故可用字节相等判定"内容出处"）。
fn frame_bytes(fx: &Fixtures, p: &Path, t: f64) -> Vec<u8> {
    let out = Command::new(&fx.ffmpeg)
        .args(["-v", "error", "-ss", &format!("{t:.3}"), "-i"])
        .arg(p)
        .args(["-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
        .output()
        .expect("启动 ffmpeg 失败");
    assert!(
        out.status.success(),
        "抽帧失败（{} @ {t:.3}s）：{}",
        p.display(),
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(!out.stdout.is_empty(), "抽帧为空：{}", p.display());
    out.stdout
}

/// 链路 5（`M15` / `TC-047` 自动半的产物侧）：**保留式裁剪**下发的 item 形态——
/// **单源、多段、无变换、全程 copy** → concat 成一个文件。
///
/// 派生链本身（补集 / 碎片吸收 / 向上吸附 / 不动点迭代 / 三态门禁）由 `src/utils/removal.test.ts`
/// 覆盖；这里锁的是它**下发给后端的那一步**：成品时长 == Σ 保留段、全帧可解码、
/// **删除区间零残留**（每段首帧与源在对应时刻的帧逐字节一致——第 2 段必须从 2.0s 起，
/// 而不是残留了 1.0~2.0s 的垃圾；第 3 段必须从 4.0s 起，而不是 3.5s）。
#[test]
fn removal_keeps_copy_chain() {
    let Some(fx) = setup() else {
        eprintln!("skip: 未找到 sidecar ffmpeg/ffprobe（先运行 scripts/fetch-ffmpeg.ps1）");
        return;
    };
    // 场景：标记删除 [1.0, 2.0] 与 [3.5, 5.0]；60s 源的 g=30（1s 一格关键帧）⇒ 第二个标记的
    // 终点向上吸附到 4.0 ⇒ 实际删除 [3.5, 4.0] ⇒ 保留段 [0,1) [2,3.5) [4,6)，合计 4.5s。
    let keeps = [(0.0, 1.0), (2.0, 3.5), (4.0, 6.0)];
    let mut segs = Vec::new();
    for (i, (start, end)) in keeps.iter().enumerate() {
        let seg = fx.dir.join(format!("e2e_keep{}.mp4", i + 1));
        run_ffmpeg(
            fx,
            // 注意 `pipeline_copy_args` 的第二元是**时长**（生产侧 `pipeline.rs` 同样做
            // `end − start` 的换算），不是终点
            &cmd::pipeline_copy_args(
                Some((*start, *end - *start)),
                0,
                false,
                false,
                &s(&fx.src_a),
                &s(&seg),
            ),
            &format!("保留段 {} copy", i + 1),
        );
        assert_duration(fx, &seg, end - start, 0.3);
        assert_decodable(fx, &seg);
        segs.push(seg);
    }

    let final_out = fx.dir.join("e2e_trimmed.mp4");
    let list = fx.dir.join("e2e_trimmed_concat.txt");
    let paths: Vec<String> = segs.iter().map(|p| s(p)).collect();
    std::fs::write(&list, cmd::concat_list_content(&paths)).unwrap();
    run_ffmpeg(
        fx,
        &cmd::concat_args(&s(&list), &s(&final_out)),
        "保留段 concat",
    );

    let want: f64 = keeps.iter().map(|(a, b)| b - a).sum();
    assert_duration(fx, &final_out, want, 0.5);
    assert_decodable(fx, &final_out);

    // 零残留：每段首帧 == 源在对应时刻的帧（第 1 段从 0 起，故只查后两段）
    for (seg, t) in [(&segs[1], 2.0), (&segs[2], 4.0)] {
        let head = frame_bytes(fx, seg, 0.0);
        let at_src = frame_bytes(fx, &fx.src_a, t);
        assert_eq!(
            head.len(),
            at_src.len(),
            "{} 首帧与源 {t}s 帧尺寸不一致",
            seg.display()
        );
        assert!(
            head == at_src,
            "{} 的首帧必须来自源的 {t}s（删除区间零残留）",
            seg.display()
        );
    }
}

/// 输出容器/扩展名口径（`TC-029` / `ADR-033`）：**名字必须与封装一致**——
/// copy 类跟随源容器、重编码类固定 mp4，用户给错扩展名时以**封装**为准校正。
#[test]
fn output_container_follows_adr_033() {
    let Some(fx) = setup() else {
        eprintln!("skip: 未找到 sidecar ffmpeg/ffprobe");
        return;
    };
    // 先造一个 matroska 容器的源（copy 类的容器要跟随它，而不是被硬编码成 mp4）
    let src_mkv = fx.dir.join("e2e_src.mkv");
    run_ffmpeg(
        fx,
        &cmd::cut_args(0.0, 3.0, &s(&fx.src_a), &s(&src_mkv)),
        "造 mkv 源",
    );
    assert_container(fx, &src_mkv, "matroska");

    // ① copy 类（极速剪切）：容器 = 源容器 → 扩展名也跟随源
    let copy_ext = video_cut_lib::fs::source_container_ext(&s(&src_mkv));
    assert_eq!(copy_ext, "mkv");
    let copy_out =
        video_cut_lib::fs::with_container_ext(&fx.dir.join("e2e_copy_out.mkv"), &copy_ext);
    run_ffmpeg(
        fx,
        &cmd::cut_args(1.0, 1.0, &s(&src_mkv), &s(&copy_out)),
        "copy 剪切",
    );
    assert_container(fx, &copy_out, "matroska");
    assert_decodable(fx, &copy_out);

    // ② 重编码类（精确剪切）：容器固定 mp4；用户把名字写成 .mkv 也要被校正成 .mp4
    let trans_out = video_cut_lib::fs::with_container_ext(&fx.dir.join("e2e_trans_out.mkv"), "mp4");
    assert_eq!(
        trans_out.extension().and_then(|e| e.to_str()),
        Some("mp4"),
        "重编码类输出名必须被校正为 mp4"
    );
    run_ffmpeg(
        fx,
        &cmd::precise_cut_args(
            1.0,
            1.0,
            &s(&src_mkv),
            &s(&trans_out),
            "libx264",
            QualityPreset::Balanced,
        ),
        "精确剪切（重编码）",
    );
    assert_container(fx, &trans_out, "mp4");
    assert_decodable(fx, &trans_out);
}

/// 链路 5：**渲染即预览**的产物链（M12-2，`FR-1760`/`TC-048` 的自动半）。
///
/// 与 `pipeline_full_chain` 同一条「copy 片段 + 带裁剪/翻转的重编码片段 → normalize → concat」，
/// 但落点换成**预览缓存目录**里的 `<令牌>.mp4`：断言成品落在预览目录、容器固定 mp4、
/// 时长 = 片段和、全帧可解码。
///
/// 交付边界（避免"以为这里覆盖了其实没有"）：**输出路径决策与"只留当前一份"的目录清扫**
/// 由 `commands/pipeline.rs` 的单测 `sweep_preview_dir_keeps_only_current_token` 覆盖
/// （`commands` 模块私有，集成测试调不到）；**任务的 internal / 低优先级 / 同源取代**
/// 由 `task/manager.rs` 的 7 条单测覆盖。
#[test]
fn preview_pipeline_full_chain() {
    let Some(fx) = setup() else {
        eprintln!("skip: 未找到 sidecar ffmpeg/ffprobe");
        return;
    };
    let preview_dir = fx.dir.join("preview");
    std::fs::create_dir_all(&preview_dir).unwrap();
    // 命名对齐 `prepare_preview_output`：成品 `<令牌>.mp4`、中间件带同一令牌
    let token = "e2e0preview0001-0001";
    let final_out = preview_dir.join(format!("{token}.mp4"));
    let seg1 = preview_dir.join(format!(".pipe_{token}_000.mp4"));
    let seg2 = preview_dir.join(format!(".pipe_{token}_001.mp4"));
    let seg2n = preview_dir.join(format!(".pipe_{token}_001n.mp4"));
    let list = preview_dir.join(format!(".concat_{token}.txt"));

    // copy 片段
    run_ffmpeg(
        fx,
        &cmd::pipeline_copy_args(Some((0.0, 2.0)), 0, false, false, &s(&fx.src_a), &s(&seg1)),
        "preview copy 片段",
    );
    let d1 = assert_duration(fx, &seg1, 2.0, 0.3);

    // 重编码片段：裁剪放大（160×120 → 320×240）+ 水平翻转 + timescale 对齐源
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
            false,
        ),
        "preview 重编码片段",
    );
    assert_decodable(fx, &seg2);

    // 定向统一
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
            false,
        ),
        "preview normalize",
    );
    let d2 = assert_duration(fx, &seg2n, 2.0, 0.3);

    std::fs::write(&list, cmd::concat_list_content(&[s(&seg1), s(&seg2n)])).unwrap();
    run_ffmpeg(
        fx,
        &cmd::concat_args(&s(&list), &s(&final_out)),
        "preview concat",
    );
    assert!(
        final_out.starts_with(&preview_dir),
        "预览产物必须落在预览缓存目录内"
    );
    assert_duration(fx, &final_out, d1 + d2, 0.5);
    assert_container(fx, &final_out, "mp4");
    assert_decodable(fx, &final_out);
}

/// M18-9（FR-392，`ADR-039`/`ADR-041`）：字幕转写链路冒烟——
/// ① `extract_audio_args` 真跑提取 16kHz mono wav（时长 ≈ 源）；
/// ② `whisper_cli_args`（VAD 强制 + 内置 tiny）真跑转写，产出 .srt。
/// sine 音源无人声：VAD 路径产出**空 srt 也算通过**——本用例验证的是
/// 参数构建器 × sidecar × 模型 resource 的整链可用性，不是识别质量。
/// whisper-cli 或内置模型缺失（未跑 fetch-whisper）时 skip。
#[test]
fn subtitle_extract_and_transcribe_chain() {
    let Some(fx) = setup() else {
        eprintln!("skip: ffmpeg sidecar 缺失（先运行 scripts/fetch-ffmpeg.ps1）");
        return;
    };
    let Ok(whisper) = cmd::resolve_sidecar("whisper-cli") else {
        eprintln!("skip: whisper-cli sidecar 缺失（先运行 scripts/fetch-whisper.ps1）");
        return;
    };
    // 内置模型定位：e2e 二进制在 target/debug/deps → 上溯一级 = target/debug（resolve_sidecar 同法）
    let mut exe_dir = std::env::current_exe()
        .expect("无法定位测试二进制")
        .parent()
        .unwrap()
        .to_path_buf();
    if exe_dir.ends_with("deps") {
        exe_dir = exe_dir.parent().unwrap().to_path_buf();
    }
    let models = exe_dir.join("resources").join("models");
    let model = models.join("ggml-tiny-q5_1.bin");
    let vad = models.join("ggml-silero-v5.1.2.bin");
    if !model.exists() || !vad.exists() {
        eprintln!("skip: 内置模型缺失（先运行 scripts/fetch-whisper.ps1）");
        return;
    }

    // ① 音频提取：16kHz mono pcm_s16le（红线 1 构建器 × 真实 sidecar）
    let wav = fx.dir.join("subtitle.wav");
    run_ffmpeg(
        fx,
        &cmd::extract_audio_args(&s(&fx.src_a), &s(&wav)),
        "音频提取",
    );
    assert!(wav.exists(), "wav 必须产出");
    let dur = assert_duration(fx, &wav, 6.0, 0.5);

    // ② 转写：sine 无人声，VAD 路径空 srt 也通过（见用例头注释）
    let srt_base = fx.dir.join("subtitle");
    let out = Command::new(&whisper)
        .args(whisper_cli_args(
            &s(&model),
            Some(&s(&vad)),
            &s(&wav),
            &s(&srt_base),
            "auto",
            4,
        ))
        .output()
        .expect("启动 whisper-cli 失败");
    assert!(
        out.status.success(),
        "转写失败：{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let srt = fx.dir.join("subtitle.srt");
    assert!(srt.exists(), "必须产出 .srt：{}", srt.display());
    eprintln!(
        "字幕链路 e2e：{dur:.2}s 音频转写完成，srt {} 字节",
        srt.metadata().unwrap().len()
    );
}
