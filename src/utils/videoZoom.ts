/**
 * 预览框选放大的几何（M19-6，FR-397）：视频盒归一化坐标 [0..1]，cover 缩放——
 * 所选区域充满播放器、另一维超出裁掉；平移 = 移动可视窗口（宽 1/s）在内容 [0,1] 内
 * 的起点 o，边界钳制不甩出画面。纯函数抽出便于单测（组件内只做事件与 transform 应用）。
 */

export interface ZoomState {
  /** 框选区域（归一化） */
  rx: number;
  ry: number;
  rw: number;
  rh: number;
  /** 可视窗口在内容中的起点（归一化） */
  ox: number;
  oy: number;
}

/** 放大倍率 = 1 / max(rw, rh)（cover：两个方向里较大的决定倍率） */
export function zoomScale(z: Pick<ZoomState, "rw" | "rh">): number {
  return 1 / Math.max(z.rw, z.rh);
}

/** 可视窗口起点 o 的合法范围：窗口宽 = 1/s，留在内容内 → o ∈ [0, 1−1/s] */
export function offsetRange(s: number): [number, number] {
  return [0, 1 - 1 / s];
}

/** 各轴钳制到合法窗口（框选落点与拖拽平移共用） */
export function clampOffset(z: ZoomState): ZoomState {
  const s = zoomScale(z);
  const [lo, hi] = offsetRange(s);
  return {
    ...z,
    ox: Math.min(hi, Math.max(lo, z.ox)),
    oy: Math.min(hi, Math.max(lo, z.oy)),
  };
}
