/**
 * 撤销栈的类型契约（TIMELINE.md §17.5 · plans/M11.md §18.1）。
 *
 * 范式：一条命令 = **冻结快照对**（`before`/`after`），不是增量补丁。undo/redo 都只是
 * "整体换文档"，不含任何回放逻辑；两份切片直接共享未变动的数组引用（结构共享），
 * 所以快照近乎零拷贝。
 *
 * 分层：本文件只有类型；builder 与钳制在 `commands.ts`（纯函数，可脱离 React 单测）；
 * React 适配在 `store.ts`。
 */
import type { Clip } from "../../types";

/**
 * 编辑文档：**唯一可撤销**的状态。
 * UI 状态（选择 / 预览模式 / 播放头 / 缩放滚动 / 检测结果）与旁路状态（素材表 `files`、
 * 片段的 rot/crop/lockRatio）都不在这里，见 plans/M11.md §18.1 的三类边界表。
 */
export interface EditorDoc {
  /** 片段池：顺序 = 创建序（决策 #13） */
  clips: Clip[];
  /** 成品顺序：片段 id 有序表（唯一顺序语义，决策 #13） */
  timeline: string[];
}

/** 命令冻结的切片 = 文档状态（`EditorDoc` 将来若加旁路字段，命令层仍只切这部分） */
export type DocSlices = Pick<EditorDoc, "clips" | "timeline">;

/** 序列化形态（会话恢复 v1 不做，但 round-trip 一致性由单测锁住） */
export interface CommandJSON {
  label: string;
  before: DocSlices;
  after: DocSlices;
}

export interface TimelineCommand {
  /** 人可读标签（右键菜单「撤销：切割」用） */
  readonly label: string;
  readonly before: DocSlices;
  readonly after: DocSlices;
  apply(doc: EditorDoc): EditorDoc;
  invert(doc: EditorDoc): EditorDoc;
  toJSON(): CommandJSON;
}

/** 构建期上下文：builder 需要的外部事实（钳制用的源参数、id 分配） */
export interface BuildCtx {
  /**
   * 片段所属源的 `{ fps, durationSec }`；素材未探测完 / 非视频源返回 `null`
   * （钳制退化为 `DEFAULT_FPS`；源时长未知时相关手势直接判非法）。
   */
  source(clipId: string): { fps: number; durationSec: number } | null;
  /** 分配新 id —— **只在构建时**调用并冻结进 `after`，所以重做复现同一 id */
  newId(): string;
}

/** 一次用户手势 → 一条命令；no-op / 取消 / 非法落点返回 `null`（不入栈） */
export type CommandBuilder = (doc: EditorDoc, ctx: BuildCtx) => TimelineCommand | null;

/** 撤销栈上限（条）；溢出丢最旧（plans/M11.md §18.1） */
export const UNDO_LIMIT = 100;
