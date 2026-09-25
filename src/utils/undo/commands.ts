/**
 * 撤销栈的命令层：**纯函数** builder + 钳制（TIMELINE.md §17.5 · plans/M11.md §18.1）。
 *
 * 约定：
 * - 每个 builder 是 `(doc, ctx) => TimelineCommand | null`；`null` = 这次手势什么都没改变
 *   （no-op / 取消 / 非法落点），**不入栈**，所以历史里不会出现"点了没反应"的条目。
 * - builder 不碰任何活状态、不产生副作用；`ctx.newId()` 在**构建时**分配 id 并冻进 `after`，
 *   这样重做（redo）能复现同一组 id。
 * - 一次用户手势 = 一条命令：批量手势用 [`buildComposite`] 合成。
 */
import type { Clip } from "../../types";
import { MIN_SEG_DURATION_SEC } from "../time";
import type {
  BuildCtx,
  CommandBuilder,
  CommandJSON,
  DocSlices,
  EditorDoc,
  TimelineCommand,
} from "./types";

/** fps 未知时的钳制粒度（plans/M11.md §18.1：钳制按帧，fps 缺失按 30） */
export const DEFAULT_FPS = 30;
/**
 * 浮点容差（秒，1µs），两个用途刻意共用同一量级、避免"同值不同名"各自漂移：
 * ① 端点同一判定（[`sameNum`] / [`computeTrim`] 的整段规范化）；
 * ② 导出映射空段阈值的边界容差（[`exportSegmentOf`]，`BUG-012`——钳到下限的
 *    1ulp 差不得把段吞成整段）。
 */
const EPS = 1e-6;

/** 修剪的哪一端 */
export type TrimEdge = "in" | "out";

// ---------------------------------------------------------------- 命令原语

/** 由两份冻结切片造命令：apply = 换成 `after`，invert = 换回 `before` */
function command(label: string, before: DocSlices, after: DocSlices): TimelineCommand {
  return {
    label,
    before,
    after,
    apply: (doc) => ({ ...doc, ...after }),
    invert: (doc) => ({ ...doc, ...before }),
    toJSON: () => ({ label, before, after }),
  };
}

/**
 * JSON → 命令。round-trip：`commandFromJSON(cmd.toJSON())` 与原命令在 apply/invert 上等价
 * （会话恢复 v1 不做，这里只把通路与一致性留出来并被单测覆盖）。
 */
export function commandFromJSON(json: CommandJSON): TimelineCommand {
  return command(json.label, json.before, json.after);
}

// ---------------------------------------------------------------- 工具

const slices = (doc: EditorDoc): DocSlices => ({
  clips: doc.clips,
  timeline: doc.timeline,
});

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

const sameNum = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * 切割/修剪共用的最短保留时长（秒）：`max(1 帧, MIN_SEG_DURATION_SEC)`。
 *
 * `BUG-012` 裁决（2026-09-25）：命令层下限从"1 帧"抬到与导出映射的空段阈值
 * （`MIN_SEG_DURATION_SEC`，M6-8 口径）**对齐**——否则 [1帧, 0.05s) 的短片段建得出来、
 * 导出却被规范成整段（违反 §17.9⑤"任意时间线状态导出正确"）。fps ≤ 20 的源 1 帧比
 * 0.05s 更长，仍按 1 帧。
 */
export function minSegSec(fps: number): number {
  return Math.max(1 / (fps > 0 ? fps : DEFAULT_FPS), MIN_SEG_DURATION_SEC);
}

/** 片段在源内的有效区间（`seg: null` = 整段） */
function clipRange(clip: Clip, durationSec: number): { start: number; end: number } {
  return clip.seg ?? { start: 0, end: durationSec };
}

/**
 * 片段在成品里的时长（秒）= 源内区间长度，全段（`seg: null`）= 源时长。
 * **源未探测（`sourceDurationSec` 为 null）返回 0**——与工作台片段卡、导出映射、成品连播
 * 口径一致（那边也是"探测不到就当 0"）；若改为返回 `seg` 长度，`buildSplit` 的前缀求和会
 * 与实际成品时长对不上。
 *
 * 这是"片段成品时长"的**唯一实现**（R2-2 收敛，原为命令层私有）：页面侧的 `clipDuration`
 * 也走它，两侧口径不可能再漂移；负跨度按 0 处理（正常数据不会出现，取命令层原口径兜底）。
 */
export function productDurationOf(seg: Clip["seg"], sourceDurationSec: number | null): number {
  if (sourceDurationSec === null) return 0;
  return seg ? Math.max(0, seg.end - seg.start) : sourceDurationSec;
}

function productDuration(doc: EditorDoc, ctx: BuildCtx, clipId: string): number {
  const clip = doc.clips.find((c) => c.id === clipId);
  if (!clip) return 0;
  return productDurationOf(clip.seg, ctx.source(clipId)?.durationSec ?? null);
}

