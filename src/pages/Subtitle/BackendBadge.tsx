/**
 * BackendBadge（M18-7，FR-391/ADR-041②）：GPU 加速包状态徽标。
 * 未安装 → 可发起下载（436MB，走任务系统）；已装可用 → 绿点；已装但试跑失败
 * → 原因 tooltip（如"未检测到 NVIDIA 驱动"，已自动回退 CPU）。
 */
export function BackendBadge({
  status,
  downloading,
  progress,
  onDownloadCuda,
}: {
  status: {
    cudaInstalled: boolean;
    gpuAvailable: boolean;
    reason: string | null;
  } | null;
  /** CUDA 加速包下载任务进行中 */
  downloading: boolean;
  /** 下载进度 0~1 */
  progress: number;
  onDownloadCuda: () => void;
}) {
  if (downloading) {
    return (
      <div
        className="flex shrink-0 items-center gap-2 font-mono text-xs text-mute"
        title="正在下载 GPU 加速包（约 436MB）"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
        GPU 包 {Math.round(progress * 100)}%
      </div>
    );
  }
  if (!status) {
    return (
      <div className="shrink-0 font-mono text-xs text-mute">GPU 状态检测中…</div>
    );
  }
  if (!status.cudaInstalled) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-xs text-mute" title="检测到 N 卡且驱动足够新时可用；CPU 转写始终可用">
          GPU 加速：未安装
        </span>
        <button
          type="button"
          onClick={onDownloadCuda}
          className="rounded-md border border-hairline px-2 py-1 text-xs text-mute transition-colors hover:border-signal hover:text-signal focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          下载加速包
        </button>
      </div>
    );
  }
  if (status.gpuAvailable) {
    return (
      <div
        className="flex shrink-0 items-center gap-2 font-mono text-xs text-mute"
        title="CUDA 12.4 加速包已就绪，转写将使用 GPU"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        GPU 加速可用
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center gap-2 font-mono text-xs text-warn"
      title={status.reason ?? "GPU 不可用"}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
      GPU 不可用 · 已回退 CPU
    </div>
  );
}
