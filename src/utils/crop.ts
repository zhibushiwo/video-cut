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

/** 偶数对齐（舍入到最近偶数）：用户输入值 / 归一化换算都用它（与下方 `evenFloor` 的向下取偶相对） */
export function evenPixel(v: number): number {
  return Math.max(0, Math.round(v / 2) * 2);
}

/** 偶数对齐（**向下**取整）：用于上界/剩余空间——边界只能往回收，不能舍入到画面之外 */
function evenFloor(v: number): number {
  return Math.max(0, Math.floor(v / 2) * 2);
}

/**
 * 归一化选区 → 像素选区（偶数对齐、**保证落在画面内**）。
 *
 * 宽高由「对齐后的边缘」相减得出，而不是各自对 `nw`/`nh` 取偶：左右（上下）边缘各自
 * 就近取偶会各多出至多 1px，叠加后 `x + w` 可能超画面 1~2px——1920 宽下把选区拖到贴右边界
 * （`nx = 5/1920`）就会得到 `x=6, w=1916`，即 `x + w = 1922 > 1920`。这种越界只有**作业体内**
 * 的 `align_rect`（定义在 `commands/crop.rs`，`commands/pipeline.rs` 是调用点）才拒绝，
 * 用户看到的是"框好选区 → 提交 → 跑到一半才失败"（`BUG-010`，与 `BUG-004` 同族：
 * 都是"转换环节产出越界裁剪"）。
 *
 * 注意本函数**不管最小尺寸**（`MIN_CROP_PX`）：拖出 1px 的选区会得到 `w = 0`，
 * 由调用方拦（工作台丢弃该裁剪、编辑页提示"请先框选至少 16×16"）。
 *
 * @param rect 归一化选区（交互产生的都在 0..1 内且 `nx + nw ≤ 1`）
 */
export function cropToPx(rect: CropRect, dims: { w: number; h: number }): CropPx {
  // 锚点也要收进画面：奇数尺寸下 nx=1 会让就近取偶给出 dims + 1
  const x = Math.min(evenPixel(rect.nx * dims.w), evenFloor(dims.w));
  const y = Math.min(evenPixel(rect.ny * dims.h), evenFloor(dims.h));
  // 右/下边缘：先按请求位置就近取偶，再收进画面可用的偶数边界；宽高 = 对齐后的边缘之差
  const right = Math.min(evenFloor(dims.w), evenPixel((rect.nx + rect.nw) * dims.w));
  const bottom = Math.min(evenFloor(dims.h), evenPixel((rect.ny + rect.nh) * dims.h));
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

/**
 * 数值字段的像素输入 → 归一化选区；宽高不足 `MIN_CROP_PX`、或收缩后仍不足时返回 `null`
 * （调用方忽略本次提交——契约是"过小或越界返回 null"，绝不返回越界选区）。
 *
 * 规则（`BUG-004`：原来只钳宽高、不钳锚点 x/y，填 `x=190, w=150` 于 200 宽画面会得到
 * `nx + nw = 1.03` 的越界选区 → 报错要到任务跑到一半才出现）：
 * 1. `x/y/w/h` 先偶数对齐；
 * 2. **锚点 `x`/`y` 钳到 `[0, dims - MIN_CROP_PX]`**（上界向下取偶：奇数尺寸下也保证
 *    `x + MIN_CROP_PX ≤ dims`）；
 * 3. 再按锚点到右/下边界的**剩余空间**收缩 `w`/`h`——锚点已钳好，收缩后必定落在画面内
 *    （`x + w == dims.w` 恰好压界是允许的）；
 * 4. 收缩后仍不足 `MIN_CROP_PX`（画面本身比下限还小）返回 `null`。
 */
export function pxToCrop(input: CropPx, dims: { w: number; h: number }): CropRect | null {
  let w = evenPixel(input.w || 0);
  let h = evenPixel(input.h || 0);
  if (w < MIN_CROP_PX || h < MIN_CROP_PX) return null;

  const x = Math.min(evenPixel(input.x || 0), evenFloor(dims.w - MIN_CROP_PX));
  const y = Math.min(evenPixel(input.y || 0), evenFloor(dims.h - MIN_CROP_PX));

  if (x + w > dims.w) w = evenFloor(dims.w - x);
  if (y + h > dims.h) h = evenFloor(dims.h - y);
  if (w < MIN_CROP_PX || h < MIN_CROP_PX) return null;
  return { nx: x / dims.w, ny: y / dims.h, nw: w / dims.w, nh: h / dims.h };
}

/** 选区尺寸文案（两页共用口径：已选 W×H @ (x, y) / 尚未框选） */
export function cropSizeText(px: CropPx | null, dims: { w: number; h: number }): string {
  return px
    ? `已选 ${px.w}×${px.h} @ (${px.x}, ${px.y})，输出将放大回 ${dims.w}×${dims.h}。`
    : "尚未框选。";
}
