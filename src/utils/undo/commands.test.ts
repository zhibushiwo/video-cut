/**
 * 命令层与撤销栈的单测基线（TIMELINE.md §17.5 的 6 条 Clypra 清单 + 钳制域）。
 *
 * 纯函数脱离 React：builder 只吃 `(doc, ctx)`，栈的规则在 `createUndoStack` 里，
 * 所以这里不需要 DOM、不需要渲染。
 */
import { describe, expect, it } from "vitest";
import type { Clip } from "../../types";
import {
  buildAppendToTimeline,
  buildComposite,
  buildCreateClip,
  buildInsert,
  buildRemoveAndDelete,
  buildRemoveFromTimeline,
  buildReorder,
  buildSplit,
  buildTrim,
  commandFromJSON,
  DEFAULT_FPS,
} from "./commands";
import { createUndoStack } from "./store";
import type { BuildCtx, CommandBuilder, EditorDoc } from "./types";

const FPS = 25;
/** 测试用源时长（秒） */
const DUR = 10;
const NO_ROT = { deg: 0, hflip: false, vflip: false };

/** 造片段：`seg` 给 null = 整段 */
function clip(id: string, start: number | null = null, end: number | null = null): Clip {
  return {
    id,
    sourceId: "src-1",
    seg: start === null || end === null ? null : { start, end },
    rot: NO_ROT,
    crop: null,
    lockRatio: true,
  };
}

function docOf(clips: Clip[], timeline?: string[]): EditorDoc {
  return { clips, timeline: timeline ?? clips.map((c) => c.id) };
}

/** 构建上下文：id 确定性递增（断言可写死），源参数固定 FPS×DUR */
function ctx(duration: number = DUR, fps: number = FPS): BuildCtx {
  let n = 0;
  return {
    source: () => (duration > 0 ? { fps, durationSec: duration } : null),
    newId: () => `n${++n}`,
  };
}

const segOf = (cmd: { after: EditorDoc }, id: string) =>
  cmd.after.clips.find((c) => c.id === id)?.seg;

// ---------------------------------------------------------------- 撤销语义

