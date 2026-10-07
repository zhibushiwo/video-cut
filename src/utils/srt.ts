/**
 * SRT 字幕解析（M18-8，FR-393）：纯函数、无 IPC，vitest 覆盖。
 * 只支持预览所需的"读取与按时间取当前字幕"，不做写入/编辑（§3.9 只读边界）。
 */

export interface SrtCue {
  startSec: number;
  endSec: number;
  /** 多行文本以 \n 连接 */
  text: string;
}

/** "HH:MM:SS,mmm" → 秒；容忍 "." 小数分隔符与省略小时段的 "MM:SS,mmm"。 */
export function parseTimecode(t: string): number | null {
  const full = /^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(t.trim());
  if (full) {
    const h = full[1] ?? "0";
    const m = full[2] ?? "0";
    const s = full[3] ?? "0";
    const ms = full[4] ?? "0";
    // 毫秒精度取整，规避 1.95+…类浮点尾差（预览按 0.001s 对齐足够）
    return Math.round((+h * 3600 + +m * 60 + +s + +ms.padEnd(3, "0") / 1000) * 1000) / 1000;
  }
  const short = /^(\d{1,3}):(\d{2})[,.](\d{1,3})$/.exec(t.trim());
  if (short) {
    const m = short[1] ?? "0";
    const s = short[2] ?? "0";
    const ms = short[3] ?? "0";
    return Math.round((+m * 60 + +s + +ms.padEnd(3, "0") / 1000) * 1000) / 1000;
  }
  return null;
}

/**
 * 解析 SRT 全文：按空行分块，块内找 "-->" 时间行（序号行可有可无——whisper-cli
 * 的 `-osrt` 输出带序号，但要容忍缺序号/多余空行的变体）；时间或结构非法的块跳过。
 */
export function parseSrt(content: string): SrtCue[] {
  const cues: SrtCue[] = [];
  for (const block of content.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const timingIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingIdx === -1) continue;
    const timingLine = lines[timingIdx] ?? "";
    const parts = timingLine.split("-->");
    const startSec = parseTimecode(parts[0] ?? "");
    const endSec = parseTimecode(parts[1] ?? "");
    if (startSec === null || endSec === null || endSec < startSec) continue;
    const text = lines
      .slice(timingIdx + 1)
      .join("\n")
      .trim();
    if (text === "") continue;
    cues.push({ startSec, endSec, text });
  }
  return cues;
}

/** 当前时刻应显示的字幕文本；不在任何区间内返回 null。 */
export function activeCueText(cues: SrtCue[], sec: number): string | null {
  for (const c of cues) {
    if (sec >= c.startSec && sec < c.endSec) return c.text;
  }
  return null;
}
