//! AI 字幕：模型与 GPU 加速包管理（M18，DESIGN §3.9，FR-391）。
//!
//! 目录约定（ADR-039）：
//! - 内置模型（tiny / silero VAD）：随安装包 resource（`<resource_dir>/resources/models/`），
//!   不可删不可清、不进模型列表（silero 仅供 FR-392 强制 VAD 预切分使用）；
//! - 下载模型（small / large-v3-turbo）：`<app_cache_dir>/models/`；
//! - CUDA 加速包解压后：`<app_cache_dir>/bin/whisper-cuda/`。
//!
//! 下载走任务系统（kind = `model_download` / `cuda_download`，面板可见可取消、
//! 占并发位、**不入历史白名单**——见 lib.rs 的 kind 白名单），`.part.<令牌>` 半成品
//! + 断点续传 + 失速重连（ADR-040）+ SHA256 硬编码校验表（ADR-039⑤）。

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

use crate::ffmpeg::{command, probe};
use crate::fs;
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::task::worker;
use crate::{AppTasks, TaskStatus};

use super::{file_name, require_disk_space, temp_token, ProgressThrottle};

/// 下载模型目录名：`<app_cache_dir>/models`（DESIGN §3.9）。
const MODELS_SUBDIR: &str = "models";
/// CUDA 加速包解压目录名：`<app_cache_dir>/bin/whisper-cuda`（ADR-039④）。
const CUDA_SUBDIR: (&str, &str) = ("bin", "whisper-cuda");
/// 下载尝试次数上限（每次失败后从 `.part` 断点续传，ADR-040）。
const MAX_ATTEMPTS: usize = 8;
/// 单次读超时 = 失速判定（ADR-040：30s 内无进展即断开重连）。
const READ_STALL: Duration = Duration::from_secs(30);

/// 模型规格（封闭白名单，ADR-039⑦：只收录量化档）。
struct ModelSpec {
    id: &'static str,
    label: &'static str,
    file_name: &'static str,
    size_bytes: u64,
    sha256: &'static str,
    /// 下载源；hf-mirror 镜像优先，官方源回退（ADR-040）
    urls: &'static [&'static str],
    /// 随安装包内置（tiny）；其余按需下载
    bundled: bool,
}

/// SHA256 硬编码校验表（ADR-039⑤：HF LFS 文件不可变，2026-10-07 从已下载产物取值）。
const MODELS: &[ModelSpec] = &[
    ModelSpec {
        id: "tiny",
        label: "极速",
        file_name: "ggml-tiny-q5_1.bin",
        size_bytes: 32_152_673,
        sha256: "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
        urls: &[],
        bundled: true,
    },
    ModelSpec {
        id: "small",
        label: "标准",
        file_name: "ggml-small-q5_1.bin",
        size_bytes: 190_085_487,
        sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
        urls: &[
            "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin",
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin",
        ],
        bundled: false,
    },
    ModelSpec {
        id: "large-v3-turbo",
        label: "高质量",
        file_name: "ggml-large-v3-turbo-q5_0.bin",
        size_bytes: 574_041_195,
        sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
        urls: &[
            "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
        ],
        bundled: false,
    },
];

/// CUDA 12.4 加速包（ADR-039④：捆绑 CUDA 运行时 DLL，用户无需装 Toolkit）。
/// zip 内为 `Release/` 目录，解压时只取 `whisper-cli.exe` + `*.dll`（跳过示例 exe）。
const CUDA_ZIP: (&str, u64, &str) = (
    "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-cublas-12.4.0-bin-x64.zip",
    457_024_596,
    "b07cff4e59831b227896018facbb6334907bf324a342c84597c44f087823d252",
);

/// 模型信息（DESIGN §3.9 / FR-391；TS 侧 `WhisperModelInfo` 双写）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModelInfo {
    pub id: String,
    pub label: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub bundled: bool,
    /// 自定义模型（models 目录动态扫描，ADR-042）：无哈希门、可删除
    pub custom: bool,
    /// 内置档 = resource 文件存在；下载档 = models 目录文件存在
    pub ready: bool,
    /// 就绪时的绝对路径（M18-5 转写直接使用）
    pub path: Option<String>,
}

fn find_spec(model_id: &str) -> Result<&'static ModelSpec, String> {
    MODELS
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| format!("未知模型：{model_id}"))
}

/// 内置模型目录：`<resource_dir>/resources/models/`（dev 与安装包同结构，M18-2 已验证）。
fn resource_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resource_dir()
        .map(|r| r.join("resources").join("models"))
        .map_err(|e| format!("无法定位资源目录：{e}"))
}

fn download_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|c| c.join(MODELS_SUBDIR))
        .map_err(|e| format!("无法定位缓存目录：{e}"))
}

fn cuda_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|c| c.join(CUDA_SUBDIR.0).join(CUDA_SUBDIR.1))
        .map_err(|e| format!("无法定位缓存目录：{e}"))
}

/// 列出模型档位与就绪状态（FR-391）。silero VAD 不进列表（ADR-039⑧）。
#[tauri::command]
pub fn list_whisper_models(app: AppHandle) -> Result<Vec<WhisperModelInfo>, String> {
    let resource_dir = resource_models_dir(&app)?;
    let download_dir = download_models_dir(&app)?;
    let mut out: Vec<WhisperModelInfo> = MODELS
        .iter()
        .map(|m| {
            let base = if m.bundled {
                &resource_dir
            } else {
                &download_dir
            };
            let path = base.join(m.file_name);
            let ready = path.exists();
            WhisperModelInfo {
                id: m.id.to_string(),
                label: m.label.to_string(),
                file_name: m.file_name.to_string(),
                size_bytes: m.size_bytes,
                bundled: m.bundled,
                custom: false,
                ready,
                path: ready.then(|| path.to_string_lossy().into_owned()),
            }
        })
        .collect();
    // 动态扫描：models 目录中白名单文件名之外的 `*.bin`（ADR-042①）
    let curated: Vec<&str> = MODELS.iter().map(|m| m.file_name).collect();
    out.extend(scan_custom_models(&download_dir, &curated));
    Ok(out)
}

/// 动态扫描 models 目录：白名单文件名之外的 `*.bin` 以"自定义模型"列出
/// （label = 文件主名、体积取 FS、ready 恒真、可删除；`.part` 半成品不结尾不命中）。
fn scan_custom_models(dir: &Path, exclude: &[&str]) -> Vec<WhisperModelInfo> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if exclude.contains(&name) || !name.to_ascii_lowercase().ends_with(".bin") {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let label = Path::new(name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(name)
            .to_string();
        out.push(WhisperModelInfo {
            id: name.to_string(),
            label,
            file_name: name.to_string(),
            size_bytes: size,
            bundled: false,
            custom: true,
            ready: true,
            path: Some(path.to_string_lossy().into_owned()),
        });
    }
    out.sort_by(|a, b| a.label.cmp(&b.label));
    out
}

