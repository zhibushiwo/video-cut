/**
 * 帧时间埋点（plans/M11.md §18.6；M11-9 性能验收取数）。
 *
 * 两个采样器：rAF 帧间隔（`playing`/`drag` 场景——帧预算 16.7ms，超 1.5× 记 drop）与
 * performance.now 手动 span（`undo` 场景——execute/undo/redo 是同步操作，没有"帧"可采）。
 * 两者共用 **5s 窗口汇总**：窗口满或 stop/flush 时回调 `onReport`，由调用方落日志
 * （页面/组件层持 `appendFrontendLog`——utils 不经 IPC，AGENTS §3 第 10 条）。
 * 汇总与格式化是纯函数，Vitest 直测；rAF 循环是薄胶水，不进单测（浏览器才有的 API）。
 */

/** 帧预算（60fps，TIMELINE.md §17.9 预算表） */
export const FRAME_BUDGET_MS = 1000 / 60;

/** 汇总窗口（§18.6：5s 窗口汇总输出） */
const WINDOW_MS = 5000;

/** drop 判定：单个样本超过预算的 1.5 倍（§18.6 drops(>1.5×预算)） */
const DROP_FACTOR = 1.5;

export type PerfScene = "playing" | "drag" | "undo";

export interface PerfSummary {
  /** 样本数（帧数或操作数） */
  frames: number;
  p50: number;
  p95: number;
  max: number;
  drops: number;
}

/**
 * 样本汇总（最近秩分位：升序后取 `ceil(q×n)-1` 下标；n=1 时 p50=p95=max）。
 * drop 阈值 = budgetMs × 1.5（**严格大于**，恰在阈值上不算）。
 */
export function summarize(samples: number[], budgetMs: number = FRAME_BUDGET_MS): PerfSummary {
  const n = samples.length;
  if (n === 0) return { frames: 0, p50: 0, p95: 0, max: 0, drops: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number => {
    const idx = Math.min(n - 1, Math.ceil(q * n) - 1);
    return sorted[idx] ?? 0; // idx 已钳到 [0, n-1]，?? 0 仅类型兜底
  };
  const dropThreshold = budgetMs * DROP_FACTOR;
  let drops = 0;
  for (const s of samples) {
    if (s > dropThreshold) drops++;
  }
  return { frames: n, p50: at(0.5), p95: at(0.95), max: sorted[n - 1] ?? 0, drops }; // n ≥ 1 由提前返回保证，?? 0 仅类型兜底
}

/** logger 行：`[perf] scene=drag frames=120 p50=8.3 p95=16.7 max=41.2 drops=3` */
export function formatPerfLine(scene: PerfScene, s: PerfSummary): string {
  return (
    `[perf] scene=${scene} frames=${s.frames}` +
    ` p50=${s.p50.toFixed(1)} p95=${s.p95.toFixed(1)} max=${s.max.toFixed(1)} drops=${s.drops}`
  );
}

export type PerfReportSink = (scene: PerfScene, s: PerfSummary) => void;

/**
 * rAF 帧间隔采样（`playing` / `drag`）。帧间隔 = 相邻两帧 rAF 时间戳之差（与
 * performance.now 同钟）；每满 5s 窗口或调用返回的 `stop()` 时回调 `onReport`。
 * 同一时刻一个场景只应有一个采样会话；重复 begin 前先 stop 旧的（stop 幂等）。
 */
export function beginFrameSampling(
  scene: Exclude<PerfScene, "undo">,
  onReport: PerfReportSink,
): () => void {
  let raf = 0;
  let stopped = false;
  let last = 0;
  let windowStart: number | null = null; // null = 窗口未开；0 是合法的窗口起点，不能当哨兵
  let deltas: number[] = [];
  const flush = () => {
    if (deltas.length > 0) onReport(scene, summarize(deltas));
    deltas = [];
    windowStart = null;
  };
  const tick = (now: number) => {
    if (stopped) return;
    if (last > 0) {
      if (windowStart === null) windowStart = now;
      deltas.push(now - last);
      if (now - windowStart >= WINDOW_MS) flush();
    }
    last = now;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    flush();
  };
}

/**
 * 手动 span 采样（`undo` 场景）：`span(() => …)` 包住同步操作，耗时样本入 5s 窗口，
 * 窗口满或 `flush()` 时回调 `onReport`。`now` 可注入（单测拨钟）。
 */
export function createSpanRecorder(
  scene: Extract<PerfScene, "undo">,
  onReport: PerfReportSink,
  now: () => number = () => performance.now(),
): { span<T>(fn: () => T): T; flush(): void } {
  let windowStart: number | null = null; // null = 窗口未开；0 是合法的窗口起点，不能当哨兵
  let samples: number[] = [];
  const flush = () => {
    if (samples.length > 0) onReport(scene, summarize(samples));
    samples = [];
    windowStart = null;
  };
  return {
    span(fn) {
      const t0 = now();
      try {
        return fn();
      } finally {
        const dt = now() - t0;
        if (windowStart === null) windowStart = t0;
        samples.push(dt);
        if (t0 - windowStart >= WINDOW_MS) flush();
      }
    },
    flush,
  };
}