describe("撤销语义（TIMELINE.md §17.5 基线）", () => {
  it("① 切割 → 撤销 → 重做：文档与首次 apply 逐字节一致（含 id）", () => {
    const d0 = docOf([clip("a", 0, DUR)]);
    const cmd = buildSplit("a", 2)(d0, ctx());
    expect(cmd).not.toBeNull();

    const d1 = cmd!.apply(d0);
    // 源内换算：成品 2s → 源 0 + 2 = 2（clip.in = 0）
    expect(d1.clips.map((c) => [c.id, c.seg])).toEqual([
      ["n1", { start: 0, end: 2 }],
      ["n2", { start: 2, end: DUR }],
    ]);
    expect(d1.timeline).toEqual(["n1", "n2"]);

    const back = cmd!.invert(d1);
    expect(back).toEqual(d0);

    const again = cmd!.apply(back);
    expect(again).toEqual(d1);
    expect(again.clips.map((c) => c.id)).toEqual(["n1", "n2"]);
  });

  it("② toJSON → fromJSON round-trip 后 apply/invert 与原件等价", () => {
    const d0 = docOf([clip("a", 2, 6), clip("b")], ["a", "b"]);
    const cmd = buildTrim("a", "in", 3)(d0, ctx());
    expect(cmd).not.toBeNull();

    // 走一遍真实的序列化（不是共享引用）
    const revived = commandFromJSON(JSON.parse(JSON.stringify(cmd!.toJSON())));
    expect(revived.label).toBe(cmd!.label);
    const applied = cmd!.apply(d0);
    expect(revived.apply(d0)).toEqual(applied);
    expect(revived.invert(applied)).toEqual(cmd!.invert(applied));
  });

  it("③ no-op 返回 null **且不入栈**：同 index 重排 / 落点等价 / 边缘切割 / 修剪到原值", () => {
    const d0 = docOf([clip("a"), clip("b")], ["a", "b"]);
    const c = ctx();
    const stack = createUndoStack();
    const noops: [string, CommandBuilder][] = [
      ["同 index 重排", buildReorder(1, 1)],
      ["落点与现位置等价", buildInsert("a", 0)],
      ["播放头压在片段起点", buildSplit("a", 0)],
      ["距末段出点 1 帧内", buildSplit("b", DUR + 1 / FPS / 2)],
      ["修剪到原值", buildTrim("a", "in", 0)],
      ["不在轴上", buildRemoveFromTimeline("不在轴上")],
      ["片段不存在", buildRemoveAndDelete("不存在")],
    ];
    for (const [what, builder] of noops) {
      expect(builder(d0, c), `${what}：应返回 null`).toBeNull();
      expect(stack.execute(d0, c, builder), `${what}：execute 应返回 null`).toBeNull();
    }
    // 关键：一次都没进历史
    expect(stack.depth).toBe(0);
    expect(stack.canUndo).toBe(false);
    expect(stack.undoLabel).toBeNull();
  });

  it("④ 手势取消：拖动中反复构建不入栈，只有提交那一次入栈", () => {
    const d0 = docOf([clip("a", 0, DUR)]);
    const snapshot = JSON.parse(JSON.stringify(d0)) as EditorDoc; // 深拷一份作对照
    const stack = createUndoStack();
    const c = ctx();

    // 修剪拖动中会不断构建"若此刻松手"的命令（供 tooltip 预览），但一次都不提交
    const previews = [3, 3.5, 4].map((t) => buildTrim("a", "in", t)(d0, c));
    expect(previews.every((x) => x !== null)).toBe(true); // 确实构建出了命令
    expect(stack.depth).toBe(0); // 但历史仍是空的
    expect(stack.undo()).toBeNull(); // 没有可撤销的东西
    // Esc / pointercancel 取消 = 丢弃那些命令：它们只被构建、从未 apply → 文档一字未改
    expect(d0).toEqual(snapshot);

    // 松手提交 → 只入一条
    expect(stack.execute(d0, c, buildTrim("a", "in", 4))).not.toBeNull();
    expect(stack.depth).toBe(1);
    expect(stack.undoLabel).toBe("修剪入点");
  });

  it("⑤ 连续两条命令撤销两次精确回到初始（先撤最近的那条）", () => {
    const stack = createUndoStack();
    const c = ctx();
    const initial = docOf([clip("a"), clip("b")], ["a", "b"]);
    let d: EditorDoc = initial;

    d = stack.execute(d, c, buildTrim("a", "in", 2))!.apply(d);
    d = stack.execute(d, c, buildReorder(0, 1))!.apply(d);
    expect(d.timeline).toEqual(["b", "a"]);
    expect(segOf({ after: d }, "a")).toEqual({ start: 2, end: DUR });

    d = stack.undo()!.invert(d); // 撤销重排
    expect(d.timeline).toEqual(["a", "b"]);
    expect(segOf({ after: d }, "a")).toEqual({ start: 2, end: DUR });

    d = stack.undo()!.invert(d); // 撤销修剪
    expect(d).toEqual(initial);
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(true);
  });

  it("⑥ 重做复现同一 id（id 在构建时分配并冻结进 after）", () => {
    const stack = createUndoStack();
    const c = ctx();
    const d0 = docOf([]);
    const created = stack.execute(
      d0,
      c,
      buildCreateClip({ sourceId: "src-1", seg: null, rot: NO_ROT, crop: null, lockRatio: true }),
    );
    const d1 = created!.apply(d0);
    const ids = d1.clips.map((x) => x.id);
    expect(ids).toHaveLength(1);

    const undone = stack.undo()!.invert(d1);
    expect(undone.clips).toEqual([]);
    const redone = stack.redo()!.apply(undone);
    expect(redone.clips.map((x) => x.id)).toEqual(ids); // 不是新 id
  });
});

// ---------------------------------------------------------------- 钳制域