/// 自定义模型 id 合法性：仅 models 目录下的 `.bin` 文件名（拒绝路径穿越，`ADR-042`②）。
fn valid_custom_model_id(id: &str) -> bool {
    !id.is_empty()
        && id.to_ascii_lowercase().ends_with(".bin")
        && !id.contains('/')
        && !id.contains('\\')
        && !id.contains("..")
}

/// 转写提交的模型解析（`ADR-042`②）：`tiny` → resource；白名单下载档 → models
/// 已知文件名；其余 id → models 目录文件名（须合法且存在）。
/// 返回 (模型路径, 是否内置)。
fn resolve_model_path(
    resource_dir: &Path,
    models_dir: &Path,
    model_id: &str,
) -> Result<(PathBuf, bool), String> {
    if model_id == "tiny" {
        return Ok((resource_dir.join("ggml-tiny-q5_1.bin"), true));
    }
    if let Some(spec) = MODELS.iter().find(|m| m.id == model_id && !m.bundled) {
        return Ok((models_dir.join(spec.file_name), false));
    }
    if !valid_custom_model_id(model_id) {
        return Err(format!("非法模型标识：{model_id}"));
    }
    Ok((models_dir.join(model_id), false))
}

/// 活动的同名下载任务（提交幂等：重复点击返回既有 taskId 而不是再起一个）。
fn active_download_task_id(
    state: &State<'_, AppTasks>,
    kind: &str,
    needle: &str,
) -> Option<String> {
    state
        .0
        .snapshot()
        .into_iter()
        .find(|t| {
            t.kind == kind
                && matches!(t.status, TaskStatus::Pending | TaskStatus::Running)
                && t.label.contains(needle)
        })
        .map(|t| t.id)
}

/// 下载模型档位（FR-391）：走任务系统，面板可见可取消、`.part` 断点续传、SHA256 校验。
#[tauri::command]
pub fn download_whisper_model(
    app: AppHandle,
    state: State<'_, AppTasks>,
    model_id: String,
) -> Result<String, String> {
    let spec = find_spec(&model_id)?;
    if spec.bundled {
        return Err("内置模型无需下载".to_string());
    }
    let dir = download_models_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建模型目录：{e}"))?;
    let final_path = dir.join(spec.file_name);
    if final_path.exists() {
        return Err("模型已就绪，无需重复下载".to_string());
    }
    if let Some(id) = active_download_task_id(&state, "model_download", spec.id) {
        return Ok(id);
    }

    let part = dir.join(format!(
        "{}.part.{}",
        spec.file_name,
        temp_token(&format!("model-download-{}", spec.id))
    ));
    let urls: Vec<String> = spec.urls.iter().map(|u| u.to_string()).collect();
    let (sha, expected, label) = (spec.sha256, spec.size_bytes, spec.id);
    let job: Job = Box::new(move |ctx: &TaskContext| {
        download_job(
            &|| ctx.is_cancelled(),
            &|p| ctx.set_progress(p, None),
            &urls,
            &part,
            &final_path,
            sha,
            expected,
        )?;
        Ok(())
    });

    let emitter = Arc::new(TauriEmitter(app.clone()));
    let task_id = state.0.submit(
        emitter,
        "model_download",
        &format!("下载字幕模型 {label}"),
        job,
    );
    Ok(task_id)
}

/// 删除下载的模型档位（FR-391）：内置档不可删；连 `.part` 残留一并清理。
#[tauri::command]
pub fn delete_whisper_model(app: AppHandle, model_id: String) -> Result<(), String> {
    // 目标文件名：白名单档取规格；自定义模型 id 即文件名（校验防穿越，`ADR-042`②）
    let file_name = match find_spec(&model_id) {
        Ok(spec) if spec.bundled => return Err("内置模型不可删除".to_string()),
        Ok(spec) => spec.file_name.to_string(),
        Err(_) => {
            if !valid_custom_model_id(&model_id) {
                return Err(format!("非法模型标识：{model_id}"));
            }
            model_id
        }
    };
    let dir = download_models_dir(&app)?;
    let final_path = dir.join(&file_name);
    let mut removed = false;
    if final_path.exists() {
        std::fs::remove_file(&final_path).map_err(|e| format!("删除失败：{e}"))?;
        removed = true;
    }
    // `.part.<令牌>` 令牌不可预知——按前缀扫目录
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with(&format!("{file_name}.part.")) {
                let _ = std::fs::remove_file(entry.path());
                removed = true;
            }
        }
    }
    if !removed {
        return Err("模型未下载".to_string());
    }
    Ok(())
}

