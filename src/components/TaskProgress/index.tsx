import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  cancelTask,
  listTasks,
  onTaskProgress,
  onTaskStatus,
  revealInFolder,
} from "../../services/tauri";
import type { TaskSnapshot } from "../../types";

interface TaskRow {
  snap: TaskSnapshot;
  percent: number | null;
  speed: string | null;
}

/**
 * 全局任务面板（DESIGN §9.7）：右下角浮层，订阅 task-status / task-progress 事件。
 * 挂载在 App 顶层，任意页面可见。
 */
export default function TaskProgress() {
  const [rows, setRows] = useState<Map<string, TaskRow>>(new Map());

  useEffect(() => {
    let alive = true;
    const unlisteners: Promise<unknown>[] = [];

    const ensureMeta = (taskId: string) => {
      setRows((prev) => {
        if (prev.has(taskId)) return prev;
        // 新任务缺少 label/kind，从 list_tasks 补齐
        void listTasks().then((snaps) => {
          if (!alive) return;
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

    unlisteners.push(
      onTaskStatus((p) => {
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
            percent:
              p.status === "completed" ? 1 : p.status === "running" ? old.percent : old.percent,
            speed: p.status === "running" ? old.speed : null,
          });
          return next;
        });
      }),
    );

    unlisteners.push(
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

    return () => {
      alive = false;
      for (const p of unlisteners) {
        void p.then((un) => {
          if (typeof un === "function") un();
        });
      }
    };
  }, []);

  if (rows.size === 0) return null;

  const dismiss = (id: string) =>
    setRows((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
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
                  onClick={() => void revealInFolder(snap.outputs[0])}
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
                <span className="truncate text-warn" title={snap.error ?? ""}>
                  {snap.error ?? "失败"}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
