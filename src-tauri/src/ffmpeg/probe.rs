//! ffprobe 封装：媒体信息 JSON 解析与关键帧扫描（DESIGN §6.5）。

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::{AudioStreamInfo, MediaInfo, VideoStreamInfo};

// ---------- 探测结果缓存（B1/M8，DESIGN §6.5、决策 #22） ----------

/// 缓存键 = (路径, size, mtime_ns)：文件被替换或改动后键变化，天然失效。
type ProbeKey = (String, u64, u128);

macro_rules! probe_cache {
    ($name:ident, $val:ty) => {
        fn $name() -> &'static Mutex<HashMap<ProbeKey, LruEntry<$val>>> {
            static CACHE: OnceLock<Mutex<HashMap<ProbeKey, LruEntry<$val>>>> = OnceLock::new();
            CACHE.get_or_init(|| Mutex::new(HashMap::new()))
        }
    };
}

probe_cache!(media_cache, MediaInfo);
probe_cache!(facts_cache, MergeFileFacts);
probe_cache!(keyframe_cache, Vec<f64>);
probe_cache!(duration_cache, f64);

/// 缓存值 + 最近使用戳（R3-1 LRU）：get/put 都刷新，淘汰取最小戳。
struct LruEntry<T> {
    value: T,
    stamp: u64,
}

/// 全局单调递增的使用序号（LRU 的时间源）。
fn next_stamp() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static STAMP: AtomicU64 = AtomicU64::new(1);
    STAMP.fetch_add(1, Ordering::Relaxed)
}

/// 条目数上限：pipeline 中间文件路径每次任务都不同，达限后 LRU 逐条淘汰防缓慢膨胀。
const PROBE_CACHE_CAP: usize = 512;

/// 读取缓存键；元数据读不到（文件被删/被占锁）返回 None，调用方直接走原路探测。
fn probe_key(path: &str) -> Option<ProbeKey> {
    let md = std::fs::metadata(path).ok()?;
    let mtime = md
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_nanos();
    Some((path.to_string(), md.len(), mtime))
}

fn cache_get<T: Clone>(
    cache: fn() -> &'static Mutex<HashMap<ProbeKey, LruEntry<T>>>,
    key: &Option<ProbeKey>,
) -> Option<T> {
    let key = key.as_ref()?;
    let mut m = cache().lock().ok()?;
    let entry = m.get_mut(key)?;
    entry.stamp = next_stamp();
    Some(entry.value.clone())
}

/// 仅缓存成功结果——探测失败可能是暂态（文件被占用等），不应固化。
fn cache_put<T: Clone>(
    cache: fn() -> &'static Mutex<HashMap<ProbeKey, LruEntry<T>>>,
    key: &Option<ProbeKey>,
    value: &T,
) {
    let Some(key) = key else { return };
    if let Ok(mut m) = cache().lock() {
        if m.len() >= PROBE_CACHE_CAP && !m.contains_key(key) {
            // R3-1：LRU 逐条淘汰——只逐出最久未用的一条，不清空整表
            //（否则 M12-2 预览高频探测会周期性清光关键帧缓存，FFMPEG.md §6.5）
            let oldest = m
                .iter()
                .min_by_key(|(_, e)| e.stamp)
                .map(|(k, _)| k.clone());
            if let Some(oldest) = oldest {
                m.remove(&oldest);
            }
        }
        m.insert(
            key.clone(),
            LruEntry {
                value: value.clone(),
                stamp: next_stamp(),
            },
        );
    }
}