/// 下载 GPU 加速包（FR-391）：zip 下载 → SHA256 校验 → 解压 whisper-cli.exe + DLL 到
/// `<app_cache_dir>/bin/whisper-cuda/`（M18-6 的试跑探测消费该目录）。
#[tauri::command]
pub fn download_whisper_cuda(app: AppHandle, state: State<'_, AppTasks>) -> Result<String, String> {
    let dir = cuda_dir(&app)?;
    if dir.join("whisper-cli.exe").exists() {
        return Err("GPU 加速包已安装".to_string());
    }
    if let Some(id) = active_download_task_id(&state, "cuda_download", "CUDA") {
        return Ok(id);
    }
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法定位缓存目录：{e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建加速包目录：{e}"))?;
    // 压缩 457MB + 解压约 731MB
    require_disk_space(&cache, CUDA_ZIP.1 + 731_466_240)?;

    let token = temp_token("cuda-download");
    let zip_part = dir.join(format!("cublas.zip.part.{token}"));
    let zip_final = dir.join("cublas.zip");
    let urls = vec![CUDA_ZIP.0.to_string()];
    let job: Job = Box::new(move |ctx: &TaskContext| {
        download_job(
            &|| ctx.is_cancelled(),
            &|p| ctx.set_progress(p, None),
            &urls,
            &zip_part,
            &zip_final,
            CUDA_ZIP.2,
            CUDA_ZIP.1,
        )?;
        extract_cuda_zip(&|p| ctx.set_progress(p, None), &zip_final, &dir)
            .map_err(|e| format!("解压失败：{e}"))?;
        let _ = std::fs::remove_file(&zip_final);
        Ok(())
    });

    let emitter = Arc::new(TauriEmitter(app.clone()));
    let task_id = state.0.submit(
        emitter,
        "cuda_download",
        "下载 GPU 加速包（CUDA 12.4）",
        job,
    );
    Ok(task_id)
}

// ---------- 下载内核 ----------

/// 取消探测注入点（作业体 = `ctx.is_cancelled`，单测 = 闭包）。
type CancelCheck<'a> = &'a dyn Fn() -> bool;
/// 进度上报注入点（作业体 = `ctx.set_progress(p, None)`，单测 = 闭包）。
type ProgressReport<'a> = &'a dyn Fn(f64);

/// 单 URL 一次传输（从 `.part` 现有长度断点续传）。返回是否传完。
/// 失速（读超时）/连接中断 → Ok(false) 由外层重试；取消 → Err（保留 `.part` 供续传）。
///
/// 实现走 async 客户端（`block_on` 在任务作业线程内等待）：per-read 失速判定需要
/// `read_timeout`，该 API 只在 async `ClientBuilder` 上（reqwest 0.12.28 实查），
/// blocking 客户端没有。
fn download_once(
    cancel: CancelCheck<'_>,
    report: ProgressReport<'_>,
    url: &str,
    part: &Path,
    total_hint: u64,
) -> Result<bool, String> {
    tauri::async_runtime::block_on(download_once_async(cancel, report, url, part, total_hint))
}

async fn download_once_async(
    cancel: CancelCheck<'_>,
    report: ProgressReport<'_>,
    url: &str,
    part: &Path,
    total_hint: u64,
) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(READ_STALL)
        .build()
        .map_err(|e| format!("无法创建下载器：{e}"))?;

    let existing = std::fs::metadata(part).map(|m| m.len()).unwrap_or(0);
    let mut req = client.get(url);
    if existing > 0 {
        req = req.header("Range", format!("bytes={existing}-"));
    }
    let mut resp = req.send().await.map_err(|e| format!("连接失败：{e}"))?;
    // 服务器不支持 Range（200 而非 206）→ 从头重下
    let mut offset = existing;
    if resp.status() == reqwest::StatusCode::OK && existing > 0 {
        offset = 0;
    }
    if !resp.status().is_success() {
        return Err(format!("服务器返回 {}", resp.status()));
    }

    let total = match resp.content_length() {
        Some(len) => offset + len,
        None => total_hint,
    };
    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(offset == 0)
        .open(part)
        .map_err(|e| format!("无法写入半成品：{e}"))?;
    file.seek(std::io::SeekFrom::Start(offset))
        .map_err(|e| format!("半成品定位失败：{e}"))?;

    let throttle = ProgressThrottle::new();
    let mut downloaded = offset;
    loop {
        if cancel() {
            return Err("下载已取消（半成品已保留，可续传）".to_string());
        }
        let chunk = match resp.chunk().await {
            Ok(Some(c)) => c,
            Ok(None) => break,
            // 失速（读超时）/连接抖动 → 断开重连续传（ADR-040）；尝试次数由外层限定
            Err(e) => {
                log::warn!("下载中断（{e}），断点续传重试");
                return Ok(false);
            }
        };
        file.write_all(&chunk)
            .map_err(|e| format!("写入失败：{e}"))?;
        downloaded += chunk.len() as u64;
        if total > 0 && throttle.update(downloaded as f64 / total as f64) {
            report(downloaded as f64 / total as f64);
        }
    }
    let done = total == 0 || downloaded >= total;
    if done {
        report(1.0);
    }
    Ok(done)
}

/// 下载作业体：多 URL × 多次断点续传尝试 → SHA256 全文件校验 → 原子落位（FR-391）。
fn download_job(
    cancel: CancelCheck<'_>,
    report: ProgressReport<'_>,
    urls: &[String],
    part: &Path,
    final_path: &Path,
    sha256_hex: &str,
    expected_size: u64,
) -> Result<(), String> {
    let existing = std::fs::metadata(part).map(|m| m.len()).unwrap_or(0);
    require_disk_space(
        part.parent().unwrap_or(Path::new(".")),
        expected_size.saturating_sub(existing),
    )?;

    let mut last_err = String::new();
    for attempt in 1..=MAX_ATTEMPTS {
        let url = urls[(attempt - 1).min(urls.len() - 1)].as_str();
        match download_once(cancel, report, url, part, expected_size) {
            Ok(true) => break,
            Ok(false) => last_err = format!("连接中断（第 {attempt} 次尝试）"),
            Err(e) if e.contains("已取消") => return Err(e),
            Err(e) => last_err = e,
        }
    }
    if !part.exists() || std::fs::metadata(part).map(|m| m.len()).unwrap_or(0) < expected_size {
        return Err(format!("下载未完成：{last_err}"));
    }

    // SHA256 全文件校验（ADR-039⑤）：不符删 `.part` 重下（由下次下载自然触发）
    let mut hasher = Sha256::new();
    let mut file = std::fs::File::open(part).map_err(|e| format!("无法打开半成品：{e}"))?;
    let mut buf = [0u8; 256 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("读取失败：{e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != sha256_hex {
        let _ = std::fs::remove_file(part);
        return Err("SHA256 校验不符，已删除损坏文件，请重试下载".to_string());
    }
    // 原子落位：不得先删旧再改名（`BUG-002` 同口径）
    fs::atomic_replace(part, final_path)
}

/// 解压 CUDA 包：只取 `whisper-cli.exe` + `*.dll`（跳过 bench/server 等示例 exe），
/// 平铺到 `whisper-cuda/`。进度按解压字节数。
fn extract_cuda_zip(
    report: ProgressReport<'_>,
    zip_path: &Path,
    dest: &Path,
) -> Result<(), std::io::Error> {
    let mut archive = zip::ZipArchive::new(std::fs::File::open(zip_path)?)?;
    // 总解压量先扫一遍（进度分母）；by_index 独占借用 archive，顺序扫
    let mut total: u64 = 0;
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index(i) {
            if keep_zip_entry(entry.name()) {
                total += entry.size();
            }
        }
    }
    let throttle = ProgressThrottle::new();
    let mut extracted: u64 = 0;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        if !keep_zip_entry(entry.name()) {
            continue;
        }
        // enclosed_name 返回 owned PathBuf（zip 2.x），先落地再取文件名
        let Some(enclosed) = entry.enclosed_name() else {
            continue;
        };
        let Some(name) = enclosed.file_name() else {
            continue;
        };
        let mut out = std::fs::File::create(dest.join(name))?;
        std::io::copy(&mut entry, &mut out)?;
        extracted += entry.size();
        if total > 0 && throttle.update(extracted as f64 / total as f64) {
            report(extracted as f64 / total as f64);
        }
    }
    if !dest.join("whisper-cli.exe").exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "压缩包内未找到 whisper-cli.exe",
        ));
    }
    Ok(())
}

fn keep_zip_entry(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with("whisper-cli.exe") || lower.ends_with(".dll")
}

// ---------- 转写任务（M18-5，FR-392） ----------

/// VAD 辅助模型文件名（随安装包 resource，ADR-039⑧；与 fetch 脚本同源）。
const VAD_FILE_NAME: &str = "ggml-silero-v5.1.2.bin";

