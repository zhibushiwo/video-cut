//! 合并：参数一致性检测与 concat 拼接（DESIGN §3.3、§6.3③④、§9.5）。

use std::cell::Cell;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::ffmpeg::probe::{self, MergeFileFacts};
use crate::ffmpeg::command;
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::task::worker;
use crate::AppTasks;

use super::fnv1a;

/// 全部文件的九项比对结果（DESIGN §3.3）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeComparison {
    pub files: Vec<MergeFileFacts>,
    pub compatible: bool,
    pub differences: Vec<String>,
}

/// 九项比对：视频编码+profile、分辨率、像素格式、帧率、time_base、
/// 音轨数量与各音轨（编码/采样率/声道）、字幕流数量。纯函数，可单测。
pub fn compare_merge_facts(files: &[MergeFileFacts]) -> MergeComparison {
    let first = &files[0].info;
    let mut differences = Vec::new();
    for (idx, f) in files.iter().enumerate().skip(1) {
        let cur = &f.info;
        let who = format!("第 {} 个文件", idx + 1);
        if cur.video.codec != first.video.codec {
            differences.push(format!(
                "{who}视频编码不一致：{} ≠ {}",
                cur.video.codec, first.video.codec
            ));
        }
        if cur.video.profile != first.video.profile {
            differences.push(format!(
                "{who}编码 profile 不一致：{:?} ≠ {:?}",
                cur.video.profile, first.video.profile
            ));
        }
        if (cur.video.width, cur.video.height) != (first.video.width, first.video.height) {
            differences.push(format!(
                "{who}分辨率不一致：{}×{} ≠ {}×{}",
                cur.video.width, cur.video.height, first.video.width, first.video.height
            ));
        }
        if cur.video.pix_fmt != first.video.pix_fmt {
            differences.push(format!(
                "{who}像素格式不一致：{} ≠ {}",
                cur.video.pix_fmt, first.video.pix_fmt
            ));
        }
        if (cur.video.frame_rate - first.video.frame_rate).abs() > 0.01 {
            differences.push(format!(
                "{who}帧率不一致：{:.3} ≠ {:.3}",
                cur.video.frame_rate, first.video.frame_rate
            ));
        }
        if f.video_time_base != files[0].video_time_base {
            differences.push(format!(
                "{who}时间基不一致：{} ≠ {}",
                f.video_time_base, files[0].video_time_base
            ));
        }
        if cur.audio.len() != first.audio.len() {
            differences.push(format!(
                "{who}音轨数量不一致：{} ≠ {}",
                cur.audio.len(),
                first.audio.len()
            ));
        } else {
            for (j, (a, b)) in cur.audio.iter().zip(first.audio.iter()).enumerate() {
                if a.codec != b.codec {
                    differences.push(format!(
                        "{who}第 {} 条音轨编码不一致：{} ≠ {}",
                        j + 1,
                        a.codec,
                        b.codec
                    ));
                }
                if a.sample_rate != b.sample_rate {
                    differences.push(format!(
                        "{who}第 {} 条音轨采样率不一致：{} ≠ {}",
                        j + 1,
                        a.sample_rate,
                        b.sample_rate
                    ));
                }
                if a.channels != b.channels {
                    differences.push(format!(
                        "{who}第 {} 条音轨声道不一致：{} ≠ {}",
                        j + 1,
                        a.channels,
                        b.channels
                    ));
                }
            }
        }
        if cur.subtitle_count != first.subtitle_count {
            differences.push(format!(
                "{who}字幕流数量不一致：{} ≠ {}",
                cur.subtitle_count, first.subtitle_count
            ));
        }
    }
    MergeComparison {
        files: files.to_vec(),
        compatible: differences.is_empty(),
        differences,
    }
}

/// 合并前参数检测（DESIGN §9.5 检测面板数据源）。
#[tauri::command]
pub async fn check_merge(app: AppHandle, inputs: Vec<String>) -> Result<MergeComparison, String> {
    if inputs.len() < 2 {
        return Err("请至少添加两个视频".into());
    }
    let mut files = Vec::with_capacity(inputs.len());
    for input in &inputs {
        files.push(
            probe::probe_merge_facts(&app, input)
                .await
                .map_err(|e| format!("{}：{e}", file_name(input)))?,
        );
    }
    Ok(compare_merge_facts(&files))
}

