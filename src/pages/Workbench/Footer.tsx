/** 工作台页脚：检测汇总 + 输出目录/质量/文件名 + 错误 + 合成导出。R2-1 自 index.tsx 拆出。 */
import type { QualityPreset } from "../../types";
import { QUALITY_LABELS } from "../../utils/quality";

export function WorkbenchFooter({
  checkSummary,
  outputDir,
  quality,
  onQualityChange,
  outputName,
  onOutputNameChange,
  error,
  submitting,
  exportDisabled,
  exportTitle,
  onExport,
  onClearProject,
  clearDisabled,
  previewPhase,
  canRenderPreview,
  onPreviewNow,
}: {
  checkSummary: string | null;
  outputDir: string;
  quality: QualityPreset;
  onQualityChange(q: QualityPreset): void;
  outputName: string;
  onOutputNameChange(v: string): void;
  error: string | null;
  submitting: boolean;
  exportDisabled: boolean;
  exportTitle?: string;
  onExport(): void;
  /** 清空工程（M14-2）：破坏性操作，调用方负责**始终**二次确认 */
  onClearProject(): void;
  /** 空工程时置灰（没有可清的东西，避免弹一个无意义的确认框） */
  clearDisabled?: boolean;
  /** 渲染即预览的状态（M12-2）：idle / rendering / ready / failed */
  previewPhase: "idle" | "rendering" | "ready" | "failed";
  /** 「精确预览」是否可用（渲染中 / 无片段时置灰） */
  canRenderPreview: boolean;
  /** 手动发起一次真实成品渲染（含重编码的时间线不会自动渲染） */
  onPreviewNow(): void;
}) {
  return (
    <footer className="shrink-0 border-t border-hairline px-4 py-3">
      <div className="flex items-center gap-3">
        {/* 页脚左侧（UI.md §9.8）：清空工程 = 清素材 + 片段 + 时间轴 + 撤销栈 */}
        <button
          type="button"
          onClick={onClearProject}
          disabled={clearDisabled}
          className="shrink-0 rounded-md border border-hairline px-3 py-1.5 text-xs text-mute transition-colors hover:border-warn hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
        >
          清空工程
        </button>
        {checkSummary && (
          <span
            className={`shrink-0 text-xs ${
              checkSummary.startsWith("✓")
                ? "text-signal"
                : checkSummary.startsWith("⚠")
                  ? "text-warn"
                  : "text-mute"
            }`}
          >
            {checkSummary}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-mute" title={outputDir}>
          {outputDir ? `输出到 ${outputDir}` : "（先添加视频并剪出片段）"}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-mute">
          质量档位
          <select
            value={quality}
            onChange={(e) => onQualityChange(e.target.value as QualityPreset)}
            className="rounded border border-hairline bg-panel px-2 py-1 text-xs text-paper focus:border-signal focus:outline-none"
          >
            {(Object.keys(QUALITY_LABELS) as QualityPreset[]).map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABELS[q]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-mute">
          文件名
          <input
            value={outputName}
            onChange={(e) => onOutputNameChange(e.target.value)}
            className="w-40 rounded border border-hairline bg-panel px-2 py-1.5 font-mono text-xs text-paper focus:border-signal focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-2">
        {error && (
          <span className="min-w-0 flex-1 truncate text-xs text-warn" title={error}>
            {error}
          </span>
        )}
        {/* 渲染即预览（M12-2）：状态 + 手动触发。含重编码的时间线不自动渲染，
            这里由用户显式发起一次"精确预览"（FR-1761） */}
        {previewPhase === "rendering" && (
          <span className="shrink-0 text-xs text-mute">渲染预览中…</span>
        )}
        {previewPhase === "ready" && (
          <span
            className="shrink-0 text-xs text-signal"
            title="预览区正在播放真实成品文件（本地缓存）"
          >
            渲染预览就绪
          </span>
        )}
        {previewPhase === "failed" && (
          <span className="shrink-0 text-xs text-warn">渲染预览失败，已回退近似预览</span>
        )}
        <button
          type="button"
          disabled={!canRenderPreview}
          onClick={onPreviewNow}
          title="立即渲染真实成品用于预览（含重编码的时间线不会自动渲染）"
          className="shrink-0 rounded-md border border-hairline px-3 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
        >
          精确预览
        </button>
        <button
          type="button"
          disabled={exportDisabled}
          onClick={onExport}
          title={exportTitle}
          className="rounded-md bg-signal px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "提交中…" : "合成导出"}
        </button>
      </div>
    </footer>
  );
}
