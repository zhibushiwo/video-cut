/** 工作台页脚：检测汇总 + 输出目录/质量/文件名 + 错误 + 合成导出。R2-1 自 index.tsx 拆出。 */
import type { QualityPreset } from "../../types";
import { QUALITY_LABELS } from "./shared";

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
}) {
  return (
    <footer className="shrink-0 border-t border-hairline px-4 py-3">
      <div className="flex items-center gap-3">
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