/// 提交合并任务：兼容走 concat copy，否则要求 force_transcode 逐个统一后二次拼接。
pub fn submit_merge(
    app: AppHandle,
    state: &State<'_, AppTasks>,
    inputs: Vec<String>,
    output: String,
    force_transcode: bool,
) -> Result<String, String> {
    if inputs.len() < 2 {
        return Err("请至少添加两个视频".into());
    }
    for i in &inputs {
        if !Path::new(i).is_file() {
            return Err(format!("输入文件不存在：{i}"));
        }
        if Path::new(i) == Path::new(&output) {
            return Err("输出文件不能与输入文件相同".into());
        }
    }
    let out = PathBuf::from(&output);
    let out_dir = out
        .parent()
        .ok_or_else(|| "输出路径无效".to_string())?
        .to_path_buf();
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("无法创建输出目录：{e}"))?;
    let ffmpeg = command::resolve_sidecar("ffmpeg")?;
    let ffprobe = command::resolve_sidecar("ffprobe")?;

    let out_name = out
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "输出文件名无效".to_string())?
        .to_string();
    // 半成品保留真实扩展名（DESIGN §8.2）
    let part = out_dir.join(format!("{out_name}.part.mp4"));
    let list_path = out_dir.join(format!(".concat_{:016x}.txt", fnv1a(output.as_bytes())));

    let label = format!("合并 {} 个文件 → {out_name}", inputs.len());
    let total_steps_base = inputs.len();

    let job_inputs = inputs.clone();
    let job_output = output.clone();
    let job: Job = Box::new(move |ctx: &TaskContext| {
        // 任务内最终校验（防前端判定与实际文件不符）
        let mut facts = Vec::with_capacity(job_inputs.len());
        for input in &job_inputs {
            if ctx.is_cancelled() {
                return Err("已取消".into());
            }
            facts.push(
                probe::probe_merge_facts_sync(&ffprobe, input)
                    .map_err(|e| format!("{}：{e}", file_name(input)))?,
            );
        }
        let comparison = compare_merge_facts(&facts);
        if !comparison.compatible && !force_transcode {
            return Err(format!(
                "文件参数不一致，无法无损合并：{}",
                comparison.differences.join("；")
            ));
        }

        let mut temps: Vec<PathBuf> = vec![list_path.clone()];
        let cleanup = |temps: &[PathBuf]| {
            for t in temps {
                let _ = std::fs::remove_file(t);
            }
        };

        // 需要时逐个统一到第 1 个文件的参数（DESIGN §6.3④），再二次 concat
        let sources: Vec<String>;
        let steps_total: f64;
        let copy_offset: f64;
        if comparison.compatible && !force_transcode {
            sources = job_inputs.clone();
            steps_total = 1.0;
            copy_offset = 0.0;
        } else {
            let base = &facts[0].info;
            let n = job_inputs.len();
            let mut normalized = Vec::with_capacity(n);
            for (i, input) in job_inputs.iter().enumerate() {
                if ctx.is_cancelled() {
                    cleanup(&temps);
                    return Err("已取消".into());
                }
                let inter = out_dir.join(format!(
                    ".merge_{:016x}_{:03}.mp4",
                    fnv1a(job_output.as_bytes()),
                    i
                ));
                temps.push(inter.clone());
                let _ = std::fs::remove_file(&inter);
                let dur = facts[i].info.duration_sec;
                let last = Cell::new(Instant::now() - Duration::from_millis(250));
                let r = worker::run_ffmpeg(
                    ctx,
                    &ffmpeg,
                    &command::normalize_args(
                        input,
                        base.video.width,
                        base.video.height,
                        base.video.frame_rate,
                        &base.video.pix_fmt,
                        &inter.to_string_lossy(),
                    ),
                    dur,
                    &|local, _| {
                        let now = Instant::now();
                        if now.duration_since(last.get()) >= Duration::from_millis(200)
                            || local >= 1.0
                        {
                            last.set(now);
                            ctx.set_progress((i as f64 + local) / (total_steps_base + 1) as f64);
                        }
                    },
                );
                if let Err(e) = r {
                    cleanup(&temps);
                    return Err(e);
                }
                normalized.push(inter.to_string_lossy().into_owned());
            }
            sources = normalized;
            steps_total = total_steps_base as f64 + 1.0;
            copy_offset = total_steps_base as f64;
        }

        if let Err(e) = std::fs::write(&list_path, command::concat_list_content(&sources)) {
            cleanup(&temps);
            return Err(format!("写入 concat 列表失败：{e}"));
        }

        let total_sec: f64 = facts.iter().map(|f| f.info.duration_sec).sum();
        let last = Cell::new(Instant::now() - Duration::from_millis(250));
        let r = worker::run_ffmpeg(
            ctx,
            &ffmpeg,
            &command::concat_args(&list_path.to_string_lossy(), &part.to_string_lossy()),
            total_sec,
            &|local, _| {
                let now = Instant::now();
                if now.duration_since(last.get()) >= Duration::from_millis(200) || local >= 1.0 {
                    last.set(now);
                    ctx.set_progress((copy_offset + local) / steps_total);
                }
            },
        );
        if let Err(e) = r {
            cleanup(&temps);
            return Err(e);
        }

        let _ = std::fs::remove_file(&out);
        if let Err(e) = std::fs::rename(&part, &out) {
            cleanup(&temps);
            return Err(format!("重命名输出失败：{e}"));
        }
        ctx.add_output(job_output);
        cleanup(&temps);
        Ok(())
    });

    Ok(state.0.submit(Arc::new(TauriEmitter(app)), "merge", &label, job))
}

