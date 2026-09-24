/** 工作台头部：品牌标记 + FFmpeg 环境徽标 + 素材/片段计数 + 功能导航。R2-1 自 index.tsx 拆出。 */
import { Clock, Settings as SettingsIcon } from "lucide-react";
import type { EnvironmentInfo, PageName } from "../../types";
import { NAV_ITEMS } from "./shared";

/** 品牌标记：一条斜切线把画面分成两块——"剪开"本身。 */
function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path d="M6 4.5h9.8L12.7 11H6z" fill="currentColor" />
      <path d="M11.4 13H18v6.5H8.1z" fill="currentColor" />
    </svg>
  );
}

/** FFmpeg 环境状态徽标（原主页头部组件，随落地页迁移）。 */
function EnvChip({ env }: { env: EnvironmentInfo | null }) {
  if (!env) {
    return (
      <div className="flex shrink-0 items-center gap-2 font-mono text-xs text-mute" title="正在检查内置 FFmpeg">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mute" />
        正在检测 FFmpeg…
      </div>
    );
  }
  if (env.ok) {
    return (
      <div
        className="flex shrink-0 items-center gap-2 font-mono text-xs text-mute"
        title={`ffmpeg ${env.ffmpegVersion ?? ""} / ffprobe ${env.ffprobeVersion ?? ""}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        FFmpeg {env.ffmpegVersion?.split("-")[0]} 就绪
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center gap-2 font-mono text-xs text-warn"
      title={env.message ?? "FFmpeg 不可用"}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
      FFmpeg 未就绪
    </div>
  );
}

export function WorkbenchHeader({
  env,
  fileCount,
  timelineCount,
  onNavigate,
}: {
  env: EnvironmentInfo | null;
  fileCount: number;
  timelineCount: number;
  onNavigate: (page: PageName) => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
      <BrandMark />
      <div className="shrink-0 leading-tight">
        <div className="text-sm font-semibold tracking-tight">video-cut</div>
        <div className="text-[11px] text-mute">工作台 · 逐段加工，合成一个成品</div>
      </div>
      <EnvChip env={env} />
      {fileCount > 0 && (
        <span className="shrink-0 text-xs text-mute">
          {fileCount} 个素材 · {timelineCount} 个片段
        </span>
      )}
      <nav className="ml-auto flex shrink-0 items-center gap-1" aria-label="功能导航">
        {NAV_ITEMS.map(({ page, label, icon: Icon }) => (
          <button
            key={page}
            type="button"
            onClick={() => onNavigate(page)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-mute transition-colors hover:bg-panel hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-hairline" aria-hidden="true" />
        <button
          type="button"
          onClick={() => onNavigate("history")}
          aria-label="历史记录"
          title="历史记录"
          className="flex h-8 w-8 items-center justify-center rounded-md text-mute transition-colors hover:bg-panel hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <Clock className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate("settings")}
          aria-label="设置"
          title="设置"
          className="flex h-8 w-8 items-center justify-center rounded-md text-mute transition-colors hover:bg-panel hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      </nav>
    </header>
  );
}
