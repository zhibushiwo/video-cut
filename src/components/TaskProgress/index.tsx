import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  cancelTask,
  clearFinishedTasks,
  listTasks,
  onTaskProgress,
  onTaskStatus,
  openLogsFolder,
  revealInFolder,
} from "../../services/tauri";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import type { TaskSnapshot } from "../../types";

interface TaskRow {
  snap: TaskSnapshot;
  percent: number | null;
  speed: string | null;
}

/**
 * 全局任务面板（DESIGN §9.7）：右下角浮层，订阅 task-status / task-progress 事件。
 * 挂载在 App 顶层，任意页面可见；autoCloseSec > 0 时终态任务到时自动消失（M7-5）。
 */
export default function TaskProgress({ autoCloseSec = 0 }: { autoCloseSec?: number }) {
  const [rows, setRows] = useState<Map<string, TaskRow>>(new Map());
  /** 复制日志按钮的短暂反馈 */
  const [copied, setCopied] = useState<Set<string>>(new Set());
  // 自动关闭定时器；ref 读最新设置避免事件闭包过期
  const autoCloseRef = useRef(autoCloseSec);
  autoCloseRef.current = autoCloseSec;
  const timersRef = useRef<Map<string, number>>(new Map());

  const copyLog = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // WebView2 非 https 源等场景的兜底
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setCopied((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1500);
  };

  // 订阅 task-status（R1-2：退订统一走 useTauriEvent，resolve 前卸载也不漏）
  useTauriEvent(() => {
    const ensureMeta = (taskId: string) => {
      setRows((prev) => {
        if (prev.has(taskId)) return prev;
        // 新任务缺少 label/kind，从 list_tasks 补齐
        void listTasks().then((snaps) => {
          setRows((cur) => {
            const next = new Map(cur);
            const row = next.get(taskId);
            const meta = snaps.find((s) => s.id === taskId);
            if (row && meta) {
              next.set(taskId, { ...row, snap: { ...meta, status: row.snap.status, error: row.snap.error, outputs: row.snap.outputs } });
            }
            return next;
          });
        });
        const placeholder: TaskRow = {
          snap: {
            id: taskId,
            kind: "",
            label: "处理中…",
            status: "running",
            progress: null,
            error: null,
            outputs: [],
          },
          percent: null,
          speed: null,
        };
        const next = new Map(prev);
        next.set(taskId, placeholder);
        return next;
      });
    };

    return onTaskStatus((p) => {
      // 内部任务（R3-3，如代理生成）：事件照常派发（useProxyPreview 依赖完成事件），
      // 但不进任务面板——不建行，后续 progress 事件因查无此行自然忽略
      if (p.internal) return;
      ensureMeta(p.taskId);
      setRows((prev) => {
        const old = prev.get(p.taskId);
        if (!old) return prev;
        const next = new Map(prev);
        next.set(p.taskId, {
          ...old,
          snap: {
            ...old.snap,
            status: p.status,
            error: p.error,
            outputs: p.outputs,
          },
          percent: p.status === "completed" ? 1 : old.percent,
          speed: p.status === "running" ? old.speed : null,
        });
        return next;
      });
      // 终态任务自动关闭（M7-5）
      if (
        (p.status === "completed" || p.status === "failed" || p.status === "cancelled") &&
        autoCloseRef.current > 0 &&
        !timersRef.current.has(p.taskId)
      ) {
        const t = window.setTimeout(() => {
          timersRef.current.delete(p.taskId);
          setRows((prev) => {
            const next = new Map(prev);
            next.delete(p.taskId);
            return next;
          });
        }, autoCloseRef.current * 1000);
        timersRef.current.set(p.taskId, t);
      }
    });
  });

  useTauriEvent(() =>
    onTaskProgress((p) => {
      setRows((prev) => {
        const old = prev.get(p.taskId);
        if (!old) return prev;
        const next = new Map(prev);
        next.set(p.taskId, { ...old, percent: p.percent, speed: p.speed });
        return next;
      });
    }),
  );

  // 自动关闭定时器随卸载清理
  useEffect(
    () => () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    },
    [],
  );

  if (rows.size === 0) return null;

  const hasTerminal = [...rows.values()].some(
    (r) =>
      r.snap.status === "completed" ||
      r.snap.status === "failed" ||
      r.snap.status === "cancelled",
  );
  const clearFinished = async () => {
    try {
      await clearFinishedTasks();
    } catch {
      /* 后端清理失败也照常清前端展示 */
    }
    setRows((prev) => {
      const next = new Map(prev);
      for (const [id, r] of next) {
        if (
          r.snap.status === "completed" ||
          r.snap.status === "failed" ||
          r.snap.status === "cancelled"
        ) {
          next.delete(id);
        }
      }
      return next;
    });
  };

  const dismiss = (id: string) => {
    // 手动关闭时清掉待触发的自动关闭定时器
    const t = timersRef.current.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setRows((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      <div className="flex items-center justify-between rounded-md border border-hairline bg-panel/95 px-3 py-1.5 backdrop-blur">
        <span className="text-xs font-medium text-mute">任务</span>
        <div className="flex items-center gap-2">
          {hasTerminal && (
            <button
              type="button"
              onClick={() => void clearFinished()}
              className="text-[11px] text-mute transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              清空已完成
            </button>
          )}
          <button
            type="button"
            onClick={() => void openLogsFolder()}
            className="text-[11px] text-mute transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            打开日志文件夹
          </button>
        </div>
      </div>
      {[...rows.values()].map(({ snap, percent, speed }) => {
        const showPercent = percent ?? snap.progress;
        return (
          <div key={snap.id} className="rounded-md border border-hairline bg-panel/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2">
              <span
                className={
                  snap.status === "completed"
                    ? "h-1.5 w-1.5 shrink-0 rounded-full bg-signal"
                    : snap.status === "failed"
                      ? "h-1.5 w-1.5 shrink-0 rounded-full bg-warn"
                      : snap.status === "cancelled"
                        ? "h-1.5 w-1.5 shrink-0 rounded-full bg-mute"
                        : "h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-signal"
                }
              />
              <span className="min-w-0 flex-1 truncate text-xs text-paper" title={snap.label}>
                {snap.label}
              </span>
              {snap.status === "running" || snap.status === "pending" ? (
                <button
                  type="button"
                  onClick={() => void cancelTask(snap.id)}
                  className="text-[11px] text-mute transition-colors hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  取消
                </button>
              ) : null}
              {snap.status === "completed" && snap.outputs[0] ? (
                <button
                  type="button"
                  onClick={() => {
                    const out = snap.outputs[0];
                    if (out) void revealInFolder(out);
                  }}
                  className="text-[11px] text-signal transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  打开位置
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => dismiss(snap.id)}
                aria-label="关闭"
                className="text-mute transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {snap.status === "running" || snap.status === "pending" ? (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink">
                {showPercent !== null ? (
                  <div
                    className="h-full rounded-full bg-signal transition-[width] duration-200"
                    style={{ width: `${Math.round(showPercent * 100)}%` }}
                  />
                ) : (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-signal/60" />
                )}
              </div>
            ) : null}
            <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-mute">
              {snap.status === "running" && showPercent !== null && (
                <span>{Math.round(showPercent * 100)}%</span>
              )}
              {snap.status === "running" && speed && <span>{speed}x</span>}
              {snap.status === "completed" && <span className="text-signal">完成</span>}
              {snap.status === "cancelled" && <span>已取消</span>}
              {snap.status === "failed" && (
                <>
                  <span className="min-w-0 flex-1 truncate text-warn" title={snap.error ?? ""}>
                    {snap.error ?? "失败"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyLog(snap.id, snap.error ?? "")}
                    className="shrink-0 text-[11px] text-warn transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                  >
                    {copied.has(snap.id) ? "已复制" : "复制日志"}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
