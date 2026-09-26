import { Volume2, VolumeX } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatTime } from "../../utils/time";

export interface VideoPlayerHandle {
  seek(t: number): void;
  play(): void;
  pause(): void;
}

/** 倍速循环档位（M7-6）：0.5 → 1 → 1.5 → 2 → 0.5；工作台 K/L 走带（M11-8）复用同一档 */
export const PLAYBACK_RATES = [0.5, 1, 1.5, 2];

interface VideoPlayerProps {
  src: string;
  /** 播放/seek 期间的时间上报（rAF 驱动，比 timeupdate 平滑） */
  onTime?: (sec: number) => void;
  onLoadedMetadata?: (duration: number) => void;
  /** 加载/播放失败回调（如编解码不被 WebView2 支持） */
  onError?: () => void;
  /** 预览提示条文案（如"当前为代理预览画面"） */
  banner?: string | null;
  /** 填满父容器（工作台旋转预览的内层盒），默认按宽度自适应并限高 */
  fill?: boolean;
  /** 底部控制条（进度 + 时间 + 音量），默认开启 */
  controls?: boolean;
  /** 非填充模式的视频最大高度类（默认 max-h-[44vh]；工作台剪切模式传更小值） */
  videoMaxClass?: string;
  /** 覆盖层（如裁剪框选层）：渲染在视频之上、控制条之下，不拦截播放控制 */
  overlay?: ReactNode;
  /** 播放状态变化（快捷键空格需要真实状态，M4-3） */
  onPlayStateChange?: (playing: boolean) => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    { src, onTime, onLoadedMetadata, onError, banner, fill, controls = true, overlay, videoMaxClass, onPlayStateChange },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const rafRef = useRef(0);
    const onTimeRef = useRef(onTime);
    onTimeRef.current = onTime;
    const onPlayStateRef = useRef(onPlayStateChange);
    onPlayStateRef.current = onPlayStateChange;
    const [cur, setCur] = useState(0);
    const [dur, setDur] = useState(0);
    const [vol, setVol] = useState(1);
    const [muted, setMuted] = useState(false);
    // 倍速循环切换（M7-6，档位见模块级 PLAYBACK_RATES）
    const RATES = PLAYBACK_RATES;
    const [rate, setRate] = useState(1);

    useImperativeHandle(ref, () => ({
      seek(t: number) {
        const v = videoRef.current;
        if (v) {
          v.currentTime = t;
          setCur(t);
        }
      },
      play() {
        void videoRef.current?.play();
      },
      pause() {
        videoRef.current?.pause();
      },
    }));

    useEffect(() => {
      const v = videoRef.current;
      if (v) v.playbackRate = rate;
    }, [rate]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = vol;
      v.muted = muted;
    }, [vol, muted]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      // rAF 链只允许一条：start/stop 由 ticking 守门，重复调用无副作用（R1-1）
      let ticking = false;
      const tick = () => {
        if (!ticking) return;
        setCur(v.currentTime);
        onTimeRef.current?.(v.currentTime);
        rafRef.current = requestAnimationFrame(tick);
      };
      const start = () => {
        if (ticking) return;
        ticking = true;
        rafRef.current = requestAnimationFrame(tick);
      };
      const stop = () => {
        ticking = false;
        cancelAnimationFrame(rafRef.current);
      };
      // 链停止后手动上报一次落点（暂停/seek 的当前位置），保证暂停态时间仍准确
      const report = () => {
        setCur(v.currentTime);
        onTimeRef.current?.(v.currentTime);
      };
      const onPlay = () => {
        start();
        onPlayStateRef.current?.(true);
      };
      const onPause = () => {
        stop();
        report();
        onPlayStateRef.current?.(false);
      };
      // seeked 会打断 rAF 链，但播放中 seek 不再触发 play 事件 → 必须自行重启，
      // 否则时间上报永久冻结（播放头停住、方向键步进失效、M9-5 区间预览首次到出点即静默失效）。
      const onStop = () => {
        report();
        if (v.paused || v.ended) stop();
        else start();
      };
      v.addEventListener("play", onPlay);
      v.addEventListener("pause", onPause);
      v.addEventListener("seeked", onStop);
      return () => {
        ticking = false;
        cancelAnimationFrame(rafRef.current);
        v.removeEventListener("play", onPlay);
        v.removeEventListener("pause", onPause);
        v.removeEventListener("seeked", onStop);
      };
    }, []);

    const commitSeek = (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = t;
      setCur(t);
    };

    return (
      <div
        className={
          fill
            ? "relative h-full w-full overflow-hidden bg-black"
            : "relative overflow-hidden rounded-md border border-hairline bg-black"
        }
      >
        <video
          ref={videoRef}
          src={src}
          preload="metadata"
          className={
            fill
              ? "h-full w-full cursor-pointer bg-black"
              : `mx-auto ${videoMaxClass ?? "max-h-[44vh]"} w-full cursor-pointer bg-black`
          }
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) void v.play();
            else v.pause();
          }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDur(d);
            onLoadedMetadata?.(e.currentTarget.duration);
          }}
          onError={() => onError?.()}
        />
        {overlay}
        {banner && (
          <div className="absolute left-2 top-2 rounded bg-ink/80 px-2 py-1 text-xs text-warn backdrop-blur-sm">
            {banner}
          </div>
        )}
        {controls && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2.5 pb-1.5 pt-5">
            <span className="shrink-0 font-mono text-[11px] text-paper/80">
              {formatTime(cur, false)}
            </span>
            <input
              type="range"
              min={0}
              max={dur || 0}
              step={0.05}
              value={Math.min(cur, dur || 0)}
              onChange={(e) => commitSeek(Number(e.target.value))}
              aria-label="播放进度"
              className="h-1 min-w-0 flex-1 cursor-pointer accent-signal"
            />
            <span className="shrink-0 font-mono text-[11px] text-paper/80">
              {dur > 0 ? formatTime(dur, false) : "--:--"}
            </span>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted || vol === 0 ? "取消静音" : "静音"}
              className="shrink-0 text-paper/80 transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              {muted || vol === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : vol}
              onChange={(e) => {
                const nv = Number(e.target.value);
                setVol(nv);
                if (nv > 0) setMuted(false);
              }}
              aria-label="音量"
              className="h-1 w-16 shrink-0 cursor-pointer accent-signal"
            />
            <button
              type="button"
              onClick={() =>
                setRate((r) => {
                  // r 恒来自 RATES（setRate 的唯一写入源），越界回退 r 仅为类型兜底
                  const i = RATES.indexOf(r);
                  return RATES[(i + 1) % RATES.length] ?? r;
                })
              }
              aria-label="播放速度"
              title="播放速度"
              className="shrink-0 font-mono text-[11px] text-paper/80 transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              {rate}x
            </button>
          </div>
        )}
      </div>
    );
  },
);

export default VideoPlayer;
