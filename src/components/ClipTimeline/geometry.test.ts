import { describe, expect, it } from "vitest";
import {
  MIN_BLOCK_PX,
  PPS_MAX,
  PPS_MIN,
  buildGeometry,
  clampPps,
  fitPps,
  tickStep,
} from "./geometry";

/** mulberry32：可复现 PRNG（与 crop.test.ts 同款） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("clampPps（硬区间 + 动态下限，§18.2）", () => {
  it("压进硬区间 [2, 500]", () => {
    expect(clampPps(0, 10)).toBe(PPS_MIN);
    expect(clampPps(-5, 10)).toBe(PPS_MIN);
    expect(clampPps(1e9, 10)).toBe(PPS_MAX);
    expect(clampPps(80, 10)).toBe(80);
  });

  it("动态下限：最短片段渲染宽 ≥ 6px", () => {
    // 最短 0.05s → 下限 120 pps，盖过硬区间内的 100
    expect(clampPps(100, 0.05)).toBe(120);
    // 下限低于硬区间下限时不生效
    expect(clampPps(2, 10)).toBe(PPS_MIN);
  });

  it("最短时长 ≤0（未探测等病态输入）不动动态下限", () => {
    expect(clampPps(100, 0)).toBe(100);
    expect(clampPps(0, 0)).toBe(PPS_MIN);
  });
});

describe("fitPps（适应窗口，§18.2）", () => {
  it("视口宽 / 总时长再钳制", () => {
    expect(fitPps(800, 16, 1)).toBe(50);
    expect(fitPps(800, 0.05, 0.05)).toBe(PPS_MAX); // 超短素材顶到硬上限（动态下限 120 < 500）
    expect(fitPps(400, 16, 1)).toBe(25);
    expect(fitPps(400, 16, 0.05)).toBe(120); // 动态下限盖过适应窗口的结果
  });

  it("退化输入（视口或总时长 ≤0）回落 PPS_MIN", () => {
    expect(fitPps(0, 10, 1)).toBe(PPS_MIN);
    expect(fitPps(800, 0, 1)).toBe(PPS_MIN);
  });
});

describe("tickStep（≥ 目标的最小整刻度，§18.2）", () => {
  it("目标落在两档之间取上档", () => {
    expect(tickStep(0.1)).toBe(0.5);
    expect(tickStep(0.5)).toBe(0.5);
    expect(tickStep(0.51)).toBe(1);
    expect(tickStep(2)).toBe(2);
    expect(tickStep(2.1)).toBe(5);
    expect(tickStep(30)).toBe(30);
  });

  it("超过最大档回落 3600", () => {
    expect(tickStep(4000)).toBe(3600);
  });
});

describe("buildGeometry（世界坐标 + 差值法，§17.3）", () => {
  it("起点/总时长/世界宽/块矩形", () => {
    const geo = buildGeometry([10, 5, 1.5], 20);
    expect(geo.starts).toEqual([0, 10, 15]);
    expect(geo.total).toBe(16.5);
    expect(geo.contentWidth).toBe(330);
    expect(geo.block(0)).toEqual({ left: 0, width: 200 });
    expect(geo.block(1)).toEqual({ left: 200, width: 100 });
    expect(geo.block(2)).toEqual({ left: 300, width: 30 });
  });

  it("差值法 ≠ round(时长×pps)：M9-3 重叠的理论反例", () => {
    // 两段各 0.105s @ 100pps：round(10.5)=11 四舍五入（half-up）进位让朴素法得 11，
    // 差值法第二块 = round(21) − round(10.5) = 21 − 11 = 10（首块起点把 0.5 摊给左缘）
    const geo = buildGeometry([0.105, 0.105], 100);
    expect(geo.block(0)).toEqual({ left: 0, width: 11 });
    expect(geo.block(1)).toEqual({ left: 11, width: 10 });
    expect(geo.contentWidth).toBe(21);
  });

  it("timeToX 取整（x = round(t×PPS)）、xToTime 线性回换", () => {
    const geo = buildGeometry([10], 20);
    expect(geo.timeToX(3.5)).toBe(70);
    expect(geo.timeToX(0.123)).toBe(2); // round(2.46)
    expect(geo.xToTime(70)).toBe(3.5);
  });

  it("随机不变量扫描：相邻块无缝、末块右缘 = 世界宽、下限内最短块 ≥6px", () => {
    const rand = mulberry32(20260925);
    for (let iter = 0; iter < 500; iter++) {
      const n = 2 + Math.floor(rand() * 7); // 2..8 块
      const durations: number[] = [];
      for (let i = 0; i < n; i++) {
        durations.push(Math.round((0.03 + rand() * 29.97) * 1000) / 1000);
      }
      const shortest = Math.min(...durations);
      const pps = clampPps(1 + rand() * 599, shortest);
      const geo = buildGeometry(durations, pps);

      let prevRight = 0;
      let minWidth = Infinity;
      for (let i = 0; i < n; i++) {
        const r = geo.block(i);
        // 相邻块无缝：下一块 left 恒等于上一块右缘（差值法的构造性质，浮点下逐位成立）
        expect(r.left).toBe(prevRight);
        expect(r.width).toBeGreaterThanOrEqual(0);
        prevRight = r.left + r.width;
        if (r.width < minWidth) minWidth = r.width;
      }
      expect(prevRight).toBe(geo.contentWidth);
      // 动态下限生效（扫描里最短时长恒 >0）。数学下界 = MIN_BLOCK_PX − 1（差值法舍入
      // 最多吃 1px，见 clampPps 注释）；本固定种子下实测最短块 ≥ 6。
      expect(minWidth).toBeGreaterThanOrEqual(MIN_BLOCK_PX - 1);
      // xToTime∘timeToX 回换误差 ≤ 半个像素
      const t = rand() * geo.total;
      expect(Math.abs(geo.xToTime(geo.timeToX(t)) - t)).toBeLessThanOrEqual(0.5 / pps);
    }
  });
});
