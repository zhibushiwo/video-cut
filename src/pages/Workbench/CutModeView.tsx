/** ① 源剪切模式（预览区三态）：选区间 → 添加为片段（一个素材可反复剪出多个片段）。
 *  R2-1 自 index.tsx 迁出；R2-2 走带键收敛进 hooks/usePlaybackHotkeys、代理预览收敛进 hooks/useProxyPreview。 */
import { useEffect, useRef, useState } from "react";
import Timeline, { type Selection } from "../../components/Timeline";
import { TimeField } from "../../components/TimeField";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import { usePlaybackHotkeys } from "../../hooks/usePlaybackHotkeys";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useProxyPreview } from "../../hooks/useProxyPreview";
import { fileSrc, listKeyframes } from "../../services/tauri";
import { MIN_SEG_DURATION_SEC, formatTime } from "../../utils/time";
import { fieldBtn, type SourceFile } from "./shared";

export function CutModeView({
  source,
  snap,
  useProxy,
  onAdd,
}: {
  source: SourceFile;
  snap: boolean;
  useProxy: boolean;
  onAdd(seg: { start: number; end: number } | null): void;
}) {
  const info = source.info!;
  const { proxyPath, onError } = useProxyPreview(source.path, useProxy);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [current, setCurrent] = useState(0);
  const [sel, setSel] = useState<Selection>({ start: 0, end: info.durationSec });
  /** null = 关键帧扫描中（允许数字输入，无吸附） */
  const [keyframes, setKeyframes] = useState<number[] | null>(null);
  const [addedMsg, setAddedMsg] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    setKeyframes(null);
    listKeyframes(source.path)
      .then((k) => {
        if (alive) setKeyframes(k);
      })
      .catch(() => {
        if (alive) setKeyframes([]);
      });
    return () => {
      alive = false;
    };
  }, [source.path]);

  const commitStart = (t: number) => {
    const start = Math.min(Math.max(0, t), info.durationSec);
    setSel((s) => ({ start, end: Math.max(s.end, start + 0.1) }));
  };
  const commitEnd = (t: number) => {
    const end = Math.min(Math.max(0, t), info.durationSec);
    setSel((s) => ({ start: Math.min(s.start, Math.max(0, end - 0.1)), end }));
  };

  // 快捷键（M4-3，源剪切）：走带共用块见 usePlaybackHotkeys；页面专属：I/O 设入/出点
  const frameStep = info.video.frameRate > 0 ? 1 / info.video.frameRate : 1 / 30;
  usePlaybackHotkeys({
    currentTime: current,
    maxT: info.durationSec,
    frameStep,
    onTogglePlay: () => {
      if (playing) playerRef.current?.pause();
      else playerRef.current?.play();
    },
    onSeek: (t) => {
      playerRef.current?.seek(t);
      setCurrent(t);
    },
  });
  useHotkeys((e) => {
    if (e.code === "KeyI" && !e.repeat) commitStart(current);
    if (e.code === "KeyO" && !e.repeat) commitEnd(current);
  });

  const addNow = () => {
    const whole = sel.start <= 0.001 && sel.end >= info.durationSec - 0.001;
    const seg = whole || sel.end <= sel.start + MIN_SEG_DURATION_SEC
      ? null
      : { start: sel.start, end: sel.end };
    onAdd(seg);
    setAddedMsg(
      seg
        ? `✓ 已添加片段 ${formatTime(seg.start, false)}–${formatTime(seg.end, false)}（入池并入轴末尾）`
        : "✓ 已添加全段片段（入池并入轴末尾）",
    );
    window.setTimeout(() => setAddedMsg(null), 2500);
  };

  return (
    <div className="flex h-full w-full flex-col gap-2 p-2">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <VideoPlayer
          ref={playerRef}
          src={fileSrc(proxyPath ?? source.path)}
          banner={proxyPath ? "当前为代理预览画面，导出使用原始文件" : null}
          onTime={setCurrent}
          onPlayStateChange={setPlaying}
          onError={onError}
          videoMaxClass="max-h-[20vh]"
        />
      </div>
      <div className="shrink-0">
        {keyframes === null ? (
          <p className="text-xs text-mute">正在扫描关键帧…（完成前可用数字输入，无吸附）</p>
        ) : (
          <Timeline
            duration={info.durationSec}
            keyframes={keyframes}
            selection={sel}
            currentTime={current}
            snap={snap}
            onSelectionChange={setSel}
            onSeek={(t) => playerRef.current?.seek(t)}
          />
        )}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <TimeField label="入点" value={sel.start} onCommit={commitStart} />
          <TimeField label="出点" value={sel.end} onCommit={commitEnd} />
          <button type="button" className={`${fieldBtn} mb-0.5`} onClick={() => commitStart(current)}>
            入点=当前帧
          </button>
          <button type="button" className={`${fieldBtn} mb-0.5`} onClick={() => commitEnd(current)}>
            出点=当前帧
          </button>
          {addedMsg && <span className="mb-1 text-xs text-signal">{addedMsg}</span>}
          <button
            type="button"
            onClick={addNow}
            className="mb-0.5 ml-auto rounded-md bg-signal px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            ✓ 添加为片段
          </button>
        </div>
      </div>
    </div>
  );
}
