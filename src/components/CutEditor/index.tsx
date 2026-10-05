import { X } from "lucide-react";
import type { Segment } from "../../types";
import type { Interval } from "../../utils/removal";
import { formatTime, realCutStart, realStartDiffers } from "../../utils/time";

interface SegmentListProps {
  segments: Segment[];
  onRemove: (index: number) => void;
  /**
   * 无损（copy）路径的关键帧列表（升序）。给了就按**真实落点**（≤入点的最近关键帧）算时长，
   * 因为无损剪切只能从关键帧开始，界面显示的时长必须等于产物时长（NFR-004 / BUG-007）。
   * 帧级精确的模式（精确剪切、带变换的片段）不要传。
   */
  keyframes?: number[];
}

/** 已添加的剪切片段列表。 */
export function SegmentList({ segments, onRemove, keyframes }: SegmentListProps) {
  if (segments.length === 0) return null;
  return (
    <div className="divide-y divide-hairline rounded-md border border-hairline">
      {segments.map((s, i) => {
        const effStart =
          keyframes && keyframes.length > 0 ? realCutStart(s.startSec, keyframes) : s.startSec;
        const adjusted = realStartDiffers(effStart, s.startSec);
        return (
          <div key={`${s.startSec}-${s.endSec}-${i}`} className="flex items-center gap-3 px-3 py-2">
            <span className="w-16 shrink-0 text-xs text-mute">片段 {i + 1}</span>
            <span className="font-mono text-xs text-paper">
              {formatTime(s.startSec)} <span className="text-mute">→</span> {formatTime(s.endSec)}
            </span>
            {adjusted && (
              <span className="text-[11px] text-mute">
                实际入点 <span className="font-mono">{formatTime(effStart)}</span>
              </span>
            )}
            <span className="flex-1" />
            <span
              className="font-mono text-[11px] text-mute"
              title={adjusted ? "无损剪切从关键帧开始，按实际落点计的时长" : undefined}
            >
              {(s.endSec - effStart).toFixed(1)}s
            </span>
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`删除片段 ${i + 1}`}
              className="flex h-6 w-6 items-center justify-center rounded text-mute transition-colors hover:bg-warn/10 hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** 删除列表的一行（`M15-2` / `FR-326`）：用户标记 + 它的实际删除区间 */
export interface RemovalRow {
  /** 用户标记要删除的区间 */
  mark: Interval;
  /** 实际删除区间（吸附延伸 / 并段后可能比标记更长）；`null` 仅为类型兜底 */
  actual: Interval | null;
}

/**
 * 删除模式的已标记区间列表（`FR-326` / UI.md §9.4）：
 * `#序号 · 标记 [a,b] · 实际删除 [a,K] · 延伸 x.xs · 时长 · ✕`。
 *
 * 只做展示 + 回调：实际删除范围与延伸量由 `utils/removal.ts` 的派生链算好传进来，
 * **组件里不复制判定逻辑**（同 `M14-2` 的共同约束）。
 */
export function RemovalList({
  rows,
  onRemove,
  onSeek,
}: {
  rows: RemovalRow[];
  onRemove: (index: number) => void;
  /** 点击行 → 跳到该标记的起点（与片段列表同口径：只 seek，不改选区） */
  onSeek: (t: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="divide-y divide-hairline rounded-md border border-hairline">
      {rows.map(({ mark, actual }, i) => {
        const extended = actual ? Math.max(0, actual.end - mark.end) : 0;
        return (
          <div
            key={`${mark.start}-${mark.end}-${i}`}
            className="flex items-center gap-3 px-3 py-2"
          >
            <button
              type="button"
              onClick={() => onSeek(mark.start)}
              title="跳到该区间的起点"
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              <span className="w-16 shrink-0 text-xs text-mute">删除 {i + 1}</span>
              <span className="shrink-0 font-mono text-xs text-paper">
                {formatTime(mark.start)} <span className="text-mute">→</span>{" "}
                {formatTime(mark.end)}
              </span>
              {actual && (
                <span className="shrink-0 text-[11px] text-warn">
                  实际删除{" "}
                  <span className="font-mono">
                    {formatTime(actual.start)} → {formatTime(actual.end)}
                  </span>
                </span>
              )}
              {extended > 1e-9 && (
                <span className="shrink-0 text-[11px] text-mute">
                  延伸 <span className="font-mono">{extended.toFixed(2)}s</span>
                </span>
              )}
            </button>
            <span
              className="font-mono text-[11px] text-mute"
              title="标记区间时长（实际删除时长见左侧「实际删除」）"
            >
              {(mark.end - mark.start).toFixed(1)}s
            </span>
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`删除标记 ${i + 1}`}
              className="flex h-6 w-6 items-center justify-center rounded text-mute transition-colors hover:bg-warn/10 hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
