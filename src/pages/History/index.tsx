/**
 * 历史记录页（DESIGN §9.10 / M4-2）：终态任务列表，点产物重新定位输出文件。
 * 数据由 Rust 侧任务终态落盘（history.json），页面只读。
 */
import { ArrowLeft, Clock, FolderOpen, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  clearHistory,
  confirmDialog,
  listHistory,
  revealInFolder,
} from "../../services/tauri";
import type { HistoryEntry, TaskStatus } from "../../types";
import { formatDateTime, formatDurationMs } from "../../utils/time";

const KIND_LABELS: Record<string, string> = {
  cut: "剪切",
  merge: "合并",
  rotate: "旋转",
  crop_zoom: "局部放大",
  pipeline: "工作台",
};

function StatusBadge({ status }: { status: TaskStatus }) {
  if (status === "completed") {
    return (
      <span className="shrink-0 rounded border border-signal/30 bg-signal/10 px-1.5 py-0.5 text-xs text-signal">
        完成
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="shrink-0 rounded border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-xs text-warn">
        失败
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded border border-hairline px-1.5 py-0.5 text-xs text-mute">
      已取消
    </span>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const duration =
    entry.startedAt > 0 ? formatDurationMs(entry.finishedAt - entry.startedAt) : null;
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex items-center gap-2">
        <StatusBadge status={entry.status} />
        <span className="shrink-0 rounded border border-hairline px-1.5 py-0.5 text-[11px] text-mute">
          {KIND_LABELS[entry.kind] ?? entry.kind}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-paper" title={entry.label}>
          {entry.label}
        </span>
        <span
          className="shrink-0 font-mono text-[11px] text-mute"
          title={`提交于 ${formatDateTime(entry.createdAt)}`}
        >
          {formatDateTime(entry.finishedAt)}
          {duration && ` · ${duration}`}
        </span>
      </div>
      {entry.error && (
        <p className="line-clamp-2 whitespace-pre-wrap text-xs text-warn" title={entry.error}>
          {entry.error}
        </p>
      )}
      {entry.outputs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.outputs.map((out) => {
            const name = out.split(/[\\/]/).pop() ?? out;
            return (
              <button
                key={out}
                type="button"
                onClick={() => void revealInFolder(out)}
                title={`${out}\n点击打开所在文件夹`}
                className="flex min-w-0 max-w-full items-center gap-1.5 rounded border border-hairline px-2 py-1 text-xs text-mute transition-colors hover:border-signal/50 hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                <FolderOpen className="h-3 w-3 shrink-0" />
                <span className="truncate">{name}</span>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

export default function HistoryPage({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listHistory()
      .then((list) =>
        setEntries([...list].sort((a, b) => b.finishedAt - a.finishedAt)),
      )
      .catch((err: unknown) => setError(String(err)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearAll = async () => {
    if (!(await confirmDialog("确定清空全部历史记录？此操作不可恢复。", "清空历史"))) {
      return;
    }
    try {
      await clearHistory();
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回主页"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold tracking-tight">历史记录</h1>
        <span className="min-w-0 flex-1" />
        {entries !== null && entries.length > 0 && (
          <button
            type="button"
            onClick={() => void clearAll()}
            className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs text-mute transition-colors hover:border-warn/50 hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-warn"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空记录
          </button>
        )}
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4">
        {error && <p className="text-xs text-warn">{error}</p>}
        {entries === null ? (
          !error && <p className="py-8 text-center text-xs text-mute">加载中…</p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-mute">
            <Clock className="h-8 w-8" strokeWidth={1.5} />
            <p className="text-sm">暂无历史记录</p>
            <p className="text-xs text-mute/70">完成一次剪切、合并、旋转或导出后会显示在这里</p>
          </div>
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {entries.map((e) => (
              <HistoryRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
