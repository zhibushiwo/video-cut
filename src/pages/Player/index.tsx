/**
 * 播放页（M25，`FR-405` / `CAND-053`，UI.md §9.13）：**只看不编**的本地播放器。
 * 复用 VideoPlayer（控制条倍速/音量/全屏 + `allowZoom` 框选放大）+ 页内翻转/循环/
 * 记忆播放位置/走带快捷键；无导出、无加工，后端零改动。
 * 翻转经 `flip` prop 只作用于视频本体（观看语义,落文件走工作台旋转/镜像）；
 * 播放位置按文件路径存 localStorage（`player-pos:<path>`），加载后恢复。
 *
 * v2 增强（M26）：快捷键 ↑↓/M/F/S、双击全屏（VideoPlayer 分态）、跳转时间输入框、
 * 最近播放 8 条 + 首次进页自动恢复、窗口标题随文件名、截图（复用 `extract_frame`）、
 * 视频信息折叠卡。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  FlipHorizontal2,
  FlipVertical2,
  History,
  Repeat,
  RotateCcw,
} from "lucide-react";
import { EmptyImport } from "../../components/EmptyImport";
import { PageHeader } from "../../components/PageHeader";
import { TimeField } from "../../components/TimeField";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import { useConsumeInitialFiles } from "../../hooks/useConsumeInitialFiles";
import { usePlaybackHotkeys } from "../../hooks/usePlaybackHotkeys";
import { useProxyPreview } from "../../hooks/useProxyPreview";
import {
  extractFrame,
  fileExists,
  fileSrc,
  pickVideo,
  probeMedia,
  setWindowTitle,
} from "../../services/tauri";
import type { AppSettings, MediaInfo } from "../../types";
import { audioSummary, wantsProxy } from "../../utils/media";
import { basename, dirname, resolveOutputDir, resolveUniqueTarget, stemOf } from "../../utils/paths";
import { formatBytes, formatTime } from "../../utils/time";

const POS_PREFIX = "player-pos:";
const posKey = (path: string) => POS_PREFIX + path;
const readPos = (path: string): number | null => {
  try {
    const v = Number(localStorage.getItem(posKey(path)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

/** 最近播放（M26）：最多 8 条，按最近使用倒序、路径去重 */
interface RecentEntry {
  path: string;
  ts: number;
}
const RECENTS_KEY = "player-recents";
const RECENTS_MAX = 8;
function readRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is RecentEntry =>
        !!e && typeof (e as RecentEntry).path === "string" && typeof (e as RecentEntry).ts === "number",
    );
  } catch {
    return [];
  }
}
function pushRecent(path: string) {
  const next = [
    { path, ts: Date.now() },
    ...readRecents().filter((e) => e.path !== path),
  ].slice(0, RECENTS_MAX);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* localStorage 不可用：跳过持久化 */
  }
}

/** 工具行开关按钮（本页自用） */
const TOGGLE_BTN = (on: boolean) =>
  `flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
    on
      ? "border-signal/40 bg-signal/10 text-signal"
      : "border-hairline text-mute hover:border-mute hover:text-paper"
  }`;

