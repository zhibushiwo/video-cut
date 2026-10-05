/**
 * 保留式裁剪（剪切页「删除片段」模式）的派生链：标记要**移除**的区间 → 求补集 → 得到保留区间
 * （`FR-326` / `ADR-037`；行为规格见 DESIGN.md §3.2、交互见 UI.md §9.4、实施设计见
 * docs/plans/M15.md §20.2）。
 *
 * 三条约束决定了这里的形状：
 *
 * 1. **全程无损（copy）**：保留段按同源、无变换的 pipeline items 下发（命中 `plan_items` 规则 A
 *    ⇒ 秒级单文件 concat）。本模式**没有**"强制重编码"入口——精确边界归 `CAND-022`。
 * 2. **保留段起点必须向上对齐关键帧**（[`nextKeyframeAtOrAfter`]）：copy 下 `-ss` 的落点是
 *    ≤ 请求时刻的最近关键帧、`-t` 又按请求时长截取 ⇒ 输出窗口整体前移（头部残留本该删掉的
 *    内容、尾部被啃短，`BUG-007` 的同族现象）。把起点直接设在"≥ 删除终点的最近关键帧"上
 *    ⇒ 删除起点精确、终点向后延伸（多删 ≤ 1 个 GOP，**宁多删不残留**）。
 *    方向与提取式的 `realCutStart` **相反，不得混用**。
 * 3. **补集是"不动点"问题**：向上吸附会缩短保留段、造出新的碎片/空段，必须把这些段并回删除
 *    区间重算，直到稳定（[`planRemoval`] 的迭代）。只跑一轮就会把"低于下限的保留段"下发给
 *    后端，被 `commands::valid_segment_span`（`end − start > 0.05 − 1e-6`）**整单拒绝**。
 *
 * 纯计算、无 IPC、无 React（与 `utils/crop.ts` 同族），全部可单测（`TC-047` 自动半）。
 *
 * 注意别与本文件外的同名概念混淆：契约层的 `types::Segment` 是 `{ startSec, endSec }`
 * （对应 Rust `PipelineItem.segment`），这里的 [`Interval`] 是**派生链内部**的秒区间
 * `{ start, end }`，两者在 `M15-3` 下发时显式转换。
 */
import { nextKeyframeAtOrAfter } from "./time";
import { minSegSec } from "./undo/commands";

/** 派生链用的秒区间（长度 = `end − start`；端点相等视为空） */
export interface Interval {
  start: number;
  end: number;
}

/** 导出被门禁拦下的原因（`null` = 可导出） */
export type RemovalBlockReason =
  | "no-marks" // 还没标记任何区间（不是错误，只是导出不可用）
  | "no-keyframes" // 关键帧索引未就绪/为空——无损删除的边界定不了
  | "nothing-left"; // 全删光

/** 派生结果：`M15-2` 的列表/色带/汇总与 `M15-3` 的下发都从这里取 */
export interface RemovalPlan {
  /** 实际删除区间（已含吸附延伸与碎片吸收），供时间轴 warn 色带渲染 */
  removals: Interval[];
  /** 保留区间 = 下发给 `pipeline` 的每段 `segment` */
  keeps: Interval[];
  /** 每个保留段头部的额外删除量（秒；与 `keeps` 同序，首段恒 0）——UI 明示"延伸 x.xs" */
  extends: number[];
  /** 成品总时长（秒）= Σ 保留段时长 */
  totalSec: number;
  /** 非 null 时禁用导出并显示对应原因 */
  blocked: RemovalBlockReason | null;
}

/** [`planRemoval`] 入参 */
export interface PlanRemovalArgs {
  /** 用户标记要删除的区间（未排序、可重叠、可越界） */
  marks: readonly Interval[];
  /** 源时长（秒） */
  durationSec: number;
  /** 关键帧时间点（升序）；`null` = 索引未就绪 ⇒ 边界定不了 ⇒ 门禁 `no-keyframes` */
  keyframes: readonly number[] | null;
  /** 最小保留时长下限（秒）：调用方传 `MIN_SEG_DURATION_SEC` */
  minKeepSec: number;
  /** 源帧率（用于 1 帧下限，与 `minSegSec` 同口径）；未知传 0 */
  fps: number;
}

