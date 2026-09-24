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
/** 端点比较精度（秒）：低于它视为同一个点，避免浮点末位差生成空命令 */
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

/** 钳制粒度：1 帧（fps 未知按 [`DEFAULT_FPS`]） */
function frameSec(ctx: BuildCtx, clipId: string): number {
  const fps = ctx.source(clipId)?.fps ?? 0;
  return 1 / (fps > 0 ? fps : DEFAULT_FPS);
}

/** 片段在源内的有效区间（`seg: null` = 整段） */
function clipRange(clip: Clip, durationSec: number): { start: number; end: number } {
  return clip.seg ?? { start: 0, end: durationSec };
}

/**
 * 片段在成品里的时长 = 源内区间长度。
 * **源未探测（`ctx.source` 为 null）返回 0**——与工作台的 `clipDuration`、导出映射口径一致
 * （那边也是"探测不到就当 0"）；若这里改成返回 `seg` 长度，`buildSplit` 的前缀求和会与实际
 * 成品时长对不上。本函数是命令层对"成品时长"的**唯一**实现（不能 import 页面里的回调）。
 */
function productDuration(doc: EditorDoc, ctx: BuildCtx, clipId: string): number {
  const clip = doc.clips.find((c) => c.id === clipId);
  const info = clip ? ctx.source(clipId) : null;
  if (!clip || !info) return 0;
  const r = clipRange(clip, info.durationSec);
  return Math.max(0, r.end - r.start);
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
 * 距任一端点 <1 帧判非法；两半各继承原片段的加工状态（rot/crop/lockRatio）；新片段入池末尾。
 */
export function buildSplit(clipId: string, productTime: number): CommandBuilder {
  return (doc, ctx) => {
    if (!Number.isFinite(productTime)) return null;
    const idx = doc.timeline.indexOf(clipId);
    const clip = doc.clips.find((c) => c.id === clipId);
    if (!clip || idx < 0) return null;
    const durationSec = ctx.source(clipId)?.durationSec ?? 0;
    if (durationSec <= 0) return null; // 源未探测：无从换算
    const frame = frameSec(ctx, clipId);
    const { start: inPoint, end: outPoint } = clipRange(clip, durationSec);

    // 片段在成品内的起点 = 前面各片段的成品时长之和（顺序即位置的直接推论，无空隙模型）
    let offset = 0;
    for (let i = 0; i < idx; i++) offset += productDuration(doc, ctx, doc.timeline[i]);
    const local = productTime - offset;
    const len = outPoint - inPoint;
    if (local < frame || len - local < frame) return null; // 落在片段外或距边缘 <1 帧

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
 * 边缘修剪：新端点按**源内时间**给（`srcTime`），钳制到 `[0, 源时长]` 且区间 ≥1 帧
 * （入边 ≤ 出边 − 1 帧，出边 ≥ 入边 + 1 帧）。
 *
 * 钳到整段时回写 `seg: null`（规范形态——导出映射与 no-op 判定都靠它）。
 */
export function buildTrim(clipId: string, edge: TrimEdge, srcTime: number): CommandBuilder {
  return (doc, ctx) => {
    if (!Number.isFinite(srcTime)) return null;
    const clip = doc.clips.find((c) => c.id === clipId);
    if (!clip) return null;
    const durationSec = ctx.source(clipId)?.durationSec ?? 0;
    if (durationSec <= 0) return null; // 源未探测：无从钳制
    const frame = frameSec(ctx, clipId);
    const cur = clipRange(clip, durationSec);

    let { start, end } = cur;
    if (edge === "in") {
      start = clamp(srcTime, 0, Math.max(0, end - frame));
    } else {
      end = clamp(srcTime, Math.min(durationSec, start + frame), durationSec);
    }

    // no-op 判定比的是**有效区间**（而不是表示形态）：`seg: null` 与 `{0, 源时长}` 内容相同，
    // 只因为写法不同就入栈会留下"撤销了但看不出变化"的脏历史。
    if (sameNum(start, cur.start) && sameNum(end, cur.end)) return null;

    // 钳到整段时回写规范形态 null（导出映射与 no-op 判定都依赖它）
    const seg = start <= EPS && end >= durationSec - EPS ? null : { start, end };
    return command(edge === "in" ? "修剪入点" : "修剪出点", slices(doc), {
      clips: doc.clips.map((c) => (c.id === clipId ? { ...c, seg } : c)),
      timeline: doc.timeline,
    });
  };
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