/// whisper-cli 转写参数（M18，ADR-041：`-pp` 进度走 stderr）。`vad_model = Some`
/// 时启用 `--vad -vm` 强制预切分（FR-392）；None = 无 VAD 全量转写（VAD 空结果
/// 回退用）。参数序列有全序列断言。
/// `pub` 供 tests/e2e.rs 复用（经 lib.rs 根重导出，同 ffmpeg 构建器口径）。
pub fn whisper_cli_args(
    model: &str,
    vad_model: Option<&str>,
    wav: &str,
    srt_base: &str,
    language: &str,
    threads: usize,
) -> Vec<String> {
    let threads_s = threads.to_string();
    let mut args = vec!["-m", model, "-f", wav];
    if let Some(vad) = vad_model {
        args.extend(["--vad", "-vm", vad]);
    }
    args.extend([
        "-osrt", "-of", srt_base, "-l", language, "-t", &threads_s, "-pp",
    ]);
    args.iter().map(|s| s.to_string()).collect()
}

/// 解析 whisper-cli stderr 的 `-pp` 进度行（ADR-041：红线 2"禁解析 stderr"为 FFmpeg
/// 专属口径，本函数是差异化裁决的落点）：
/// `whisper_print_progress_callback: progress =  73%` → 0.73；其余行 → None。
fn parse_whisper_progress(line: &str) -> Option<f64> {
    let idx = line.find("progress = ")?;
    let rest = line[idx + "progress = ".len()..].trim();
    let rest = rest.strip_suffix('%')?;
    rest.parse::<f64>()
        .ok()
        .map(|p| (p / 100.0).clamp(0.0, 1.0))
}

/// 转写线程数：物理并行度（spike 同款实测口径）；取不到按 4。
fn transcribe_threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

/// 产物名防覆盖（决策 #19"同名才追加时间戳"）：`<dir>/<stem>.srt`，冲突 →
/// `<stem>_<YYYYMMDD_HHMMSS>.srt`，同一秒内再冲突 → 序号 `_2`/`_3`。
fn reserve_srt_output(dir: &Path, stem: &str) -> Result<PathBuf, String> {
    let candidate = dir.join(format!("{stem}.srt"));
    if !candidate.exists() {
        return Ok(candidate);
    }
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    for n in 1u32.. {
        let candidate = dir.join(format!("{stem}_{stamp}_{n}.srt"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    unreachable!("循环内必然返回");
}

/// 运行 whisper-cli：`--vad` 强制预切分（FR-392）→ stderr 逐行解析 `-pp` 进度
/// （ADR-041）并保留尾部 30 行作失败提示（worker.rs 同法）；killer 注册支持取消。
/// `whisper_exe` 由后端选择决定（CPU sidecar 或 CUDA 加速包，M18-6）。
fn run_whisper(
    ctx: &TaskContext,
    whisper_exe: &Path,
    model: &str,
    vad_model: Option<&str>,
    wav: &str,
    srt_base: &str,
    language: &str,
    report: &dyn Fn(f64),
) -> Result<(), String> {
    let args = whisper_cli_args(
        model,
        vad_model,
        wav,
        srt_base,
        language,
        transcribe_threads(),
    );
    log::debug!(
        "whisper-cli argv：{} {}",
        whisper_exe.display(),
        args.join(" ")
    );
    let mut spawn_cmd = Command::new(whisper_exe);
    command::spawn_hidden(&mut spawn_cmd); // 红线 3
    let mut child = spawn_cmd
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 whisper-cli：{e}"))?;

    let stderr = child.stderr.take();
    let child = Arc::new(parking_lot::Mutex::new(child));
    {
        let c = child.clone();
        ctx.set_killer(Box::new(move || {
            let _ = c.lock().kill();
        }));
    }

    let tail: Arc<parking_lot::Mutex<VecDeque<String>>> =
        Arc::new(parking_lot::Mutex::new(VecDeque::new()));
    // stderr 线程只写共享状态（report 闭包不保证 Send，不能跨线程）；
    // 上报由主循环按 200ms 轮询节流（与 PROGRESS_INTERVAL_MS 同量级）。
    let latest: Arc<parking_lot::Mutex<f64>> = Arc::new(parking_lot::Mutex::new(0.0));
    if let Some(stderr) = stderr {
        let tail = tail.clone();
        let latest = latest.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Some(p) = parse_whisper_progress(&line) {
                    *latest.lock() = p;
                }
                let mut t = tail.lock();
                if t.len() >= 30 {
                    t.pop_front();
                }
                t.push_back(line);
            }
        });
    }

    // 等待子进程退出，同时响应取消（killer 由 cancel() 触发，这里兜底轮询）
    loop {
        if ctx.is_cancelled() {
            let mut c = child.lock();
            let _ = c.kill();
            let _ = c.wait();
            return Err("已取消".into());
        }
        match child.lock().try_wait() {
            Ok(Some(status)) => {
                if ctx.is_cancelled() {
                    return Err("已取消".into());
                }
                if !status.success() {
                    let tail = {
                        let t = tail.lock();
                        t.iter().map(String::as_str).collect::<Vec<_>>().join("\n")
                    };
                    return Err(if tail.trim().is_empty() {
                        format!("whisper-cli 以非零状态退出（{:?}）", status.code())
                    } else {
                        format!("转写失败：\n{}", tail.trim())
                    });
                }
                report(*latest.lock());
                return Ok(());
            }
            Ok(None) => {
                report(*latest.lock());
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(format!("等待 whisper-cli 退出失败：{e}")),
        }
    }
}

// ---------- GPU 后端（M18-6，ADR-041②） ----------

/// GPU 试跑冒烟超时（正常 1~2s；超时按失败处理并 kill）
const GPU_SMOKE_TIMEOUT: Duration = Duration::from_secs(30);
/// 0xC0000135 STATUS_DLL_NOT_FOUND：无 N 卡机器的实测失败形态——加载器直接失败
/// （nvcuda.dll 缺失）、stderr 全空（2026-10-07 真机取值）
const STATUS_DLL_NOT_FOUND: i32 = -1073741515;

/// GPU 后端状态（UI BackendBadge 数据源；TS 侧 `WhisperBackendStatus` 双写）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperBackendStatus {
    pub cuda_installed: bool,
    pub gpu_available: bool,
    /// 不可用原因（已安装但冒烟失败时给出）
    pub reason: Option<String>,
}

/// 后端选择纯逻辑（可测）。
#[derive(Debug, PartialEq, Eq)]
enum BackendDecision {
    UseGpu,
    UseCpu,
    /// 已装加速包但试跑失败 → 回退并携带原因
    UseCpuFallback,
}

fn decide_backend(setting: &str, cuda_installed: bool, smoke_ok: bool) -> BackendDecision {
    match setting {
        "cpu" => BackendDecision::UseCpu,
        _ if !cuda_installed => BackendDecision::UseCpu,
        _ if smoke_ok => BackendDecision::UseGpu,
        _ => BackendDecision::UseCpuFallback,
    }
}

/// 失败原因可判读化（NFR-004 口径）：无 N 卡 = 加载器失败（0xC0000135、无输出）
fn gpu_failure_reason(exit_code: Option<i32>, stderr_tail: &str) -> String {
    if exit_code == Some(STATUS_DLL_NOT_FOUND) {
        return "未检测到 NVIDIA 驱动/CUDA 运行库，本机无法使用 GPU 加速".to_string();
    }
    if !stderr_tail.trim().is_empty() {
        return stderr_tail.trim().to_string();
    }
    match exit_code {
        Some(code) => format!("whisper-cli(GPU) 异常退出（code {code}）"),
        None => "whisper-cli(GPU) 未能启动".to_string(),
    }
}