describe("钳制域（plans/M11.md §18.1）", () => {
  it("trim 出界钳到源边界；钳成整段时规范为 seg=null", () => {
    const c = ctx();
    const d0 = docOf([clip("a", 2, 6)]);
    // 入点拉到源开头 → [0, 6)
    expect(segOf({ after: buildTrim("a", "in", -5)(d0, c)!.after }, "a")).toEqual({
      start: 0,
      end: 6,
    });
    // 出点拉到源末 → [2, 10)（不是整段，入点还在 2）
    expect(segOf({ after: buildTrim("a", "out", 99)(d0, c)!.after }, "a")).toEqual({
      start: 2,
      end: DUR,
    });

    // 回整段要规范成 seg=null：导出映射与 no-op 判定都依赖这个形态
    const full = docOf([clip("a", 0, DUR)]);
    const shrunk = buildTrim("a", "in", 3)(full, c)!.apply(full);
    const regrown = buildTrim("a", "in", 0)(shrunk, c);
    expect(segOf({ after: regrown!.after }, "a")).toBeNull();
    // 已经是整段 → 再"回整段"就是 no-op
    expect(buildTrim("a", "in", 0)(full, c)).toBeNull();
  });

  it("trim 至少保留 1 帧（入点不得超过出点、出点不得低于入点）", () => {
    const d0 = docOf([clip("a", 0, DUR)]);
    const c = ctx();
    expect(segOf({ after: buildTrim("a", "in", 99)(d0, c)!.after }, "a")).toEqual({
      start: DUR - 1 / FPS,
      end: DUR,
    });
    expect(segOf({ after: buildTrim("a", "out", -3)(d0, c)!.after }, "a")).toEqual({
      start: 0,
      end: 1 / FPS,
    });
  });

  it("fps 未知时按 DEFAULT_FPS 钳制", () => {
    const d0 = docOf([clip("a", 0, DUR)]);
    const c: BuildCtx = { source: () => ({ fps: 0, durationSec: DUR }), newId: () => "x" };
    expect(segOf({ after: buildTrim("a", "in", 99)(d0, c)!.after }, "a")).toEqual({
      start: DUR - 1 / DEFAULT_FPS,
      end: DUR,
    });
  });

  it("split 距边缘 <1 帧判非法（两侧都算）", () => {
    // 注意 productTime 是**成品**坐标：片段 a 的成品区间是 [0, 4)（源内 [2, 6)）
    const d0 = docOf([clip("a", 2, 6)]);
    const c = ctx();
    expect(buildSplit("a", 1 / FPS / 2)(d0, c)).toBeNull(); // 贴入点半帧
    expect(buildSplit("a", 4 - 1 / FPS / 2)(d0, c)).toBeNull(); // 贴出点半帧
    expect(buildSplit("a", 1 / FPS)(d0, c)).not.toBeNull(); // 恰好 1 帧 → 合法
    expect(buildSplit("a", 4 + 1 / FPS)(d0, c)).toBeNull(); // 完全在片段之外
  });

  it("split 的源内换算带上片段已有入点与轴上前缀时长", () => {
    // a: [2, 6)（成品 4s）、b: 整段 10s → b 在成品里从 4s 开始
    const d0 = docOf([clip("a", 2, 6), clip("b")], ["a", "b"]);
    const cmd = buildSplit("b", 4 + 3)(d0, ctx());
    expect(cmd).not.toBeNull();
    // b 的源内切点 = 0 + (7 − 4) = 3
    const halves = cmd!.after.clips.filter((c) => c.id.startsWith("n"));
    expect(halves.map((c) => c.seg)).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: DUR },
    ]);
    expect(cmd!.after.timeline).toEqual(["a", "n1", "n2"]);
  });

  it("源未探测（durationSec=0）时切割/修剪判非法", () => {
    const d0 = docOf([clip("a")]);
    const unknown = ctx(0);
    expect(buildSplit("a", 1)(d0, unknown)).toBeNull();
    expect(buildTrim("a", "in", 1)(d0, unknown)).toBeNull();
  });

  it("波纹删除只出轴，池条目保留", () => {
    const d0 = docOf([clip("a"), clip("b")], ["a", "b"]);
    const cmd = buildRemoveFromTimeline("a")(d0, ctx());
    expect(cmd!.after.timeline).toEqual(["b"]);
    expect(cmd!.after.clips.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("池「+」只追加不重排：已在轴上 / 片段不在池 都判 no-op", () => {
    const c = ctx();
    const d0 = docOf([clip("a"), clip("b")], ["a", "b"]);
    // 已在轴上 → 不把它挪到末尾（这是 append 与 insert 的语义分界）
    expect(buildAppendToTimeline("a")(d0, c)).toBeNull();
    // 片段不在池里 → 不能凭空造条目
    expect(buildAppendToTimeline("不存在")(d0, c)).toBeNull();
    // 不在轴上 → 追加到末尾
    const d1 = docOf([clip("a"), clip("b"), clip("c")], ["a", "b"]);
    expect(buildAppendToTimeline("c")(d1, c)!.after.timeline).toEqual(["a", "b", "c"]);
  });

  it("insert 移动语义：越界/负数/NaN 的兜底钳制", () => {
    const d0 = docOf([clip("a"), clip("b"), clip("c")], ["a", "b", "c"]);
    const c = ctx();
    expect(buildInsert("a", 2)(d0, c)!.after.timeline).toEqual(["b", "c", "a"]);
    expect(buildInsert("c", 0)(d0, c)!.after.timeline).toEqual(["c", "a", "b"]);
    expect(buildInsert("a", 99)(d0, c)!.after.timeline).toEqual(["b", "c", "a"]); // 越界 → 末尾
    expect(buildInsert("a", NaN)(d0, c)!.after.timeline).toEqual(["b", "c", "a"]); // NaN → 末尾
    expect(buildInsert("a", -3)(d0, c)).toBeNull(); // 负数 → 钳到 0 → 与原位相同 → no-op
  });
});

// ---------------------------------------------------------------- 栈规则

describe("栈规则（plans/M11.md §18.1）", () => {
  it("批量手势合成一条命令（一次撤销全部回退）", () => {
    const stack = createUndoStack();
    const c = ctx();
    const d0 = docOf([]);
    const cmd = buildComposite("批量建 3 个片段", [
      buildCreateClip({ sourceId: "src-1", seg: null, rot: NO_ROT, crop: null, lockRatio: true }),
      buildCreateClip({ sourceId: "src-2", seg: null, rot: NO_ROT, crop: null, lockRatio: true }),
      buildCreateClip({ sourceId: "src-3", seg: null, rot: NO_ROT, crop: null, lockRatio: true }),
    ])(d0, c)!;
    const d1 = cmd.apply(d0);
    expect(d1.clips.map((x) => x.sourceId)).toEqual(["src-1", "src-2", "src-3"]);
    expect(d1.timeline).toEqual(["n1", "n2", "n3"]);

    const landed = stack.execute(d0, c, () => cmd);
    expect(landed).toBe(cmd);
    expect(stack.depth).toBe(1); // 三条子命令 → 一条历史
    expect(stack.undo()!.invert(d1)).toEqual(d0);
  });

  it("新操作清空重做链", () => {
    const stack = createUndoStack();
    const c = ctx();
    const d0 = docOf([clip("a"), clip("b")], ["a", "b"]);
    let d: EditorDoc = d0;
    d = stack.execute(d, c, buildTrim("a", "in", 2))!.apply(d);
    d = stack.undo()!.invert(d);
    expect(d).toEqual(d0);
    expect(stack.canRedo).toBe(true);
    // 撤销后做别的操作 → 重做链作废
    stack.execute(d, c, buildTrim("b", "in", 3));
    expect(stack.canRedo).toBe(false);
    expect(stack.redo()).toBeNull();
  });

  it("栈上限丢最旧", () => {
    const stack = createUndoStack(3);
    const c = ctx();
    let d: EditorDoc = docOf([clip("a")]);
    for (const t of [1, 2, 3, 4, 5]) {
      d = stack.execute(d, c, buildTrim("a", "in", t))!.apply(d);
    }
    expect(stack.depth).toBe(3);
    expect(stack.undoLabel).toBe("修剪入点");

    stack.clear();
    expect(stack.depth).toBe(0);
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
    expect(stack.undo()).toBeNull();
  });

  it("buildComposite：空 builders 与全 no-op 子命令都返回 null", () => {
    const d0 = docOf([clip("a"), clip("b")], ["a", "b"]);
    const c = ctx();
    expect(buildComposite("空", [])(d0, c)).toBeNull();
    expect(
      buildComposite("全 no-op", [buildReorder(1, 1), buildInsert("a", 0)])(d0, c),
    ).toBeNull();

    // 只要有一步产生变化就成一条命令；no-op 的那步不留下痕迹
    const mixed = buildComposite("混合", [buildReorder(1, 1), buildTrim("a", "in", 2)])(d0, c);
    expect(mixed).not.toBeNull();
    expect(mixed!.after.timeline).toEqual(["a", "b"]);
    expect(mixed!.label).toBe("混合");
    expect(mixed!.after.clips[0].seg).toEqual({ start: 2, end: DUR });
    expect(mixed!.before).toEqual(d0);
  });
});
