/**
 * ModelPicker（M18-7，FR-391）：三档模型选择与下载管理。
 * 内置档标注"已内置"不可删；下载档就绪可选用、未就绪显示体积与下载按钮；
 * 下载进度由页面层经 task-progress 订阅回传（`progress` 0~1）。
 */
import { Trash2 } from "lucide-react";
import type { WhisperModelInfo } from "../../types";

function fmtSize(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
    : `${Math.round(bytes / 1024 / 1024)}MB`;
}

export function ModelPicker({
  models,
  selectedId,
  downloadingName,
  progress,
  onSelect,
  onDownload,
  onDelete,
}: {
  models: WhisperModelInfo[];
  selectedId: string;
  /** 正在下载的模型文件名（null = 无下载任务） */
  downloadingName: string | null;
  /** 下载进度 0~1（仅 downloadingName 对应行显示） */
  progress: number;
  onSelect: (id: string) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="识别模型档位">
      {models.map((m) => {
        const busy = downloadingName === m.fileName;
        const selected = selectedId === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={busy || (!m.ready && m.bundled)}
            onClick={() => m.ready && onSelect(m.id)}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
              selected
                ? "border-signal/60 bg-signal/10"
                : "border-hairline hover:border-mute disabled:opacity-60"
            }`}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${selected ? "bg-signal" : "bg-mute/40"}`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm text-paper">{m.label}</span>
                {m.bundled && (
                  <span className="rounded bg-signal/15 px-1.5 py-0.5 text-[10px] text-signal">
                    已内置
                  </span>
                )}
                {!m.ready && !busy && (
                  <span className="text-[10px] text-mute">未下载</span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-mute">
                {m.bundled ? "随应用内置 · 零下载开箱即用" : `质量更好 · 需联网下载`}
                {" · "}
                {fmtSize(m.sizeBytes)}
              </span>
              {busy && (
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1 w-40 overflow-hidden rounded-full bg-hairline">
                    <span
                      className="block h-full bg-signal transition-[width]"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </span>
                  <span className="text-[10px] text-mute">
                    {Math.round(progress * 100)}%
                  </span>
                </span>
              )}
            </span>
            {!m.bundled && (
              <span className="flex shrink-0 items-center gap-1.5">
                {!m.ready && !busy && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(m.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onDownload(m.id);
                      }
                    }}
                    className="rounded-md border border-hairline px-2 py-1 text-xs text-mute transition-colors hover:border-signal hover:text-signal focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                  >
                    下载
                  </span>
                )}
                {m.ready && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`删除 ${m.label} 模型`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(m.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onDelete(m.id);
                      }
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-mute transition-colors hover:bg-panel hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
