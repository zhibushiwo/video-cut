/**
 * 空状态「打开 / 添加视频」虚线大按钮（T-005 收敛四份同构：Cut / Editor / Merge / Workbench）。
 * 图标、文案与最大宽度由调用方给定（Cut/Editor 为 `max-w-xl`，Merge/Workbench 铺满容器）。
 */
import type { LucideIcon } from "lucide-react";

export function EmptyImport({
  onOpen,
  icon: Icon,
  label,
  hint,
  maxWidth = "",
}: {
  onOpen: () => void;
  icon: LucideIcon;
  label: string;
  hint: string;
  /** 覆盖宽度上限（如 `"max-w-xl"`）；默认铺满父容器 */
  maxWidth?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex h-64 w-full ${maxWidth} flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-hairline transition-colors hover:border-signal/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal`}
    >
      <Icon className="h-8 w-8 text-mute transition-colors group-hover:text-signal" strokeWidth={1.5} />
      <span className="text-sm text-mute transition-colors group-hover:text-paper">{label}</span>
      <span className="text-xs text-mute/70">{hint}</span>
    </button>
  );
}
