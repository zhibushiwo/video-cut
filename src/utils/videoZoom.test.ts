import { describe, expect, it } from "vitest";
import { clampOffset, offsetRange, zoomScale } from "./videoZoom";

describe("zoomScale（cover 倍率）", () => {
  it("由较长的边决定倍率", () => {
    expect(zoomScale({ rw: 0.5, rh: 0.25 })).toBe(2);
    expect(zoomScale({ rw: 0.25, rh: 0.5 })).toBe(2);
  });
});

describe("offsetRange（可视窗口起点合法范围）", () => {
  it("窗口宽 = 1/s，起点 ∈ [0, 1−1/s]", () => {
    expect(offsetRange(2)).toEqual([0, 0.5]);
    expect(offsetRange(4)).toEqual([0, 0.75]);
  });

  it("s=1（未放大）时无平移余量", () => {
    expect(offsetRange(1)).toEqual([0, 0]);
  });
});

describe("clampOffset（框选落点与平移共用钳制）", () => {
  it("框选在中间：起点默认对齐所选区间，越界输入被钳回", () => {
    const z = clampOffset({ rx: 0.25, ry: 0.25, rw: 0.5, rh: 0.5, ox: 99, oy: -99 });
    // s=2 → o ∈ [0, 0.5]；99→0.5、-99→0
    expect(z.ox).toBe(0.5);
    expect(z.oy).toBe(0);
  });

  it("框选贴右下角：起点钳到 1−1/s（画面右下充满）", () => {
    const z = clampOffset({ rx: 0.75, ry: 0.75, rw: 0.25, rh: 0.25, ox: 0.75, oy: 0.75 });
    // s=4 → o ∈ [0, 0.75]，0.75 合法（右下角内容充满视口）
    expect(z.ox).toBe(0.75);
    expect(z.oy).toBe(0.75);
  });

  it("平移落点不甩出画面", () => {
    const z = clampOffset({ rx: 0, ry: 0, rw: 0.5, rh: 0.5, ox: 3, oy: -3 });
    expect(z.ox).toBe(0.5);
    expect(z.oy).toBe(0);
  });
});
