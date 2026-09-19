/**
 * 裁剪（局部放大）选区的坐标换算与钳制（UI.md §9.8 片段加工「显示空间框选」）。
 *
 * 归一化坐标为 0..1，相对**显示空间**画面宽高：工作台的显示空间含旋转效果
 * （90°/270° 时宽高交换，见 `displayedDims`），编辑器页放大无旋转、即源宽高。
 * 交互与 UI 见 `src/components/CropOverlay`（R1-4：编辑器页与工作台共用一套实现）。
 */

/** 归一化选区（0..1，相对画面宽高） */
export interface CropRect {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

/** 像素选区（宽高已偶数对齐） */
export interface CropPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 最小可框选边长（px）：编码器 yuv420 与放大质量的下限 */
export const MIN_CROP_PX = 16;

/** 偶数对齐（编码器 yuv420 要求宽高为偶数，也是后端校验口径） */
export function evenPixel(v: number): number {
  return Math.max(0, Math.round(v / 2) * 2);
}

/** 归一化选区 → 像素选区（偶数对齐；不做边界钳制，越界由调用方校验） */
export function cropToPx(rect: CropRect, dims: { w: number; h: number }): CropPx {
  return {
    x: evenPixel(rect.nx * dims.w),
    y: evenPixel(rect.ny * dims.h),
    w: evenPixel(rect.nw * dims.w),
    h: evenPixel(rect.nh * dims.h),
  };
}

/**
 * 数值字段的像素输入 → 归一化选区；过小或越界不可救时返回 null（调用方忽略本次提交）。
 * 规则：先偶数对齐；宽高不足 `MIN_CROP_PX` 判废；超出右/下边界时以 x/y 为锚点收缩，
 * 锚点本身在边界外则贴到 `dims - MIN_CROP_PX`。
 */
export function pxToCrop(input: CropPx, dims: { w: number; h: number }): CropRect | null {
  const x = evenPixel(input.x || 0);
  const y = evenPixel(input.y || 0);
  let w = evenPixel(input.w || 0);
  let h = evenPixel(input.h || 0);
  if (w < MIN_CROP_PX || h < MIN_CROP_PX) return null;
  if (x + w > dims.w) w = dims.w - evenPixel(Math.min(x, dims.w - MIN_CROP_PX));
  if (y + h > dims.h) h = dims.h - evenPixel(Math.min(y, dims.h - MIN_CROP_PX));
  if (w < MIN_CROP_PX || h < MIN_CROP_PX) return null;
  return { nx: x / dims.w, ny: y / dims.h, nw: w / dims.w, nh: h / dims.h };
}

/** 选区尺寸文案（两页共用口径：已选 W×H @ (x, y) / 尚未框选） */
export function cropSizeText(px: CropPx | null, dims: { w: number; h: number }): string {
  return px
    ? `已选 ${px.w}×${px.h} @ (${px.x}, ${px.y})，输出将放大回 ${dims.w}×${dims.h}。`
    : "尚未框选。";
}
