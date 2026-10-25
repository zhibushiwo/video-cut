/**
 * 播放页（M25，`FR-405` / `CAND-053`，UI.md §9.13）：**只看不编**的本地播放器。
 * 复用 VideoPlayer（控制条倍速/音量/全屏 + `allowZoom` 框选放大）+ 页内翻转/循环/
 * 记忆播放位置/走带快捷键；无导出、无加工，后端零改动。
 * 翻转经 `flip` prop 只作用于视频本体（观看语义,落文件走工作台旋转/镜像）；
 * 播放位置按文件路径存 localStorage（`player-pos:<path>`），加载后恢复。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Repeat, FlipHorizontal2, FlipVertical2 } from "lucide-react";
import { EmptyImport } from "../../components/EmptyImport";
import { PageHeader } from "../../components/PageHeader";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import { useConsumeInitialFiles } from "../../hooks/useConsumeInitialFiles";
import { usePlaybackHotkeys } from "../../hooks/usePlaybackHotkeys";
import { useProxyPreview } from "../../hooks/useProxyPreview";
import { fileSrc, pickVideo, probeMedia } from "../../services/tauri";
import type { AppSettings, MediaInfo } from "../../types";
import { wantsProxy } from "../../utils/media";
import { dirname } from "../../utils/paths";

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
  const playerRef = useRef<VideoPlayerHandle>(null);
  /** 位置节流落盘基准（onTime rAF 高频，localStorage 每 ~2s 写一次足够） */
  const lastSaveRef = useRef(0);

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

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="播放"
        onBack={onBack}
        right={
          inputPath ? (
            <button
              type="button"
              onClick={() => void openFile()}
              className="shrink-0 rounded-md border border-hairline px-3 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              更换视频
            </button>
          ) : undefined
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
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {probeError && <p className="text-xs text-warn">{probeError}</p>}
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
            <span className="text-xs text-mute">观看工具（不落文件）：</span>
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
            <span className="flex-1" />
            <span className="font-mono text-[11px] text-mute/70">
              Ctrl+拖拽框选放大 · 空格 播放/暂停 · ←→ ±1s · Shift 逐帧
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
