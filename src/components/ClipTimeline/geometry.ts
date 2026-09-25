/**
 * 时间线世界坐标几何（TIMELINE.md §17.3 / plans/M11.md §18.2，M11-1）。
 *
 * 单参数 PPS（pixels/second）：块位置/宽度、刻度、播放头、seek 换算全走一套线性公式。
 * 块宽用**差值法**（`round(端点×pps) − round(起点×pps)`），**禁止** `round(时长×pps)`——
 * `round(a+b) ≠ round(a)+round(b)`，M9-3 块重叠 bug 的理论根源。差值法还让相邻块**天然无缝**：
 * 下一块的 left 恒等于上一块右缘（同一个 round 表达式，浮点下也逐位成立，因为
 * `starts[i+1] === starts[i] + duration[i]`），极端缩小下不会出现重叠或缝隙。
 */

/** PPS 硬区间（TIMELINE.md §17.4：钳制约 2~500 px/s） */
export const PPS_MIN = 2;
export const PPS_MAX = 500;

/** 最短块渲染宽下限（px）：动态 PPS 下限的依据（§18.2，杜绝 M9-3 类重叠在极端缩小下回归）。
 * 差值法舍入的严格数学下界是 MIN_BLOCK_PX − 1（见 `clampPps` 注释），设计目标是 ≥6。 */
export const MIN_BLOCK_PX = 6;

export interface BlockRect {
  left: number;
  width: number;
}

/**
 * PPS 钳制：先压进硬区间 `[PPS_MIN, PPS_MAX]`，再抬到动态下限 `MIN_BLOCK_PX / 最短片段时长`
 * （最短块渲染宽按 ≥6px 设计；差值法逐像素舍入的数学下界是 5px——x≥6 时
 * `round(s+x) − round(s) ≥ 5`，极端浮点边缘最多被舍入吃掉 1px，不影响"块不消失"的意图）。
 *
 * - `shortestSec <= 0`（片段未探测等病态输入）不动动态下限：0 会除出 Infinity。
 * - 帧级 ≥1 帧的钳制在 undo 命令层（M11-0）。
 * - 高帧率源（>83fps）的 1 帧片段会让动态下限越过 500（120fps → 720）：块可见性优先于
 *   缩放上界，TIMELINE §17.4 的"约 2~500"按软区间理解（M11-2 缩放接线沿用本软区间，
 *   未在交互侧加硬顶）。
 */
export function clampPps(raw: number, shortestSec: number): number {
  const pps = Math.min(PPS_MAX, Math.max(PPS_MIN, raw));
  return shortestSec > 0 ? Math.max(pps, MIN_BLOCK_PX / shortestSec) : pps;
}

/** 适应窗口（\ 键，§18.2）：视口宽装下总时长，再钳制 */
export function fitPps(viewportWidth: number, totalSec: number, shortestSec: number): number {
  if (viewportWidth <= 0 || totalSec <= 0) return PPS_MIN;
  return clampPps(viewportWidth / totalSec, shortestSec);
}

/**
 * 刻度步长：取 **≥ 目标间距（秒）** 的最小整刻度（§18.2：刻度间距 ≥ 60px，目标秒数 = 60/pps）。
 * 注意与剪切页 `Timeline::pickTickStep`（"总长内 ≤16 格"语义）**不是一回事**——那套语义
 * 在这里会把间距压到 60px 以下、标签互相叠（2026-09-25 实施时更正 plans/M11.md §18.2 的公式）。
 */
export function tickStep(minSec: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 3600];
  for (const s of steps) {
    if (s >= minSec) return s;
  }
  return 3600;
}

export interface Geometry {
  /** 生效 PPS */
  readonly pps: number;
  /** 每块成品内起点（秒），与传入 durations 同序 */
  readonly starts: number[];
  /** 总时长（秒） */
  readonly total: number;
  /** 世界宽 = round(total × pps) */
  readonly contentWidth: number;
  /** 第 i 块矩形（差值法）；i 越界返回 {0,0}（防御，正常调用不会发生） */
  block(i: number): BlockRect;
  /** 成品时间 → 世界 x（§17.3：x = round(t × PPS)） */
  timeToX(t: number): number;
  /** 世界 x → 成品时间（t = x / PPS）；不钳制，调用方按需钳到 [0, total] */
  xToTime(x: number): number;
}

/** 由各块时长构建几何（durations 与时间轴同序；时长 ≤0 的块宽度为 0） */
export function buildGeometry(durations: number[], pps: number): Geometry {
  const starts: number[] = [];
  let acc = 0;
  for (const d of durations) {
    starts.push(acc);
    acc += d;
  }
  const total = acc;
  const contentWidth = Math.round(total * pps);
  return {
    pps,
    starts,
    total,
    contentWidth,
    block(i) {
      const start = starts[i];
      const d = durations[i];
      if (start === undefined || d === undefined) return { left: 0, width: 0 };
      const left = Math.round(start * pps);
      // 差值法（§17.3）：宽 = round(端点×pps) − round(起点×pps)
      return { left, width: Math.round((start + d) * pps) - left };
    },
    timeToX(t) {
      return Math.round(t * pps);
    },
    xToTime(x) {
      return x / pps;
    },
  };
}
