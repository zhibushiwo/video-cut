import { ArrowLeft, Film, GripVertical, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkMerge,
  fileExists,
  fileSrc,
  generateThumbnails,
  pickVideos,
  submitTask,
} from "../../services/tauri";
import type { AppSettings, MergeComparison } from "../../types";
import { useDragSort } from "../../hooks/useDragSort";
import { moveAt } from "../../utils/array";
import { audioSummary, videoSummary } from "../../utils/media";
import { basename, resolveOutputDir, resolveUniqueTarget } from "../../utils/paths";
import { formatBytes } from "../../utils/time";

export default function MergePage({
  settings,
  onBack,
  initialFiles,
}: {
  settings: AppSettings;
  onBack: () => void;
  initialFiles?: string[] | null;
}) {
  const [files, setFiles] = useState<string[]>(initialFiles ?? []);
  const [check, setCheck] = useState<MergeComparison | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState("merged.mp4");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmNormalize, setConfirmNormalize] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // 拖拽导入：每次新的拖入都追加（App 层原地分发，页面不跳转）
  const consumedInitialRef = useRef<string[] | null>(null);

  // 输出位置：默认输出目录优先，否则跟随首个源文件目录（DESIGN §12）
  const outputDir =
    files.length > 0 ? resolveOutputDir(files[0], settings.defaultOutputDir) : "";

  useEffect(() => {
    if (!initialFiles || initialFiles === consumedInitialRef.current) return;
    consumedInitialRef.current = initialFiles;
    setFiles((prev) => {
      const next = [...prev];
      for (const p of initialFiles) {
        if (!next.includes(p)) next.push(p);
      }
      return next;
    });
  }, [initialFiles]);

  // 列表变化 → 重新检测（≥2 个文件时）
  useEffect(() => {
    setConfirmNormalize(false);
    if (files.length < 2) {
      setCheck(null);
      setCheckError(null);
      return;
    }
    let alive = true;
    setChecking(true);
    setCheckError(null);
    checkMerge(files)
      .then((c) => {
        if (alive) setCheck(c);
      })
      .catch((err: unknown) => {
        if (alive) {
          setCheck(null);
          setCheckError(String(err));
        }
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [files]);

  // 列表变化 → 批量取首帧缩略图（缓存命中时接近即时）
  useEffect(() => {
    if (files.length === 0) return;
    let alive = true;
    generateThumbnails(files)
      .then((list) => {
        if (!alive) return;
        setThumbs((prev) => {
          const next = { ...prev };
          for (const t of list) next[t.input] = t.thumbPath;
          return next;
        });
      })
      .catch(() => {
        /* 缩略图失败不阻塞，行内显示占位图标 */
      });
    return () => {
      alive = false;
    };
  }, [files]);

  const addFiles = useCallback(async () => {
    const picked = await pickVideos();
    if (picked.length === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const p of picked) {
        if (!next.includes(p)) next.push(p);
      }
      return next;
    });
  }, []);

  const removeAt = (index: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== index));

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    setFiles((prev) => moveAt(prev, from, to));
  };

  const { listRef, beginDrag, rowCls } = useDragSort(reorder);

  const startMerge = async (force: boolean) => {
    if (files.length < 2 || !outputDir || !outputName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const dir = outputDir.replace(/[\\/]+$/, "");
      const name = outputName.trim();
      // 同名才追加时间戳（DESIGN 决策 #19）：目标已存在时自动改名防覆盖
      const target = await resolveUniqueTarget(dir, name, fileExists);
      await submitTask({
        type: "merge",
        inputs: files,
        output: target,
        forceTranscode: force,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const summaryOf = (path: string): string | null => {
    // check.files 与 files 顺序一致（checkMerge 按提交顺序返回）
    const idx = files.indexOf(path);
    const f = check?.files[idx];
    if (!f) return null;
    const parts = [videoSummary(f)];
    const audio = audioSummary(f);
    if (audio) parts.push(audio);
    parts.push(formatBytes(f.sizeBytes));
    return parts.join("　");
  };

  const canLossless = files.length >= 2 && check?.compatible === true;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回工作台"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold tracking-tight">合并</h1>
        {files.length > 0 && (
          <span className="ml-auto text-xs text-mute">{files.length} 个视频</span>
        )}
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-4">
        {files.length === 0 ? (
          <button
            type="button"
            onClick={() => void addFiles()}
            className="group flex h-64 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-hairline transition-colors hover:border-signal/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <Plus className="h-8 w-8 text-mute transition-colors group-hover:text-signal" strokeWidth={1.5} />
            <span className="text-sm text-mute transition-colors group-hover:text-paper">
              添加视频文件
            </span>
            <span className="text-xs text-mute/70">参数一致时可无损拼接，秒级完成</span>
          </button>
        ) : (
          <>
            <div ref={listRef} className="divide-y divide-hairline rounded-md border border-hairline">
              {files.map((path, i) => {
                const name = basename(path);
                const summary = summaryOf(path);
                return (
                  <div
                    key={path}
                    data-sort-row
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-panel ${rowCls(i)}`}
                  >
                    <GripVertical
                      onPointerDown={(e) => beginDrag(e, i)}
                      className="h-4 w-4 shrink-0 cursor-grab touch-none text-mute/60"
                      aria-hidden="true"
                    />
                    <span className="w-5 shrink-0 text-center font-mono text-xs text-mute">
                      {i + 1}
                    </span>
                    {thumbs[path] ? (
                      <img
                        src={fileSrc(thumbs[path])}
                        alt=""
                        className="h-9 w-16 shrink-0 rounded border border-hairline object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded border border-hairline bg-panel">
                        <Film className="h-4 w-4 text-mute/60" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-paper" title={path}>
                        {name}
                      </span>
                      {summary && (
                        <span className="block truncate font-mono text-[11px] text-mute">
                          {summary}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAt(i)}
                      aria-label={`移除 ${name}`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-mute transition-colors hover:bg-warn/10 hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void addFiles()}
              className="flex items-center justify-center gap-2 rounded-md border border-dashed border-hairline py-2 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              <Plus className="h-3.5 w-3.5" /> 添加视频
            </button>
            <p className="text-[11px] text-mute/70">拖动左侧手柄调整拼接顺序。</p>

            {/* 检测面板（DESIGN §9.5） */}
            {files.length >= 2 && (
              <div
                className={`rounded-md border p-4 ${
                  checking
                    ? "border-hairline bg-panel/60"
                    : check?.compatible
                      ? "border-signal/30 bg-signal/5"
                      : check
                        ? "border-warn/40 bg-warn/5"
                        : "border-hairline bg-panel/60"
                }`}
              >
                {checking ? (
                  <p className="text-sm text-mute">正在检测参数一致性…</p>
                ) : checkError ? (
                  <p className="text-sm text-warn">{checkError}</p>
                ) : check?.compatible ? (
                  <div>
                    <p className="text-sm font-medium text-signal">
                      ✓ 参数一致，可无损合并
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      编码、分辨率、帧率、音频参数全部相同，直接拼接数据流，预计速度极快，画质不变。
                    </p>
                  </div>
                ) : check ? (
                  <div>
                    <p className="text-sm font-medium text-warn">
                      ⚠ 检测到参数不一致，无法直接无损合并
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-mute">
                      {check.differences.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-hairline px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-xs text-mute" title={outputDir}>
            输出到 {outputDir || "（先添加视频）"}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-mute">
            文件名
            <input
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
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
          {confirmNormalize && (
            <>
              <span className="text-xs text-mute">
                以第 1 个文件的参数重编码全部视频后合并，画质会有损失。
              </span>
              <button
                type="button"
                onClick={() => setConfirmNormalize(false)}
                className="rounded-md border border-hairline px-3 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                取消
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void startMerge(true)}
                className="rounded-md bg-warn px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-warn disabled:cursor-not-allowed disabled:opacity-40"
              >
                确认重编码并合并
              </button>
            </>
          )}
          {!confirmNormalize && check && !check.compatible && !checking && (
            <button
              type="button"
              onClick={() => setConfirmNormalize(true)}
              className="rounded-md border border-warn/50 bg-warn/10 px-4 py-1.5 text-sm text-warn transition-colors hover:bg-warn/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-warn"
            >
              自动统一后合并
            </button>
          )}
          <button
            type="button"
            disabled={submitting || !canLossless}
            onClick={() => void startMerge(false)}
            title={files.length < 2 ? "请先添加至少两个视频" : undefined}
            className="rounded-md bg-signal px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "提交中…" : "无损合并"}
          </button>
        </div>
      </footer>
    </div>
  );
}
