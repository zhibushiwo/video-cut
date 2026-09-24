/**
 * 撤销栈：纯核心 [`createUndoStack`] + React 适配 [`useUndoStack`]（TIMELINE.md §17.5）。
 *
 * 拆两层的理由：栈的**规则**（null 不入栈、成功清空重做栈、上限丢最旧）是纯逻辑，
 * 不该只能靠渲染来验证——单测直接打核心；hook 只负责"读最新文档、写 React state"。
 */
import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  UNDO_LIMIT,
  type BuildCtx,
  type CommandBuilder,
  type EditorDoc,
  type TimelineCommand,
} from "./types";

export interface UndoCore {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** 下一次撤销会撤销的操作名（右键菜单「撤销：切割」）；无可撤销时 null */
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  /** 深度（调试/单测用） */
  readonly depth: number;
  /** 构建并入栈；返回命令或 null（no-op / 取消 / 非法落点，不入栈） */
  execute(doc: EditorDoc, ctx: BuildCtx, builder: CommandBuilder): TimelineCommand | null;
  /** 出栈，返回要 `invert` 的命令（没有则 null） */
  undo(): TimelineCommand | null;
  /** 出栈，返回要 `apply` 的命令（没有则 null） */
  redo(): TimelineCommand | null;
  clear(): void;
}

/**
 * 纯命令栈（无 React）。`limit` 条封顶，溢出丢**最旧**。
 */
export function createUndoStack(limit: number = UNDO_LIMIT): UndoCore {
  const past: TimelineCommand[] = [];
  const future: TimelineCommand[] = [];
  return {
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get undoLabel() {
      return past.length > 0 ? past[past.length - 1].label : null;
    },
    get redoLabel() {
      return future.length > 0 ? future[future.length - 1].label : null;
    },
    get depth() {
      return past.length;
    },
    execute(doc, ctx, builder) {
      const cmd = builder(doc, ctx);
      if (!cmd) return null; // 无变化 → 不产生脏历史
      past.push(cmd);
      if (past.length > limit) past.shift();
      future.length = 0; // 新操作作废重做链
      return cmd;
    },
    undo() {
      const cmd = past.pop();
      if (!cmd) return null;
      future.push(cmd);
      return cmd;
    },
    redo() {
      const cmd = future.pop();
      if (!cmd) return null;
      past.push(cmd);
      return cmd;
    },
    clear() {
      past.length = 0;
      future.length = 0;
    },
  };
}

export interface UndoStack extends Omit<UndoCore, "execute" | "undo" | "redo" | "depth"> {
  /** 执行一次手势；返回是否入栈（false = no-op / 取消 / 非法落点） */
  execute(builder: CommandBuilder): boolean;
  undo(): boolean;
  redo(): boolean;
  /** 不经栈直接改文档：旁路状态（片段 rot/crop 加工、素材删除的联动清理） */
  applyRaw(update: (doc: EditorDoc) => EditorDoc): void;
}

export interface UndoStackOptions {
  doc: EditorDoc;
  setDoc: Dispatch<SetStateAction<EditorDoc>>;
  /** 构建上下文；每次渲染重建，栈内以 ref 镜像，保证事件时读到最新（无 stale 闭包） */
  ctx: BuildCtx;
  limit?: number;
}

/**
 * 工作台的撤销栈。**只在事件处理器里调用** `execute`（命令构建不进 render）。
 */
export function useUndoStack({ doc, setDoc, ctx, limit }: UndoStackOptions): UndoStack {
  const coreRef = useRef<UndoCore | null>(null);
  if (!coreRef.current) coreRef.current = createUndoStack(limit);
  const core = coreRef.current;

  // docRef 是"事件时读到的最新文档"：渲染期同步一次，**每次写文档时也立即推进**（见 commit）。
  // 后者是必要的——只靠 setDoc 的话，同一 tick 内连续两次 execute 会都读到陈旧快照，
  // 第二条命令的 after 基于旧文档算出，apply 时把第一次的改动覆盖掉（M11-7 接键盘连发时会踩）。
  const docRef = useRef(doc);
  const ctxRef = useRef(ctx);
  docRef.current = doc;
  ctxRef.current = ctx;

  /** 写文档：即时推进 docRef（事件时真源）+ 交给 React 状态 */
  const commit = useCallback(
    (next: EditorDoc) => {
      docRef.current = next;
      setDoc(next);
    },
    [setDoc],
  );

  // 栈本身不进 render（用 ref 持有）。`execute/undo/redo` 都经 commit 换掉 doc 对象，必然重渲染，
  // 所以派生值（canUndo/undoLabel…）跟着走；只有 `clear()` 不改文档，需要显式 bump。
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((v) => v + 1), []);

  const execute = useCallback(
    (builder: CommandBuilder): boolean => {
      const cmd = core.execute(docRef.current, ctxRef.current, builder);
      if (!cmd) return false;
      commit(cmd.apply(docRef.current));
      return true;
    },
    [core, commit],
  );

  const undo = useCallback((): boolean => {
    const cmd = core.undo();
    if (!cmd) return false;
    commit(cmd.invert(docRef.current));
    return true;
  }, [core, commit]);

  const redo = useCallback((): boolean => {
    const cmd = core.redo();
    if (!cmd) return false;
    commit(cmd.apply(docRef.current));
    return true;
  }, [core, commit]);

  const applyRaw = useCallback(
    (update: (doc: EditorDoc) => EditorDoc) => commit(update(docRef.current)),
    [commit],
  );

  /** 清空历史：栈是 ref（不进 render），所以必须显式触发一次重渲染，否则 `canUndo` 会停在旧值 */
  const clear = useCallback(() => {
    core.clear();
    rerender();
  }, [core, rerender]);

  // 每次渲染返回新对象（派生值 canUndo/undoLabel 必须跟着栈走）；三个动作函数本身是稳定的，
  // 需要稳定引用的地方请直接依赖 execute/undo/redo。
  return {
    execute,
    undo,
    redo,
    applyRaw,
    clear,
    canUndo: core.canUndo,
    canRedo: core.canRedo,
    undoLabel: core.undoLabel,
    redoLabel: core.redoLabel,
  };
}
