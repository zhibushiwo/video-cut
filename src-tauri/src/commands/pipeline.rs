//! 工作台：多文件流水线（逐段剪切/旋转/放大 → 定向统一 → concat）
//! （DESIGN §3.8、§6.3⑨⑩）。

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};

use super::{PreparedOutput, ProgressThrottle};
use crate::ffmpeg::command;
use crate::ffmpeg::probe::{self, MergeFileFacts};
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::task::worker;
use crate::{AppTasks, CropRect, MediaInfo, PipelineItem, QualityPreset};

use super::crop::align_rect;
use super::fnv1a;
use super::merge::diff_pair;
use super::valid_segment_span;

/// 提交级递增序号：拼进临时文件名，防止同名输出的并发任务互写半成品（DESIGN §8.2）。
static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

pub(crate) fn temp_token(seed: &str) -> String {
    format!(
        "{:016x}-{:04x}",
        fnv1a(seed.as_bytes()),
        (TEMP_SEQ.fetch_add(1, Ordering::Relaxed) & 0xffff) as u32
    )
}

/// 计划输入：只携带与处理方式判定有关的字段（纯函数可单测）。
pub(crate) struct PlanInput {
    pub source_rotation: Option<i32>,
    pub rotate_deg: i32,
    pub hflip: bool,
    pub vflip: bool,
    pub has_crop: bool,
}

/// 单片段处理计划：copy（元数据旋转）或 transcode（像素烘焙）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ItemPlan {
    pub copy: bool,
    /// copy 路径：覆写显示矩阵的绝对角度（正=顺时针）
    pub display_deg: i32,
    pub display_hflip: bool,
    pub display_vflip: bool,
    /// transcode 路径：烘焙进像素的绝对变换（相对源像素）
    pub bake_deg: i32,
    pub bake_hflip: bool,
    pub bake_vflip: bool,
}

/// 处理计划（DESIGN §3.8 核心规则）：
/// - 规则 A：全部片段无裁剪且目标朝向一致 → 全部 copy（每片段矩阵覆写为 T_i）。
/// - 规则 B：其余情况以恒等朝向为基准——无裁剪且 T_i 恒等 → copy（矩阵显式归零），
///   否则重编码把绝对变换烘焙进像素（`-display_rotation 0` 剥离源矩阵）。
/// 正确性依据：concat 输出的显示矩阵取自第一个文件；规则 B 下全片矩阵恒等，
/// copy 片段（自然像素）与烘焙片段（像素即目标朝向）渲染方向都正确。
pub fn plan_items(items: &[PlanInput]) -> Vec<ItemPlan> {
    let targets: Vec<(i32, bool, bool)> = items
        .iter()
        .map(|it| {
            (
                (it.source_rotation.unwrap_or(0) + it.rotate_deg).rem_euclid(360),
                it.hflip,
                it.vflip,
            )
        })
        .collect();
    let no_crop = items.iter().all(|it| !it.has_crop);
    let all_equal = targets.windows(2).all(|w| w[0] == w[1]);
    if no_crop && all_equal {
        return targets
            .iter()
            .map(|(deg, hf, vf)| ItemPlan {
                copy: true,
                display_deg: *deg,
                display_hflip: *hf,
                display_vflip: *vf,
                bake_deg: 0,
                bake_hflip: false,
                bake_vflip: false,
            })
            .collect();
    }
    items
        .iter()
        .zip(targets.iter())
        .map(|(it, t)| {
            if !it.has_crop && *t == (0, false, false) {
                ItemPlan {
                    copy: true,
                    display_deg: 0,
                    display_hflip: false,
                    display_vflip: false,
                    bake_deg: 0,
                    bake_hflip: false,
                    bake_vflip: false,
                }
            } else {
                ItemPlan {
                    copy: false,
                    display_deg: 0,
                    display_hflip: false,
                    display_vflip: false,
                    bake_deg: t.0,
                    bake_hflip: t.1,
                    bake_vflip: t.2,
                }
            }
        })
        .collect()
}

/// 显示空间裁剪校验：90°/270° 时显示宽高为源宽高交换；默认放大回显示分辨率。
fn display_crop_rect(
    info: &MediaInfo,
    bake_deg: i32,
    r: CropRect,
    out_width: Option<u32>,
    out_height: Option<u32>,
) -> Result<(u32, u32, u32, u32, u32, u32), String> {
    let (dw, dh) = match bake_deg.rem_euclid(360) {
        90 | 270 => (info.video.height, info.video.width),
        _ => (info.video.width, info.video.height),
    };
    align_rect(dw, dh, r.x, r.y, r.width, r.height, out_width, out_height)
}