// ---------------------------------------------------------------- builders

/**
 * 剪出片段（素材卡「剪出片段」/ 批量）：新建池条目（池序 = 创建序）并接入轴末尾。
 *
 * @param clip 除 `id` 外的初值（默认加工状态由调用方给），`id` 由 `ctx.newId()` 在构建时分配
 */
export function buildCreateClip(clip: Omit<Clip, "id">): CommandBuilder {
  return (doc, ctx) => {
    const created: Clip = { ...clip, id: ctx.newId() };
    return command("剪出片段", slices(doc), {
      clips: [...doc.clips, created],
      timeline: [...doc.timeline, created.id],
    });
  };
}

/**
 * 插入 / 移动到时间轴指定位置：池拖入、块拖动共用。
 *
 * `index` 是**先移除该 id** 之后的数组落点，且**钳制到 `[0, len]`**（负数 → 0、`NaN`/越界 → 末尾）。
 * 唯一的调用来源 `ClipTimeline` 只会给出 `[0, len)` 的整数，钳制只是兜底。
 * 已在轴上 = 移动语义；结果与当前顺序相同 → `null`（no-op）。
 */
export function buildInsert(clipId: string, index: number): CommandBuilder {
  return (doc) => {
    if (!doc.clips.some((c) => c.id === clipId)) return null;
    const next = doc.timeline.filter((x) => x !== clipId);
    const at = Number.isFinite(index) ? clamp(Math.floor(index), 0, next.length) : next.length;
    next.splice(at, 0, clipId);
    if (sameOrder(next, doc.timeline)) return null;
    const moving = doc.timeline.includes(clipId);
    return command(moving ? "移动片段" : "加入时间轴", slices(doc), {
      clips: doc.clips,
      timeline: next,
    });
  };
}

/** 池「+」：仅当不在轴上时追加到末尾；已在轴上 = no-op（与"加入"语义一致，不重排） */
export function buildAppendToTimeline(clipId: string): CommandBuilder {
  return (doc, ctx) =>
    doc.timeline.includes(clipId) ? null : buildInsert(clipId, doc.timeline.length)(doc, ctx);
}

/** 整块拖拽重排（`from`/`to` 为当前轴内下标）：内部即 [`buildInsert`] 的移动语义 */
export function buildReorder(from: number, to: number): CommandBuilder {
  return (doc, ctx) => {
    if (from === to) return null;
    const clipId = doc.timeline[from];
    if (clipId === undefined) return null;
    return buildInsert(clipId, to)(doc, ctx);
  };
}

/** 波纹删除：只从轴上摘掉，**池里保留**（TIMELINE.md §17.4 / 决策 #13） */
export function buildRemoveFromTimeline(clipId: string): CommandBuilder {
  return (doc) => {
    if (!doc.timeline.includes(clipId)) return null;
    return command("移出时间轴", slices(doc), {
      clips: doc.clips,
      timeline: doc.timeline.filter((x) => x !== clipId),
    });
  };
}

/** 移除并删除池条目（右键复合手势；也是 M11-0 之前「块 ✕」的既有语义） */
export function buildRemoveAndDelete(clipId: string): CommandBuilder {
  return (doc) => {
    if (!doc.clips.some((c) => c.id === clipId)) return null;
    return command("删除片段", slices(doc), {
      clips: doc.clips.filter((c) => c.id !== clipId),
      timeline: doc.timeline.filter((x) => x !== clipId),
    });
  };
}

/**
 * 切割（C / 右键）：`productTime` 是**成品时间轴**上的秒数。
 *
 * 源内换算：`sourceSplit = clip.in + (productTime − 片段在成品内的起点)`（TIMELINE.md §17.2）。
 * 落在片段外或任一半不足 [`minSegSec`] 判非法；两半各继承原片段的加工状态（rot/crop/lockRatio）；
 * 新片段入池末尾。
 */
export function buildSplit(clipId: string, productTime: number): CommandBuilder {
  return (doc, ctx) => {
    if (!Number.isFinite(productTime)) return null;
    const idx = doc.timeline.indexOf(clipId);
    const clip = doc.clips.find((c) => c.id === clipId);
    if (!clip || idx < 0) return null;
    const durationSec = ctx.source(clipId)?.durationSec ?? 0;
    if (durationSec <= 0) return null; // 源未探测：无从换算
    const minSeg = minSegSec(ctx.source(clipId)?.fps ?? 0);
    const { start: inPoint, end: outPoint } = clipRange(clip, durationSec);

    // 片段在成品内的起点 = 前面各片段的成品时长之和（顺序即位置的直接推论，无空隙模型）
    let offset = 0;
    for (const id of doc.timeline.slice(0, idx)) offset += productDuration(doc, ctx, id);
    const local = productTime - offset;
    const len = outPoint - inPoint;
    // 落在片段外，或任一半不足最短保留时长（BUG-012：max(1帧, 0.05s)——半段建出来也导不出）
    if (local < minSeg || len - local < minSeg) return null;

    const srcSplit = inPoint + local;
    const left: Clip = { ...clip, id: ctx.newId(), seg: { start: inPoint, end: srcSplit } };
    const right: Clip = { ...clip, id: ctx.newId(), seg: { start: srcSplit, end: outPoint } };

    const timeline = [...doc.timeline];
    timeline.splice(idx, 1, left.id, right.id);
    return command("切割片段", slices(doc), {
      // 原片段被两半完全覆盖 → 出池（上表位置原位替换为两个新 id）
      clips: [...doc.clips.filter((c) => c.id !== clipId), left, right],
      timeline,
    });
  };
}