/**
 * 浮点容差（秒，1µs）：与 `utils/undo/commands.ts` 的 `EPS`、后端 `commands::valid_segment_span`
 * 的 `0.05 − 1e-6` 同量级——"恰好钳到下限"的末位差不得被判成不合格而整单失败（`BUG-012`）。
 */
const EPS = 1e-6;

/**
 * 归一化的相邻/重叠合并容差（秒，1e-9）：只吸收浮点末位差，**不吞真实间隔**
 * （相邻的两个标记要合并成一段，但 `[10,20]` 与 `[20.001,30]` 之间的 1ms 是真实间隔）。
 */
const NEAR = 1e-9;

/** 补集的分段视图：每段还带"紧邻其前的那一段"的终点（首段为 `null`——它在 0 上，无需吸附） */
interface Gap {
  start: number;
  end: number;
  prevEnd: number | null;
}

/** 对 `[0, durationSec]` 求补集（丢弃空段），并保留"前一段的终点"供吸附使用 */
function gapsWithPrev(blocks: readonly Interval[], durationSec: number): Gap[] {
  const out: Gap[] = [];
  if (!Number.isFinite(durationSec) || durationSec <= 0) return out;
  let cursor = 0;
  let prevEnd: number | null = null;
  for (const b of blocks) {
    if (b.start - cursor > NEAR) out.push({ start: cursor, end: b.start, prevEnd });
    cursor = Math.max(cursor, b.end);
    prevEnd = cursor;
  }
  if (durationSec - cursor > NEAR) out.push({ start: cursor, end: durationSec, prevEnd });
  return out;
}

/**
 * 对 `[0, durationSec]` 求补集（忽略空段）。
 *
 * 两处复用同一关系、方向相反：「标记 → 保留段」与「保留段 → 实际删除区间」（后者把吸附延伸与
 * 碎片吸收产生的额外删除量一并算进 warn 色带）。写成一份，避免两条互补关系各自漂移。
 */
export function complementIntervals(
  blocks: readonly Interval[],
  durationSec: number,
): Interval[] {
  return gapsWithPrev(blocks, durationSec).map(({ start, end }) => ({ start, end }));
}

/**
 * 归一化标记区间：裁到 `[0, durationSec]`、丢弃非有限值与长度 ≤ 0 的项、按起点排序、
 * **合并重叠与相邻**（容差 [`NEAR`]）。
 */
export function normalizeRemovals(raw: readonly Interval[], durationSec: number): Interval[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const fitted: Interval[] = [];
  for (const item of raw) {
    if (!Number.isFinite(item.start) || !Number.isFinite(item.end)) continue;
    const start = Math.min(Math.max(item.start, 0), durationSec);
    const end = Math.min(Math.max(item.end, 0), durationSec);
    if (end - start <= NEAR) continue; // 空 / 负长度 / 被裁到零
    fitted.push({ start, end });
  }
  fitted.sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of fitted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end + NEAR) {
      if (iv.end > last.end) last.end = iv.end; // 重叠或相邻 ⇒ 并成一段
      continue;
    }
    out.push({ ...iv });
  }
  return out;
}

/**
 * 保留段的有效下限（秒）= `max(传入下限, minSegSec(fps))`；后者 = `max(1 帧, 0.05s)`，
 * 与命令层切割/修剪下限、导出映射阈值、后端 `valid_segment_span` 同源（`BUG-012` 裁决），
 * 避免"建得出来却导不出去"。
 */
function effectiveMinKeep(minKeepSec: number, fps: number): number {
  const floor = minSegSec(fps);
  return Number.isFinite(minKeepSec) && minKeepSec > 0 ? Math.max(minKeepSec, floor) : floor;
}

