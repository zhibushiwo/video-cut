/** 媒体信息相关的展示与判定逻辑（DESIGN §3.7、§10）。 */
import type { MediaInfo, ProxyMode } from "../types";

/** WebView2 原生可播的视频编码 */
const NATIVE_VIDEO = new Set(["h264", "vp8", "vp9", "av1"]);
/** WebView2 原生可播的音频编码 */
const NATIVE_AUDIO = new Set(["aac", "mp3", "opus", "flac", "vorbis"]);

/**
 * 是否需要代理预览：视频编码 / 像素格式 / 音频编码任一不被 WebView2 支持时。
 * 该判定只影响预览，处理始终使用原始文件（DESIGN §3.7）。
 */
export function needsProxy(info: MediaInfo): boolean {
  const videoOk =
    NATIVE_VIDEO.has(info.video.codec.toLowerCase()) &&
    info.video.pixFmt.toLowerCase() === "yuv420p";
  const audioOk = info.audio.every((a) => NATIVE_AUDIO.has(a.codec.toLowerCase()));
  return !(videoOk && audioOk);
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
  if (info.audio.length === 0) return null;
  const first = info.audio[0];
  const layout = first.channels >= 6 ? "5.1" : first.channels === 2 ? "立体声" : first.channels === 1 ? "单声道" : `${first.channels}声道`;
  const base = `${first.codec.toUpperCase()} ${Math.round(first.sampleRate / 100) / 10}kHz ${layout}`;
  return info.audio.length > 1 ? `${base} +${info.audio.length - 1}` : base;
}