/**
 * 修剪钳制核心：预览（ClipTimeline 拖动中的 tooltip/块形）与提交（[`buildTrim`]）**共用**
 * 同一实现，保证"看到的就是松手后会得到的"。新端点钳到 `[0, 源时长]` 且有效区间 ≥
 * [`minSegSec`]（`BUG-012`：与导出映射阈值对齐）。
 *
 * 返回 `null` = 输入非法（非有限数 / 源时长非正）；`seg` 已做规范形态
 * （钳到整段 → `null`，导出映射与 no-op 判定都依赖它）。
 */
export function computeTrim(
  cur: { start: number; end: number },
  durationSec: number,
  fps: number,
  edge: TrimEdge,
  srcTime: number,
): { seg: Clip["seg"]; start: number; end: number } | null {
  if (!Number.isFinite(srcTime) || durationSec <= 0) return null;
  const minSeg = minSegSec(fps);
  let { start, end } = cur;
  if (edge === "in") {
    start = clamp(srcTime, 0, Math.max(0, end - minSeg));
  } else {
    end = clamp(srcTime, Math.min(durationSec, start + minSeg), durationSec);
  }
  const seg = start <= EPS && end >= durationSec - EPS ? null : { start, end };
  return { seg, start, end };
}

/**
 * 边缘修剪：新端点按**源内时间**给（`srcTime`），钳制与规范形态见 [`computeTrim`]。
 */
export function buildTrim(clipId: string, edge: TrimEdge, srcTime: number): CommandBuilder {
  return (doc, ctx) => {
    const clip = doc.clips.find((c) => c.id === clipId);
    if (!clip) return null;
    const src = ctx.source(clipId);
    const durationSec = src?.durationSec ?? 0;
    const cur = clipRange(clip, durationSec);
    const next = computeTrim(cur, durationSec, src?.fps ?? 0, edge, srcTime);
    if (!next) return null; // 源未探测：无从钳制

    // no-op 判定比的是**有效区间**（而不是表示形态）：`seg: null` 与 `{0, 源时长}` 内容相同，
    // 只因为写法不同就入栈会留下"撤销了但看不出变化"的脏历史。
    if (sameNum(next.start, cur.start) && sameNum(next.end, cur.end)) return null;

    return command(edge === "in" ? "修剪入点" : "修剪出点", slices(doc), {
      clips: doc.clips.map((c) => (c.id === clipId ? { ...c, seg: next.seg } : c)),
      timeline: doc.timeline,
    });
  };
}

/**
 * 文档片段 → 导出映射的 `segment` 字段（Workbench payload 的**唯一实现**，R2-2 同款收敛思路）：
 * 区间时长 > `MIN_SEG_DURATION_SEC − 容差` 才作为有效段下发，否则规范为 `null`（整段）。
 *
 * M6-8 空段口径；`BUG-012` 裁决后命令层下限与该阈值对齐（[`minSegSec`]），判定留 1µs 容差
 * （[`EPS`]）吸收"恰好钳到下限"的浮点末位差——builder 建出的任何片段都不会在这里被吞成
 * 整段。后端提交期校验是同式同源的 `commands::valid_segment_span`（src-tauri），改动必须两侧同批。
 */
export function exportSegmentOf(
  seg: Clip["seg"],
): { startSec: number; endSec: number } | null {
  if (!seg) return null;
  return seg.end - seg.start > MIN_SEG_DURATION_SEC - EPS
    ? { startSec: seg.start, endSec: seg.end }
    : null;
}

/**
 * 复合手势：把多个 builder 的结果合成**一条**命令（批量操作 = 一条撤销记录）。
 * 逐个作用于工作副本；全部 no-op 时返回 `null`。
 */
export function buildComposite(
  label: string,
  builders: readonly CommandBuilder[],
): CommandBuilder {
  return (doc, ctx) => {
    let cur: EditorDoc = doc;
    for (const b of builders) {
      const cmd = b(cur, ctx);
      if (cmd) cur = cmd.apply(cur);
    }
    if (cur === doc) return null;
    return command(label, slices(doc), slices(cur));
  };
}
