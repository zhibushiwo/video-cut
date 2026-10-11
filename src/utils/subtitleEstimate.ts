/**
 * 字幕识别耗时估算（M18-14，FR-393 / `AC-393-2`）：视频时长 × 模型系数，**CPU 口径
 * 上界**——GPU 可用时实际显著更快（估算非承诺，UI 明示）。
 *
 * 系数来源（`ADR-039` spike 实测，CPU 8 线程 + VAD，238s 音频）：
 * small 96s → 0.40、large-v3-turbo 439s → 1.85；tiny 未实测，按其相对 small 的
 * 速度量级取 0.15（± 数十秒内的偏差对"约 N 分钟"展示无意义）。
 */

const FALLBACK_FACTOR = 0.4; // 自定义模型按 small 同级估算
const CPU_FACTOR: Record<string, number> = {
  tiny: 0.15,
  small: 0.4,
  "large-v3-turbo": 1.85,
};

/** 模型的 CPU 耗时系数；自定义模型（ADR-042 动态扫描）无从归类，按 small 同级估算 */
export function transcribeFactor(modelId: string): number {
  return CPU_FACTOR[modelId] ?? FALLBACK_FACTOR;
}

/** 预计转写秒数（CPU 口径）；时长非正返回 0 */
export function estimateTranscribeSec(durationSec: number, modelId: string): number {
  if (!(durationSec > 0)) return 0;
  return durationSec * transcribeFactor(modelId);
}

/** 粗粒度展示：「不到 1 分钟」/「约 N 分钟」/「约 X 小时 Y 分钟」；非正数返回「—」 */
export function formatEstimate(sec: number): string {
  if (!(sec > 0)) return "—";
  const min = Math.floor(sec / 60);
  if (min < 1) return "不到 1 分钟";
  if (min < 60) return `约 ${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `约 ${h} 小时` : `约 ${h} 小时 ${m} 分钟`;
}