/// GPU 试跑冒烟（照抄 M3 硬件编码器先例）：生成 0.3s 静音 wav，用内置 tiny 真跑
/// 一次推理（CUDA 初始化发生在模型加载，静音输入即可覆盖），30s 超时判失败。
fn smoke_gpu(gpu_exe: &Path, model: &Path, vad: &Path, ffmpeg: &Path) -> Result<(), String> {
    let token = temp_token("gpu-probe");
    let tmp = std::env::temp_dir().join(format!("vc-gpu-probe-{token}.wav"));
    let out_base = std::env::temp_dir().join(format!("vc-gpu-probe-{token}"));
    let cleanup = || {
        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(out_base.with_extension("srt"));
    };

    // 探测音频：0.3s 静音（lavfi，无输入依赖）
    let mut gen = Command::new(ffmpeg);
    command::spawn_hidden(&mut gen);
    let gen_ok = gen
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=16000:cl=mono",
            "-t",
            "0.3",
            "-c:a",
            "pcm_s16le",
        ])
        .arg(&tmp)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !gen_ok {
        return Err("探测音频生成失败".to_string());
    }

    let args = whisper_cli_args(
        &model.to_string_lossy(),
        Some(&vad.to_string_lossy()),
        &tmp.to_string_lossy(),
        &out_base.to_string_lossy(),
        "auto",
        transcribe_threads(),
    );
    let mut spawn_cmd = Command::new(gpu_exe);
    command::spawn_hidden(&mut spawn_cmd);
    let mut child = match spawn_cmd
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            cleanup();
            return Err(format!("无法启动 GPU 版 whisper-cli：{e}"));
        }
    };
    // stderr 尾部收集（后台线程，失败原因来源）
    let stderr_tail = Arc::new(parking_lot::Mutex::new(String::new()));
    if let Some(stderr) = child.stderr.take() {
        let t = stderr_tail.clone();
        std::thread::spawn(move || {
            let mut s = String::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                s.push_str(&line);
                s.push('\n');
                if s.len() > 8192 {
                    break;
                }
            }
            *t.lock() = s;
        });
    }
    let deadline = Instant::now() + GPU_SMOKE_TIMEOUT;
    let exit_code = loop {
        match child.try_wait() {
            Ok(Some(st)) => break st.code(),
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                cleanup();
                return Err("GPU 推理超时（30s）".to_string());
            }
            Err(e) => {
                cleanup();
                return Err(format!("等待 GPU 推理失败：{e}"));
            }
        }
    };
    cleanup();
    let tail = stderr_tail.lock().clone();
    if exit_code == Some(0) {
        Ok(())
    } else {
        Err(gpu_failure_reason(exit_code, &tail))
    }
}

/// 打开模型文件夹（FR-391 手动放置逃生舱的引导）：目录不存在则先创建再打开，
/// 用户即可把自行下载的模型文件（如 `ggml-small-q5_1.bin`）放进来。
#[tauri::command]
pub fn open_models_dir(app: AppHandle) -> Result<(), String> {
    let dir = download_models_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建模型目录：{e}"))?;
    tauri_plugin_opener::open_path(&dir, None::<&str>)
        .map_err(|e| format!("打开模型文件夹失败：{e}"))
}

/// 探测 GPU 后端状态（FR-391，BackendBadge / 设置页消费）。未下载加速包 =
/// `cuda_installed: false`（无 reason——这是正常状态不是失败）。
#[tauri::command]
pub fn probe_whisper_backend(app: AppHandle) -> Result<WhisperBackendStatus, String> {
    let exe = cuda_dir(&app)?.join("whisper-cli.exe");
    if !exe.exists() {
        return Ok(WhisperBackendStatus {
            cuda_installed: false,
            gpu_available: false,
            reason: None,
        });
    }
    let model = resource_models_dir(&app)?.join("ggml-tiny-q5_1.bin");
    let vad = resource_models_dir(&app)?.join(VAD_FILE_NAME);
    let ffmpeg = command::resolve_sidecar("ffmpeg")?;
    match smoke_gpu(&exe, &model, &vad, &ffmpeg) {
        Ok(()) => Ok(WhisperBackendStatus {
            cuda_installed: true,
            gpu_available: true,
            reason: None,
        }),
        Err(reason) => Ok(WhisperBackendStatus {
            cuda_installed: true,
            gpu_available: false,
            reason: Some(reason),
        }),
    }
}

