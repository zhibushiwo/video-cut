/**
 * 工作台合成时间轴（DESIGN §9.8 ②）：
 * - 块排布 = 逐块像素（M9-3）：块宽 = max(时长占比×容器实测宽, 最小宽度)，
 *   下一块左缘恒等于前块实际右缘——最小宽度膨胀时最多溢出轨道，绝不重叠。
 * - 整块拖拽排序（M9-4）：块本体进拖拽（指针事件 + 4px 死区），点击仍选中。
 * - 池→轴跨容器拖入（M6-3）；时间↔像素换算与渲染排布同一套公式。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { pickTickStep } from "../Timeline";
import { useDragSort } from "../../hooks/useDragSort";
import { beginPointerDrag } from "../../utils/pointerDrag";

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
  /** 点击空白处按渲染位置 seek（成品内时间，秒） */
  onSeek(t: number): void;
  /** 播放头（成品内时间，秒） */
  currentTime: number;
}

/** 块最小宽度（px）：短片段保底可见可点 */
const MIN_BLOCK_W = 28;

interface BlockRect {
  left: number;
  width: number;
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

  // 容器实测宽：逐块像素排布的基础（M9-3）
  const [trackW, setTrackW] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) {
      setTrackW(0);
      return;
    }
    const measure = () => setTrackW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clips.length]);

  /** 每块 {左缘, 宽}（px）与每块的成品内起点（秒）——渲染与时间换算共用 */
  const { rects, starts } = useMemo(() => {
    const rects: BlockRect[] = [];
    const starts: number[] = [];
    let x = 0;
    let t = 0;
    for (const c of clips) {
      starts.push(t);
      const w =
        total > 0 && trackW > 0
          ? Math.max((c.duration / total) * trackW, MIN_BLOCK_W)
          : MIN_BLOCK_W;
      rects.push({ left: x, width: w });
      x += w;
      t += c.duration;
    }
    return { rects, starts };
  }, [clips, total, trackW]);

  const lastRect = rects[rects.length - 1];
  const trackRight = lastRect ? lastRect.left + lastRect.width : 0;

  /** 成品时间 → 轨道 x（与渲染同一套换算） */
  const timeToX = (t: number): number => {
    const firstRect = rects[0];
    if (!firstRect || total <= 0) return 0;
    if (t <= 0) return firstRect.left;
    let acc = 0;
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const r = rects[i];
      if (!c || !r) return trackRight; // clips 与 rects 同长同序（useMemo 内同步派生），防御
      const d = c.duration;
      if (t < acc + d || i === clips.length - 1) {
        const local = d > 0 ? Math.min(1, Math.max(0, (t - acc) / d)) : 0;
        return r.left + local * r.width;
      }
      acc += d;
    }
    return trackRight;
  };

  /** 轨道 x → 成品时间：命中块内按比例插值（与渲染一致，含最小宽度膨胀） */
  const xToTime = (clientX: number): number => {
    const track = trackRef.current;
    if (!track || rects.length === 0) return 0;
    const x = clientX - track.getBoundingClientRect().left;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const start = starts[i];
      const c = clips[i];
      if (!r || start === undefined || !c) break; // 同长不变量，防御
      if (x <= r.left + r.width || i === rects.length - 1) {
        const local = r.width > 0 ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0;
        return start + local * c.duration;
      }
    }
    return total;
  };

  /** 指针所在块：与渲染块矩形做最近中线命中 */
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
    // 收尾兜底（窗口外松手 / pointercancel）走公共实现（BUG-003 / AGENTS.md §3 第 20 条）
    const detach = beginPointerDrag(
      (ev) => {
        setExtIndex(insideTrack(ev.clientX, ev.clientY) ? indexAtX(ev.clientX) : null);
      },
      (last) => {
        if (last && insideTrack(last.clientX, last.clientY)) {
          const idx = indexAtX(last.clientX);
          if (idx !== null) onInsert(externalDrag.clipId, idx);
        }
        onExternalDragEnd();
      },
    );
    // 卸载/依赖变化只摘监听、不触发落点处理（否则重挂载时会把上次的落点再插一遍）
    return detach;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalDrag?.clipId, clips.length]);

  const step = total > 0 ? pickTickStep(total) : 0;
  const ticks: number[] = [];
  if (step > 0) {
    for (let t = 0; t <= total + 1e-6; t += step) ticks.push(t);
  }

  return (
    <div
      ref={listRef}
      className="relative select-none overflow-hidden rounded-md border border-hairline bg-panel/60"
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
            if (total > 0) onSeek(xToTime(e.clientX));
          }}
        >
          {/* 刻度（位置与块排布同一换算） */}
          {ticks.map((t) => (
            <span
              key={t}
              className="pointer-events-none absolute bottom-0 w-px bg-hairline/60"
              style={{ left: timeToX(t), height: "35%" }}
            >
              {t > 0 && t < total - 1e-6 && (
                <span className="absolute bottom-1 left-1 font-mono text-[9px] text-mute/80">
                  {Math.floor(t / 60)}:{String(Math.round(t % 60)).padStart(2, "0")}
                </span>
              )}
            </span>
          ))}

          {/* 片段块：整块可拖（M9-4），点击选中 */}
          {clips.map((c, i) => {
            const r = rects[i];
            if (!r) return null; // rects 与 clips 同长同序（useMemo 内同步派生），防御
            return (
              <div
                key={c.id}
                data-sort-row
                onPointerDown={(e) => {
                  e.stopPropagation();
                  beginDrag(e, i);
                }}
                onClick={() => onSelect(c.id)}
                title={c.detail ? `${c.label}\n${c.detail}` : c.label}
                className={`group absolute bottom-1.5 top-1 flex touch-none cursor-grab flex-col justify-center overflow-hidden rounded border px-1.5 transition-colors ${rowCls(i)} ${
                  c.id === selectedId
                    ? "border-signal/70 bg-signal/15"
                    : "border-hairline bg-panel hover:border-mute/60"
                }`}
                style={{
                  left: r.left,
                  width: r.width,
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
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(c.id);
                  }}
                  aria-label={`从时间轴移除 ${c.label}`}
                  className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded text-mute hover:bg-warn/20 hover:text-warn focus:outline-none group-hover:flex"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* 池拖入的插入指示线：贴目标块左缘（或末块右缘） */}
          {extIndex !== null && clips.length > 0 && (
            <span
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-signal"
              style={{
                left: rects[extIndex]?.left ?? trackRight,
              }}
            />
          )}

          {/* 播放头 */}
          <span
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-paper/80"
            style={{ left: timeToX(currentTime) }}
          >
            <span className="absolute -top-px left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-paper/80" />
          </span>
        </div>
      )}
    </div>
  );
}