/** 三种门禁（不可导出）的统一收尾：`removals` 供色带，"全删光"时就是整段源 */
function blockedPlan(
  removals: Interval[],
  blocked: RemovalBlockReason,
): RemovalPlan {
  return { removals, keeps: [], extends: [], totalSec: 0, blocked };
}

/** 稳定态的收尾：从保留段反推实际删除区间、延伸量与总时长 */
function finalizePlan(
  keeps: Interval[],
  extendsSec: number[],
  durationSec: number,
): RemovalPlan {
  if (keeps.length === 0) return blockedPlan(complementIntervals([], durationSec), "nothing-left");
  return {
    removals: complementIntervals(keeps, durationSec),
    keeps,
    extends: extendsSec,
    totalSec: keeps.reduce((sum, k) => sum + (k.end - k.start), 0),
    blocked: null,
  };
}

/**
 * 入口：标记区间 + 时长 + 关键帧 → 导出计划。
 *
 * 步骤（每步都是可单测的纯函数，除不动点迭代本身）：
 *
 * 1. [`normalizeRemovals`]：裁剪 / 排序 / 合并；
 * 2. [`complementIntervals`]：对 `[0, 时长]` 求补集 → 候选保留段；
 * 3. 吸附：第 `i` 段（`i ≥ 1`）起点 = `nextKeyframeAtOrAfter(前一段删除区间的终点)`，
 *    取不到关键帧则记作片尾（该段作废）；**首段起点为 0，天然落在 0 号关键帧上，不动**；
 * 4. 吸收 + **不动点迭代**：低于下限（含空段）的保留段并回删除区间后重算，直到全部合格——
 *    实测中第 2 轮即为确认轮（丢弃的段不改变其余段的吸附基准），迭代保留是为了覆盖
 *    "关键帧稀疏 + 多段夹碎片"的一般情形；
 * 5. 收尾：`removals` = 保留段的补集（含碎片吸收）、`extends[i]` = 吸附后起点 − 吸附前起点、
 *    `totalSec` = Σ 保留段时长。
 *
 * 门禁优先级：未标记 → 关键帧未就绪 → 全删光（越靠前越先报，UI 文案按此顺序给）。
 */
export function planRemoval(args: PlanRemovalArgs): RemovalPlan {
  const { durationSec, keyframes, fps } = args;
  const initial = normalizeRemovals(args.marks, durationSec);
  if (initial.length === 0) return blockedPlan([], "no-marks");

  // 索引未就绪 ⇒ 边界定不了：不给保留段与时长（避免展示"未吸附"的假精确），导出由门禁拦下
  if (!keyframes || keyframes.length === 0) return blockedPlan(initial, "no-keyframes");

  const minKeep = effectiveMinKeep(args.minKeepSec, fps);
  let removals = initial;
  // 每轮至少并回一段（保留段数量单调不增）⇒ 至多 initial.length 轮；上限只作防御
  for (let round = 0; round <= initial.length; round++) {
    const gaps = gapsWithPrev(removals, durationSec);
    const aligned = gaps.map((g) => ({
      start:
        g.prevEnd === null
          ? g.start // 首段：起点在 0 上（0 号关键帧），不吸附
          : (nextKeyframeAtOrAfter(g.prevEnd, keyframes) ?? durationSec),
      end: g.end,
      gapStart: g.start,
    }));
    const kept = aligned.filter((k) => k.end - k.start > minKeep - EPS);
    if (kept.length === aligned.length) {
      return finalizePlan(
        kept.map(({ start, end }) => ({ start, end })),
        kept.map((k) => k.start - k.gapStart),
        durationSec,
      );
    }
    removals = complementIntervals(
      kept.map(({ start, end }) => ({ start, end })),
      durationSec,
    );
  }
  // 防御分支（数学上不可达：保留段数量每轮严格减少）；宁可不导出，也不下发未收敛的段
  return blockedPlan(complementIntervals([], durationSec), "nothing-left");
}
