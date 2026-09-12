import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  onBack: () => void;
  children: ReactNode;
}

/** 二级页面通用骨架：顶部返回栏 + 内容区（后续 Cut/Merge/Editor 复用）。 */
export default function PageShell({ title, onBack, children }: PageShellProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回主页"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
      </header>
      <div className="flex flex-1 items-center justify-center p-6">{children}</div>
    </div>
  );
}
