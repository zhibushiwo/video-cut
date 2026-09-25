/**
 * 工作台合成时间轴（DESIGN §9.8 ②）：
 * - 坐标 = PPS 世界坐标（M11-1，TIMELINE.md §17.3 / plans/M11.md §18.2）：块位置/宽度、
 *   刻度、播放头、seek 换算全走 `geometry.ts` 一套公式——块宽**差值法**（M9-3 重叠的
 *   理论根源在该文件注释）。
 * - 缩放与滚动（M11-2，plans/M11.md §18.3）：PPS 是页面级 state（Workbench 持有，本组件
 *   经 props 读、onChangePps 写）；用户手动缩放前自动跟随适应窗口（M11-1 行为延续），
 *   首次手动缩放/适应后交还控制权。Ctrl+滚轮以鼠标为中心缩放；滚轮 = 横向滚动；
 *   +/− 键以视口中心为锚、\ 适应窗口。
 * - 整块拖拽排序（M9-4）：块本体进拖拽（指针事件 + 4px 死区），点击仍选中。
 * - 池→轴跨容器拖入（M6-3）。
 * - 帧时间埋点（plans/M11.md §18.6 drag 场景）挂在拖拽激活/收尾上。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useDragSort } from "../../hooks/useDragSort";
import { useHotkeys } from "../../hooks/useHotkeys";
import { appendFrontendLog } from "../../services/tauri";
import { beginPointerDrag } from "../../utils/pointerDrag";
import { beginFrameSampling, formatPerfLine, type PerfScene, type PerfSummary } from "../../utils/perf";
import { formatTimecode } from "../../utils/time";
import { buildGeometry, clampPps, fitPps, tickStep } from "./geometry";

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
  /** PPS（§18.3 页面级 state，Workbench 持有）：本组件经 onChangePps 写回 */
  pps: number;
  onChangePps(next: number): void;
}

/** 刻度目标间距（px，§18.2：刻度间距 ≥60px） */
const TICK_MIN_PX = 60;

