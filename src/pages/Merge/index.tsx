import { Film, GripVertical, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  checkMerge,
  confirmDialog,
  fileSrc,
  pickDirectory,
  pickVideos,
  submitTask,
  submitToUniqueTarget,
} from "../../services/tauri";
import type { AppSettings, MergeComparison, PipelineItem } from "../../types";
import { useDragSort } from "../../hooks/useDragSort";
import { usePreviewRender } from "../../hooks/usePreviewRender";
import { useVideoZoom } from "../../hooks/useVideoZoom";
import { useThumbnails } from "../../hooks/useThumbnails";
import { useConsumeInitialFiles } from "../../hooks/useConsumeInitialFiles";
import { EmptyImport } from "../../components/EmptyImport";
import { PageHeader } from "../../components/PageHeader";
import { moveAt } from "../../utils/array";
import { audioSummary, videoSummary } from "../../utils/media";
import { basename, defaultOutputName, dirname, resolveOutputDir } from "../../utils/paths";
import { formatBytes, formatTime } from "../../utils/time";

/** 默认输出文件名（`M14-3` 会把它换成"按首个素材派生 + `ADR-033` 扩展名预判"） */
const DEFAULT_OUTPUT_NAME = "merged.mp4";

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

  // 合并预览（M16-7 / CAND-027②）：文件列表 = pipeline 多输入条目（每文件全区间、无变换），
  // 与导出走同一条 copy/归一化判定；文件可能很大 → 手动触发（auto: false）
  const previewItems = useMemo<PipelineItem[]>(
    () =>
      files.map((path) => ({
        input: path,
        segment: null,
        rotateDeg: 0,
        hflip: false,
        vflip: false,
        crop: null,
        outWidth: null,
        outHeight: null,
      })),
    [files],
  );
  const preview = usePreviewRender({
    hasEntries: files.length >= 2,
    allLossless: true,
    items: previewItems,
    quality: settings.quality,
    encoder: settings.encoder === "auto" ? null : settings.encoder,
    auto: false,
  });
  const videoZoom = useVideoZoom(true);
  const [check, setCheck] = useState<MergeComparison | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState(DEFAULT_OUTPUT_NAME);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmNormalize, setConfirmNormalize] = useState(false);
  /** 分组勾选（M24，CAND-048）：默认全选，取消勾选的组不随「分组无损合并」提交 */
  const [groupChecked, setGroupChecked] = useState<boolean[]>([]);
  /** 分组合并的提交后提示（FR-334）：单文件组跳过等非错误信息 */
  const [groupMsg, setGroupMsg] = useState<string | null>(null);
  /** 本次临时导出目录（FR-402/M23，字幕页 M19-3 同款）：null = 走 §12 默认规则；不持久化 */
  const [exportDir, setExportDir] = useState<string | null>(null);
  // 素材首帧缩略图（T-005 收敛进 hooks/useThumbnails）
  const { thumbs, clearThumbs } = useThumbnails(files);
  // 拖拽导入：每次新的拖入都追加（App 层原地分发，页面不跳转）

  // 输出位置：默认输出目录优先，否则跟随首个源文件目录（DESIGN §12）
  const outputDir =
    exportDir ?? (files[0] ? resolveOutputDir(files[0], settings.defaultOutputDir) : "");

  useConsumeInitialFiles(initialFiles, (fs) => {
    setFiles((prev) => {
      const next = [...prev];
      for (const p of fs) {
        if (!next.includes(p)) next.push(p);
      }
      return next;
    });
  });

  // 列表变化 → 重新检测（≥2 个文件时）
  useEffect(() => {
    setConfirmNormalize(false);
    setGroupMsg(null);
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

  /**
   * 默认输出名（`M14-3`，UI.md §9.5）：`<首个文件名>_merged.<扩展名>`——扩展名按 `ADR-033` 预判
   * （参数一致 = copy 跟随源容器；不一致 / 还没检测出结果 = 重编码固定 `mp4`）。
   * **用户手改过（`nameDirtyRef`）之后不再联动**（素材增删/排序都不覆盖他的名字）；
   * 清空列表时复位。重名仍沿用 `resolveUniqueTarget`（决策 #19，只加时间戳）。
   */
  const nameDirtyRef = useRef(false);
  useEffect(() => {
    const first = files[0];
    if (!first) {
      nameDirtyRef.current = false;
      setOutputName(DEFAULT_OUTPUT_NAME);
      return;
    }
    if (nameDirtyRef.current) return;
    setOutputName(defaultOutputName(first, "merged", check?.compatible === true));
  }, [files, check]);

  const addFiles = useCallback(async () => {
    // 追加素材从最近一个素材的目录起始（M22-2 / CAND-043）；列表为空时缺省系统行为
    const last = files[files.length - 1];
    const picked = await pickVideos(last ? dirname(last) : undefined);
    if (picked.length === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const p of picked) {
        if (!next.includes(p)) next.push(p);
      }
      return next;
    });
  }, [files]);

  const removeAt = (index: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== index));

  /**
   * 清空列表（`M14-2`，UI.md §9.5）：有文件时二次确认；文件名回默认、缩略图与检测结果一并清，
   * 落点 = 合并页空态（不跳页）。
   */
  const clearList = useCallback(async () => {
    if (files.length > 0) {
      const ok = await confirmDialog(
        `清空列表将移除全部 ${files.length} 个文件，输出文件名回到默认。`,
        "清空列表",
      );
      if (!ok) return;
    }
    setFiles([]);
    clearThumbs();
    setCheck(null);
    setCheckError(null);
    setConfirmNormalize(false);
    // 文件名回默认由上面的派生 effect 负责（files 变空 ⇒ 复位 + 清 nameDirty）
    nameDirtyRef.current = false;
  }, [files.length, clearThumbs]);

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
      // 同名才追加时间戳（DESIGN 决策 #19）：目标已存在时自动改名防覆盖
      await submitToUniqueTarget(outputDir, outputName, (target) =>
        submitTask({ type: "merge", inputs: files, output: target, forceTranscode: force }),
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * 分组无损合并（`FR-334`/`ADR-048`）：仅取 ≥2 文件的组逐组提交无损合并
   * （组内两两相容由后端 `group_merge_facts` 保证，执行期复检必过）；单文件组跳过并提示
   * （用户裁决）。每组命名 = 组内首文件派生 `<名>_merged.<源容器>`（组内全 copy ⇒ lossless），
   * 撞名加时间戳（决策 #19）；组内顺序 = 列表顺序。
   */
  const mergeableGroups = useMemo(
    () => (check && !check.compatible ? check.groups.filter((g) => g.length >= 2) : []),
    [check],
  );
  const singletonCount =
    check && !check.compatible ? check.groups.filter((g) => g.length < 2).length : 0;

  // 检测结果变化时重置分组勾选 = 默认全选（M24，CAND-048）
  useEffect(() => {
    setGroupChecked(mergeableGroups.map(() => true));
  }, [mergeableGroups]);

  const startGroupedMerge = async () => {
    const checkedGroups = mergeableGroups.filter((_, i) => groupChecked[i]);
    if (checkedGroups.length === 0 || !outputDir) return;
    setSubmitting(true);
    setError(null);
    setGroupMsg(null);
    try {
      for (const g of checkedGroups) {
        const first = files[g[0] ?? -1];
        if (!first) continue;
        const inputs = g.map((i) => files[i] ?? "").filter(Boolean);
        await submitToUniqueTarget(outputDir, defaultOutputName(first, "merged", true), (target) =>
          submitTask({ type: "merge", inputs, output: target, forceTranscode: false }),
        );
      }
      const skippedGroups = mergeableGroups.length - checkedGroups.length;
      const parts: string[] = [];
      if (skippedGroups > 0) parts.push(`已取消勾选 ${skippedGroups} 组（不提交）。`);
      if (singletonCount > 0) parts.push(`已跳过 ${singletonCount} 个参数独特的文件。`);
      if (parts.length > 0) setGroupMsg(parts.join(" "));
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
      <PageHeader
        title="合并"
        onBack={onBack}
        right={
          files.length > 0 ? (
            <>
              <span className="ml-auto text-xs text-mute">{files.length} 个视频</span>
              {/* 清空列表（M14-2）：破坏性操作，有文件时二次确认 */}
              <button
                type="button"
                onClick={() => void clearList()}
                className="shrink-0 rounded-md border border-hairline px-3 py-1.5 text-xs text-mute transition-colors hover:border-warn hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                清空列表
              </button>
            </>
          ) : undefined
        }
      />

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-4">
        {files.length === 0 ? (
          <EmptyImport
            onOpen={() => void addFiles()}
            icon={Plus}
            label="添加视频文件"
            hint="参数一致时可无损拼接，秒级完成"
          />
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
                      // draggable=false：同 SourceCards——原生图片拖拽会被 Tauri 当成外部拖入（BUG-025）
                      <img
                        src={fileSrc(thumbs[path])}
                        alt=""
                        draggable={false}
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
                    {mergeableGroups.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-mute">
                            可分成 {mergeableGroups.length} 组无损合并（各组独立出文件），取消勾选的组不提交：
                          </p>
                          <span className="flex shrink-0 gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setGroupChecked(mergeableGroups.map(() => true))}
                              className="text-mute transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                            >
                              全选
                            </button>
                            <button
                              type="button"
                              onClick={() => setGroupChecked((prev) => prev.map(() => false))}
                              className="text-mute transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                            >
                              全不选
                            </button>
                          </span>
                        </div>
                        <div className="mt-1.5 grid gap-1.5">
                          {mergeableGroups.map((g, gi) => {
                            const checked = groupChecked[gi] ?? true;
                            const totalSec = g.reduce(
                              (acc, i) => acc + (check?.files[i]?.durationSec ?? 0),
                              0,
                            );
                            return (
                              <label
                                key={gi}
                                className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                                  checked
                                    ? "border-signal/30 bg-signal/5"
                                    : "border-hairline bg-panel/40 opacity-60"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setGroupChecked((prev) =>
                                      prev.map((v, idx) => (idx === gi ? e.target.checked : v)),
                                    )
                                  }
                                  className="accent-signal"
                                />
                                <span className="shrink-0 text-mute">组 {gi + 1}</span>
                                <span className="min-w-0 flex-1 truncate text-mute" title={g.map((i) => basename(files[i] ?? "")).join("、")}>
                                  {g.map((i) => basename(files[i] ?? "")).join("、")}
                                </span>
                                <span className="shrink-0 font-mono text-[11px] text-mute">
                                  {g.length} 个 · {formatTime(totalSec, false)}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {singletonCount > 0 && (
                          <p className="mt-1.5 text-xs text-warn">
                            {singletonCount} 个文件参数独特，无法参与分组合并（提交时将跳过）。
                          </p>
                        )}
                      </div>
                    )}
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
<div className="rounded-md border border-hairline bg-panel/40 p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => preview.renderNow()}
                  disabled={files.length < 2}
                  className="rounded-md border border-hairline px-2.5 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-50"
                >
                  生成预览
                </button>
                <span className="text-[11px] text-mute">
                  {preview.phase === "rendering"
                    ? "渲染预览中…（不进任务面板与历史）"
                    : preview.phase === "failed"
                      ? "上次渲染失败，可重试"
                      : preview.renderedSrc
                        ? "预览就绪"
                        : files.length < 2
                          ? "添加至少两个视频后可预览"
                          : "点「生成预览」渲染真实合并结果"}
                </span>
              </div>
              {preview.renderedSrc && (
                // 溢出裁剪（BUG-030）：框选放大是纯 transform（画到元素框外），宿主必须有 overflow-hidden
                <div className="relative mt-2 overflow-hidden rounded-md">
                  <video
                    src={fileSrc(preview.renderedSrc)}
                    controls
                    className={`max-h-[40vh] w-full rounded bg-black object-contain ${videoZoom.cursorClass}`}
                    style={videoZoom.videoStyle}
                    onPointerDown={videoZoom.onPointerDown}
                    onDoubleClick={videoZoom.onDoubleClick}
                  />
                  {videoZoom.selOverlay}
                </div>
              )}
              <p className="mt-1.5 text-[11px] leading-relaxed text-mute/70">
                预览按文件顺序连续播放，判定与导出一致（参数不一致时预览同样自动统一）。
              </p>
            </div>
            输出到 {outputDir || "（先添加视频）"}
            {exportDir && <span className="ml-1 text-mute/80">（本次临时）</span>}
          </span>
          <button
            type="button"
            onClick={() => void pickDirectory().then((d) => d && setExportDir(d))}
            disabled={!files.length}
            title="本次导出使用的文件夹（不改动设置里的默认输出目录）"
            className="rounded-md border border-hairline px-2 py-1 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
          >
            更改目录
          </button>
          {exportDir && (
            <button
              type="button"
              onClick={() => setExportDir(null)}
              className="rounded-md border border-hairline px-2 py-1 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              恢复默认
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-mute">
            文件名
            <input
              value={outputName}
              onChange={(e) => {
                // 用户手改过 ⇒ 停止默认名联动（M14-3）；清空列表时复位
                nameDirtyRef.current = true;
                setOutputName(e.target.value);
              }}
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
          {!error && groupMsg && (
            <span className="min-w-0 flex-1 truncate text-xs text-mute" title={groupMsg}>
              {groupMsg}
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
          {!confirmNormalize && !checking && mergeableGroups.length > 0 && (
            <button
              type="button"
              disabled={submitting || !groupChecked.some(Boolean)}
              onClick={() => void startGroupedMerge()}
              title="参数一致的文件各自无损合并，参数独特的文件将被跳过"
              className="rounded-md bg-signal/90 px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
            >
              分组无损合并
            </button>
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