async fn run_ffprobe(app: &AppHandle, args: &[&str], input: &str) -> Result<String, String> {
    let cmd = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| format!("未找到 ffprobe：{e}"))?;
    let out = cmd
        .args(args)
        .arg(input)
        .output()
        .await
        .map_err(|e| format!("无法启动 ffprobe：{e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("ffprobe 失败：{}", err.trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// 合并检测所需的完整事实（DESIGN §3.3 九项比对）。
/// `info` 以 flatten 方式序列化，前端可直接作为 MediaInfo 使用。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeFileFacts {
    #[serde(flatten)]
    pub info: MediaInfo,
    pub video_time_base: String,
}

/// 解析媒体信息（DESIGN §6.5：`-print_format json -show_format -show_streams`）。
pub async fn probe_media(app: &AppHandle, input: &str) -> Result<MediaInfo, String> {
    let key = probe_key(input);
    if let Some(v) = cache_get(media_cache, &key) {
        return Ok(v);
    }
    let out = run_ffprobe(
        app,
        &[
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            "-show_chapters",
        ],
        input,
    )
    .await?;
    let v: Value =
        serde_json::from_str(&out).map_err(|e| format!("ffprobe 输出解析失败：{e}"))?;
    let info = parse_media_json(&v)?;
    cache_put(media_cache, &key, &info);
    Ok(info)
}

/// 解析合并检测事实（异步命令入口用）。
pub async fn probe_merge_facts(app: &AppHandle, input: &str) -> Result<MergeFileFacts, String> {
    let key = probe_key(input);
    if let Some(v) = cache_get(facts_cache, &key) {
        return Ok(v);
    }
    let out = run_ffprobe(
        app,
        &["-print_format", "json", "-show_format", "-show_streams"],
        input,
    )
    .await?;
    let v: Value =
        serde_json::from_str(&out).map_err(|e| format!("ffprobe 输出解析失败：{e}"))?;
    let facts = parse_merge_facts(&v)?;
    cache_put(facts_cache, &key, &facts);
    Ok(facts)
}

/// 同步版本：任务作业线程内做最终校验用。
pub fn probe_merge_facts_sync(ffprobe: &Path, input: &str) -> Result<MergeFileFacts, String> {
    let key = probe_key(input);
    if let Some(v) = cache_get(facts_cache, &key) {
        return Ok(v);
    }
    let mut cmd = Command::new(ffprobe);
    super::command::spawn_hidden(&mut cmd);
    let out = cmd
        .args(["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input])
        .output()
        .map_err(|e| format!("无法启动 ffprobe：{e}"))?;
    if !out.status.success() {
        return Err(format!(
            "ffprobe 失败：{}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let v: Value = serde_json::from_str(&String::from_utf8_lossy(&out.stdout))
        .map_err(|e| format!("ffprobe 输出解析失败：{e}"))?;
    let facts = parse_merge_facts(&v)?;
    cache_put(facts_cache, &key, &facts);
    Ok(facts)
}

/// 扫描关键帧时间点（秒，升序）。只解码关键帧，长视频仍需数秒（DESIGN §6.5）。
pub async fn list_keyframes(app: &AppHandle, input: &str) -> Result<Vec<f64>, String> {
    let key = probe_key(input);
    if let Some(v) = cache_get(keyframe_cache, &key) {
        return Ok(v);
    }
    let out = run_ffprobe(
        app,
        &[
            "-select_streams",
            "v:0",
            "-skip_frame",
            "nokey",
            "-show_entries",
            "frame=pts_time",
            "-of",
            "csv=p=0",
        ],
        input,
    )
    .await?;
    let frames = parse_keyframes(&out);
    cache_put(keyframe_cache, &key, &frames);
    Ok(frames)
}

/// 同步读取容器总时长（秒）。任务作业线程内使用（磁盘预检 / 代理进度）。
pub fn probe_duration_sync(ffprobe: &Path, input: &str) -> Result<f64, String> {
    let key = probe_key(input);
    if let Some(v) = cache_get(duration_cache, &key) {
        return Ok(v);
    }
    let mut cmd = Command::new(ffprobe);
    super::command::spawn_hidden(&mut cmd);
    let out = cmd
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            input,
        ])
        .output()
        .map_err(|e| format!("无法启动 ffprobe：{e}"))?;
    if !out.status.success() {
        return Err(format!(
            "ffprobe 失败：{}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let duration = String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse::<f64>()
        .map_err(|e| format!("时长解析失败：{e}"))?;
    cache_put(duration_cache, &key, &duration);
    Ok(duration)
}

// ---------- 纯解析函数（可单测） ----------

fn as_f64(v: &Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

/// "60/1" / "30000/1001" → 60.0 / 29.97
fn parse_fraction(v: &Value) -> Option<f64> {
    let s = v.as_str()?;
    let (num, den) = s.split_once('/')?;
    let n: f64 = num.parse().ok()?;
    let d: f64 = den.parse().ok()?;
    (d != 0.0).then(|| n / d)
}

pub fn parse_media_json(v: &Value) -> Result<MediaInfo, String> {
    let streams = v
        .get("streams")
        .and_then(Value::as_array)
        .ok_or_else(|| "ffprobe 输出缺少 streams".to_string())?;
    let video_json = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(Value::as_str) == Some("video"))
        .ok_or_else(|| "文件中没有视频流".to_string())?;
    let video = parse_video_stream(video_json)?;

    let mut audio = Vec::new();
    let mut subtitle_count = 0u32;
    for s in streams {
        match s.get("codec_type").and_then(Value::as_str) {
            Some("audio") => audio.push(parse_audio_stream(s)?),
            Some("subtitle") => subtitle_count += 1,
            _ => {}
        }
    }

    let format = v.get("format").ok_or_else(|| "ffprobe 输出缺少 format".to_string())?;
    let duration_sec =
        format.get("duration").and_then(as_f64).ok_or_else(|| "无法解析时长".to_string())?;
    let size_bytes =
        format.get("size").and_then(as_f64).ok_or_else(|| "无法解析文件大小".to_string())? as u64;

    Ok(MediaInfo {
        container: format
            .get("format_name")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        duration_sec,
        size_bytes,
        bitrate: format.get("bit_rate").and_then(as_f64).map(|b| b as u64),
        video,
        audio,
        subtitle_count,
        rotation: parse_rotation(video_json),
    })
}

pub fn parse_merge_facts(v: &Value) -> Result<MergeFileFacts, String> {
    let info = parse_media_json(v)?;
    let video_time_base = v
        .get("streams")
        .and_then(Value::as_array)
        .and_then(|ss| {
            ss.iter()
                .find(|s| s.get("codec_type").and_then(Value::as_str) == Some("video"))
        })
        .and_then(|s| s.get("time_base"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    Ok(MergeFileFacts {
        info,
        video_time_base,
    })
}

fn parse_video_stream(s: &Value) -> Result<VideoStreamInfo, String> {
    let num = |key: &str| s.get(key).and_then(as_f64);
    Ok(VideoStreamInfo {
        codec: s
            .get("codec_name")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        profile: s
            .get("profile")
            .and_then(Value::as_str)
            .map(str::to_string),
        width: num("width").ok_or_else(|| "缺少宽度".to_string())? as u32,
        height: num("height").ok_or_else(|| "缺少高度".to_string())? as u32,
        pix_fmt: s
            .get("pix_fmt")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        frame_rate: s
            .get("avg_frame_rate")
            .and_then(parse_fraction)
            .or_else(|| s.get("r_frame_rate").and_then(parse_fraction))
            .unwrap_or(0.0),
        bitrate: num("bit_rate").map(|b| b as u64),
        bit_depth: num("bits_per_raw_sample").map(|b| b as u32),
    })
}

fn parse_audio_stream(s: &Value) -> Result<AudioStreamInfo, String> {
    Ok(AudioStreamInfo {
        codec: s
            .get("codec_name")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        sample_rate: s
            .get("sample_rate")
            .and_then(as_f64)
            .ok_or_else(|| "缺少采样率".to_string())? as u32,
        channels: s
            .get("channels")
            .and_then(as_f64)
            .unwrap_or(0.0) as u32,
        bitrate: s.get("bit_rate").and_then(as_f64).map(|b| b as u64),
    })
}

/// 旋转元数据：优先 side_data_list 的 Display Matrix，其次 tags.rotate。
fn parse_rotation(video: &Value) -> Option<i32> {
    if let Some(list) = video.get("side_data_list").and_then(Value::as_array) {
        for sd in list {
            if let Some(r) = sd.get("rotation").and_then(as_f64) {
                return Some(r.round() as i32);
            }
        }
    }
    video
        .get("tags")
        .and_then(|t| t.get("rotate"))
        .and_then(as_f64)
        .map(|r| r.round() as i32)
}

/// 解析 `-skip_frame nokey` 的 CSV 输出（每行一个关键帧时间点，秒）。
///
/// **只取行内首个逗号前的字段**：ffprobe 对**部分**帧会多输出一个空字段（实测
/// `0.000000,` / `5.753333,`，同一文件里只出现个别行），若按整行 `parse::<f64>()`
/// 解析，这些行会被静默丢弃——关键帧列表缺项会让 UI 少刻度、少可吸附点（BUG-008）。
/// 非数值行（如 `N/A`）仍然跳过。
pub fn parse_keyframes(csv: &str) -> Vec<f64> {
    csv.lines()
        .filter_map(|l| {
            l.split(',').next().unwrap_or("").trim().parse::<f64>().ok().filter(|t| t.is_finite())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 取自真实 ffprobe 9.0.1 输出（video/极乐净土 1080p ultra.mp4，有删节）。
    #[test]
    fn parses_real_world_probe_json() {
        let v = json!({
            "streams": [
                {
                    "index": 0, "codec_name": "h264", "profile": "High",
                    "codec_type": "video", "width": 1920, "height": 1080,
                    "pix_fmt": "yuv420p", "r_frame_rate": "60/1", "avg_frame_rate": "60/1",
                    "bit_rate": "32247854", "bits_per_raw_sample": "8"
                },
                {
                    "index": 1, "codec_name": "aac", "codec_type": "audio",
                    "sample_rate": "44100", "channels": 2, "bit_rate": "192000"
                }
            ],
            "format": {
                "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
                "duration": "264.554667",
                "size": "1074504363",
                "bit_rate": "32492471"
            }
        });
        let info = parse_media_json(&v).unwrap();
        // container 必须原样保留 ffprobe 的 `format_name`（**逗号分隔的解复用器列表**）：
        // 前端 `needsProxy` 按它做容器判定（DESIGN §10 · `BUG-006`），
        // 若哪天改成展示名（如 "QuickTime/MP4"）会静默破坏该判定。
        assert_eq!(info.container, "mov,mp4,m4a,3gp,3g2,mj2");
        assert_eq!(info.video.codec, "h264");
        assert_eq!((info.video.width, info.video.height), (1920, 1080));
        assert_eq!(info.video.frame_rate, 60.0);
        assert_eq!(info.video.pix_fmt, "yuv420p");
        assert_eq!(info.audio.len(), 1);
        assert_eq!(info.audio[0].codec, "aac");
        assert_eq!(info.audio[0].sample_rate, 44100);
        assert_eq!(info.subtitle_count, 0);
        assert!((info.duration_sec - 264.554667).abs() < 1e-6);
        assert_eq!(info.size_bytes, 1_074_504_363);
        assert_eq!(info.rotation, None);
    }

    /// `BUG-006`：容器维度靠 `container` 原样透传，非 ISO-BMFF / Matroska 的容器
    /// （avi/flv/mpegts/asf）不得被"友好化"或截断——否则前端会误判为可播、不生成代理。
    #[test]
    fn keeps_non_native_container_verbatim() {
        for name in ["avi", "flv", "mpegts", "asf", "matroska,webm"] {
            let v = json!({
                "streams": [
                    { "codec_name": "h264", "codec_type": "video", "width": 640, "height": 480,
                      "pix_fmt": "yuv420p", "avg_frame_rate": "25/1" }
                ],
                "format": { "format_name": name, "duration": "10.0", "size": "1000" }
            });
            assert_eq!(parse_media_json(&v).unwrap().container, name);
        }
    }

    #[test]
    fn parses_rotation_from_side_data() {
        let v = json!({
            "streams": [
                { "codec_name": "h264", "codec_type": "video", "width": 1920, "height": 1080,
                  "pix_fmt": "yuv420p", "avg_frame_rate": "30/1",
                  "side_data_list": [ { "side_data_type": "Display Matrix", "rotation": -90 } ] }
            ],
            "format": { "format_name": "mp4", "duration": "10.0", "size": "1000" }
        });
        let info = parse_media_json(&v).unwrap();
        assert_eq!(info.rotation, Some(-90));
    }

    #[test]
    fn rejects_streams_without_video() {
        let v = json!({ "streams": [], "format": { "duration": "1", "size": "1" } });
        assert!(parse_media_json(&v).is_err());
    }

    #[test]
    fn keyframe_csv_skips_na_lines() {
        let csv = "0.000000\nN/A\n1.504000\n3.003000\n";
        assert_eq!(parse_keyframes(csv), vec![0.0, 1.504, 3.003]);
    }

    /// BUG-008 回归：ffprobe 会给**个别**关键帧行多输出一个空 CSV 字段（尾逗号），
    /// 按整行解析会丢掉这些关键帧——实测 `极乐净土` 因此丢了 `0.0`（列表首项变成
    /// 5.883）、`123.mp4` 丢了 5.753333。样本取自真实 ffprobe 9.0.1 输出。
    #[test]
    fn keyframe_csv_keeps_rows_with_extra_fields() {
        let csv = "0.000000,\n5.883333\n11.283333,\n16.750000\n18.450000,\n";
        let got = parse_keyframes(csv);
        assert_eq!(got, vec![0.0, 5.883333, 11.283333, 16.75, 18.45]);
        assert_eq!(got.first().copied(), Some(0.0), "首个关键帧不得丢失");
    }

    /// 行数与 ffprobe 原始输出一致（丢行即失败）——真机用例 TC-030 / TC-026 的单测侧口径。
    #[test]
    fn keyframe_csv_row_count_matches_input() {
        let csv = "0.052667\n1.319333\n9.786000,\n14.052667\n15.619333,\n";
        let rows = csv.lines().count();
        assert_eq!(parse_keyframes(csv).len(), rows);
    }

    // ---------- 缓存（B1/M8） ----------

    probe_cache!(scratch_cache, f64);
    // cap 测试专用：逐条淘汰也可能逐到别的测试刚写入的条目，不能与 scratch 混用
    probe_cache!(cap_cache, f64);

    fn temp_file(tag: &str, size: usize) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("video-cut-cache-test-{}-{tag}.bin", std::process::id()));
        std::fs::write(&p, vec![0u8; size]).unwrap();
        p
    }

    #[test]
    fn probe_key_changes_when_file_changes() {
        let p = temp_file("key", 16);
        let a = probe_key(p.to_str().unwrap());
        std::fs::write(&p, vec![0u8; 32]).unwrap();
        let b = probe_key(p.to_str().unwrap());
        assert_ne!(a, b, "size 变化应换键（mtime+size 双保险）");
        assert!(probe_key("no/such/video-cut-cache-test-file.bin").is_none());
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn cache_roundtrip_hits_same_file() {
        let p = temp_file("roundtrip", 8);
        let key = probe_key(p.to_str().unwrap());
        assert!(cache_get(scratch_cache, &key).is_none());
        cache_put(scratch_cache, &key, &1.25);
        // 同路径同内容 → 键相同 → 命中
        assert_eq!(cache_get(scratch_cache, &probe_key(p.to_str().unwrap())), Some(1.25));
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn cache_evicts_lru_at_cap() {
        let p = temp_file("cap", 8);
        let key = probe_key(p.to_str().unwrap()).unwrap();
        for i in 0..PROBE_CACHE_CAP {
            cache_put(cap_cache, &Some((format!("cap-{i}"), i as u64, i as u128)), &0.0);
        }
        assert_eq!(cap_cache().lock().unwrap().len(), PROBE_CACHE_CAP);
        // 触碰最旧的一条（cap-0）→ 它变成最近使用，不该被淘汰
        cache_get(cap_cache, &Some(("cap-0".to_string(), 0, 0)));
        cache_put(cap_cache, &Some(key.clone()), &2.5);
        let m = cap_cache().lock().unwrap();
        assert_eq!(m.len(), PROBE_CACHE_CAP, "达限后只逐出一条，不清空整表");
        assert_eq!(
            m.get(&key).map(|e| e.value.clone()),
            Some(2.5),
            "新写入的第 513 条应挤掉最久未用者后正常入表"
        );
        assert!(
            m.contains_key(&("cap-0".to_string(), 0, 0)),
            "刚被触碰的条目不得被逐出（LRU 而非 FIFO/清空）"
        );
        assert!(
            !m.contains_key(&("cap-1".to_string(), 1, 1)),
            "被逐出的应是最久未用的 cap-1（cap-0 已被触碰刷新）"
        );
        drop(m);
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn cache_put_existing_key_at_cap_overrides_without_evicting() {
        // cap 测试专用（与 cache_evicts_lru_at_cap 隔离：并行测试共用会互相逐出条目）
        probe_cache!(cap_ov_cache, f64);
        let key = ("cap-ov".to_string(), 7u64, 7u128);
        for i in 0..PROBE_CACHE_CAP {
            cache_put(cap_ov_cache, &Some((format!("cap-f{i}"), i as u64, i as u128)), &0.0);
        }
        cache_put(cap_ov_cache, &Some(key.clone()), &1.0);
        // 达限后插入新键：先逐出最久未用的 cap-f0 再入表，表长不变
        let (len_insert, ov_first, f0_gone) = {
            let m = cap_ov_cache().lock().unwrap();
            (
                m.len(),
                m.get(&key).map(|e| e.value.clone()),
                !m.contains_key(&("cap-f0".to_string(), 0u64, 0u128)),
            )
        };
        assert_eq!(len_insert, PROBE_CACHE_CAP, "达限插入 = 逐出一条再入表");
        assert_eq!(ov_first, Some(1.0));
        assert!(f0_gone, "被逐出的应是最久未用的 cap-f0");

        // 达限后覆盖已有键：只替换值并刷新使用序，不得再逐出任何条目
        cache_put(cap_ov_cache, &Some(key.clone()), &3.5);
        let (len_overwrite, ov_second, f1_survives) = {
            let m = cap_ov_cache().lock().unwrap();
            (
                m.len(),
                m.get(&key).map(|e| e.value.clone()),
                m.contains_key(&("cap-f1".to_string(), 1u64, 1u128)),
            )
        };
        assert_eq!(len_overwrite, PROBE_CACHE_CAP, "覆盖不改变条目数");
        assert_eq!(ov_second, Some(3.5));
        assert!(f1_survives, "覆盖不得再逐出条目");
        let _ = std::fs::remove_file(temp_file("cap", 8));
    }
}
