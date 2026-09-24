/** 时间码输入：受控同步 + 失焦/回车提交（非法值回滚）。R2-1 原样自 index.tsx 迁出。 */
import { useEffect, useState } from "react";
import { formatTime, parseTime } from "../../utils/time";

export function TimeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit(t: number): void;
}) {
  const [text, setText] = useState(formatTime(value));
  useEffect(() => setText(formatTime(value)), [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-mute">{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = parseTime(text);
          if (t !== null) onCommit(t);
          else setText(formatTime(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-28 rounded border border-hairline bg-panel px-2 py-1.5 font-mono text-xs text-paper focus:border-signal focus:outline-none"
      />
    </label>
  );
}
