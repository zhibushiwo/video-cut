/** 时间格式化与解析。全程 f64 秒流转，仅展示层格式化（DESIGN §5.2/§15-12）。 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 秒 → HH:MM:SS(.mmm) */
export function formatTime(sec: number, withMs = true): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const whole = Math.floor(s % 60);
  const base = `${pad2(h)}:${pad2(m)}:${pad2(whole)}`;
  if (!withMs) return base;
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${base}.${String(ms % 1000).padStart(3, "0")}`;
}

/** HH:MM:SS.mmm → 秒；非法返回 null */
export function parseTime(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3}):([0-5]?\d):([0-5]?\d)(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const ms = m[4] ? Number(m[4].padEnd(3, "0")) / 1000 : 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms;
}

/** 字节数 → 人类可读（GB/MB） */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

/** 比特率 → Mbps/Kbps */
export function formatBitrate(bitsPerSec: number): string {
  if (bitsPerSec >= 1e6) return `${(bitsPerSec / 1e6).toFixed(1)} Mbps`;
  return `${Math.round(bitsPerSec / 1e3)} Kbps`;
}

/** 导出文件名用的时间戳：yyyyMMdd_HHmmss */
export function fileTimestamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}

/** 输出名防覆盖：在扩展名前插入时间戳（merged.mp4 → merged_20260913_153001.mp4） */
export function withFileTimestamp(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : ".mp4";
  return `${stem}_${fileTimestamp()}${ext}`;
}
