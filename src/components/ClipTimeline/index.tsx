/**
 * 工作台合成时间轴（DESIGN §9.8 ②）：
 * - 坐标 = PPS 世界坐标（M11-1，TIMELINE.md §17.3 / plans/M11.md §18.2）：块位置/宽度、
 *   刻度、播放头、seek 换算全走 `geometry.ts` 一套公式——块宽**差值法**（M9-3 重叠的
 *   理论根源在该文件注释），PPS = 适应窗口经钳制（最短块 ≥6px）。缩放/滚动交互与
 *   页面级 PPS 状态归 M11-2（plans/M11.md §18.3），当前 pps 是组件内派生值。
 * - 整块拖拽排序（M9-4）：块本体进拖拽（指针事件 + 4px 死区），点击仍选中。
 * - 池→轴跨容器拖入（M6-3）。
 * - 帧时间埋点（plans/M11.md §18.6 drag 场景）挂在拖拽激活/收尾上。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useDragSort } from "../../hooks/useDragSort";
import { appendFrontendLog } from "../../services/tauri";
import { beginPointerDrag } from "../../utils/pointerDrag";
import { beginFrameSampling, formatPerfLine, type PerfScene, type PerfSummary } from "../../utils/perf";
import { formatTimecode } from "../../utils/time";
import { buildGeometry, fitPps, tickStep } from "./geometry";

export interface TimelineClip {
  id: string;
  /** 显示名：来源文件名 + 区间/全段 */
  label: string;
  /** 时长（秒）；0 = 未探测（渲染为 0 宽块，正常数据不会出现——导入必先探测） */
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
  /** 时间码帧率（刻度标签，§17.3 总帧数时间码）：轴上首个片段的源帧率，Workbench 缺省 30 */
  fps: number;
}

/** 刻度目标间距（px，§18.2：刻度间距 ≥60px） */
const TICK_MIN_PX = 60;

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
  fps,
}: ClipTimelineProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // 帧时间埋点（§18.6 drag 场景）：拖拽激活时开采样、收尾时停（stop 冲掉不足一窗的余量）
  const dragSampleStop = useRef<(() => void) | null>(null);
  const onPerfReport = useCallback(
    (scene: PerfScene, s: PerfSummary) => void appendFrontendLog("debug", formatPerfLine(scene, s)),
    [],
  );
  useEffect(() => () => dragSampleStop.current?.(), []);

  const { listRef, beginDrag, rowCls } = useDragSort(onReorder, "x", {
    boundsRef: viewportRef,
    onDropOutside: (i) => {
      const id = clips[i]?.id;
      if (id) onRemove(id);
    },
    onDragActive: (active) => {
      dragSampleStop.current?.();
      dragSampleStop.current = active ? beginFrameSampling("drag", onPerfReport) : null;
    },
  });

  /** 池拖入时的插入位置指示（目标块 index） */
  const [extIndex, setExtIndex] = useState<number | null>(null);
  const total = clips.reduce((s, c) => s + c.duration, 0);

  // 视口实测宽：适应窗口 fit 的基础（ResizeObserver 保留，§18.2）
  const [viewportW, setViewportW] = useState(0);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      setViewportW(0);
      return;
    }
    const measure = () => setViewportW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clips.length]);

  // PPS（§18.2）：适应窗口 + 钳制（硬区间 [2,500] + 动态下限保证最短块 ≥6px）。
  // M11-2 提升为页面级 state 并接缩放交互（plans/M11.md §18.3），届时 fit 变成「\」键动作。
  const shortest = useMemo(
    () =>
      clips.reduce(
        (m, c) => (c.duration > 0 && (m <= 0 || c.duration < m) ? c.duration : m),
        0,
      ),
    [clips],
  );
  const pps = useMemo(() => fitPps(viewportW, total, shortest), [viewportW, total, shortest]);
  const geo = useMemo(() => buildGeometry(clips.map((c) => c.duration), pps), [clips, pps]);

  /** 点击空白/标尺 → seek：世界坐标线性换算，x 钳进内容宽、时间钳进 [0, total]
   *  （round 舍入可能让 contentWidth 折算出半像素超尾，右端死区语义 = seek 到末尾） */
  const seekAt = (clientX: number) => {
    const el = viewportRef.current;
    if (!el || geo.total <= 0) return;
    const x = Math.min(geo.contentWidth, Math.max(0, clientX - el.getBoundingClientRect().left));
    onSeek(Math.min(geo.total, geo.xToTime(x)));
  };

  /** 指针所在块：与渲染块矩形做最近中线命中 */
  const indexAtX = (clientX: number): number | null => {
    const blocks = viewportRef.current?.querySelectorAll<HTMLElement>("[data-sort-row]");
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

  const insideViewport = (clientX: number, clientY: number): boolean => {
    const el = viewportRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
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
        setExtIndex(insideViewport(ev.clientX, ev.clientY) ? indexAtX(ev.clientX) : null);
      },
      (last) => {
        if (last && insideViewport(last.clientX, last.clientY)) {
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

  // 刻度步长：≥60px 对应的秒数向上取整刻度（§18.2）；i×step 逐项相乘避免浮点累加漂移
  const step = tickStep(TICK_MIN_PX / pps);
  const ticks: number[] = [];
  for (let i = 0; i * step <= geo.total + 1e-6; i++) ticks.push(i * step);

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
          ref={viewportRef}
          className="relative h-full w-full cursor-crosshair"
          onPointerDown={(e) => {
            if (geo.total > 0) seekAt(e.clientX);
          }}
        >
          {/* 世界坐标层：宽 = contentWidth（M11-2 接 overflow-x 滚动；动态下限撑出视口的
              极端情况在 M11-1 暂被 overflow-hidden 裁剪，属已知分阶段边界） */}
          <div className="relative h-full" style={{ width: geo.contentWidth }}>
            {/* 刻度（世界坐标；标签 = 总帧数时间码 §17.3/§18.5） */}
            {ticks.map((t, i) => (
              <span
                key={i}
                className="pointer-events-none absolute bottom-0 w-px bg-hairline/60"
                style={{ left: geo.timeToX(t), height: "35%" }}
              >
                {t > 0 && t < geo.total - 1e-6 && (
                  <span className="absolute bottom-1 left-1 whitespace-nowrap font-mono text-[9px] text-mute/80">
                    {formatTimecode(t, fps)}
                  </span>
                )}
              </span>
            ))}

            {/* 片段块：整块可拖（M9-4），点击选中；位置/宽度 = geometry 差值法 */}
            {clips.map((c, i) => {
              const r = geo.block(i);
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

            {/* 池拖入的插入指示线：贴目标块左缘（或末块右缘 = 世界宽） */}
            {extIndex !== null && (
              <span
                className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-signal"
                style={{
                  left: extIndex < clips.length ? geo.block(extIndex).left : geo.contentWidth,
                }}
              />
            )}

            {/* 播放头（世界坐标，钳进内容宽） */}
            <span
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-paper/80"
              style={{
                left: Math.min(geo.contentWidth, Math.max(0, geo.timeToX(currentTime))),
              }}
            >
              <span className="absolute -top-px left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-paper/80" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