/// 提交 AI 字幕转写任务（M18-5）：模型解析 → 两阶段作业（音频提取 0~5% → whisper
/// 转写 5~100%）→ `.part.srt` 原子落位 `<output_dir>/<源同名>.srt`（防覆盖命名）。
/// `backend` = "auto"（GPU 已装且试跑通过则用，失败回退 CPU，ADR-041②）或 "cpu"。
#[allow(clippy::too_many_arguments)]
pub(crate) fn submit_subtitle(
    app: AppHandle,
    state: &State<'_, AppTasks>,
    input: String,
    model_id: String,
    language: String,
    backend: String,
    output_dir: String,
) -> Result<String, String> {
    // 模型解析（`ADR-042`②）：tiny → resource；白名单下载档 → models 已知名；
    // 其余 id → models 目录文件名（自定义模型）。不存在即拒绝，UI 引导下载。
    let (model_path, bundled) = resolve_model_path(
        &resource_models_dir(&app)?,
        &download_models_dir(&app)?,
        &model_id,
    )?;
    if !model_path.exists() {
        return Err(if bundled {
            "内置模型缺失（安装不完整），请重新安装应用".to_string()
        } else {
            format!("模型「{model_id}」未下载，请先在模型列表下载或手动放置")
        });
    }
    // VAD 模型随包（FR-392 强制预切分），缺失 = 安装不完整
    let vad_path = resource_models_dir(&app)?.join(VAD_FILE_NAME);
    if !vad_path.exists() {
        return Err("VAD 模型缺失（安装不完整），请重新安装应用".to_string());
    }

    let input_path = Path::new(&input);
    if !input_path.exists() {
        return Err(format!("输入文件不存在：{input}"));
    }
    let Some(stem) = input_path.file_stem().and_then(|s| s.to_str()) else {
        return Err("输入文件名无效".to_string());
    };
    let out_dir = Path::new(&output_dir);
    std::fs::create_dir_all(out_dir).map_err(|e| format!("无法创建输出目录：{e}"))?;
    let final_srt = reserve_srt_output(out_dir, stem)?;

    // wav 临时文件与转写半成品都在 `<app_cache_dir>/whisper/`，任务终了删除（FR-392）
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法定位缓存目录：{e}"))?;
    let whisper_tmp = cache.join("whisper");
    std::fs::create_dir_all(&whisper_tmp).map_err(|e| format!("无法创建临时目录：{e}"))?;
    let token = temp_token(&input);
    let wav = whisper_tmp.join(format!("{token}.wav"));
    // whisper-cli 的 `-of` 取基名（无扩展名），产物 = `<base>.srt`
    let srt_base = whisper_tmp.join(&token);

    let ffmpeg = command::resolve_sidecar("ffmpeg")?;
    let ffprobe = command::resolve_sidecar("ffprobe")?;
    let total_sec = probe::probe_duration_sync(&ffprobe, &input).unwrap_or(0.0);
    // 后端选择的两个候选（M18-6）：CPU sidecar + CUDA 加速包 exe（未下载则 None）
    let cpu_exe = command::resolve_sidecar("whisper-cli")?;
    let cuda_exe = cuda_dir(&app).ok().map(|d| d.join("whisper-cli.exe"));

    let job_model = model_path.to_string_lossy().into_owned();
    let job_vad = vad_path.to_string_lossy().into_owned();
    let job_wav = wav.to_string_lossy().into_owned();
    let job_srt_base = srt_base.to_string_lossy().into_owned();
    let job_final = final_srt.clone();
    let job_input = input.clone();
    let job_lang = language;
    let job_backend = backend;
    let job_cpu_exe = cpu_exe.to_string_lossy().into_owned();
    let job_cuda_exe = cuda_exe.map(|p| p.to_string_lossy().into_owned());
    let label = format!(
        "AI 字幕 {} → {}",
        file_name(&input),
        final_srt
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("字幕")
    );

    let job: Job = Box::new(move |ctx: &TaskContext| {
        let produced = PathBuf::from(format!("{job_srt_base}.srt"));
        let result = (|| -> Result<(), String> {
            // 阶段一：提取音频（映射总进度 0~5%）
            let throttle = ProgressThrottle::new();
            worker::run_ffmpeg(
                ctx,
                &ffmpeg,
                &command::extract_audio_args(&job_input, &job_wav),
                total_sec,
                &|local, speed| {
                    if throttle.update(local * 0.05) {
                        ctx.set_progress(local * 0.05, speed);
                    }
                },
            )?;
            if ctx.is_cancelled() {
                return Err("已取消".into());
            }
            // 阶段二：whisper 转写（5~100%，stderr `-pp` 进度，ADR-041）。
            // 后端选择（M18-6，ADR-041②）：auto 且已装加速包 → 试跑冒烟真跑一次，
            // 通过走 GPU、失败回退 CPU（原因入日志，UI 徽标经 probe 命令同口径）。
            let cuda_installed = job_cuda_exe
                .as_ref()
                .map(|p| Path::new(p).exists())
                .unwrap_or(false);
            let need_smoke = job_backend != "cpu" && cuda_installed;
            let (smoke_ok, fallback_reason) = if need_smoke {
                let cuda = job_cuda_exe.clone().unwrap();
                match smoke_gpu(
                    Path::new(&cuda),
                    Path::new(&job_model),
                    Path::new(&job_vad),
                    &ffmpeg,
                ) {
                    Ok(()) => (true, None),
                    Err(reason) => (false, Some(reason)),
                }
            } else {
                (false, None)
            };
            let (whisper_exe, fallback) =
                match decide_backend(&job_backend, cuda_installed, smoke_ok) {
                    BackendDecision::UseGpu => (job_cuda_exe.clone().unwrap(), None),
                    BackendDecision::UseCpuFallback => (job_cpu_exe.clone(), fallback_reason),
                    BackendDecision::UseCpu => (job_cpu_exe.clone(), None),
                };
            if let Some(reason) = &fallback {
                log::warn!("GPU 不可用，本次转写回退 CPU：{reason}");
            }
            run_whisper(
                ctx,
                Path::new(&whisper_exe),
                &job_model,
                Some(&job_vad),
                &job_wav,
                &job_srt_base,
                &job_lang,
                &|p| ctx.set_progress(0.05 + 0.90 * p, None),
            )?;
            // VAD 空结果回退（真机缺陷 2026-10-07，用户报告"识别出 0KB"）：唱歌/重
            // BGM 内容会被 silero 误判为零语音段（实测 `Final speech segments: 0`、
            // whisper 退出 0 但 srt 为空）→ 回退一次无 VAD 全量转写；真静音素材回退
            // 后仍为空 srt，属正确结果。同名 `-of` 截断重写已实测。
            if !produced.exists() || std::fs::metadata(&produced).map(|m| m.len()).unwrap_or(0) == 0
            {
                log::warn!("VAD 未检出语音段，回退无 VAD 全量转写");
                run_whisper(
                    ctx,
                    Path::new(&whisper_exe),
                    &job_model,
                    None,
                    &job_wav,
                    &job_srt_base,
                    &job_lang,
                    &|p| ctx.set_progress(0.05 + 0.90 * p + 0.04, None),
                )?;
            }
            // 落位：`.part.srt` → 最终产物（原子替换，`BUG-002` 同口径）
            if !produced.exists() {
                return Err("转写完成但未产出字幕文件".to_string());
            }
            fs::atomic_replace(&produced, &job_final)?;
            ctx.add_output(job_final.to_string_lossy().into_owned());
            Ok(())
        })();
        // 任务终了清理（FR-392）：wav 与转写半成品（转写半成品无续传价值，取消/失败一并删）
        let _ = std::fs::remove_file(&job_wav);
        if result.is_err() {
            let _ = std::fs::remove_file(&produced);
        }
        result
    });

    let emitter = Arc::new(TauriEmitter(app.clone()));
    Ok(state.0.submit(emitter, "subtitle", &label, job))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_is_closed_whitelist_of_quantized_tiers() {
        // ADR-039⑦：三档量化白名单（tiny 内置 + small / large-v3-turbo 下载），无 F16 / base
        let ids: Vec<_> = MODELS.iter().map(|m| m.id).collect();
        assert_eq!(ids, ["tiny", "small", "large-v3-turbo"]);
        assert!(MODELS[0].bundled, "tiny 必须是内置默认档");
        assert!(MODELS[1..].iter().all(|m| !m.bundled));
        assert!(
            MODELS.iter().all(|m| m.file_name.contains("q5_")),
            "白名单只收量化档：{ids:?}"
        );
    }

    #[test]
    fn catalog_specs_have_hash_and_urls_where_needed() {
        for m in MODELS {
            assert_eq!(m.sha256.len(), 64, "{} 的 SHA256 不是 64 位十六进制", m.id);
            assert!(m.size_bytes > 0);
            if m.bundled {
                assert!(m.urls.is_empty(), "内置模型不应有下载源");
            } else {
                assert!(
                    m.urls[0].starts_with("https://hf-mirror.com/"),
                    "镜像优先（ADR-040）"
                );
                assert!(m.urls[1].starts_with("https://huggingface.co/"));
            }
        }
        assert!(CUDA_ZIP.0.starts_with("https://github.com/"));
        assert_eq!(CUDA_ZIP.2.len(), 64);
    }

    #[test]
    fn keep_zip_entry_filters_sample_executables() {
        assert!(keep_zip_entry("Release/whisper-cli.exe"));
        assert!(keep_zip_entry("Release/cublas64_12.dll"));
        assert!(!keep_zip_entry("Release/bench.exe"));
        assert!(!keep_zip_entry("Release/whisper-server.exe"));
        assert!(!keep_zip_entry("Release/README"));
    }

    #[test]
    fn decide_backend_matches_adr_041_matrix() {
        use BackendDecision::*;
        // 强制 cpu：永远 CPU
        assert_eq!(decide_backend("cpu", true, true), UseCpu);
        assert_eq!(decide_backend("cpu", false, false), UseCpu);
        // auto + 未装加速包：CPU（无回退语义——未装是正常状态）
        assert_eq!(decide_backend("auto", false, false), UseCpu);
        // auto + 已装 + 冒烟通过：GPU
        assert_eq!(decide_backend("auto", true, true), UseGpu);
        // auto + 已装 + 冒烟失败：回退 CPU
        assert_eq!(decide_backend("auto", true, false), UseCpuFallback);
    }

    #[test]
    fn gpu_failure_reason_is_actionable() {
        // 真机实测形态：无 N 卡 → 0xC0000135 且 stderr 全空
        assert_eq!(
            gpu_failure_reason(Some(STATUS_DLL_NOT_FOUND), ""),
            "未检测到 NVIDIA 驱动/CUDA 运行库，本机无法使用 GPU 加速"
        );
        // 有 stderr：原样透传（可判读）
        assert_eq!(
            gpu_failure_reason(Some(1), "cuda error: out of memory"),
            "cuda error: out of memory"
        );
        // 无输出其他退出码：带 code
        assert!(gpu_failure_reason(Some(-1), "").contains("code -1"));
    }

    #[test]
    fn scan_custom_models_lists_only_foreign_bin_files() {
        // ADR-042①：白名单文件名之外的 *.bin 动态列出；非 bin 与半成品不命中
        let d = std::env::temp_dir().join(format!("vc-scan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("ggml-small-q5_1.bin"), b"curated").unwrap(); // 白名单 → 排除
        std::fs::write(d.join("ggml-large-v3-turbo.bin"), b"custom-f16").unwrap();
        std::fs::write(d.join("ggml-small-q5_1.bin.part.t9"), b"part").unwrap();
        std::fs::write(d.join("notes.txt"), b"not a model").unwrap();
        std::fs::create_dir_all(d.join("subdir")).unwrap();
        std::fs::write(d.join("subdir").join("nested.bin"), b"nested").unwrap();

        let got = scan_custom_models(&d, &["ggml-small-q5_1.bin"]);
        assert_eq!(got.len(), 1, "只应列出 1 个自定义模型：{got:?}");
        let m = &got[0];
        assert_eq!(m.file_name, "ggml-large-v3-turbo.bin");
        assert!(m.custom && m.ready && !m.bundled);
        assert_eq!(m.label, "ggml-large-v3-turbo");
        assert_eq!(m.size_bytes, "custom-f16".len() as u64);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn resolve_model_path_rejects_traversal_and_maps_tiers() {
        let res = Path::new("/res/models");
        let dir = Path::new("/cache/models");

        // tiny → resource 内置
        let (p, bundled) = resolve_model_path(res, dir, "tiny").unwrap();
        assert!(bundled);
        assert_eq!(p, res.join("ggml-tiny-q5_1.bin"));

        // 白名单下载档 → models 已知文件名
        let (p, bundled) = resolve_model_path(res, dir, "small").unwrap();
        assert!(!bundled);
        assert_eq!(p, dir.join("ggml-small-q5_1.bin"));

        // 自定义：id 即文件名
        let (p, bundled) = resolve_model_path(res, dir, "ggml-large-v3-turbo.bin").unwrap();
        assert!(!bundled);
        assert_eq!(p, dir.join("ggml-large-v3-turbo.bin"));

        // 路径穿越 / 目录分隔符 / 非 bin 一律拒绝
        assert!(resolve_model_path(res, dir, "../../etc/passwd.bin").is_err());
        assert!(resolve_model_path(res, dir, "a/b.bin").is_err());
        assert!(resolve_model_path(res, dir, "a\\b.bin").is_err());
        assert!(resolve_model_path(res, dir, "model.txt").is_err());
    }

    #[test]
    fn parse_whisper_progress_extracts_percent_lines() {
        // ADR-041：`-pp` 行格式实测（spire/whisper 1.8.4，百分号前可有空格）
        assert_eq!(
            parse_whisper_progress("whisper_print_progress_callback: progress =  73%"),
            Some(0.73)
        );
        assert_eq!(parse_whisper_progress("progress = 100%"), Some(1.0));
        assert_eq!(parse_whisper_progress("progress = 0%"), Some(0.0));
        assert_eq!(parse_whisper_progress("其他日志行"), None);
        assert_eq!(parse_whisper_progress("progress = abc%"), None);
    }

    #[test]
    fn whisper_cli_args_follow_vad_mandatory_spec() {
        // FR-392 强制 VAD 预切分（--vad -vm）+ ADR-041 stderr 进度（-pp）——全序列逐字断言
        assert_eq!(
            whisper_cli_args(
                "C:\\models\\tiny.bin",
                Some("C:\\models\\silero.bin"),
                "C:\\cache\\whisper\\t1.wav",
                "C:\\cache\\whisper\\t1",
                "auto",
                8,
            ),
            vec![
                "-m",
                "C:\\models\\tiny.bin",
                "-f",
                "C:\\cache\\whisper\\t1.wav",
                "--vad",
                "-vm",
                "C:\\models\\silero.bin",
                "-osrt",
                "-of",
                "C:\\cache\\whisper\\t1",
                "-l",
                "auto",
                "-t",
                "8",
                "-pp",
            ]
        );
        // None = 无 VAD 全量转写（VAD 空结果回退路径，2026-10-07 用户报告 0KB 后引入）
        assert_eq!(
            whisper_cli_args("m.bin", None, "a.wav", "a", "auto", 4),
            vec![
                "-m", "m.bin", "-f", "a.wav", "-osrt", "-of", "a", "-l", "auto", "-t", "4", "-pp",
            ]
        );
    }

    #[test]
    fn reserve_srt_output_appends_timestamp_only_on_conflict() {
        let dir = std::env::temp_dir().join(format!("vc-srt-name-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // 无冲突：直接用原名
        let first = reserve_srt_output(&dir, "video").unwrap();
        assert_eq!(first.file_name().unwrap().to_str(), Some("video.srt"));

        // 冲突：追加时间戳（决策 #19）；同秒内再冲突：序号 _2
        std::fs::write(&first, b"x").unwrap();
        let second = reserve_srt_output(&dir, "video").unwrap();
        let name2 = second.file_name().unwrap().to_str().unwrap().to_string();
        assert!(
            name2.starts_with("video_") && name2.ends_with(".srt"),
            "时间戳命名：{name2}"
        );
        std::fs::write(&second, b"x").unwrap();
        let third = reserve_srt_output(&dir, "video").unwrap();
        let name3 = third.file_name().unwrap().to_str().unwrap().to_string();
        assert_ne!(name2, name3, "同秒再冲突应序号递增：{name3}");
        assert!(name3.contains("_2"), "第二个冲突应为 _2：{name3}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---------- 下载内核（本地 HTTP 服务器，无外网依赖） ----------

    use std::io::Read as _;
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    /// 确定性测试载荷
    fn test_body(len: usize, salt: u8) -> Vec<u8> {
        (0..len)
            .map(|i| ((i as u64 * 31 + salt as u64) % 251) as u8)
            .collect()
    }

    fn sha_hex(bytes: &[u8]) -> String {
        let mut h = Sha256::new();
        h.update(bytes);
        format!("{:x}", h.finalize())
    }

    /// 极简 HTTP 服务器：支持 Range 断点续传（206）。返回端口号。
    /// `saw_range` 记录是否收到过 Range 请求头。
    fn spawn_http_server(
        body: Arc<Vec<u8>>,
        hits: Arc<AtomicUsize>,
        saw_range: Arc<AtomicBool>,
    ) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").expect("绑定测试端口失败");
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut stream = stream;
                let mut head = Vec::new();
                let mut byte = [0u8; 1];
                loop {
                    match stream.read(&mut byte) {
                        Ok(1) => {
                            head.push(byte[0]);
                            if head.ends_with(b"\r\n\r\n") {
                                break;
                            }
                        }
                        _ => break,
                    }
                }
                let head = String::from_utf8_lossy(&head).into_owned();
                hits.fetch_add(1, Ordering::SeqCst);
                // hyper 发的请求头是小写的（"range: bytes=…"），大小写不敏感解析
                let range_start = head.lines().find_map(|l| {
                    let lower = l.to_ascii_lowercase();
                    let value = lower.strip_prefix("range: bytes=")?;
                    value.trim().trim_end_matches('-').parse::<usize>().ok()
                });
                if range_start.is_some() {
                    saw_range.store(true, Ordering::SeqCst);
                }
                let (status, slice) = match range_start {
                    Some(n) if n < body.len() => ("206 Partial Content", &body[n..]),
                    _ => ("200 OK", &body[..]),
                };
                let resp = format!(
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    slice.len()
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.write_all(slice);
            }
        });
        port
    }

    fn no_cancel() -> bool {
        false
    }
    fn no_report(_p: f64) {}

    #[test]
    fn download_job_succeeds_and_atomic_replaces() {
        let body = Arc::new(test_body(1024 * 1024, 7));
        let port = spawn_http_server(
            body.clone(),
            Arc::new(AtomicUsize::new(0)),
            Arc::new(AtomicBool::new(false)),
        );
        let dir = std::env::temp_dir().join(format!("vc-dl-ok-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let part = dir.join("model.bin.part.t1");
        let final_path = dir.join("model.bin");
        let urls = vec![format!("http://127.0.0.1:{port}/model.bin")];

        download_job(
            &no_cancel,
            &no_report,
            &urls,
            &part,
            &final_path,
            &sha_hex(&body),
            body.len() as u64,
        )
        .expect("下载应成功");

        assert_eq!(std::fs::read(&final_path).unwrap(), *body, "落位内容一致");
        assert!(!part.exists(), ".part 应已原子改名消失");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn download_job_resumes_from_part_via_range() {
        let body = Arc::new(test_body(1024 * 1024, 9));
        let hits = Arc::new(AtomicUsize::new(0));
        let saw_range = Arc::new(AtomicBool::new(false));
        let port = spawn_http_server(body.clone(), hits.clone(), saw_range.clone());
        let dir = std::env::temp_dir().join(format!("vc-dl-resume-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let part = dir.join("model.bin.part.t2");
        let final_path = dir.join("model.bin");
        let half = body.len() / 2;
        std::fs::write(&part, &body[..half]).unwrap();
        let urls = vec![format!("http://127.0.0.1:{port}/model.bin")];

        download_job(
            &no_cancel,
            &no_report,
            &urls,
            &part,
            &final_path,
            &sha_hex(&body),
            body.len() as u64,
        )
        .expect("断点续传后应下载成功");

        assert!(
            saw_range.load(Ordering::SeqCst),
            "必须发送 Range 头（ADR-040）"
        );
        assert_eq!(hits.load(Ordering::SeqCst), 1, "一次传输应只建一个连接");
        assert_eq!(std::fs::read(&final_path).unwrap(), *body, "拼接内容完整");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn download_job_hash_mismatch_deletes_part() {
        let body = Arc::new(test_body(64 * 1024, 3));
        let port = spawn_http_server(
            body.clone(),
            Arc::new(AtomicUsize::new(0)),
            Arc::new(AtomicBool::new(false)),
        );
        let dir = std::env::temp_dir().join(format!("vc-dl-hash-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let part = dir.join("model.bin.part.t3");
        let final_path = dir.join("model.bin");
        let urls = vec![format!("http://127.0.0.1:{port}/model.bin")];
        // 期望哈希 = 另一份同长内容的哈希 → 必然不符（ADR-039⑤ 校验表的价值）
        let wrong_sha = sha_hex(&test_body(64 * 1024, 4));

        let err = download_job(
            &no_cancel,
            &no_report,
            &urls,
            &part,
            &final_path,
            &wrong_sha,
            body.len() as u64,
        )
        .expect_err("哈希不符必须失败");

        assert!(err.contains("SHA256"), "错误应可判读：{err}");
        assert!(!part.exists(), "损坏半成品应被删除");
        assert!(!final_path.exists(), "坏文件不得落位");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn download_job_cancel_keeps_part_for_resume() {
        let body = Arc::new(test_body(64 * 1024, 5));
        let port = spawn_http_server(
            body.clone(),
            Arc::new(AtomicUsize::new(0)),
            Arc::new(AtomicBool::new(false)),
        );
        let dir = std::env::temp_dir().join(format!("vc-dl-cancel-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let part = dir.join("model.bin.part.t4");
        let final_path = dir.join("model.bin");
        let urls = vec![format!("http://127.0.0.1:{port}/model.bin")];
        let always_cancel = || true;

        let err = download_job(
            &always_cancel,
            &no_report,
            &urls,
            &part,
            &final_path,
            &sha_hex(&body),
            body.len() as u64,
        )
        .expect_err("取消必须以错误收场");

        assert!(err.contains("已取消"), "错误应可判读：{err}");
        assert!(part.exists(), "取消后 .part 保留（续传语义，ADR-040）");
        assert!(!final_path.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
