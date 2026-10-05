import { ArrowLeft, Film } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RemovalList, SegmentList, type RemovalRow } from "../../components/CutEditor";
import { TimeField } from "../../components/TimeField";
import Timeline, { type Selection } from "../../components/Timeline";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import { usePlaybackHotkeys } from "../../hooks/usePlaybackHotkeys";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useProxyPreview } from "../../hooks/useProxyPreview";
import {
  fileExists,
  fileSrc,
  listKeyframes,
  pickDirectory,
  pickVideo,
  probeMedia,
  submitTask,
} from "../../services/tauri";
import type { AppSettings, CutMode, MediaInfo, PipelineItem, Segment } from "../../types";
import { audioSummary, needsProxy, videoSummary, wantsProxy } from "../../utils/media";
import { basename, resolveOutputDir, resolveUniqueTarget } from "../../utils/paths";
import { actualRemovalOf, planRemoval, type Interval } from "../../utils/removal";
import {
  MIN_SEG_DURATION_SEC,
  formatBitrate,
  formatBytes,
  formatTime,
  realCutStart,
  realStartDiffers,
} from "../../utils/time";

/**
 * 剪切页的两种模式（`FR-326` / `ADR-037`）：
 * - `extract` 提取式（默认，现行为不变）：标记**要保留**的区间，多段导出多个文件；
 * - `remove` 删除式（保留式裁剪）：标记**要删除**的区间，求补集后无损合成**一个**文件。
 * 两套列表各自保留，导出只作用于当前模式（UI.md §9.4）。
 */
type CutTab = "extract" | "remove";

/** 成品名：`<源文件名去扩展名>_trimmed<源扩展名>`（`ADR-033`：全 copy ⇒ 跟随源容器；M15-3 收口预判与防覆盖） */
function removalOutputName(inputPath: string): string {
  const base = basename(inputPath);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : ".mp4";
  return `${stem}_trimmed${ext}`;
}