/// 单片段检测结果（UI 检测面板数据源，DESIGN §9.8）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineItemCheck {
    pub input: String,
    pub facts: MergeFileFacts,
    pub copy: bool,
    /// 重编码原因（copy 片段为空）
    pub reasons: Vec<String>,
    /// 最终朝向（绝对角度，展示用）
    pub display_deg: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineCheck {
    pub items: Vec<PipelineItemCheck>,
    pub all_lossless: bool,
    /// 预先可见、需用户知晓的提示（如无损片段间参数不一致将定向统一）
    pub warnings: Vec<String>,
}

/// 工作台导出前检测：逐片段给出无损/重编码判定与原因（DESIGN §9.8）。
#[tauri::command]
pub async fn check_pipeline(
    app: AppHandle,
    items: Vec<PipelineItem>,
) -> Result<PipelineCheck, String> {
    if items.is_empty() {
        return Err("请先添加视频".into());
    }
    let mut facts = Vec::with_capacity(items.len());
    for it in &items {
        facts.push(
            probe::probe_merge_facts(&app, &it.input)
                .await
                .map_err(|e| format!("{}：{e}", file_name(&it.input)))?,
        );
    }
    let plans = plan_items(&plan_inputs(&items, &facts));

    // 无损片段之间的参数一致性（不一致 → 拼接时定向统一，提前提示）
    let copy_idx: Vec<usize> = plans
        .iter()
        .enumerate()
        .filter(|(_, p)| p.copy)
        .map(|(i, _)| i)
        .collect();
    let mut warnings = Vec::new();
    for &i in copy_idx.iter().skip(1) {
        let base = &facts[copy_idx[0]];
        for d in diff_pair(
            &format!("第 {} 个片段", i + 1),
            &base.info,
            &base.video_time_base,
            &facts[i].info,
            &facts[i].video_time_base,
        ) {
            warnings.push(format!("{d}（拼接时将自动统一，需一次额外转码）"));
        }
    }
    let mut checks = Vec::with_capacity(items.len());
    for (i, (it, plan)) in items.iter().zip(plans.iter()).enumerate() {
        let mut reasons = Vec::new();
        if !plan.copy {
            if it.crop.is_some() {
                reasons.push("裁剪放大需要重编码".into());
            }
            if plan.bake_deg != 0 || plan.bake_hflip || plan.bake_vflip {
                reasons.push("与其他片段方向不一致，改为像素级旋转以保持整片统一".into());
            }
        }
        checks.push(PipelineItemCheck {
            input: it.input.clone(),
            facts: facts[i].clone(),
            copy: plan.copy,
            reasons,
            display_deg: if plan.copy {
                plan.display_deg
            } else {
                plan.bake_deg
            },
        });
    }
    let all_lossless = checks.iter().all(|c| c.copy) && warnings.is_empty();
    Ok(PipelineCheck {
        items: checks,
        all_lossless,
        warnings,
    })
}

/// 渲染即预览的"**只留当前一份**"（M12-2，TIMELINE.md §17.6）：清掉 `dir` 下所有文件名不含
/// `keep_token` 的文件——即上一轮预览的成品与陈旧 `.part`。本任务用自己的令牌，故不会误删
/// 自己的半成品；删除失败一律忽略（被 WebView2 占用的文件留给「清理缓存」兜底），
/// **绝不复用旧文件**（复用会让前端拿到过期画面）。
pub(crate) fn sweep_preview_dir(dir: &Path, keep_token: &str) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        if e.file_name().to_string_lossy().contains(keep_token) {
            continue;
        }
        let _ = std::fs::remove_file(e.path());
    }
}

