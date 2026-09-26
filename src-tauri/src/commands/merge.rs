//! 合并：参数一致性检测与 concat 拼接（DESIGN §3.3、§6.3③④、§9.5）。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};

use super::{PreparedOutput, ProgressThrottle};
use crate::ffmpeg::command;
use crate::ffmpeg::probe::{self, MergeFileFacts};
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::task::worker;
use crate::{AppTasks, MediaInfo};

/// 全部文件的九项比对结果（DESIGN §3.3）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeComparison {
    pub files: Vec<MergeFileFacts>,
    pub compatible: bool,
    pub differences: Vec<String>,
}

/// 两个文件的九项比对（DESIGN §3.3），`who` 标注差异来源。
/// compare_merge_facts 与工作台的定向统一（§3.8）共用。
pub(crate) fn diff_pair(
    who: &str,
    base: &MediaInfo,
    base_time_base: &str,
    cur: &MediaInfo,
    cur_time_base: &str,
) -> Vec<String> {
    let first = base;
    let mut differences = Vec::new();
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
    if cur_time_base != base_time_base {
        differences.push(format!(
            "{who}时间基不一致：{} ≠ {}",
            cur_time_base, base_time_base
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
    differences
}

/// 九项比对：视频编码+profile、分辨率、像素格式、帧率、time_base、
/// 音轨数量与各音轨（编码/采样率/声道）、字幕流数量。纯函数，可单测。
pub fn compare_merge_facts(files: &[MergeFileFacts]) -> MergeComparison {
    let mut differences = Vec::new();
    for (idx, f) in files.iter().enumerate().skip(1) {
        differences.extend(diff_pair(
            &format!("第 {} 个文件", idx + 1),
            &files[0].info,
            &files[0].video_time_base,
            &f.info,
            &f.video_time_base,
        ));
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
    }
    // 输出不得落在任一输入上（同一性比较走 fs::same_path 的归一化，见 R3-7）
    crate::fs::reject_if_input_equals(
        Path::new(&output),
        &inputs.iter().map(String::as_str).collect::<Vec<_>>(),
    )?;
    // ADR-033：容器由命令决定——无损合并（copy）跟随源容器、自动统一后合并（重编码）统一 mp4。
    // **类别取决于探测结果**，所以最终名与 `.part` 都在作业体内（探测后）才定：提交期定不了，
    // 也不该提前探测（`DESIGN` §8.1/§8.2：探测与检查按**运行时**的文件状态做）。
    let requested = PathBuf::from(&output);
    // 容器由作业体按探测结果定（ADR-033），提交期前导只按请求路径解析
    let PreparedOutput {
        out_dir,
        out_name,
        token,
        ffmpeg,
        ffprobe,
    } = super::prepare_output(&requested, &output)?;
    let list_path = out_dir.join(format!(".concat_{token}.txt"));

    let label = format!("合并 {} 个文件 → {out_name}", inputs.len());
    let total_steps_base = inputs.len();

    let job_inputs = inputs.clone();
    let job_output = output.clone();
    let job: Job = Box::new(move |ctx: &TaskContext| {
        // 磁盘空间预检（DESIGN §8.2）：copy 成品 ≈ Σ输入
        let inputs_size: u64 = job_inputs.iter().map(|i| super::file_size(i)).sum();
        super::require_disk_space(&out_dir, inputs_size)?;

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

        // ADR-033：容器由探测结果决定（copy 跟随源容器、重编码统一 mp4），
        // 最终名按容器校正（含同名不覆盖兜底），`.part` 与成品共用同一扩展名（ADR-033 ④）。
        let all_copy = comparison.compatible && !force_transcode;
        let container_ext = if all_copy {
            crate::fs::source_container_ext(job_inputs.first().map(String::as_str).unwrap_or(""))
        } else {
            "mp4".to_string()
        };
        let out = crate::fs::output_path_for(Path::new(&job_output), &container_ext);
        crate::fs::reject_if_input_equals(
            &out,
            &job_inputs.iter().map(String::as_str).collect::<Vec<_>>(),
        )?;
        let out_file = out
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("output")
            .to_string();
        let part = out_dir.join(format!("{out_file}.part.{token}.{container_ext}"));

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
        if all_copy {
            sources = job_inputs.clone();
            steps_total = 1.0;
            copy_offset = 0.0;
        } else {
            let base = &facts[0].info;
            // 重编码路径：中间统一文件与成品并存，峰值 ≈ 2 × Σ输入（DESIGN §8.2）
            super::require_disk_space(&out_dir, inputs_size.saturating_mul(2))?;
            let n = job_inputs.len();
            let mut normalized = Vec::with_capacity(n);
            for (i, input) in job_inputs.iter().enumerate() {
                if ctx.is_cancelled() {
                    cleanup(&temps);
                    return Err("已取消".into());
                }
                let inter = out_dir.join(format!(".merge_{token}_{:03}.mp4", i));
                temps.push(inter.clone());
                let _ = std::fs::remove_file(&inter);
                let dur = facts[i].info.duration_sec;
                let throttle = ProgressThrottle::new();
                let r = worker::run_ffmpeg(
                    ctx,
                    &ffmpeg,
                    &command::normalize_args(
                        input,
                        base.video.width,
                        base.video.height,
                        base.video.frame_rate,
                        &base.video.pix_fmt,
                        command::parse_timescale(&facts[0].video_time_base),
                        &inter.to_string_lossy(),
                    ),
                    dur,
                    &|local, speed| {
                        if throttle.update(local) {
                            ctx.set_progress(
                                (i as f64 + local) / (total_steps_base + 1) as f64,
                                speed,
                            );
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
        let throttle = ProgressThrottle::new();
        let r = worker::run_ffmpeg(
            ctx,
            &ffmpeg,
            &command::concat_args(&list_path.to_string_lossy(), &part.to_string_lossy()),
            total_sec,
            &|local, speed| {
                if throttle.update(local) {
                    ctx.set_progress((copy_offset + local) / steps_total, speed);
                }
            },
        );
        if let Err(e) = r {
            cleanup(&temps);
            return Err(e);
        }

        // 原子替换：不得先删旧产物再改名，否则 rename 失败时两头空（`BUG-002`）。
        // 注意 `temps` 里只有中间文件与 concat 列表，不含 `part`——替换失败时新产物必须留在磁盘上。
        if let Err(e) = crate::fs::atomic_replace(&part, &out) {
            cleanup(&temps);
            return Err(e);
        }
        ctx.add_output(out.to_string_lossy().into_owned());
        cleanup(&temps);
        Ok(())
    });

    Ok(state
        .0
        .submit(Arc::new(TauriEmitter(app)), "merge", &label, job))
}

fn file_name(p: &str) -> &str {
    Path::new(p)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(p)
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
