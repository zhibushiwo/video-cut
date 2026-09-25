import { describe, expect, it } from "vitest";
import {
  FRAME_BUDGET_MS,
  createSpanRecorder,
  formatPerfLine,
  summarize,
} from "./perf";

describe("summarize（最近秩分位 + drop 计数）", () => {
  it("空样本全零", () => {
    expect(summarize([])).toEqual({ frames: 0, p50: 0, p95: 0, max: 0, drops: 0 });
  });

  it("p50/p95/max 按升序最近秩取值", () => {
    // 升序 [5, 8, 10, 12, 20, 100]：p50 = ceil(3)-1 = idx2 → 10；p95 = ceil(5.7)-1 = idx5 → 100
    const s = summarize([5, 100, 10, 8, 20, 12]);
    expect(s.frames).toBe(6);
    expect(s.p50).toBe(10);
    expect(s.p95).toBe(100);
    expect(s.max).toBe(100);
    // drop 阈值 = 16.67 × 1.5 = 25：只有 100 超过
    expect(s.drops).toBe(1);
  });

  it("drop 判定严格大于阈值（恰在 1.5×预算不算）", () => {
    const threshold = FRAME_BUDGET_MS * 1.5;
    expect(summarize([threshold]).drops).toBe(0);
    expect(summarize([threshold + 0.001]).drops).toBe(1);
  });

  it("单样本与自定义预算", () => {
    const s = summarize([42], 20);
    expect(s.p50).toBe(42);
    expect(s.p95).toBe(42);
    expect(s.max).toBe(42);
    expect(s.drops).toBe(1); // 42 > 20×1.5 = 30
  });
});

describe("formatPerfLine（logger 行格式）", () => {
  it("固定字段顺序与小数位", () => {
    expect(formatPerfLine("drag", { frames: 120, p50: 8.34, p95: 16.7, max: 41.24, drops: 3 })).toBe(
      "[perf] scene=drag frames=120 p50=8.3 p95=16.7 max=41.2 drops=3",
    );
  });
});

describe("createSpanRecorder（undo 场景，注入时钟）", () => {
  it("span 记录耗时；窗口满 5s 自动 flush 后窗口重开", () => {
    let now = 0;
    const reports: string[] = [];
    const rec = createSpanRecorder(
      "undo",
      (_scene, s) => reports.push(formatPerfLine("undo", s)),
      () => now,
    );

    now = 0;
    rec.span(() => {
      now = 5;
      return "a";
    }); // 样本 dt=5ms，窗口起点 0
    now = 6000;
    rec.span(() => {
      now = 6004;
      return "b";
    }); // 样本 dt=4ms；t0(6000) − 窗口起点(0) ≥ 5s → flush [5,4]
    expect(reports).toHaveLength(1);
    // n=2 的最近秩：p50 = idx0 → 4；p95/max = idx1 → 5
    expect(reports[0]).toBe("[perf] scene=undo frames=2 p50=4.0 p95=5.0 max=5.0 drops=0");

    now = 6100;
    rec.span(() => now); // 新窗口第一条（窗口起点已重开为 6100），不 flush
    expect(reports).toHaveLength(1);
    rec.flush();
    expect(reports).toHaveLength(2);
    expect(reports[1]).toContain("frames=1");
  });

  it("异常透传且样本入账（finally 保证）", () => {
    const reports: number[] = [];
    let now = 0;
    const rec = createSpanRecorder("undo", (_scene, s) => reports.push(s.frames), () => now);
    rec.span(() => 42); // 样本 1（dt=0），窗口起点 0
    now = 6000;
    expect(() =>
      rec.span(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom"); // t0=6000：finally push 样本 2 → 距窗口起点 ≥5s → flush
    expect(reports).toEqual([2]);
  });
});
