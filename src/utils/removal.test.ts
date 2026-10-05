import { describe, expect, it } from "vitest";
import { MIN_SEG_DURATION_SEC } from "./time";
import {
  complementIntervals,
  normalizeRemovals,
  planRemoval,
  type Interval,
} from "./removal";

/**
 * `TC-047` 自动半（`FR-326` / `AC-326-1`，`M15-1`）：派生链纯函数。
 *
 * 覆盖：归一化（重叠 / 相邻 / 越界 / 负长度 / 非有限值）· 补集（删头 / 删尾 / 中间 / 全删）·
 * 关键帧向上对齐与延伸量 · 碎片吸收与不动点迭代 · 三态门禁 · 随机扫描的互补不变量。
 * 手工半（真机导出核对）见 docs/TESTING.md §3.2 `TC-047`。
 */

/** 60s 源、关键帧每 2s（0,2,…,60）——plans/M15.md §20.1.3 的例子用这套参数 */
function kfEvery2s(): number[] {
  return Array.from({ length: 31 }, (_, i) => i * 2);
}

/** 与 `utils/crop.test.ts` 同款可复现 PRNG（同种子必然同序列） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const base = { durationSec: 60, minKeepSec: MIN_SEG_DURATION_SEC, fps: 30 } as const;

describe("normalizeRemovals（标记归一化）", () => {
  it("裁到 [0, 时长]：负起点贴 0、超尾贴时长", () => {
    expect(
      normalizeRemovals(
        [
          { start: -5, end: 3 },
          { start: 58, end: 70 },
        ],
        60,
      ),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 58, end: 60 },
    ]);
  });

  it("丢弃空段、负长度与非有限值", () => {
    expect(normalizeRemovals([{ start: 5, end: 5 }, { start: 7, end: 4 }], 60)).toEqual([]);
    expect(
      normalizeRemovals(
        [
          { start: Number.NaN, end: 10 },
          { start: 0, end: Number.POSITIVE_INFINITY },
        ],
        60,
      ),
    ).toEqual([]);
  });

  it("合并重叠与相邻（端点相接），但不吞真实间隔（1ms）", () => {
    expect(
      normalizeRemovals([{ start: 10, end: 20 }, { start: 18, end: 25 }], 60),
    ).toEqual([{ start: 10, end: 25 }]);
    expect(
      normalizeRemovals([{ start: 10, end: 20 }, { start: 20, end: 30 }], 60),
    ).toEqual([{ start: 10, end: 30 }]);
    expect(
      normalizeRemovals([{ start: 10, end: 20 }, { start: 20.001, end: 30 }], 60),
    ).toEqual([
      { start: 10, end: 20 },
      { start: 20.001, end: 30 },
    ]);
  });

  it("未排序输入按起点排序；时长非正 ⇒ 空", () => {
    expect(
      normalizeRemovals([{ start: 40, end: 50 }, { start: 5, end: 10 }], 60),
    ).toEqual([
      { start: 5, end: 10 },
      { start: 40, end: 50 },
    ]);
    expect(normalizeRemovals([{ start: 0, end: 10 }], 0)).toEqual([]);
  });
});

describe("complementIntervals（对整段求补集）", () => {
  it("删中间 ⇒ 两段保留", () => {
    expect(complementIntervals([{ start: 10, end: 20 }], 60)).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 60 },
    ]);
  });

  it("删头 / 删尾 / 全删", () => {
    expect(complementIntervals([{ start: 0, end: 10 }], 60)).toEqual([{ start: 10, end: 60 }]);
    expect(complementIntervals([{ start: 50, end: 60 }], 60)).toEqual([{ start: 0, end: 50 }]);
    expect(complementIntervals([{ start: 0, end: 60 }], 60)).toEqual([]);
  });
});

describe("planRemoval（吸附、延伸量与总时长）", () => {
  it("plans/M15.md §20.1.3 的例子：标记 [10,19.3] → 实际删除 [10,20]、延伸 0.7s、成品 50s", () => {
    const plan = planRemoval({
      ...base,
      marks: [{ start: 10, end: 19.3 }],
      keyframes: kfEvery2s(),
    });
    expect(plan.blocked).toBeNull();
    expect(plan.keeps).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 60 },
    ]);
    expect(plan.removals).toEqual([{ start: 10, end: 20 }]);
    expect(plan.extends[0]).toBe(0);
    expect(plan.extends[1]).toBeCloseTo(0.7, 9);
    expect(plan.totalSec).toBeCloseTo(50, 9);
  });

  it("标记终点恰在关键帧上 ⇒ 延伸 0（起点精确、终点不延伸）", () => {
    const plan = planRemoval({
      ...base,
      marks: [{ start: 10, end: 18 }],
      keyframes: kfEvery2s(),
    });
    expect(plan.keeps).toEqual([
      { start: 0, end: 10 },
      { start: 18, end: 60 },
    ]);
    expect(plan.removals).toEqual([{ start: 10, end: 18 }]);
    expect(plan.extends).toEqual([0, 0]);
    expect(plan.totalSec).toBeCloseTo(52, 9);
  });

  it("多段标记各自对齐；删除起点精确（区间起点不做任何吸附）", () => {
    const plan = planRemoval({
      ...base,
      marks: [
        { start: 5.5, end: 9.1 },
        { start: 30.7, end: 41.2 },
      ],
      keyframes: kfEvery2s(),
    });
    // 5.5 → 保留段 [0,5.5]（起点精确）；9.1 向上吸附到 10 → 实际删除 [5.5,10]
    // 30.7 精确；41.2 向上吸附到 42
    expect(plan.removals).toEqual([
      { start: 5.5, end: 10 },
      { start: 30.7, end: 42 },
    ]);
    expect(plan.keeps).toEqual([
      { start: 0, end: 5.5 },
      { start: 10, end: 30.7 },
      { start: 42, end: 60 },
    ]);
    expect(plan.extends[1]).toBeCloseTo(0.9, 9);
    expect(plan.extends[2]).toBeCloseTo(0.8, 9);
    expect(plan.totalSec).toBeCloseTo(60 - 4.5 - 11.3, 9);
  });

  it("最后一个标记的终点之后没有关键帧 ⇒ 该保留段作废（宁可多删，不残留）", () => {
    const plan = planRemoval({
      ...base,
      marks: [{ start: 10, end: 19.3 }],
      keyframes: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18], // 19.3 之后无关键帧
    });
    expect(plan.keeps).toEqual([{ start: 0, end: 10 }]);
    expect(plan.removals).toEqual([{ start: 10, end: 60 }]);
    expect(plan.totalSec).toBeCloseTo(10, 9);
  });
});

describe("planRemoval（碎片吸收与不动点迭代）", () => {
  it("头部碎片（0.01s）低于下限 ⇒ 并回删除区间", () => {
    const plan = planRemoval({
      ...base,
      marks: [{ start: 0.01, end: 10 }],
      keyframes: kfEvery2s(),
    });
    expect(plan.keeps).toEqual([{ start: 10, end: 60 }]);
    expect(plan.removals).toEqual([{ start: 0, end: 10 }]);
    expect(plan.totalSec).toBeCloseTo(50, 9);
  });

  it("两段删除夹一个 0.02s 保留段 ⇒ 并回后两段删除合并成一段", () => {
    const plan = planRemoval({
      ...base,
      marks: [
        { start: 10, end: 20 },
        { start: 20.02, end: 30 },
      ],
      keyframes: kfEvery2s(),
    });
    expect(plan.keeps).toEqual([
      { start: 0, end: 10 },
      { start: 30, end: 60 },
    ]);
    expect(plan.removals).toEqual([{ start: 10, end: 30 }]);
    expect(plan.totalSec).toBeCloseTo(40, 9);
  });

  it("关键帧稀疏：吸附把中间保留段压成空段，迭代后结果不含低于下限的段", () => {
    const plan = planRemoval({
      ...base,
      marks: [
        { start: 10.5, end: 12 },
        { start: 12.2, end: 39 },
      ],
      keyframes: [0, 10, 40, 60], // 12 → 只能跳到 40 ⇒ [12,12.2] 这段作废
    });
    expect(plan.keeps).toEqual([
      { start: 0, end: 10.5 },
      { start: 40, end: 60 },
    ]);
    expect(plan.removals).toEqual([{ start: 10.5, end: 40 }]);
    expect(plan.totalSec).toBeCloseTo(30.5, 9);
    for (const k of plan.keeps) {
      expect(k.end - k.start).toBeGreaterThan(MIN_SEG_DURATION_SEC);
    }
  });
});

describe("planRemoval（三态门禁）", () => {
  it("未标记 ⇒ no-marks（不是错误，只是导出不可用）", () => {
    const plan = planRemoval({ ...base, marks: [], keyframes: kfEvery2s() });
    expect(plan).toEqual({ removals: [], keeps: [], extends: [], totalSec: 0, blocked: "no-marks" });
  });

  it("关键帧索引未就绪（null / 空表）⇒ no-keyframes，且不给保留段与时长", () => {
    for (const keyframes of [null, []]) {
      const plan = planRemoval({ ...base, marks: [{ start: 10, end: 20 }], keyframes });
      expect(plan.blocked).toBe("no-keyframes");
      expect(plan.keeps).toEqual([]);
      expect(plan.totalSec).toBe(0);
      expect(plan.removals).toEqual([{ start: 10, end: 20 }]); // 归一化标记，供色带预览
    }
  });

  it("全删光（标记覆盖整段）⇒ nothing-left", () => {
    const plan = planRemoval({
      ...base,
      marks: [{ start: 0, end: 60 }],
      keyframes: kfEvery2s(),
    });
    expect(plan.blocked).toBe("nothing-left");
    expect(plan.keeps).toEqual([]);
    expect(plan.totalSec).toBe(0);
    expect(plan.removals).toEqual([{ start: 0, end: 60 }]);
  });

  it("全删光（碎片吸收后一段不剩）⇒ nothing-left", () => {
    const plan = planRemoval({
      ...base,
      marks: [
        { start: 0.01, end: 10 },
        { start: 10.01, end: 60 },
      ],
      keyframes: kfEvery2s(),
    });
    expect(plan.blocked).toBe("nothing-left");
    expect(plan.keeps).toEqual([]);
  });
});

describe("planRemoval（随机标记扫描的互补不变量）", () => {
  it("保留段 ∪ 实际删除区间恰好覆盖 [0, 时长]、互不重叠、保留段全部高于下限", () => {
    const rnd = mulberry32(20260928);
    const keyframes = kfEvery2s();
    for (let i = 0; i < 300; i++) {
      const marks: Interval[] = [];
      const n = 1 + Math.floor(rnd() * 4);
      for (let j = 0; j < n; j++) {
        const a = rnd() * 60;
        const b = rnd() * 60;
        marks.push({ start: Math.min(a, b), end: Math.max(a, b) });
      }
      const plan = planRemoval({ ...base, marks, keyframes });
      if (plan.blocked !== null) {
        // 随机域内只可能出现"全删光"（标记全空 / 覆盖整段都不成立，故保守处理）
        expect(plan.keeps).toEqual([]);
        continue;
      }
      expect(plan.extends.length).toBe(plan.keeps.length);
      expect(plan.totalSec).toBeCloseTo(
        plan.keeps.reduce((sum, k) => sum + (k.end - k.start), 0),
        9,
      );

      const covered = [
        ...plan.keeps.map((k) => ({ ...k, del: false })),
        ...plan.removals.map((r) => ({ ...r, del: true })),
      ].sort((a, b) => a.start - b.start);
      let cursor = 0;
      for (const seg of covered) {
        expect(seg.start).toBeGreaterThanOrEqual(cursor - 1e-9); // 不重叠
        expect(seg.end).toBeGreaterThan(seg.start); // 无空段
        cursor = seg.end;
      }
      expect(cursor).toBeCloseTo(60, 9); // 覆盖到片尾

      for (const k of plan.keeps) {
        expect(k.end - k.start).toBeGreaterThan(MIN_SEG_DURATION_SEC - 1e-6);
      }
      for (const e of plan.extends) expect(e).toBeGreaterThanOrEqual(0);
    }
  });
});
