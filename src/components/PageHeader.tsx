/**
 * 页头（T-005 收敛六份逐字同构：Cut×2 / Merge / Editor / History / Settings）：
 * 返回按钮 + 标题 + 可选右侧内容（文件名 / 动作按钮经 `right` 插槽传入）。
 */
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="返回工作台"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
      {right}
    </header>
  );
}
