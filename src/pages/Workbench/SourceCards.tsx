/** ④ 素材卡片区（横向卡片行，拖拽排序用横向轴；勾选支持批量操作，M6-8）。R2-1 原样自 index.tsx 迁出。 */
import { Film, GripVertical, Plus, X } from "lucide-react";
import { useDragSort } from "../../hooks/useDragSort";
import { fileSrc } from "../../services/tauri";
import { basename } from "../../utils/paths";
import { formatTime } from "../../utils/time";
import type { SourceFile } from "./shared";

export function SourceCards({
  files,
  thumbs,
  selectedIds,
  onOpen,
  onRemove,
  onAdd,
  onReorder,
  onToggleSelect,
}: {
  files: SourceFile[];
  thumbs: Record<string, string>;
  selectedIds: Set<string>;
  onOpen(id: string): void;
  onRemove(file: SourceFile): void;
  onAdd(): void;
  onReorder(from: number, to: number): void;
  onToggleSelect(id: string): void;
}) {
  const { listRef, beginDrag, rowCls } = useDragSort(onReorder, "x");
  return (
    <div ref={listRef} className="flex gap-2.5 overflow-x-auto pb-1">
      {files.map((f, i) => {
        const isSelected = selectedIds.has(f.id);
        const thumb = thumbs[f.path];
        return (
        <div
          key={f.id}
          data-sort-row
          className={`group relative w-40 shrink-0 overflow-hidden rounded-md border bg-panel ${rowCls(i)} ${
            isSelected ? "border-signal/70" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => onOpen(f.id)}
            className="block w-full text-left focus:outline-none"
          >
            <div className="relative h-20 w-full bg-black">
              {thumb ? (
                <img src={fileSrc(thumb)} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Film className="h-6 w-6 text-mute/50" />
                </span>
              )}
              {f.info && (
                <span className="absolute bottom-1 right-1 rounded bg-ink/80 px-1 font-mono text-[9px] text-paper/90">
                  {formatTime(f.info.durationSec, false)}
                </span>
              )}
            </div>
            <div className="px-2 py-1.5">
              <p className="truncate text-xs text-paper" title={f.path}>
                {basename(f.path)}
              </p>
              <p className="truncate text-[10px] text-mute">
                {f.probeError
                  ? "⚠ 读取失败"
                  : !f.info
                    ? "读取中…"
                    : `${f.info.video.codec.toUpperCase()} ${f.info.video.width}×${f.info.video.height}`}
              </p>
            </div>
          </button>
          <span
            onPointerDown={(e) => beginDrag(e, i)}
            className="absolute bottom-1 right-1 cursor-grab touch-none rounded p-0.5 text-mute/60 hover:text-paper"
            title="拖动排序"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          <button
            type="button"
            onClick={() => onToggleSelect(f.id)}
            aria-label={isSelected ? "取消选择" : "选择以批量操作"}
            aria-pressed={isSelected}
            title="选择以批量操作"
            className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
              isSelected
                ? "border-signal bg-signal text-ink"
                : "border-paper/50 bg-ink/70 text-transparent hover:border-paper"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onRemove(f)}
            aria-label={`移除 ${basename(f.path)}`}
            className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-ink/80 text-mute opacity-0 transition-opacity hover:text-warn focus:outline-none focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="flex h-28 w-40 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-hairline text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <Plus className="h-4 w-4" />
        添加素材
      </button>
    </div>
  );
}
