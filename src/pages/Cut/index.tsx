import { ArrowLeft, Film } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SegmentList, TimeField } from "../../components/CutEditor";
import Timeline, { type Selection } from "../../components/Timeline";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import {
  fileSrc,
  generateProxy,
  listKeyframes,
  onTaskStatus,
  pickDirectory,
  pickVideo,
  probeMedia,
  submitTask,
} from "../../services/tauri";
import type { MediaInfo, Segment } from "../../types";
import { audioSummary, needsProxy, videoSummary } from "../../utils/media";
import { formatBitrate, formatBytes, formatTime } from "../../utils/time";

export default function CutPage({
  onBack,
  initialFiles,
}: {
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
  const [outputDir, setOutputDir] = useState("");
  const [snap, setSnap] = useState(true);
  const [cutMode, setCutMode] = useState<"fast" | "precise">("fast");
  const [proxyPath, setProxyPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<VideoPlayerHandle>(null);
  const proxyTaskIdRef = useRef<string | null>(null);

  // 代理任务完成 → 切换到代理画面
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onTaskStatus((p) => {
      const tid = proxyTaskIdRef.current;
      if (tid && p.taskId === tid && p.status === "completed" && p.outputs[0]) {
        setProxyPath(p.outputs[0]);
      }
    }).then((f) => {
      unlisten = f;
    });
    return () => unlisten?.();
  }, []);

  const loadFile = useCallback(async (path: string) => {
    setError(null);
    setProbeError(null);
    setInputPath(path);
    setInfo(null);
    setKeyframes([]);
    setSegments([]);
    setProxyPath(null);
    proxyTaskIdRef.current = null;
    setCurrentTime(0);
    setDuration(0);

    try {
      const mi = await probeMedia(path);
      setInfo(mi);
      setDuration(mi.durationSec);
      setSelection({ start: 0, end: mi.durationSec });
      // 默认输出到视频所在目录
      const parent = path.replace(/[\\/][^\\/]+$/, "");
      if (parent) setOutputDir(parent);
      if (needsProxy(mi)) {
        const started = await generateProxy(path);
        if (started.taskId) {
          proxyTaskIdRef.current = started.taskId;
        } else {
          setProxyPath(started.proxyPath);
        }
      }
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

  const handleTime = useCallback((t: number) => setCurrentTime(t), []);
  const handleSeek = useCallback((t: number) => {
    playerRef.current?.seek(t);
    setCurrentTime(t);
  }, []);

  const canAdd =
    duration > 0 && selection.end - selection.start >= 0.1;

  const addSegment = () => {
    if (!canAdd) return;
    setSegments((prev) => [
      ...prev,
      { startSec: selection.start, endSec: selection.end },
    ]);
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
            aria-label="返回主页"
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
          aria-label="返回主页"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold tracking-tight">剪切</h1>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-mute" title={inputPath}>
          {inputPath.split(/[\\/]/).pop()}
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
              onLoadedMetadata={(d) => {
                if (duration <= 0 && Number.isFinite(d) && d > 0) {
                  setDuration(d);
                  setSelection((s) => (s.end <= 0 ? { start: 0, end: d } : s));
                }
              }}
              onError={() => {
                // 原始文件播不了且代理还没生成 → 兜底请求代理
                if (!proxyPath && !proxyTaskIdRef.current && info) {
                  void generateProxy(inputPath).then((s) => {
                    if (s.taskId) proxyTaskIdRef.current = s.taskId;
                    else setProxyPath(s.proxyPath);
                  });
                }
              }}
              banner={
                proxyPath ? "当前为代理预览画面，导出使用原始文件" : null
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
                onSelectionChange={setSelection}
                onSeek={handleSeek}
              />
            ) : (
              <div className="h-20 animate-pulse rounded-md border border-hairline bg-panel/60" />
            )}

            <div className="flex flex-wrap items-end gap-3">
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
              <button
                type="button"
                onClick={addSegment}
                disabled={!canAdd}
                className="rounded-md border border-signal/40 bg-signal/10 px-4 py-2 text-sm text-signal transition-colors hover:bg-signal/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
              >
                添加片段
              </button>
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
              <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-mute">
                <input
                  type="checkbox"
                  checked={snap}
                  onChange={(e) => setSnap(e.target.checked)}
                  className="accent-[#4cc38a]"
                />
                入点吸附关键帧
              </label>
              {kfLoading && (
                <span className="pb-2 font-mono text-[11px] text-mute">正在扫描关键帧…</span>
              )}
            </div>

            {cutMode === "precise" && (
              <p className="text-xs leading-relaxed text-warn">
                精确剪切将重新编码：速度慢、画质有损，字幕流会丢弃；音频保持原样。
              </p>
            )}

            <SegmentList
              segments={segments}
              onRemove={(i) => setSegments((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-hairline px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-xs text-mute" title={outputDir}>
          输出到 {outputDir || "（未选择）"}
        </span>
        <button
          type="button"
          onClick={async () => {
            const dir = await pickDirectory();
            if (dir) setOutputDir(dir);
          }}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          更改目录
        </button>
        <span
          className={`rounded border px-1.5 py-0.5 text-xs ${
            cutMode === "fast"
              ? "border-signal/30 bg-signal/10 text-signal"
              : "border-warn/30 bg-warn/10 text-warn"
          }`}
        >
          {cutMode === "fast" ? "无损" : "重编码"}
        </span>
        <button
          type="button"
          onClick={() => void startCut()}
          disabled={submitting || segments.length === 0 || !outputDir}
          className="rounded-md bg-signal px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "提交中…" : "开始剪切"}
        </button>
      </footer>

      {error && (
        <p className="shrink-0 px-4 pb-2 text-xs text-warn" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