/// 提交工作台任务：单任务内串行"逐片段处理 → 定向统一 → concat"（DESIGN §3.8）。
///
/// `preview = true` 是**渲染即预览**（M12-2，TIMELINE.md §17.6）：忽略 `output`，产物改写
/// `<app_cache_dir>/preview/<令牌>.mp4`；任务以 **internal + 低优先级 + 同源单例** 提交
/// ——不进历史与任务面板、不抢导出并发位、新编辑取代旧预览。
pub fn submit_pipeline(
    app: AppHandle,
    state: &State<'_, AppTasks>,
    items: Vec<PipelineItem>,
    output: String,
    quality: QualityPreset,
    locked_encoder: Option<String>,
    preview: bool,
) -> Result<String, String> {
    if items.is_empty() {
        return Err("请先添加视频".into());
    }
    for it in &items {
        if !Path::new(&it.input).is_file() {
            return Err(format!("输入文件不存在：{}", it.input));
        }
        if let Some(seg) = &it.segment {
            if !valid_segment_span(seg.start_sec, seg.end_sec) {
                return Err(format!("{} 的剪切区间无效", file_name(&it.input)));
            }
        }
    }
    // 输出不得落在任一输入上（同一性比较走 fs::same_path 的归一化，见 R3-7）。
    // preview 忽略用户给的 `output`，同一性检查改由作业体对**真实产物路径**做（见下）。
    if !preview {
        crate::fs::reject_if_input_equals(
            Path::new(&output),
            &items.iter().map(|it| it.input.as_str()).collect::<Vec<_>>(),
        )?;
    }
    // 渲染即预览的内容签名（M12-2）：同一份时间线不重复渲染（React StrictMode 双提交幂等）；
    // 编辑后签名必变 → 由 `submit_internal_singleton` 触发"取代旧预览"。
    let dedup_key = format!(
        "{:016x}",
        super::fnv1a(serde_json::to_string(&items).unwrap_or_default().as_bytes())
    );
    // 输出前导：preview 写缓存目录的 `<令牌>.mp4`；普通导出用用户请求的路径
    // （真正落盘的名字由作业体按容器校正后决定，见下）。
    let PreparedOutput {
        out_dir,
        out_name,
        token,
        ffmpeg,
        ffprobe,
    } = if preview {
        super::prepare_preview_output(&super::media::preview_cache_dir(&app)?, &dedup_key)?
    } else {
        super::prepare_output(&PathBuf::from(&output), &output)?
    };

    // ADR-033：容器要按"有没有片段需要转码"来定，而这只在探测+计划之后才知道；
    // 探测与计划**留在作业体内**（`DESIGN` §8.1/§8.2：按运行时的文件状态做，排队期间文件可能变），
    // 因此最终名与 `.part` 也在作业体内才定（见下面的容器决策）。
    let list_path = out_dir.join(format!(".concat_{token}.txt"));

    let label = format!(
        "{} {} 个片段 → {out_name}",
        if preview { "预览渲染" } else { "工作台" },
        items.len()
    );
    let n = items.len();
    log::info!("[pipeline] {label}");
    log::debug!(
        "[pipeline] 提交载荷：{}",
        serde_json::to_string(&items).unwrap_or_default()
    );

    let job: Job = Box::new(move |ctx: &TaskContext| {
        // 渲染即预览：**只留当前一份**（M12-2）——先清掉上一轮预览的产物与陈旧 `.part`
        if preview {
            sweep_preview_dir(&out_dir, &token);
        }
        // 磁盘空间预检（DESIGN §8.2）：中间片段与成品并存，峰值 ≈ 2 × Σ片段源大小
        let inputs_size: u64 = items.iter().map(|it| super::file_size(&it.input)).sum();
        super::require_disk_space(&out_dir, inputs_size.saturating_mul(2))?;

        let mut temps: Vec<PathBuf> = vec![list_path.clone()];
        let cleanup = |temps: &[PathBuf]| {
            for t in temps {
                let _ = std::fs::remove_file(t);
            }
        };

        // 1) 任务内探测并计算计划（防前端判定与实际文件不符，也防排队期间文件被换掉）
        let mut facts = Vec::with_capacity(n);
        for it in &items {
            if ctx.is_cancelled() {
                cleanup(&temps);
                return Err("已取消".into());
            }
            facts.push(
                probe::probe_merge_facts_sync(&ffprobe, &it.input)
                    .map_err(|e| format!("{}：{e}", file_name(&it.input)))?,
            );
        }
        let plans = plan_items(&plan_inputs(&items, &facts));

        // 基准视频轨 timescale：取第 1 个片段的源 time_base（copy 片段 remux 后保持该 tb）。
        // 转码片段强制对齐，否则 concat demuxer 的 copy 拼接会错乱后续段时间戳（DESIGN §6.3⑨⑩）。
        let base_timescale = command::parse_timescale(&facts[0].video_time_base);

        // 2) 逐片段处理：copy = 剪切+元数据旋转一步；transcode = 单次编码烘焙
        let mut sources: Vec<String> = Vec::with_capacity(n);
        for (i, (it, plan)) in items.iter().zip(plans.iter()).enumerate() {
            if ctx.is_cancelled() {
                cleanup(&temps);
                return Err("已取消".into());
            }
            let inter = out_dir.join(format!(".pipe_{token}_{i:03}.mp4"));
            temps.push(inter.clone());
            let _ = std::fs::remove_file(&inter);
            let seg = it.segment.map(|s| (s.start_sec, s.end_sec - s.start_sec));
            let dur = seg.map_or(facts[i].info.duration_sec, |(_, d)| d);

            let args = if plan.copy {
                command::pipeline_copy_args(
                    seg,
                    plan.display_deg,
                    plan.display_hflip,
                    plan.display_vflip,
                    &it.input,
                    &inter.to_string_lossy(),
                )
            } else {
                let crop = match it.crop {
                    Some(r) => Some(display_crop_rect(
                        &facts[i].info,
                        plan.bake_deg,
                        r,
                        it.out_width,
                        it.out_height,
                    )?),
                    None => None,
                };
                let encoder = command::effective_encoder(
                    locked_encoder.as_deref(),
                    &facts[i].info.video.pix_fmt,
                );
                command::pipeline_transcode_args(
                    seg,
                    plan.bake_deg,
                    plan.bake_hflip,
                    plan.bake_vflip,
                    crop,
                    &encoder,
                    quality,
                    base_timescale,
                    &it.input,
                    &inter.to_string_lossy(),
                )
            };

            let throttle = ProgressThrottle::new();
            let r = worker::run_ffmpeg(ctx, &ffmpeg, &args, dur, &|local, speed| {
                if throttle.update(local) {
                    ctx.set_progress((i as f64 + local) / (n as f64 + 1.0), speed);
                }
            });
            if let Err(e) = r {
                cleanup(&temps);
                return Err(e);
            }
            sources.push(inter.to_string_lossy().into_owned());
        }

        // 3) 定向参数统一：中间文件与第 1 个片段比对，不一致者归一化到其参数
        let mut inter_facts = Vec::with_capacity(n);
        for src in &sources {
            if ctx.is_cancelled() {
                cleanup(&temps);
                return Err("已取消".into());
            }
            inter_facts.push(
                probe::probe_merge_facts_sync(&ffprobe, src)
                    .map_err(|e| format!("{}：{e}", file_name(src)))?,
            );
        }
        let n_norm: usize = (1..n)
            .filter(|&i| {
                !diff_pair(
                    "",
                    &inter_facts[0].info,
                    &inter_facts[0].video_time_base,
                    &inter_facts[i].info,
                    &inter_facts[i].video_time_base,
                )
                .is_empty()
            })
            .count();
        let base = &inter_facts[0];
        let mut norm_done = 0usize;
        for i in 1..n {
            let diffs = diff_pair(
                &format!("第 {} 个片段", i + 1),
                &base.info,
                &base.video_time_base,
                &inter_facts[i].info,
                &inter_facts[i].video_time_base,
            );
            if diffs.is_empty() {
                continue;
            }
            if ctx.is_cancelled() {
                cleanup(&temps);
                return Err("已取消".into());
            }
            let norm = out_dir.join(format!(".pipe_{token}_norm_{i:03}.mp4"));
            temps.push(norm.clone());
            let _ = std::fs::remove_file(&norm);
            let dur = inter_facts[i].info.duration_sec;
            let throttle = ProgressThrottle::new();
            // 归一化占用剩余进度预算的前半段，concat 占后半段
            let r = worker::run_ffmpeg(
                ctx,
                &ffmpeg,
                &command::normalize_args(
                    &sources[i],
                    base.info.video.width,
                    base.info.video.height,
                    base.info.video.frame_rate,
                    &base.info.video.pix_fmt,
                    base_timescale,
                    &norm.to_string_lossy(),
                ),
                dur,
                &|local, speed| {
                    if throttle.update(local) {
                        let phase = (norm_done as f64 + local) / (n_norm.max(1) as f64 + 1.0);
                        // 归一化/concat 与上面的逐段处理共享 n+1 个进度单位（BUG-013：
                        // 旧公式漏除 (n+1)，两阶段进度恒被钳到 100%）
                        ctx.set_progress((n as f64 + phase * 0.5) / (n as f64 + 1.0), speed);
                    }
                },
            );
            if let Err(e) = r {
                cleanup(&temps);
                return Err(e);
            }
            norm_done += 1;
            sources[i] = norm.to_string_lossy().into_owned();
        }

        // ADR-033：**全 copy 且无需归一化**才跟随源容器；只要有一个片段要转码、**或发生过归一化**
        // （归一化本身就是一次重编码，`ADR-033` ② 把它归在重编码类），成品容器统一 mp4。
        // 命名放在这里定：归一化是否需要只有探测完中间文件才知道（`DESIGN` §8.1/§8.2：按运行时状态）。
        // 渲染即预览固定 mp4（产物在缓存目录，复用方按 mp4 播放）；普通导出走 ADR-033 的容器决策
        let container_ext = if !preview && plans.iter().all(|p| p.copy) && n_norm == 0 {
            crate::fs::source_container_ext(&items[0].input)
        } else {
            "mp4".to_string()
        };
        let out = if preview {
            out_dir.join(&out_name)
        } else {
            crate::fs::output_path_for(Path::new(&output), &container_ext)
        };
        crate::fs::reject_if_input_equals(
            &out,
            &items.iter().map(|it| it.input.as_str()).collect::<Vec<_>>(),
        )?;
        let out_file = out
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("output")
            .to_string();
        // 半成品与成品共用同一容器扩展名（ADR-033 ④）
        let part = out_dir.join(format!("{out_file}.part.{token}.{container_ext}"));

        // 4) concat 拼接成成品
        if let Err(e) = std::fs::write(&list_path, command::concat_list_content(&sources)) {
            cleanup(&temps);
            return Err(format!("写入 concat 列表失败：{e}"));
        }
        let total_sec: f64 = inter_facts.iter().map(|f| f.info.duration_sec).sum();
        let throttle = ProgressThrottle::new();
        let r = worker::run_ffmpeg(
            ctx,
            &ffmpeg,
            &command::concat_args(&list_path.to_string_lossy(), &part.to_string_lossy()),
            total_sec,
            &|local, speed| {
                if throttle.update(local) {
                    let phase = if n_norm > 0 { 0.5 + local * 0.5 } else { local };
                    ctx.set_progress((n as f64 + phase) / (n as f64 + 1.0), speed);
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

    let sink = Arc::new(TauriEmitter(app));
    Ok(if preview {
        // 渲染即预览：internal + 低优先级 + 同源单例（新编辑取代旧任务，且不抢导出并发位）
        state
            .0
            .submit_internal_singleton(sink, "pipeline", &label, &dedup_key, job)
    } else {
        state.0.submit(sink, "pipeline", &label, job)
    })
}

fn plan_inputs(items: &[PipelineItem], facts: &[MergeFileFacts]) -> Vec<PlanInput> {
    items
        .iter()
        .zip(facts.iter())
        .map(|(it, f)| PlanInput {
            source_rotation: f.info.rotation,
            rotate_deg: it.rotate_deg,
            hflip: it.hflip,
            vflip: it.vflip,
            has_crop: it.crop.is_some(),
        })
        .collect()
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

    fn input(rotation: Option<i32>, deg: i32, hf: bool, vf: bool, crop: bool) -> PlanInput {
        PlanInput {
            source_rotation: rotation,
            rotate_deg: deg,
            hflip: hf,
            vflip: vf,
            has_crop: crop,
        }
    }

    #[test]
    fn identical_targets_without_crop_are_all_copy() {
        let plans = plan_items(&[
            input(None, 0, false, false, false),
            input(None, 0, false, false, false),
        ]);
        assert!(plans.iter().all(|p| p.copy));
        assert_eq!(plans[0].display_deg, 0);
    }

    #[test]
    fn flip_difference_breaks_uniform_metadata_rule() {
        // 90° 与 90°+水平翻转目标朝向不同 → 规则 B，两个片段都烘焙像素
        let plans = plan_items(&[
            input(None, 90, false, false, false),
            input(None, 90, true, false, false),
        ]);
        assert!(!plans[0].copy);
        assert_eq!(plans[0].bake_deg, 90);
        assert!(!plans[1].copy);
        assert!(plans[1].bake_hflip, "翻转必须保留在烘焙变换中");
        assert_eq!(plans[1].bake_deg, 90);
    }

    #[test]
    fn differing_rotation_without_crop_bakes_pixels() {
        let plans = plan_items(&[
            input(None, 0, false, false, false),
            input(None, 90, false, false, false),
        ]);
        assert!(plans[0].copy, "恒等朝向片段应保持无损");
        assert_eq!(plans[0].display_deg, 0);
        assert!(!plans[1].copy);
        assert_eq!(plans[1].bake_deg, 90, "非恒等片段应烘焙绝对角度");
    }

    #[test]
    fn crop_forces_transcode_and_bakes_absolute() {
        let plans = plan_items(&[
            input(None, 0, false, false, true),
            input(None, 0, false, false, false),
        ]);
        assert!(!plans[0].copy);
        assert!(plans[1].copy, "无裁剪且无变换的片段仍无损");
    }

    #[test]
    fn crop_with_uniform_rotation_bakes_the_uncropped_too() {
        // 已知取舍（DESIGN §3.8）：有裁剪时规则 B 生效，非恒等旋转片段
        // 即使无裁剪也需重编码（保整片方向一致优先于局部无损）
        let plans = plan_items(&[
            input(None, 90, false, false, false),
            input(None, 90, false, false, true),
        ]);
        assert!(!plans[0].copy);
        assert_eq!(plans[0].bake_deg, 90);
        assert!(!plans[1].copy);
        assert_eq!(plans[1].bake_deg, 90);
    }

    #[test]
    fn source_metadata_is_included_in_target() {
        // 手机视频自带 90° 矩阵 + 用户 -90°（逆时针转正）→ 目标恒等 → copy
        let plans = plan_items(&[input(Some(90), 270, false, false, false)]);
        assert!(plans[0].copy);
        assert_eq!(plans[0].display_deg, 0);
    }

    #[test]
    fn displayed_crop_bounds_swap_for_quarter_turns() {
        let info = media(1920, 1080);
        // 90° 显示空间为 1080×1920：x 上限 1080，y 上限 1920
        let ok = display_crop_rect(
            &info,
            90,
            CropRect {
                x: 0,
                y: 1000,
                width: 1080,
                height: 900,
            },
            None,
            None,
        )
        .unwrap();
        assert_eq!(ok, (0, 1000, 1080, 900, 1080, 1920));
        assert!(display_crop_rect(
            &info,
            90,
            CropRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080
            },
            None,
            None
        )
        .is_err());
        // 0° 仍按源宽高校验
        let ok0 = display_crop_rect(
            &info,
            0,
            CropRect {
                x: 100,
                y: 100,
                width: 800,
                height: 600,
            },
            None,
            None,
        )
        .unwrap();
        assert_eq!(ok0.4, 1920);
    }

    fn media(w: u32, h: u32) -> MediaInfo {
        let v = serde_json::json!({
            "streams": [{ "codec_name": "h264", "codec_type": "video",
                "width": w, "height": h, "pix_fmt": "yuv420p", "avg_frame_rate": "30/1" }],
            "format": { "format_name": "mp4", "duration": "10.0", "size": "1000" }
        });
        probe::parse_media_json(&v).unwrap()
    }

    /// 渲染即预览的"只留当前一份"（M12-2）：只保留当前令牌的文件（含同名 `.part`），
    /// 上一轮的成品与陈旧 `.part` 一并清掉。
    #[test]
    fn sweep_preview_dir_keeps_only_current_token() {
        let dir = std::env::temp_dir().join(format!("vc-preview-sweep-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("aaaa-0001.mp4"), b"old").unwrap();
        std::fs::write(dir.join("aaaa-0001.mp4.part.aaaa-0001.mp4"), b"stale").unwrap();
        std::fs::write(dir.join("bbbb-0002.mp4"), b"current").unwrap();
        std::fs::write(dir.join("bbbb-0002.mp4.part.bbbb-0002.mp4"), b"inflight").unwrap();

        sweep_preview_dir(&dir, "bbbb-0002");

        let mut names: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec![
                "bbbb-0002.mp4".to_string(),
                "bbbb-0002.mp4.part.bbbb-0002.mp4".to_string()
            ],
            "只应留下当前令牌的文件（含其 .part）"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