fn file_name(p: &str) -> &str {
    Path::new(p).file_name().and_then(|n| n.to_str()).unwrap_or(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn facts(video: Value, audio: Value, time_base: &str) -> MergeFileFacts {
        let mut v = json!({
            "streams": [video, audio],
            "format": { "format_name": "mp4", "duration": "10.0", "size": "1000" }
        });
        v["streams"][0]["time_base"] = json!(time_base);
        probe::parse_merge_facts(&v).unwrap()
    }

    fn sample_video() -> Value {
        json!({
            "codec_name": "h264", "codec_type": "video", "profile": "High",
            "width": 1920, "height": 1080, "pix_fmt": "yuv420p",
            "avg_frame_rate": "30000/1001"
        })
    }

    fn sample_audio() -> Value {
        json!({ "codec_name": "aac", "codec_type": "audio", "sample_rate": "44100", "channels": 2 })
    }

    #[test]
    fn identical_files_are_compatible() {
        let a = facts(sample_video(), sample_audio(), "1/15360");
        let b = facts(sample_video(), sample_audio(), "1/15360");
        let cmp = compare_merge_facts(&[a, b]);
        assert!(cmp.compatible, "不应有差异：{:?}", cmp.differences);
    }

    #[test]
    fn frame_rate_within_tolerance_is_compatible() {
        let a = facts(sample_video(), sample_audio(), "1/15360");
        let mut v = sample_video();
        v["avg_frame_rate"] = json!("2997/100");
        let b = facts(v, sample_audio(), "1/15360");
        assert!(compare_merge_facts(&[a, b]).compatible);
    }

    #[test]
    fn resolution_difference_is_detected() {
        let a = facts(sample_video(), sample_audio(), "1/15360");
        let mut v = sample_video();
        v["width"] = json!(3840);
        v["height"] = json!(2160);
        let b = facts(v, sample_audio(), "1/15360");
        let cmp = compare_merge_facts(&[a, b]);
        assert!(!cmp.compatible);
        assert!(cmp.differences.iter().any(|d| d.contains("分辨率")));
    }

    #[test]
    fn audio_sample_rate_difference_is_detected() {
        let a = facts(sample_video(), sample_audio(), "1/15360");
        let mut audio = sample_audio();
        audio["sample_rate"] = json!("48000");
        let b = facts(sample_video(), audio, "1/15360");
        let cmp = compare_merge_facts(&[a, b]);
        assert!(!cmp.compatible);
        assert!(cmp.differences.iter().any(|d| d.contains("采样率")));
    }

    #[test]
    fn time_base_difference_is_detected() {
        let a = facts(sample_video(), sample_audio(), "1/15360");
        let b = facts(sample_video(), sample_audio(), "1/90000");
        let cmp = compare_merge_facts(&[a, b]);
        assert!(!cmp.compatible);
        assert!(cmp.differences.iter().any(|d| d.contains("时间基")));
    }

    #[test]
    fn audio_track_count_difference_is_detected() {
        let a = facts(sample_video(), sample_audio(), "1/15360");
        let two_audio = json!({
            "streams": [
                sample_video(), sample_audio(), sample_audio()
            ],
            "format": { "format_name": "mp4", "duration": "10.0", "size": "1000" }
        });
        let mut v = two_audio;
        v["streams"][0]["time_base"] = json!("1/15360");
        let b = probe::parse_merge_facts(&v).unwrap();
        let cmp = compare_merge_facts(&[a, b]);
        assert!(!cmp.compatible);
        assert!(cmp.differences.iter().any(|d| d.contains("音轨")));
    }
}
