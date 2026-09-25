import { describe, expect, it } from "vitest";
import { MIN_CROP_PX, cropToPx, pxToCrop, type CropPx } from "./crop";

/**
 * TC-022（BUG-004）/ TC-028（BUG-010）的边界矩阵，2026-09-25（`T-004`）由一次性命令级脚本
 * 固化为常驻用例——矩阵记录见 docs/TESTING.md §3.4 注。静态期望值一比一转写；随机扫描
 * 同域同种子（`20260923`）。原脚本的 PRNG 算法未随矩阵入库、无法逐位复现，这里固定用
 * mulberry32——从此同种子必然同序列。
 */

/** mulberry32：可复现 PRNG（32 位状态，标准实现） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("pxToCrop（数值输入 → 归一化选区，TC-022）", () => {
  const dims200 = { w: 200, h: 200 };

  it("x 界内原样；恰好压界（dims − MIN）也原样", () => {
    expect(pxToCrop({ x: 0, y: 0, w: 16, h: 16 }, dims200)).toEqual({
      nx: 0,
      ny: 0,
      nw: 16 / 200,
      nh: 16 / 200,
    });
    expect(pxToCrop({ x: 8, y: 0, w: 16, h: 16 }, dims200)?.nx).toBe(8 / 200);
    expect(pxToCrop({ x: 184, y: 0, w: 16, h: 16 }, dims200)?.nx).toBe(184 / 200);
  });

  it("超界锚点回钳到 dims − MIN（190 / 300 → 184）；负值贴 0（y 对称）", () => {
    expect(pxToCrop({ x: 190, y: 0, w: 16, h: 16 }, dims200)?.nx).toBe(184 / 200);
    expect(pxToCrop({ x: 300, y: 0, w: 16, h: 16 }, dims200)?.nx).toBe(184 / 200);
    expect(pxToCrop({ x: -5, y: -5, w: 16, h: 16 }, dims200)).toEqual({
      nx: 0,
      ny: 0,
      nw: 16 / 200,
      nh: 16 / 200,
    });
    expect(pxToCrop({ x: 0, y: 190, w: 16, h: 16 }, dims200)?.ny).toBe(184 / 200);
  });

  it("w 恰好到边原样；超界按剩余空间收缩", () => {
    expect(pxToCrop({ x: 100, y: 0, w: 100, h: 16 }, dims200)).toEqual({
      nx: 100 / 200,
      ny: 0,
      nw: 100 / 200,
      nh: 16 / 200,
    });
    expect(pxToCrop({ x: 150, y: 0, w: 100, h: 16 }, dims200)?.nw).toBe(50 / 200);
  });

  it("CR 复现值：x=190 w=150 → 锚点回钳 184、宽收缩 16", () => {
    expect(pxToCrop({ x: 190, y: 0, w: 150, h: 16 }, dims200)).toEqual({
      nx: 184 / 200,
      ny: 0,
      nw: 16 / 200,
      nh: 16 / 200,
    });
  });

  it("宽高不足 MIN_CROP_PX 或为 0 → null", () => {
    expect(pxToCrop({ x: 0, y: 0, w: 8, h: 16 }, dims200)).toBeNull();
    expect(pxToCrop({ x: 0, y: 0, w: 0, h: 16 }, dims200)).toBeNull();
  });

  it("奇数 w 就近取偶（15 → 16）", () => {
    expect(pxToCrop({ x: 0, y: 0, w: 15, h: 16 }, dims200)?.nw).toBe(16 / 200);
  });

  it("奇数尺寸 dims=101×57：界内原样；锚点回钳；收缩向下取偶", () => {
    const dims = { w: 101, h: 57 };
    expect(pxToCrop({ x: 84, y: 0, w: 16, h: 16 }, dims)).toEqual({
      nx: 84 / 101,
      ny: 0,
      nw: 16 / 101,
      nh: 16 / 57,
    });
    expect(pxToCrop({ x: 100, y: 0, w: 16, h: 16 }, dims)?.nx).toBe(84 / 101);
    // 上界与收缩步都必须向下取偶：若收缩步就近取偶，x=84 会得 w=18 → 102 > 101
    expect(pxToCrop({ x: 0, y: 0, w: 200, h: 200 }, dims)).toEqual({
      nx: 0,
      ny: 0,
      nw: 100 / 101,
      nh: 56 / 57,
    });
  });

  it("画面本身小于下限 dims=8×8 → null", () => {
    expect(pxToCrop({ x: 0, y: 0, w: 16, h: 16 }, { w: 8, h: 8 })).toBeNull();
  });

  it("随机不变量扫描：4000 组，同域同种子（20260923）", () => {
    // 域 = 2026-09-23 命令级矩阵原域：dims 各维 16..415、x/y/w/h ∈ [−50, 550]
    const rand = mulberry32(20260923);
    const ri = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    let nonNull = 0;
    for (let i = 0; i < 4000; i++) {
      const dims = { w: ri(16, 415), h: ri(16, 415) };
      const input: CropPx = {
        x: ri(-50, 550),
        y: ri(-50, 550),
        w: ri(-50, 550),
        h: ri(-50, 550),
      };
      const r = pxToCrop(input, dims);
      if (!r) continue;
      nonNull++;
      // 归一化不变量（TESTING §3.4 注 A.5）：x+w=dims 时浮点和可能超 1 一个 ulp，容差 1e-9
      expect(r.nx).toBeGreaterThanOrEqual(0);
      expect(r.ny).toBeGreaterThanOrEqual(0);
      expect(r.nx + r.nw).toBeLessThanOrEqual(1 + 1e-9);
      expect(r.ny + r.nh).toBeLessThanOrEqual(1 + 1e-9);
      // 像素侧不变量：回投影（换算误差 ≪ 0.5px，Math.round 可精确还原整数）后
      // 为偶数、≥ MIN_CROP_PX，且锚点 + 宽高不越界——BUG-004 的契约本身
      const x = Math.round(r.nx * dims.w);
      const y = Math.round(r.ny * dims.h);
      const w = Math.round(r.nw * dims.w);
      const h = Math.round(r.nh * dims.h);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThanOrEqual(MIN_CROP_PX);
      expect(h).toBeGreaterThanOrEqual(MIN_CROP_PX);
      expect(w % 2).toBe(0);
      expect(h % 2).toBe(0);
      expect(x + w).toBeLessThanOrEqual(dims.w);
      expect(y + h).toBeLessThanOrEqual(dims.h);
    }
    expect(nonNull).toBeGreaterThan(0); // 灵敏度守卫：域不得退化成「全 null」
  });
});

describe("cropToPx（归一化选区 → 像素，TC-028）", () => {
  it("贴右边界复现值：宽高由对齐后的边缘相减（BUG-010 修复点）", () => {
    const nx = 5 / 1920;
    expect(cropToPx({ nx, ny: 0, nw: 1 - nx, nh: 1 }, { w: 1920, h: 1080 })).toEqual({
      x: 6,
      y: 0,
      w: 1914,
      h: 1080,
    });
  });

  it("奇数尺寸整幅：上界向下取偶收进画面（修复前 h=58 > 57）", () => {
    expect(cropToPx({ nx: 0, ny: 0, nw: 1, nh: 1 }, { w: 101, h: 57 })).toEqual({
      x: 0,
      y: 0,
      w: 100,
      h: 56,
    });
  });

  it("退化输入（单击 nw=nh=0）：锚点收进画面（修复前 x=102 > 101）", () => {
    expect(cropToPx({ nx: 1, ny: 1, nw: 0, nh: 0 }, { w: 101, h: 57 })).toEqual({
      x: 100,
      y: 56,
      w: 0,
      h: 0,
    });
  });

  it("随机不变量扫描：3 组尺寸 × 2000 组交互选区", () => {
    // 原命令级扫描为 3 组尺寸 × 3688320 组（一次性脚本，不入库）——直接固化会让 pnpm test
    // 跑几十秒，固化时缩到 2000/组：边界已由上方静态复现值兜住，扫描只兜不变量回归。
    // 交互选区以整数像素对 [p, p2] ⊆ [0, dims] 采样（与原命令级矩阵同域；生产路径
    // CropOverlay 产出连续浮点选区，浮点侧由下方钳制不变量覆盖），再归一化。
    // 尺寸组前两组与原记录一致（1920×1080、101×57）；第三组原记录未留名，取最小合法画面 16×16。
    const rand = mulberry32(20260923);
    const dimsGroups = [
      { w: 1920, h: 1080 },
      { w: 101, h: 57 },
      { w: 16, h: 16 },
    ];
    for (const dims of dimsGroups) {
      // 灵敏度守卫：空矩形对全部不变量恒真，扫描不得退化成「恒返 {0,0,0,0}」
      let sawNonZero = false;
      for (let i = 0; i < 2000; i++) {
        const x = Math.floor(rand() * (dims.w + 1));
        const x2 = x + Math.floor(rand() * (dims.w + 1 - x));
        const y = Math.floor(rand() * (dims.h + 1));
        const y2 = y + Math.floor(rand() * (dims.h + 1 - y));
        const rect = {
          nx: x / dims.w,
          ny: y / dims.h,
          nw: (x2 - x) / dims.w,
          nh: (y2 - y) / dims.h,
        };
        const px = cropToPx(rect, dims);
        // 不变量（TESTING §3.4 注 B.4）
        expect(px.x).toBeLessThanOrEqual(dims.w);
        expect(px.y).toBeLessThanOrEqual(dims.h);
        expect(px.x + px.w).toBeLessThanOrEqual(dims.w);
        expect(px.y + px.h).toBeLessThanOrEqual(dims.h);
        expect(px.w % 2).toBe(0);
        expect(px.h % 2).toBe(0);
        if (px.w > 0 || px.h > 0) sawNonZero = true;
      }
      expect(sawNonZero).toBe(true);
    }
  });
});
