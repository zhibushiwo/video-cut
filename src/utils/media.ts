/** 媒体信息相关的展示与判定逻辑（DESIGN §3.7、§10）。 */
import type { MediaInfo, ProxyMode } from "../types";

/** WebView2 原生可播的视频编码 */
const NATIVE_VIDEO = new Set(["h264", "vp8", "vp9", "av1"]);
/** WebView2 原生可播的音频编码 */
const NATIVE_AUDIO = new Set(["aac", "mp3", "opus", "flac", "vorbis"]);

/**
 * WebView2 原生可播的容器，按 **ffprobe `format_name` 的解复用器名**比对（不是扩展名）。
 *
 * `format_name` 是**逗号分隔的候选解复用器列表**，且只看内容、与文件扩展名无关
 * （实测：mp4/mov/m4v → `mov,mp4,m4a,3gp,3g2,mj2`；mkv/webm → `matroska,webm`；
 * avi → `avi`；flv → `flv`；ts → `mpegts`；wmv → `asf`；把 asf 内容改名成 .mp4 仍是 `asf`），
 * 所以必须**逐项**比对而不是整串相等。收录范围 = ISO-BMFF/QuickTime 家族 + Matroska 家族。
 *
 * 与 `services/tauri.ts` 的 `VIDEO_EXTENSIONS` 是**两个不同的口径**：那个按**扩展名**描述"能处理的
 * 容器"（交给 FFmpeg，含 avi/flv/ts/wmv），这里按**解复用器名**描述"能直接播的容器"——前者的容器
 * 集合是后者的超集，但取值命名空间不同，实现上不可互相复用。
 *
 * 注：这些令牌在当前 ffprobe 输出里**成族同现**（ISO-BMFF 族必带 `mov`、Matroska 族必带 `matroska`），
 * 理论上只留这两个也够；保留完整族列表是为了让"容器 ↔ 扩展名"的对应一眼可见，并防 ffprobe 将来只报单个名字。
 */
const NATIVE_CONTAINERS = new Set([
  "mov",
  "mp4",
  "m4a",
  "3gp",
  "3g2",
  "mj2", // ISO-BMFF / QuickTime 家族（MP4 / MOV / M4V）
  "matroska",
  "webm", // Matroska 家族（MKV / WebM）
]);

/**
 * 容器能否被 WebView2 直接播放（DESIGN §10）。
 *
 * 取列表**首位**：ffprobe 的候选按匹配度排序，首位即它实际选中的解复用器（实测九种容器的首位
 * 依次是 `mov`/`mov`/`mov`/`matroska`/`matroska`/`avi`/`flv`/`mpegts`/`asf`，与扩展名一一对应）。
 * 判不出来的一律 false —— 空串、`unknown`、首位不在白名单（含理论上跨族同现的列表）：宁可多生成
 * 一次代理，也不让用户面对黑屏。
 * 导出仅为 TC-024 测试矩阵提供用例入口（`T-004`），生产路径经 `needsProxy` 使用。
 */
export function containerPlayable(container: string): boolean {
  const [primary = ""] = container.toLowerCase().split(",");
  return NATIVE_CONTAINERS.has(primary.trim());
}

/**
 * 是否需要代理预览：**容器** / 视频编码 / 像素格式 / 音频编码任一不被 WebView2 支持时
 * （DESIGN §10 的判定规格）。容器维度不可省——H.264+AAC 装进 AVI/FLV/TS/WMV 时编码全"原生可播"，
 * 但 `<video>` 播不了这些容器（`BUG-006`）。
 * 该判定只影响预览，处理始终使用原始文件（DESIGN §3.7）。
 */
export function needsProxy(info: MediaInfo): boolean {
  const videoOk =
    NATIVE_VIDEO.has(info.video.codec.toLowerCase()) &&
    info.video.pixFmt.toLowerCase() === "yuv420p";
  const audioOk = info.audio.every((a) => NATIVE_AUDIO.has(a.codec.toLowerCase()));
  return !(containerPlayable(info.container) && videoOk && audioOk);
}

/**
 * 结合设置的三态代理判定（DESIGN §3.7/§10/§12）：
 * off = 从不生成（不支持格式的画面显示占位提示）；always = 强制代理；
 * auto = 按格式支持性按需生成。
 */
export function wantsProxy(info: MediaInfo, mode: ProxyMode): boolean {
  if (mode === "off") return false;
  return mode === "always" || needsProxy(info);
}

/** 视频摘要行：H.264 · 1920×1080 · 60fps */
export function videoSummary(info: MediaInfo): string {
  const fps = info.video.frameRate % 1 === 0
    ? String(Math.round(info.video.frameRate))
    : info.video.frameRate.toFixed(2);
  return `${info.video.codec.toUpperCase()} ${info.video.width}×${info.video.height} ${fps}fps`;
}

/** 音频摘要行：AAC 48kHz 立体声（多轨显示数量） */
export function audioSummary(info: MediaInfo): string | null {
  const first = info.audio[0];
  if (!first) return null;
  const layout = first.channels >= 6 ? "5.1" : first.channels === 2 ? "立体声" : first.channels === 1 ? "单声道" : `${first.channels}声道`;
  const base = `${first.codec.toUpperCase()} ${Math.round(first.sampleRate / 100) / 10}kHz ${layout}`;
  return info.audio.length > 1 ? `${base} +${info.audio.length - 1}` : base;
}
