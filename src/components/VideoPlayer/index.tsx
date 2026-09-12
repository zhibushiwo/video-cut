import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export interface VideoPlayerHandle {
  seek(t: number): void;
  play(): void;
  pause(): void;
}

interface VideoPlayerProps {
  src: string;
  /** 播放/seek 期间的时间上报（rAF 驱动，比 timeupdate 平滑） */
  onTime?: (sec: number) => void;
  onLoadedMetadata?: (duration: number) => void;
  /** 加载/播放失败回调（如编解码不被 WebView2 支持） */
  onError?: () => void;
  /** 预览提示条文案（如"当前为代理预览画面"） */
  banner?: string | null;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ src, onTime, onLoadedMetadata, onError, banner }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const rafRef = useRef(0);
    const onTimeRef = useRef(onTime);
    onTimeRef.current = onTime;

    useImperativeHandle(ref, () => ({
      seek(t: number) {
        const v = videoRef.current;
        if (v) v.currentTime = t;
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
      if (!v) return;
      const tick = () => {
        onTimeRef.current?.(v.currentTime);
        rafRef.current = requestAnimationFrame(tick);
      };
      const onPlay = () => {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      const onStop = () => {
        cancelAnimationFrame(rafRef.current);
        onTimeRef.current?.(v.currentTime);
      };
      v.addEventListener("play", onPlay);
      v.addEventListener("pause", onStop);
      v.addEventListener("seeked", onStop);
      return () => {
        cancelAnimationFrame(rafRef.current);
        v.removeEventListener("play", onPlay);
        v.removeEventListener("pause", onStop);
        v.removeEventListener("seeked", onStop);
      };
    }, []);

    return (
      <div className="relative overflow-hidden rounded-md border border-hairline bg-black">
        <video
          ref={videoRef}
          src={src}
          preload="metadata"
          className="mx-auto max-h-[44vh] w-full cursor-pointer bg-black"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) void v.play();
            else v.pause();
          }}
          onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget.duration)}
          onError={() => onError?.()}
        />
        {banner && (
          <div className="absolute left-2 top-2 rounded bg-ink/80 px-2 py-1 text-xs text-warn backdrop-blur-sm">
            {banner}
          </div>
        )}
      </div>
    );
  },
);

export default VideoPlayer;
