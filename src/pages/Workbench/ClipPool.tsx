/**
 * ③ 片段池：池序 = 创建序（决策 #13，顺序只在时间轴上表达）。
 * 卡片点击=加工 · 「+」=加入轴末尾 · 拖手柄=入轴。R2-1 自 index.tsx 的池区块拆出。
 */
import { Film, GripVertical, Plus, X } from "lucide-react";
import { fileSrc } from "../../services/tauri";
import type { Clip, PipelineItemCheck } from "../../types";
import { formatTime } from "../../utils/time";
import { basename, type SourceFile } from "./shared";

export function ClipPool({
  clips,
  timeline,
  thumbs,
  clipThumbs,
  clipSource,
  checkOf,
  clipDurationOf,
  clipThumbKeyOf,
  selectedClipId,
  onOpen,
  onAppend,
  onRemove,
  onDragStart,
}: {
  clips: Clip[];
  timeline: string[];
  thumbs: Record<string, string>;
  clipThumbs: Record<string, string>;
  clipSource: (c: Clip) => SourceFile | undefined;
  checkOf: (clipId: string) => PipelineItemCheck | null;
  clipDurationOf: (c: Clip) => number;
  clipThumbKeyOf: (c: Clip) => string;
  selectedClipId: string | null;
  onOpen(id: string): void;
  onAppend(id: string): void;
  onRemove(id: string): void;
  onDragStart(id: string): void;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-medium text-mute">片段池</h2>
        <span className="text-[11px] text-mute/60">
          {clips.length === 0
            ? "点素材卡剪出片段；顺序只在时间轴上表达"
            : "点击卡片加工 · + 加入时间轴 · 拖手柄入轴"}
        </span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {clips.length === 0 ? (
          <p className="shrink-0 text-xs text-mute/50">还没有片段。</p>
        ) : (
          clips.map((c) => {
            const src = clipSource(c);
            const chk = checkOf(c.id);
            const inTimeline = timeline.includes(c.id);
            const selected = selectedClipId === c.id;
            const thumbKey = clipThumbKeyOf(c);
            const thumb = src
              ? (clipThumbs[thumbKey] ?? thumbs[src.path])
              : null;
            return (
              <div
                key={c.id}
                className={`group relative w-44 shrink-0 overflow-hidden rounded-md border bg-panel ${
                  selected ? "border-signal/70" : "border-hairline"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="block w-full text-left focus:outline-none"
                  title={chk && !chk.copy ? chk.reasons.join("；") : undefined}
                >
                  <div className="relative h-16 w-full bg-black">
                    {thumb ? (
                      <img
                        src={fileSrc(thumb)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <Film className="h-5 w-5 text-mute/50" />
                      </span>
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-ink/80 px-1 font-mono text-[9px] text-paper/90">
                      {c.seg
                        ? `${formatTime(c.seg.start, false)}–${formatTime(c.seg.end, false)}`
                        : "全段"}
                    </span>
                    <span
                      className={`absolute right-1 top-1 h-2 w-2 rounded-full ${
                        chk === null ? "bg-mute/50" : chk.copy ? "bg-signal" : "bg-warn"
                      }`}
                      title={
                        chk
                          ? chk.copy
                            ? "无损片段"
                            : chk.reasons.join("；")
                          : "检测中"
                      }
                    />
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="truncate text-xs text-paper">
                      {src ? basename(src.path) : "已移除素材"}
                    </p>
                    <p className="font-mono text-[10px] text-mute">
                      {clipDurationOf(c) > 0 ? `${clipDurationOf(c).toFixed(1)}s` : "…"}
                      {inTimeline ? " · 已在轴" : ""}
                    </p>
                  </div>
                </button>
                <div className="absolute right-1 top-9 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  {!inTimeline && (
                    <button
                      type="button"
                      onClick={() => onAppend(c.id)}
                      aria-label="加入时间轴末尾"
                      title="加入时间轴末尾"
                      className="flex h-5 w-5 items-center justify-center rounded bg-ink/80 text-mute hover:text-signal focus:outline-none"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(c.id)}
                    aria-label="删除片段"
                    title="删除片段"
                    className="flex h-5 w-5 items-center justify-center rounded bg-ink/80 text-mute hover:text-warn focus:outline-none"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    onDragStart(c.id);
                  }}
                  className="absolute bottom-1 right-1 cursor-grab touch-none rounded p-0.5 text-mute/60 hover:text-paper"
                  title="拖入时间轴"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