/** 键控缩放步进因子（+/− 键；规格只给了滚轮系数，此为实现自定——一次按键 ≈ 一档明显缩放） */
const KEY_ZOOM_FACTOR = 1.2;

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
  pps,
  onChangePps,
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

  const shortest = useMemo(
    () =>
      clips.reduce(
        (m, c) => (c.duration > 0 && (m <= 0 || c.duration < m) ? c.duration : m),
        0,
      ),
    [clips],
  );
  const geo = useMemo(() => buildGeometry(clips.map((c) => c.duration), pps), [clips, pps]);

  // PPS 来自页面级 state（§18.3）；ref 镜像供滚轮/按键的连续事件读最新值——连续两次
  // Ctrl+滚轮之间可能不发生渲染，读 props 会拿到陈旧值（与 undo/store 的 docRef 同模式：
  // 渲染期同步一次，本组件写入时也立即推进）。
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  /** 用户尚未手动缩放时 pps 跟随适应窗口（M11-1 行为的延续）；手动缩放/适应后交还控制权 */
  const autoFitRef = useRef(true);
  /** 待补偿的 scrollLeft（缩放锚点公式）：等 pps commit 后、绘制前写入（useLayoutEffect）——
   *  「先改 pps 再补偿 scroll」同帧完成、无视觉跳动（§18.3） */
  const pendingScroll = useRef<number | null>(null);

  // 布局 effect：setState 在绘制前 flush，保持 M11-1"同帧算完"的单帧绘制等价
  useLayoutEffect(() => {
    if (!autoFitRef.current) return;
    const next = fitPps(viewportW, geo.total, shortest);
    if (next !== ppsRef.current) {
      ppsRef.current = next; // 与 zoomAt/zoomFit 同口径：写入时立即推进
      onChangePps(next);
    }
  }, [viewportW, geo.total, shortest, onChangePps]);

  /** 缩放（§18.3）：放大/缩小 factor 倍，以视口内 mouseLocalX（px）为锚——
   *  t_anchor = (scrollLeft + mouseX) / pps；pps' = clamp(pps × factor)；scroll 补偿待 commit */
  const zoomAt = useCallback(
    (factor: number, mouseLocalX: number) => {
      const el = viewportRef.current;
      if (!el || geo.total <= 0) return;
      const cur = ppsRef.current;
      const next = clampPps(cur * factor, shortest);
      if (next === cur) return; // 已在钳制边界，缩放无操作
      autoFitRef.current = false;
      // 连发滚轮同帧时 commit 未发生：pendingScroll 是 cur 档 pps 下的目标 scrollLeft，
      // 比 el.scrollLeft（上一档的旧值）新鲜——基准取前者，否则触控板连发会锚点漂移
      const base = pendingScroll.current ?? el.scrollLeft;
      pendingScroll.current = ((base + mouseLocalX) / cur) * next - mouseLocalX;
      ppsRef.current = next;
      onChangePps(next);
    },
    [geo.total, shortest, onChangePps],
  );

  /** \ 适应窗口：pps 取 fit 值并回到起点 */
  const zoomFit = useCallback(() => {
    if (geo.total <= 0) return;
    autoFitRef.current = false;
    const next = fitPps(viewportW, geo.total, shortest);
    if (next !== ppsRef.current) {
      pendingScroll.current = 0;
      ppsRef.current = next;
      onChangePps(next);
    } else {
      pendingScroll.current = null; // 同帧先 zoomAt 后 fit 的陈旧补偿不反噬
      const el = viewportRef.current;
      if (el) el.scrollLeft = 0;
    }
  }, [viewportW, geo.total, shortest, onChangePps]);

  // pps commit 后补偿 scrollLeft：布局 effect 在 DOM 按新 pps 更新之后、绘制之前执行
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || pendingScroll.current === null) return;
    el.scrollLeft = pendingScroll.current;
    pendingScroll.current = null;
  }, [pps]);

  // 滚轮（§18.3）：无 Ctrl = 横向滚动（编辑器惯例，时间轴吃掉滚轮不放行页面纵滚）；
  // Ctrl+滚轮 = 以鼠标为中心缩放。React 挂在 root 上的 onWheel 是 passive，preventDefault
  // 无效——必须原生非 passive 监听。
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const mouseX = e.clientX - el.getBoundingClientRect().left;
        zoomAt(Math.exp(-e.deltaY * 0.0015), mouseX);
      } else {
        el.scrollLeft += e.deltaY + e.deltaX;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // +/− 键：以视口中心为锚（mouseX 取半宽）；\：适应窗口（§18.3；M11-8 快捷键全表
  // 整合时如需归页级再挪）。无 Shift 的 + 是 =，一并接受。
  useHotkeys(
    (e) => {
      if (e.key === "+" || e.key === "=") zoomAt(KEY_ZOOM_FACTOR, viewportW / 2);
      else if (e.key === "-" || e.key === "_") zoomAt(1 / KEY_ZOOM_FACTOR, viewportW / 2);
      else if (e.key === "\\") zoomFit();
    },
    clips.length > 0 && geo.total > 0,
  );

  /** 点击空白/标尺 → seek：世界 x = 视口本地 x + scrollLeft（§18.3 滚动容器），线性换算；
   *  x 钳进内容宽、时间钳进 [0, total]（round 舍入可能让 contentWidth 折算出半像素超尾，
   *  右端死区语义 = seek 到末尾） */
  const seekAt = (clientX: number) => {
    const el = viewportRef.current;
    if (!el || geo.total <= 0) return;
    const x = Math.min(
      geo.contentWidth,
      Math.max(0, clientX - el.getBoundingClientRect().left + el.scrollLeft),
    );
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
          className="relative h-full w-full cursor-crosshair overflow-x-auto overflow-y-hidden"
          onPointerDown={(e) => {
            if (geo.total > 0) seekAt(e.clientX);
          }}
        >
          {/* 世界坐标层：宽 = contentWidth，超出视口即横向滚动（§18.3）；播放头/块/刻度
              全部世界坐标定位，随内容滚动、无补偿计算 */}
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
