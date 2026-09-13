/**
 * 工作台合成时间轴（DESIGN §9.8 ②）：片段块宽∝时长（最小宽度保底）、
 * 刻度与播放头、块拖拽排序（指针事件）、池→轴跨容器拖入（M6-3）。
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { pickTickStep } from "../Timeline";
import { useDragSort } from "../../hooks/useDragSort";

export interface TimelineClip {
  id: string;
  /** 显示名：来源文件名 + 区间/全段 */
  label: string;
  /** 时长（秒）；探测完成前为 0（渲染走最小宽度保底） */
  duration: number;
  /** 无损判定；null = 检测未出 */
  lossless: boolean | null;
  /** 重编码原因（hover 展示） */
  detail?: string;
}

interface ClipTimelineProps {
  clips: TimelineClip[];
  /** 池→轴拖拽进行中的片段 id；null = 无 */
  externalDrag: { clipId: string } | null;
  selectedId: string | null;
  onSelect(id: string): void;
  onReorder(from: number, to: number): void;
  /** 池拖入/块拖动落点插入：目标 index 处放该片段（已在轴内则为移动语义） */
  onInsert(clipId: string, index: number): void;
  /** 池拖拽结束（无论是否落进轴内），父层据此清 externalDrag */
  onExternalDragEnd(): void;
  /** 从成品移除（块 hover ✕） */
  onRemove(id: string): void;
  /** 点击空白处按比例 seek（成品内时间，秒） */
  onSeek(t: number): void;
  /** 播放头（成品内时间，秒）；M6-6 连播接入前恒为 0 */
  currentTime: number;
}

export default function ClipTimeline({
  clips,
  externalDrag,
  selectedId,
  onSelect,
  onReorder,
  onInsert,
  onExternalDragEnd,
  onRemove,
  onSeek,
  currentTime,
}: ClipTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // 拖出时间轴边界松手 = 移出成品（M6-8 拖回池手势的等价实现）
  const { listRef, beginDrag, rowCls } = useDragSort(onReorder, "x", {
    boundsRef: trackRef,
    onDropOutside: (i) => {
      const id = clips[i]?.id;
      if (id) onRemove(id);
    },
  });
  /** 池拖入时的插入位置指示（目标块 index） */
  const [extIndex, setExtIndex] = useState<number | null>(null);
  const total = clips.reduce((s, c) => s + c.duration, 0);

  const pct = (t: number) =>
    total > 0 ? `${Math.min(100, Math.max(0, (t / total) * 100))}%` : "0%";

  /** 指针所在块：与渲染块矩形做最近中线命中（块有最小宽度，比例换算会失真） */
  const indexAtX = (clientX: number): number | null => {
    const blocks = trackRef.current?.querySelectorAll<HTMLElement>("[data-sort-row]");
    if (!blocks || blocks.length === 0) return 0;
    let best = 0;
    let bestDist = Infinity;
    blocks.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(clientX - (r.left + r.width / 2));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const insideTrack = (clientX: number, clientY: number): boolean => {
    const track = trackRef.current;
    if (!track) return false;
    const r = track.getBoundingClientRect();
    return (
      clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    );
  };

  // 池→轴跨容器拖拽：拖拽期间监听指针，落点在轴内则插入
  useEffect(() => {
    if (!externalDrag) {
      setExtIndex(null);
      return;
    }
    const move = (ev: PointerEvent) => {
      setExtIndex(insideTrack(ev.clientX, ev.clientY) ? indexAtX(ev.clientX) : null);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (insideTrack(ev.clientX, ev.clientY)) {
        const idx = indexAtX(ev.clientX);
        if (idx !== null) onInsert(externalDrag.clipId, idx);
      }
      onExternalDragEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalDrag?.clipId, clips.length]);

  const step = total > 0 ? pickTickStep(total) : 0;
  const ticks: number[] = [];
  if (step > 0) {
    for (let t = 0; t <= total + 1e-6; t += step) ticks.push(t);
  }

  // 累计起点（渲染块位置）
  let acc = 0;

  return (
    <div
      ref={listRef}
      className="relative select-none rounded-md border border-hairline bg-panel/60"
      style={{ height: 64 }}
    >
      {clips.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-xs text-mute/70">
          时间轴为空——从片段池点击「+」加入，或拖拽片段卡到此处
        </div>
      ) : (
        <div
          ref={trackRef}
          className="relative h-full w-full cursor-crosshair"
          onPointerDown={(e) => {
            if (total > 0) {
              const r = e.currentTarget.getBoundingClientRect();
              onSeek(((e.clientX - r.left) / r.width) * total);
            }
          }}
        >
          {/* 刻度 */}
          {ticks.map((t) => (
            <span
              key={t}
              className="pointer-events-none absolute bottom-0 w-px bg-hairline/60"
              style={{ left: pct(t), height: "35%" }}
            >
              {t > 0 && t < total - 1e-6 && (
                <span className="absolute bottom-1 left-1 font-mono text-[9px] text-mute/80">
                  {Math.floor(t / 60)}:{String(Math.round(t % 60)).padStart(2, "0")}
                </span>
              )}
            </span>
          ))}

          {/* 片段块 */}
          {clips.map((c, i) => {
            const left = acc;
            acc += c.duration;
            const widthPct = total > 0 ? (c.duration / total) * 100 : 0;
            return (
              <div
                key={c.id}
                data-sort-row
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(c.id)}
                title={c.detail ? `${c.label}\n${c.detail}` : c.label}
                className={`group absolute bottom-1.5 top-1 flex cursor-pointer flex-col justify-center overflow-hidden rounded border px-1.5 transition-colors ${rowCls(i)} ${
                  c.id === selectedId
                    ? "border-signal/70 bg-signal/15"
                    : "border-hairline bg-panel hover:border-mute/60"
                }`}
                style={{
                  left: `${left}%`,
                  width: `${widthPct}%`,
                  minWidth: 28,
                  zIndex: 1,
                }}
              >
                <span className="truncate text-[10px] leading-tight text-paper">{c.label}</span>
                <span className="flex items-center gap-1">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      c.lossless === null
                        ? "bg-mute/50"
                        : c.lossless
                          ? "bg-signal"
                          : "bg-warn"
                    }`}
                  />
                  <span className="truncate font-mono text-[9px] text-mute">
                    {c.duration > 0 ? `${c.duration.toFixed(1)}s` : "…"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(c.id);
                  }}
                  aria-label={`从时间轴移除 ${c.label}`}
                  className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded text-mute hover:bg-warn/20 hover:text-warn focus:outline-none group-hover:flex"
                >
                  <X className="h-3 w-3" />
                </button>
                <span
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    beginDrag(e, i);
                  }}
                  className="absolute bottom-0 left-0 top-0 w-1.5 cursor-grab touch-none bg-mute/0 transition-colors hover:bg-mute/40"
                  aria-hidden="true"
                />
              </div>
            );
          })}

          {/* 池拖入的插入指示线：贴目标块左缘（或末块右缘） */}
          {extIndex !== null && clips.length > 0 && (
            <span
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-signal"
              style={{
                left:
                  extIndex >= clips.length
                    ? undefined
                    : `${
                        (clips.slice(0, extIndex).reduce((s, c) => s + c.duration, 0) / total) * 100
                      }%`,
                right: extIndex >= clips.length ? 0 : undefined,
              }}
            />
          )}

          {/* 播放头 */}
          <span
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-paper/80"
            style={{ left: pct(currentTime) }}
          >
            <span className="absolute -top-px left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-paper/80" />
          </span>
        </div>
      )}
    </div>
  );
}
