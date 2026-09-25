import { X } from "lucide-react";
import type { Segment } from "../../types";
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
