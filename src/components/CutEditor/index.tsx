import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Segment } from "../../types";
import { formatTime, parseTime } from "../../utils/time";

interface TimeFieldProps {
  label: string;
  value: number;
  onCommit: (t: number) => void;
}

/** 时间输入框：显示 HH:MM:SS.mmm，失焦/回车提交；非法输入回退为上次值。 */
export function TimeField({ label, value, onCommit }: TimeFieldProps) {
  const [text, setText] = useState(() => formatTime(value));
  const lastValue = useRef(value);

  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setText(formatTime(value));
    }
  }, [value]);

  const commit = () => {
    const t = parseTime(text);
    if (t === null) {
      setText(formatTime(lastValue.current));
      return;
    }
    lastValue.current = t;
    onCommit(t);
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-mute">{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-32 rounded border border-hairline bg-panel px-2 py-1.5 font-mono text-sm text-paper focus:border-signal focus:outline-none"
      />
    </label>
  );
}

interface SegmentListProps {
  segments: Segment[];
  onRemove: (index: number) => void;
}

/** 已添加的剪切片段列表。 */
export function SegmentList({ segments, onRemove }: SegmentListProps) {
  if (segments.length === 0) return null;
  return (
    <div className="divide-y divide-hairline rounded-md border border-hairline">
      {segments.map((s, i) => (
        <div key={`${s.startSec}-${s.endSec}-${i}`} className="flex items-center gap-3 px-3 py-2">
          <span className="w-16 shrink-0 text-xs text-mute">片段 {i + 1}</span>
          <span className="font-mono text-xs text-paper">
            {formatTime(s.startSec)} <span className="text-mute">→</span> {formatTime(s.endSec)}
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[11px] text-mute">
            {(s.endSec - s.startSec).toFixed(1)}s
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
      ))}
    </div>
  );
}
