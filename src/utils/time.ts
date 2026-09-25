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

/** 历史记录用：unix ms → 本地 yyyy-MM-dd HH:mm */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

/** 历史记录用：耗时毫秒 → "42 秒" / "3 分 05 秒" */
export function formatDurationMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒`;
  return `${Math.floor(s / 60)} 分 ${pad2(s % 60)} 秒`;
}

/**
 * 无损（stream copy）剪切的**真实入点**：落点是 ≤ start 的最近关键帧（没有则 0）。
 *
 * 界面上的选区值**不等于**实际落点，无损路径只能从关键帧开始（NFR-004 / DESIGN §13：
 * "UI 事先展示实际落点"，不允许剪完才知道偏了）。重编码路径（精确剪切、带变换的片段）
 * 是帧级精确，落点就是入点本身，不要调这个函数。
 *
 * @param start 用户选区入点（秒）
 * @param keyframes `list_keyframes` 返回的关键帧时间点（升序）
 */
export function realCutStart(start: number, keyframes: number[]): number {
  if (keyframes.length === 0) return 0;
  let lo = 0;
  let hi = keyframes.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const kf = keyframes[mid];
    if (kf === undefined) break;
    if (kf <= start) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // 入点早于首个关键帧时，ffmpeg 从文件开头取（首帧必是关键帧）
  if (best < 0) return 0;
  return keyframes[best] ?? 0; // best 由上循环已判空的 kf 赋值，?? 0 仅类型兜底
}

/**
 * 判定"实际落点 vs 选区入点算不算同一时刻"的容差（秒）。
 *
 * 关键帧 pts 会被界面的毫秒格式舍掉尾数（`1.319333` → 显示 `1.319`），这个量级的差
 * 不能被当成"落点不一样"——否则提示会随拖动抖动。
 */
export const REAL_START_EPSILON = 1e-3;

/**
 * 实际落点与选区入点是否存在**实质差异**（值得提示、并按落点算时长）。
 *
 * `Timeline`（落点虚线）/ `CutEditor`（片段时长）/ `Cut`（提示文案）三处必须同口径，
 * 所以判定收在这里，不要再各自写 `Math.abs(...) > 1e-3`。
 *
 * 写成类型谓词，调用处在 `if` / `&&` 内可直接拿到 `number`，不必再各自 `as number` 或判空。
 *
 * @param realStart 真实落点；重编码路径（帧级精确）不适用，传 `undefined`
 * @param startSec 选区入点
 */
export function realStartDiffers(
  realStart: number | undefined,
  startSec: number,
): realStart is number {
  return realStart !== undefined && Math.abs(realStart - startSec) > REAL_START_EPSILON;
}