export default function PlayerPage({
  settings,
  active,
  onBack,
  initialFiles,
}: {
  settings: AppSettings;
  active: boolean;
  onBack: () => void;
  initialFiles?: string[] | null;
}) {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [flip, setFlip] = useState({ h: false, v: false });
  const [loop, setLoop] = useState(false);
  const [recents, setRecents] = useState<RecentEntry[]>(() => readRecents());
  const [recentsOpen, setRecentsOpen] = useState(false);
  /** 操作完成提示（截图等同步命令无任务卡片，短暂展示结果） */
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const playerRef = useRef<VideoPlayerHandle>(null);
  /** 位置节流落盘基准（onTime rAF 高频，localStorage 每 ~2s 写一次足够） */
  const lastSaveRef = useRef(0);
  /** 首次进页自动恢复只做一次（之后由用户操作主导） */
  const autoRestoredRef = useRef(false);

  // 代理预览（R2-2 同口径）：不支持原生播放的编码走代理；失败兜底门槛 = proxyMode !== "off"
  const { proxyPath, onError } = useProxyPreview(
    inputPath ?? "",
    !!info && wantsProxy(info, settings.proxyMode),
    !!info && settings.proxyMode !== "off",
  );

  const loadFile = useCallback(async (path: string) => {
    setProbeError(null);
    setInputPath(path);
    setInfo(null);
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    try {
      const mi = await probeMedia(path);
      setInfo(mi);
      setDuration(mi.durationSec);
      pushRecent(path);
      setRecents(readRecents());
    } catch (err) {
      setProbeError(String(err));
      setInputPath(null);
    }
  }, []);

  useConsumeInitialFiles(initialFiles, (fs) => {
    if (fs[0]) void loadFile(fs[0]);
  });

  const openFile = useCallback(async () => {
    const path = await pickVideo(inputPath ? dirname(inputPath) : undefined);
    if (path) void loadFile(path);
  }, [loadFile, inputPath]);

  // 窗口标题随当前视频名（M26，FR-405 v2）；无文件还原应用名
  useEffect(() => {
    setWindowTitle(inputPath ? `${basename(inputPath)} - video-cut` : "video-cut").catch(
      () => {},
    );
  }, [inputPath]);

  // 首次进页自动恢复最近一个视频（M26）：拖入分发先消费，没拖入才兜底恢复
  useEffect(() => {
    if (autoRestoredRef.current) return;
    autoRestoredRef.current = true;
    if (!inputPath) {
      const first = readRecents()[0];
      if (first) void loadFile(first.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时执行一次
  }, []);

  // 换素材清翻转/循环（per-file 观看状态不跨文件延续；播放位置按路径各自记忆）
  useEffect(() => {
    setFlip({ h: false, v: false });
    setLoop(false);
  }, [inputPath]);

  // 位置记忆（FR-405）：加载后恢复上次位置；onTime 节流写入
  useEffect(() => {
    if (!inputPath || duration <= 0) return;
    const saved = readPos(inputPath);
    if (saved !== null && saved < duration - 1) playerRef.current?.seek(saved);
  }, [inputPath, duration]);

  const handleTime = useCallback(
    (t: number) => {
      setCurrentTime(t);
      if (inputPath && t > 0 && t - lastSaveRef.current > 2) {
        lastSaveRef.current = t;
        try {
          localStorage.setItem(posKey(inputPath), String(t));
        } catch {
          /* 隐私模式等 localStorage 不可用：跳过持久化 */
        }
      }
    },
    [inputPath],
  );

  /** 截图（M26，`FR-405` v2）：当前帧出 png，复用 FR-403 的 extract_frame */
  const [error, setError] = useState<string | null>(null);
  const shot = useCallback(async () => {
    if (!inputPath || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const dir = resolveOutputDir(inputPath, settings.defaultOutputDir).replace(/[\/\\]+$/, "");
      const target = await resolveUniqueTarget(
        dir,
        `${stemOf(inputPath)}_${currentTime.toFixed(3)}.png`,
        fileExists,
      );
      await extractFrame(inputPath, currentTime, target);
      setNotice(`已截图 ${basename(target)}`);
      setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }, [inputPath, submitting, settings.defaultOutputDir, currentTime]);

  usePlaybackHotkeys({
    enabled: active && !!inputPath,
    currentTime,
    maxT: duration || currentTime,
    onTogglePlay: () => {
      if (playing) playerRef.current?.pause();
      else playerRef.current?.play();
    },
    onSeek: (t) => {
      playerRef.current?.seek(t);
      setCurrentTime(t);
    },
  });

  // v2 快捷键（M26）：↑↓ 音量 · M 静音 · F 全屏 · S 截图
  useEffect(() => {
    if (!active || !inputPath) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable)
        return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        playerRef.current?.adjustVolume(e.key === "ArrowUp" ? 0.05 : -0.05);
      } else if (e.key.toLowerCase() === "m") {
        playerRef.current?.toggleMuted();
      } else if (e.key.toLowerCase() === "f") {
        playerRef.current?.toggleFullscreen();
      } else if (e.key.toLowerCase() === "s") {
        void shot();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, inputPath, shot]);

  const infoLines = info
    ? [
        ["画面", `${info.video?.width ?? 0}×${info.video?.height ?? 0}`],
        ["视频", info.video?.codec ?? "—"],
        ["帧率", info.video ? `${info.video.frameRate.toFixed(2)} fps` : "—"],
        ["音频", audioSummary(info) ?? "—"],
        ["大小", formatBytes(info.sizeBytes)],
        ["时长", formatTime(info.durationSec, false)],
        ["路径", inputPath ?? ""],
      ]
    : [];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="播放"
        onBack={onBack}
        right={
          <div className="flex shrink-0 items-center gap-2">
            {recents.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRecentsOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-md border border-hairline px-3 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  <History className="h-3.5 w-3.5" />
                  最近播放
                  <ChevronDown className="h-3 w-3" />
                </button>
                {recentsOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border border-hairline bg-panel py-1 shadow-lg">
                    {recents.map((r) => (
                      <button
                        key={r.path}
                        type="button"
                        onClick={() => {
                          setRecentsOpen(false);
                          void loadFile(r.path);
                        }}
                        title={r.path}
                        className="block w-full truncate px-3 py-1.5 text-left text-xs text-mute transition-colors hover:bg-panel hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                      >
                        {basename(r.path)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {inputPath && (
              <button
                type="button"
                onClick={() => void openFile()}
                className="shrink-0 rounded-md border border-hairline px-3 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                更换视频
              </button>
            )}
          </div>
        }
      />

      {!inputPath ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
          <EmptyImport
            onOpen={() => void openFile()}
            icon={RotateCcw}
            label="打开视频文件"
            hint="纯播放：缩放 / 翻转 / 倍速 / 循环，不做编辑"
            maxWidth="max-w-xl"
          />
          {probeError && <p className="text-xs text-warn">{probeError}</p>}
          {recents.length > 0 && (
            <div className="w-full max-w-xl rounded-md border border-hairline p-3">
              <p className="text-[11px] text-mute">最近播放</p>
              <div className="mt-1 grid gap-0.5">
                {recents.map((r) => (
                  <button
                    key={r.path}
                    type="button"
                    onClick={() => void loadFile(r.path)}
                    title={r.path}
                    className="block w-full truncate rounded px-2 py-1 text-left text-xs text-mute transition-colors hover:bg-panel hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                  >
                    {basename(r.path)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {probeError && <p className="text-xs text-warn">{probeError}</p>}
          {error && <p className="text-xs text-warn">{error}</p>}
          <VideoPlayer
            ref={playerRef}
            allowZoom
            src={fileSrc(proxyPath ?? inputPath)}
            onTime={handleTime}
            onPlayStateChange={setPlaying}
            onError={onError}
            onLoadedMetadata={(d) => setDuration(d)}
            flip={flip}
            loop={loop}
          />

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="min-w-0 max-w-48 truncate text-xs text-paper"
              title={inputPath}
            >
              {basename(inputPath)}
            </span>
            <span className="shrink-0 text-xs text-mute">观看工具（不落文件）：</span>
            <button
              type="button"
              onClick={() => setFlip((f) => ({ ...f, h: !f.h }))}
              aria-pressed={flip.h}
              className={TOGGLE_BTN(flip.h)}
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
              水平翻转
            </button>
            <button
              type="button"
              onClick={() => setFlip((f) => ({ ...f, v: !f.v }))}
              aria-pressed={flip.v}
              className={TOGGLE_BTN(flip.v)}
            >
              <FlipVertical2 className="h-3.5 w-3.5" />
              垂直翻转
            </button>
            <button
              type="button"
              onClick={() => setLoop((v) => !v)}
              aria-pressed={loop}
              className={TOGGLE_BTN(loop)}
            >
              <Repeat className="h-3.5 w-3.5" />
              循环播放
            </button>
            <button
              type="button"
              onClick={() => void shot()}
              disabled={submitting}
              title="截取当前画面为 png（S），保存到输出目录"
              className={TOGGLE_BTN(false)}
            >
              <Camera className="h-3.5 w-3.5" />
              截图
            </button>
            <TimeField
              label="跳转到"
              value={currentTime}
              onCommit={(t) => {
                playerRef.current?.seek(Math.min(Math.max(0, t), duration || t));
              }}
            />
            <span className="flex-1" />
            {notice && <span className="shrink-0 text-xs text-signal">{notice}</span>}
          </div>
          <p className="text-[11px] text-mute/70">
            Ctrl+拖拽框选放大 · 双击全屏（放大态双击还原） · 空格 播放/暂停 · ←→ ±1s · Shift 逐帧
            · ↑↓ 音量 · M 静音 · F 全屏 · S 截图
          </p>

          {infoLines.length > 0 && (
            <details className="rounded-md border border-hairline px-3 py-2 text-xs">
              <summary className="cursor-pointer select-none text-mute hover:text-paper">
                视频信息
              </summary>
              <div className="mt-2 grid gap-x-6 gap-y-0.5 font-mono text-[11px] text-mute sm:grid-cols-2">
                {infoLines.map(([k, v]) => (
                  <div key={k} className="flex min-w-0 gap-2">
                    <span className="shrink-0 text-mute/70">{k}</span>
                    <span className="truncate text-paper" title={v}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
