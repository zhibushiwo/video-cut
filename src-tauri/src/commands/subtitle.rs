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

use std::io::{Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

use crate::fs;
use crate::task::manager::{Job, TaskContext, TauriEmitter};
use crate::{AppTasks, TaskStatus};

use super::{require_disk_space, temp_token, ProgressThrottle};

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
    Ok(MODELS
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
                ready,
                path: ready.then(|| path.to_string_lossy().into_owned()),
            }
        })
        .collect())
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
    let spec = find_spec(&model_id)?;
    if spec.bundled {
        return Err("内置模型不可删除".to_string());
    }
    let dir = download_models_dir(&app)?;
    let final_path = dir.join(spec.file_name);
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
            if name.starts_with(&format!("{}.part.", spec.file_name)) {
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