export default function CutPage({
  settings,
  onBack,
  initialFiles,
}: {
  settings: AppSettings;
  onBack: () => void;
  initialFiles?: string[] | null;
}) {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [keyframes, setKeyframes] = useState<number[]>([]);
  const [kfLoading, setKfLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [segments, setSegments] = useState<Segment[]>([]);
  const [outputDir, setOutputDir] = useState(settings.defaultOutputDir);
  const [snap, setSnap] = useState(settings.keyframeSnap);
  const [cutMode, setCutMode] = useState<CutMode>(settings.defaultCutMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<CutTab>("extract");
  /**
   * 删除模式的已标记区间（`FR-326`）。普通 state、**不入撤销栈**——剪切页没有撤销栈，
   * 与提取式的片段列表同口径；回退手段 = 逐条 ✕ 或（M14-2 的）「重置」。
   */
  const [marks, setMarks] = useState<Interval[]>([]);

  const playerRef = useRef<VideoPlayerHandle>(null);
  // 设置在页面生命周期内不变，loadFile 闭包经 ref 读取
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // 代理预览（R2-2 收敛走 hooks/useProxyPreview）：探测成功且需要代理时请求；
  // 播放失败兜底的门槛 = proxyMode !== "off"（源文件本可播却播不了时也兜底一次）
  const { proxyPath, onError } = useProxyPreview(
    inputPath ?? "",
    !!info && wantsProxy(info, settings.proxyMode),
    !!info && settings.proxyMode !== "off",
  );

  const loadFile = useCallback(async (path: string) => {
    setError(null);
    setProbeError(null);
    setInputPath(path);
    setInfo(null);
    setKeyframes([]);
    setSegments([]);
    // 删除列表也是 per-file 状态：换素材必须清（否则标记会落到新文件的错误区间上）
    setMarks([]);
    setCurrentTime(0);
    setDuration(0);

    try {
      const mi = await probeMedia(path);
      setInfo(mi);
      setDuration(mi.durationSec);
      setSelection({ start: 0, end: mi.durationSec });
      // 输出位置：默认输出目录优先，否则跟随源文件目录（DESIGN §12）
      setOutputDir(resolveOutputDir(path, settingsRef.current.defaultOutputDir));
    } catch (err) {
      setProbeError(String(err));
      setInputPath(null);
      return;
    }

    setKfLoading(true);
    listKeyframes(path)
      .then((kfs) => setKeyframes(kfs))
      .catch(() => setKeyframes([]))
      .finally(() => setKfLoading(false));
  }, []);

  // 拖拽导入：每次新的拖入都加载第一个文件（页面不跳转，App 层原地分发）
  const consumedInitialRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (!initialFiles || initialFiles === consumedInitialRef.current) return;
    consumedInitialRef.current = initialFiles;
    if (initialFiles[0]) void loadFile(initialFiles[0]);
  }, [initialFiles, loadFile]);

  const openFile = useCallback(async () => {
    const path = await pickVideo();
    if (path) void loadFile(path);
  }, [loadFile]);

  const changeDir = useCallback(async () => {
    const dir = await pickDirectory();
    if (dir) setOutputDir(dir);
  }, []);

  const handleTime = useCallback((t: number) => setCurrentTime(t), []);
  const handleSeek = useCallback((t: number) => {
    playerRef.current?.seek(t);
    setCurrentTime(t);
  }, []);

  // ---------- 快捷键（M4-3 / §9.4）：走带共用块见 usePlaybackHotkeys；
  // 页面专属：I/O 设入/出点 · Delete 删最近添加的片段 ----------
  const frameStep =
    info?.video.frameRate && info.video.frameRate > 0 ? 1 / info.video.frameRate : 1 / 30;
  usePlaybackHotkeys({
    currentTime,
    maxT: duration || currentTime,
    frameStep,
    onTogglePlay: () => {
      if (playing) playerRef.current?.pause();
      else playerRef.current?.play();
    },
    onSeek: (t) => {
      playerRef.current?.seek(t);
      setCurrentTime(t);
    },
  });
  useHotkeys((e) => {
    if (e.code === "KeyI" && !e.repeat) {
      setSelection((s) => ({
        start: Math.min(Math.max(0, currentTime), s.end - 0.1),
        end: s.end,
      }));
      return;
    }
    if (e.code === "KeyO" && !e.repeat) {
      setSelection((s) => ({
        start: s.start,
        end: Math.min(Math.max(currentTime, s.start + 0.1), duration || currentTime),
      }));
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !e.repeat) {
      // 删"最近添加的一条"，作用于**当前模式**的列表（两套列表各自保留，UI.md §9.4）
      if (tab === "remove") setMarks((prev) => prev.slice(0, -1));
      else setSegments((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
    }
  });

  const canAdd =
    duration > 0 && selection.end - selection.start >= 0.1;
  const removeMode = tab === "remove";

  /**
   * 只有**提取式的无损（极速）模式**的关键帧才决定落点：精确模式帧级精确，落点=入点。
   * 删除模式的"实际边界"是**删除终点的向上吸附**（由下方 `planRemoval` 计算），与
   * `realCutStart` 的落点语义**方向相反**，故删除模式不传（否则会显示错误的"实际入点"）。
   */
  const usableKeyframes =
    !removeMode && cutMode === "fast" && keyframes.length > 0 ? keyframes : undefined;

  /**
   * 无损（极速）剪切的**真实落点**：≤入点的最近关键帧。界面必须事先展示它
   * （NFR-004 / DESIGN §13"不允许剪完才知道偏了"）；精确模式帧级精确，落点=入点，故不传。
   */
  const realStart = usableKeyframes
    ? realCutStart(selection.start, usableKeyframes)
    : undefined;

  /**
   * 删除模式的派生计划（`utils/removal.ts::planRemoval`）：归一化标记 → 求补集 →
   * 吸收碎片保留段 → 保留段起点**向上对齐关键帧** → 不动点迭代；`blocked` 即导出门禁三态。
   * 关键帧扫描中按"未就绪"传（`keyframes = null`）——边界定不了就不允许导出。
   */
  const removalPlan = useMemo(
    () =>
      removeMode
        ? planRemoval({
            marks,
            durationSec: duration,
            keyframes: kfLoading ? null : keyframes,
            minKeepSec: MIN_SEG_DURATION_SEC,
            fps: info?.video.frameRate ?? 0,
          })
        : null,
    [removeMode, marks, duration, kfLoading, keyframes, info],
  );

  /** 删除列表逐行：标记 + 它的实际删除区间（并段/延伸后可能更长） */
  const removalRows = useMemo<RemovalRow[]>(
    () =>
      removalPlan
        ? marks.map((mark) => ({ mark, actual: actualRemovalOf(removalPlan.removals, mark) }))
        : [],
    [removalPlan, marks],
  );

  /** 时间轴上的 warn 色带（标记区间）与延伸虚线（终点向上吸附出的那一截），只读 */
  const removalMarks = useMemo(
    () =>
      removalRows.map(({ mark, actual }) => ({
        start: mark.start,
        end: mark.end,
        actualEnd: actual?.end ?? mark.end,
      })),
    [removalRows],
  );

  /** 门禁原因（导出按钮禁用时显示；文案见 UI.md §9.4 门禁表） */
  const gateReason =
    !removeMode || !removalPlan || removalPlan.blocked === null
      ? null
      : removalPlan.blocked === "no-marks"
        ? "先在时间轴上选区间 → 「标记为删除」"
        : removalPlan.blocked === "no-keyframes"
          ? kfLoading
            ? "正在扫描关键帧…（无损删除需要它来确定边界）"
            : "关键帧索引为空，无法确定删除边界"
          : "至少要保留一段";

  const addSegment = () => {
    if (!canAdd) return;
    setSegments((prev) => [
      ...prev,
      { startSec: selection.start, endSec: selection.end },
    ]);
  };

  /** 标记为删除（`M15-2`）：与「添加片段」共用同一条选区与同一条可用性判定 `canAdd` */
  const addMark = () => {
    if (!canAdd) return;
    setMarks((prev) => [...prev, { start: selection.start, end: selection.end }]);
  };

  const startCut = async () => {
    if (!inputPath || segments.length === 0 || !outputDir) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitTask({
        type: "cut",
        input: inputPath,
        segments,
        outputDir,
        mode: cutMode,
        encoder: settings.encoder === "auto" ? null : settings.encoder,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * 导出保留部分（`FR-326`）：保留段映射为**同源、无变换**的 pipeline items ⇒ 命中
   * `plan_items` 规则 A（全 copy、秒级、单文件 concat）；成品名 `<源名>_trimmed.<扩展名>`，
   * 目标已存在时按决策 #19 只加时间戳（`resolveUniqueTarget`，不静默覆盖）。
   */
  const startRemovalExport = async () => {
    if (!inputPath || !outputDir || !removalPlan || removalPlan.blocked !== null) return;
    setSubmitting(true);
    setError(null);
    try {
      const items: PipelineItem[] = removalPlan.keeps.map((k) => ({
        input: inputPath,
        segment: { startSec: k.start, endSec: k.end },
        rotateDeg: 0,
        hflip: false,
        vflip: false,
        crop: null,
        outWidth: null,
        outHeight: null,
      }));
      const dir = outputDir.replace(/[\\/]+$/, "");
      const target = await resolveUniqueTarget(dir, removalOutputName(inputPath), fileExists);
      await submitTask({
        type: "pipeline",
        items,
        output: target,
        quality: settings.quality,
        encoder: settings.encoder === "auto" ? null : settings.encoder,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 未打开文件：空状态 ----------
  if (!inputPath) {
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
          <h1 className="text-sm font-semibold tracking-tight">剪切</h1>
        </header>
        <div className="flex flex-1 items-center justify-center p-6">
          <button
            type="button"
            onClick={() => void openFile()}
            className="group flex h-64 w-full max-w-xl flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-hairline transition-colors hover:border-signal/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <Film className="h-8 w-8 text-mute transition-colors group-hover:text-signal" strokeWidth={1.5} />
            <span className="text-sm text-mute transition-colors group-hover:text-paper">
              打开视频文件
            </span>
            <span className="text-xs text-mute/70">MP4 / MOV / MKV / AVI / WebM / M4V / TS</span>
          </button>
        </div>
        {probeError && (
          <p className="px-6 pb-4 text-center text-xs text-warn">{probeError}</p>
        )}
      </div>
    );
  }

  // ---------- 已打开：编辑视图 ----------
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
        <h1 className="text-sm font-semibold tracking-tight">剪切</h1>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-mute" title={inputPath}>
          {basename(inputPath)}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {probeError ? (
          <p className="text-xs text-warn">{probeError}</p>
        ) : (
          <>
            <VideoPlayer
              ref={playerRef}
              src={fileSrc(proxyPath ?? inputPath)}
              onTime={handleTime}
              onPlayStateChange={setPlaying}
              onLoadedMetadata={(d) => {
                if (duration <= 0 && Number.isFinite(d) && d > 0) {
                  setDuration(d);
                  setSelection((s) => (s.end <= 0 ? { start: 0, end: d } : s));
                }
              }}
              onError={onError}
              banner={
                proxyPath
                  ? "当前为代理预览画面，导出使用原始文件"
                  : settings.proxyMode === "off" && info && needsProxy(info)
                    ? "代理预览已关闭，此格式无法预览；导出不受影响，可在设置中开启代理预览"
                    : null
              }
            />

            <div className="flex items-center justify-between font-mono text-[11px] text-mute">
              <span>{formatTime(currentTime)}</span>
              {info && (
                <span className="flex gap-3">
                  <span>{videoSummary(info)}</span>
                  {audioSummary(info) && <span>{audioSummary(info)}</span>}
                  {info.video.bitrate && <span>{formatBitrate(info.video.bitrate)}</span>}
                  <span>{formatBytes(info.sizeBytes)}</span>
                </span>
              )}
              <span>{formatTime(duration, false)}</span>
            </div>

            {duration > 0 ? (
              <Timeline
                duration={duration}
                keyframes={keyframes}
                selection={selection}
                currentTime={currentTime}
                snap={snap}
                realStart={realStart}
                removalMarks={removeMode ? removalMarks : undefined}
                onSelectionChange={setSelection}
                onSeek={handleSeek}
              />
            ) : (
              <div className="h-20 animate-pulse rounded-md border border-hairline bg-panel/60" />
            )}

            <div className="flex flex-wrap items-end gap-3">
              {/* 模式（FR-326 / ADR-037）：默认「提取片段」= 既有行为一字不改 */}
              <div
                className="flex overflow-hidden rounded-md border border-hairline"
                role="group"
                aria-label="剪切模式：提取片段 / 删除片段"
              >
                <button
                  type="button"
                  onClick={() => setTab("extract")}
                  className={`px-3 py-2 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal ${
                    tab === "extract" ? "bg-signal/15 text-signal" : "text-mute hover:text-paper"
                  }`}
                >
                  提取片段
                </button>
                <button
                  type="button"
                  onClick={() => setTab("remove")}
                  className={`px-3 py-2 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal ${
                    tab === "remove" ? "bg-warn/15 text-warn" : "text-mute hover:text-paper"
                  }`}
                >
                  删除片段
                </button>
              </div>
              <TimeField
                label="开始"
                value={selection.start}
                onCommit={(t) =>
                  setSelection((s) => ({
                    start: Math.min(Math.max(0, t), s.end - 0.1),
                    end: s.end,
                  }))
                }
              />
              <TimeField
                label="结束"
                value={selection.end}
                onCommit={(t) =>
                  setSelection((s) => ({
                    start: s.start,
                    end: Math.min(Math.max(t, s.start + 0.1), duration || t),
                  }))
                }
              />
              {removeMode ? (
                <button
                  type="button"
                  onClick={addMark}
                  disabled={!canAdd}
                  className="rounded-md border border-warn/40 bg-warn/10 px-4 py-2 text-sm text-warn transition-colors hover:bg-warn/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-warn disabled:cursor-not-allowed disabled:opacity-40"
                >
                  标记为删除
                </button>
              ) : (
                <button
                  type="button"
                  onClick={addSegment}
                  disabled={!canAdd}
                  className="rounded-md border border-signal/40 bg-signal/10 px-4 py-2 text-sm text-signal transition-colors hover:bg-signal/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
                >
                  添加片段
                </button>
              )}
              {!removeMode && realStartDiffers(realStart, selection.start) && (
                <span className="pb-2 text-xs text-mute">
                  实际入点 <span className="font-mono">{formatTime(realStart)}</span>
                  （无损剪切只能从关键帧开始）
                </span>
              )}
              {!removeMode && (
                <div className="flex overflow-hidden rounded-md border border-hairline pb-0" role="group" aria-label="剪切模式">
                  <button
                    type="button"
                    onClick={() => setCutMode("fast")}
                    className={`px-3 py-2 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal ${
                      cutMode === "fast" ? "bg-signal/15 text-signal" : "text-mute hover:text-paper"
                    }`}
                  >
                    极速
                  </button>
                  <button
                    type="button"
                    onClick={() => setCutMode("precise")}
                    className={`px-3 py-2 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal ${
                      cutMode === "precise" ? "bg-warn/15 text-warn" : "text-mute hover:text-paper"
                    }`}
                  >
                    精确
                  </button>
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-mute">
                <input
                  type="checkbox"
                  checked={snap}
                  onChange={(e) => setSnap(e.target.checked)}
                  className="accent-signal"
                />
                入点吸附关键帧
              </label>
              {kfLoading && (
                <span className="pb-2 font-mono text-[11px] text-mute">正在扫描关键帧…</span>
              )}
            </div>

            {!removeMode && cutMode === "precise" && (
              <p className="text-xs leading-relaxed text-warn">
                精确剪切将重新编码：速度慢、画质有损，字幕流会丢弃；音频保持原样。
              </p>
            )}

            {removeMode ? (
              <>
                {/* 必须明示的实际边界（NFR-004 口径）：起点精确、终点向上对齐关键帧 */}
                <p className="text-xs leading-relaxed text-mute">
                  无损删除：删除的<span className="text-paper">起点精确</span>、
                  <span className="text-paper">终点会对齐到下一个关键帧</span>
                  （最多多删 1 个 GOP；每条标记的实际范围与延伸量见下方列表）。
                </p>
                <RemovalList
                  rows={removalRows}
                  onRemove={(i) => setMarks((prev) => prev.filter((_, idx) => idx !== i))}
                  onSeek={handleSeek}
                />
                {removalPlan && removalPlan.blocked === null && (
                  <div className="rounded-md border border-hairline px-3 py-2 text-xs text-mute">
                    成品 ={" "}
                    <span className="text-paper">{removalPlan.keeps.length}</span> 段 · 总时长{" "}
                    <span className="font-mono text-paper">
                      {formatTime(removalPlan.totalSec, false)}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px]">
                      {removalPlan.keeps.map((k, i) => (
                        <span key={`${k.start}-${k.end}`}>
                          保留 {i + 1} {formatTime(k.start, false)} → {formatTime(k.end, false)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <SegmentList
                segments={segments}
                keyframes={usableKeyframes}
                onRemove={(i) => setSegments((prev) => prev.filter((_, idx) => idx !== i))}
              />
            )}

            <p className="text-[11px] text-mute/60">
              快捷键：空格 播放/暂停 · ←/→ ±1 秒 · Shift+←/→ 逐帧 · I / O 设入点/出点 · Delete{" "}
              {removeMode ? "删最近标记的删除区间" : "删最近添加的片段"}
            </p>
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-hairline px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-xs text-mute" title={outputDir}>
          输出到 {outputDir || "（未选择）"}
        </span>
        {gateReason && <span className="shrink-0 text-xs text-warn">{gateReason}</span>}
        <button
          type="button"
          onClick={() => void changeDir()}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          更改目录
        </button>
        <span
          className={`rounded border px-1.5 py-0.5 text-xs ${
            removeMode || cutMode === "fast"
              ? "border-signal/30 bg-signal/10 text-signal"
              : "border-warn/30 bg-warn/10 text-warn"
          }`}
        >
          {removeMode || cutMode === "fast" ? "无损" : "重编码"}
        </span>
        {removeMode ? (
          <button
            type="button"
            onClick={() => void startRemovalExport()}
            disabled={submitting || !outputDir || removalPlan?.blocked !== null}
            className="rounded-md bg-signal px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "提交中…" : "导出保留部分"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startCut()}
            disabled={submitting || segments.length === 0 || !outputDir}
            className="rounded-md bg-signal px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "提交中…" : "开始剪切"}
          </button>
        )}
      </footer>

      {error && (
        <p className="shrink-0 px-4 pb-2 text-xs text-warn" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
