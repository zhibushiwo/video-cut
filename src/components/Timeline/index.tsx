import { useMemo, useRef } from "react";
import { realStartDiffers } from "../../utils/time";
import { beginPointerDrag } from "../../utils/pointerDrag";

export interface Selection {
  start: number;
  end: number;
}

interface TimelineProps {
  duration: number;
  /** 关键帧时间点（秒，升序），来自 list_keyframes */
  keyframes: number[];
  selection: Selection;
  currentTime: number;
  /** 入点是否吸附最近关键帧（±0.5s 内，DESIGN §3.2） */
  snap: boolean;
  /**
   * 无损剪切的**真实落点**（≤入点的最近关键帧，`utils/time.ts` 的 `realCutStart`）。
   * 与 `selection.start` 不同时在轴上标出虚线并写进入点 tooltip——NFR-004 / DESIGN §13
   * 要求"UI 事先展示实际落点"；重编码路径（帧级精确）不要传。
   */
  realStart?: number;
  onSelectionChange: (sel: Selection) => void;
  onSeek: (t: number) => void;
}

type DragKind = "start" | "end" | null;

const SNAP_TOLERANCE_SEC = 0.5;
const MIN_SELECTION_SEC = 0.1;
/** 渲染的关键帧刻度上限，超出按步长抽稀 */
const MAX_RENDERED_KEYFRAMES = 800;

/** 二分找最近关键帧；容差内则吸附 */
function snapToKeyframe(t: number, kfs: number[], snap: boolean): number {
  if (!snap || kfs.length === 0) return t;
  let lo = 0;
  let hi = kfs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const candidates = [kfs[lo], kfs[lo - 1]].filter(
    (x): x is number => x !== undefined,
  );
  const best = candidates.reduce((a, b) =>
    Math.abs(b - t) < Math.abs(a - t) ? b : a,
  );
  return Math.abs(best - t) <= SNAP_TOLERANCE_SEC ? best : t;
}

/** 按时长选择合适的刻度步长（秒）；ClipTimeline 复用 */
export function pickTickStep(duration: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 3600];
  for (const s of steps) {
    if (duration / s <= 16) return s;
  }
  return 3600;
}

export default function Timeline({
  duration,
  keyframes,
  selection,
  currentTime,
  snap,
  realStart,
  onSelectionChange,
  onSeek,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragKind>(null);
  // 拖拽回调闭包里读取最新 selection，避免 stale closure
  const selRef = useRef(selection);
  selRef.current = selection;
  /** 真实落点与选区入点是否可辨（同一毫秒内的差异不提示，避免抖动） */
  const showRealStart = realStartDiffers(realStart, selection.start);

  const pct = (t: number) =>
    duration > 0 ? `${Math.min(100, Math.max(0, (t / duration) * 100))}%` : "0%";

  const ticks = useMemo(() => {
    if (duration <= 0) return [];
    const step = pickTickStep(duration);
    const list: { t: number; label: boolean }[] = [];
    const labelStep = step * 5;
    for (let t = 0; t <= duration + 1e-6; t += step) {
      list.push({ t, label: Math.abs(t % labelStep) < 1e-6 });
    }
    return list;
  }, [duration]);

  const renderedKeyframes = useMemo(() => {
    if (keyframes.length === 0) return [];
    const stride = Math.ceil(keyframes.length / MAX_RENDERED_KEYFRAMES);
    return keyframes.filter((_, i) => i % stride === 0);
  }, [keyframes]);

  const xToTime = (clientX: number) => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
  };

  const beginDrag = (kind: Exclude<DragKind, null>) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = kind;
    const move = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const snapped = snapToKeyframe(xToTime(ev.clientX), keyframes, snap);
      const cur = selRef.current;
      if (dragRef.current === "start") {
        onSelectionChange({
          start: Math.min(snapped, cur.end - MIN_SELECTION_SEC),
          end: cur.end,
        });
      } else {
        onSelectionChange({
          start: cur.start,
          end: Math.max(snapped, cur.start + MIN_SELECTION_SEC),
        });
      }
    };
    // 收尾兜底（窗口外松手 / pointercancel）走公共实现（BUG-003 / AGENTS.md §3 第 20 条）
    beginPointerDrag(move, () => {
      dragRef.current = null;
    });
  };

  const handleStyle =
    "absolute bottom-0 top-0 w-3 -translate-x-1/2 cursor-col-resize rounded-sm bg-paper/70 transition-colors hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal";

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        className="relative h-20 cursor-crosshair rounded-md border border-hairline bg-panel/60"
        onPointerDown={(e) => onSeek(xToTime(e.clientX))}
        role="slider"
        aria-label="时间轴"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
      >
        {/* 时间刻度 */}
        {ticks.map(({ t, label }) => (
          <span
            key={t}
            className={
              label
                ? "absolute bottom-0 w-px bg-hairline"
                : "absolute bottom-0 w-px bg-hairline/50"
            }
            style={{ left: pct(t), height: label ? "40%" : "22%" }}
          />
        ))}
        {/* 时间标签（顶部） */}
        {ticks
          .filter(({ label }) => label)
          .map(({ t }) => (
            <span
              key={`label-${t}`}
              className="absolute top-1 -translate-x-1/2 font-mono text-[9px] text-mute"
              style={{ left: pct(t) }}
            >
              {t === 0 || t === duration
                ? null
                : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`}
            </span>
          ))}
        {/* 关键帧刻度 */}
        {renderedKeyframes.map((t) => (
          <span
            key={`kf-${t}`}
            className="absolute bottom-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-signal/80"
            style={{ left: pct(t) }}
          />
        ))}
        {/* 选中区间 */}
        <div
          className="absolute bottom-0 top-0 border-x border-signal/70 bg-signal/15"
          style={{ left: pct(selection.start), width: `calc(${pct(selection.end)} - ${pct(selection.start)})` }}
        />
        {/* 真实落点（无损路径只能从关键帧开始） */}
        {showRealStart && (
          <span
            className="pointer-events-none absolute bottom-0 top-0 border-l border-dashed border-paper/60"
            style={{ left: pct(realStart as number) }}
          />
        )}
        {/* 双手柄 */}
        <div
          role="slider"
          aria-label="入点"
          aria-valuenow={Math.round(selection.start * 1000)}
          tabIndex={0}
          className={`${handleStyle} left-0`}
          style={{ left: pct(selection.start) }}
          onPointerDown={beginDrag("start")}
          title={
            showRealStart
              ? `入点 ${selection.start.toFixed(3)}s · 实际落点 ${(realStart as number).toFixed(3)}s（无损对齐关键帧）`
              : `入点 ${selection.start.toFixed(3)}s`
          }
        />
        <div
          role="slider"
          aria-label="出点"
          aria-valuenow={Math.round(selection.end * 1000)}
          tabIndex={0}
          className={`${handleStyle} left-0`}
          style={{ left: pct(selection.end) }}
          onPointerDown={beginDrag("end")}
          title={`出点 ${selection.end.toFixed(3)}s`}
        />
        {/* 播放头 */}
        <span
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-paper"
          style={{ left: pct(currentTime) }}
        >
          <span className="absolute -top-px left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-paper" />
        </span>
      </div>
    </div>
  );
}
