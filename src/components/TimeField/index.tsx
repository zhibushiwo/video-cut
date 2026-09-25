/** 时间输入框：显示 HH:MM:SS.mmm，失焦/回车提交；非法输入回退为上次值。 */
import { useEffect, useRef, useState } from "react";
import { formatTime, parseTime } from "../../utils/time";

interface TimeFieldProps {
  label: string;
  value: number;
  onCommit: (t: number) => void;
}

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
