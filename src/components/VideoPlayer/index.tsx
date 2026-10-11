import { Maximize2, Minimize2 as Restore, Pause, Play, Volume2, VolumeX, ZoomIn } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { formatTime } from "../../utils/time";
import { useVolumeMemory } from "../../hooks/useVolumeMemory";
import { appendFrontendLog } from "../../services/tauri";
import { beginPointerDrag } from "../../utils/pointerDrag";
import { clampOffset, zoomScale, type ZoomState } from "../../utils/videoZoom";

export interface VideoPlayerHandle {
  seek(t: number): void;
  play(): void;
  pause(): void;
}

/** 播放速度档位（T-020 扩展：0.2~3 直接选择，不再循环点按）；工作台 K/L 走带（M11-8）复用同一档 */
export const PLAYBACK_RATES = [0.2, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

/**
 * 起播，并吞掉 `play()` 的 **AbortError**：`play()` 与 `pause()` / 后续 `seek` 竞态时规范
 * 让这个 promise 以 AbortError 拒绝（"这次起播被打断"）——那是正常结果，不是故障，不该作为
 * "未处理的 Promise 拒绝"落进日志（`BUG-022` 真机排查时同源 6 条 ERROR 噪音，干扰了定性）。
 * 真正的播放失败（解码不支持等）走 `<video>` 的 `error` 事件 → `onError`，不受影响。
 */
function safePlay(v: HTMLVideoElement | null | undefined) {
  if (!v) return;
  void v.play().catch(() => {});
}

interface VideoPlayerProps {
  src: string;
  /** 播放/seek 期间的时间上报（rAF 驱动，比 timeupdate 平滑） */
  onTime?: (sec: number) => void;
  /**
   * 一次 seek **完成**（`seeked` DOM 事件，非轮询）。
   *
   * 与 `onTime` 的关键区别：`onTime` 主要由 rAF 驱动，而 rAF 只在 `play` 事件之后才跑
   * ——"还没起播、正在 seek"这个阶段只能靠 `pause`/`seeked` 的手动上报。
   * 因此凡是"seek 落地后才能接着做"的逻辑（如区间回入点后起播，`BUG-017` 的重播），
   * **必须挂在这里**，挂 `onTime` 会形成"等 rAF 起播 → rAF 要 play 后才跑"的死锁。
   */
  onSeeked?: () => void;
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
  /**
   * 直接作用于 `<video>` 元素的样式（如裁剪预览的 `transform`）。
   * **只影响视频本身**——控制条 / 提示条 / 覆盖层这些兄弟节点留在外层坐标系里，
   * 不会被一起缩放（`M14-5` 的裁切预览要的正是这个语义）。
   */
  videoStyle?: CSSProperties;
  /** 播放状态变化（快捷键空格需要真实状态，M4-3） */
  onPlayStateChange?: (playing: boolean) => void;
  /**
   * 覆盖**视频本体**的点击语义（默认 = 点击切换播放/暂停，按 `<video>.paused` 判向）。
   *
   * 片段加工必须传入自己的走带切换：那里面画面点击默认只 `play()` 而不做「回到入点」——
   * 播完停在出点后点画面，播放位置仍在出点之外，越界判定下一帧就把自己按停，怎么点都
   * 只起播一帧（`BUG-023`；`seg = null` 的全段片段因为不参与越界判定而"看起来正常"）。
   */
  onVideoClick?: () => void;
  /**
   * 启用预览框选放大（M19-6，`FR-397`）：Ctrl+拖拽框选 → 放大充满播放器，放大态拖拽
   * 平移、Esc/双击/控制栏按钮还原。纯前端 transform、实时预览专用，**不参与导出**。
   * 默认关闭（编辑页裁剪预览的 `videoStyle` transform 与它互斥）。
   */
  allowZoom?: boolean;
}

interface SelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    { src, onTime, onSeeked, onLoadedMetadata, onError, banner, fill, controls = true, overlay, videoMaxClass, videoStyle, onPlayStateChange, onVideoClick, allowZoom = false },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    /** 全屏容器（M16-4）：整块播放器（含控制条）进 Fullscreen API，Esc 退出 */
    const rootRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef(0);
    const onTimeRef = useRef(onTime);
    onTimeRef.current = onTime;
    const onSeekedRef = useRef(onSeeked);
    onSeekedRef.current = onSeeked;
    const onPlayStateRef = useRef(onPlayStateChange);
    onPlayStateRef.current = onPlayStateChange;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    /**
     * 解码错误软重建（`BUG-024`）：`MEDIA_ERR_DECODE` 后元素进入永久故障态，
     * `load()` 重建管线后按此意图落地（回原位 + 按需续播）；attempts = 连续失败计数。
     */
    const decodeRecoveryRef = useRef<{ t: number; resume: boolean } | null>(null);
    const decodeAttemptsRef = useRef(0);
    /**
     * 播放意图：`play` 置 true，`pause`/`loadstart`/`ended` 置 false。error 时刻**不能**
     * 直接拿 `!v.paused` 当"刚才在播"的依据——错误路径会先把 `paused` 属性置 true、
     * `pause` 事件晚于 `error` 派发，第一版用 `!v.paused` 导致重建后永远不续播：
     * 重播要点两下（第一下只回原点）、循环到出点回卷后停在入点（`BUG-024` 自愈版）。
     */
    const playIntentRef = useRef(false);
    const [cur, setCur] = useState(0);
    const [dur, setDur] = useState(0);
    /** 播放态（M19-5 控制栏播放按钮需要）；与 onPlayStateChange 同源回写 */
    const [playing, setPlaying] = useState(false);
    // 音量/静音走会话级全局记忆（M16-2）：所有播放器实例共用、跨页面与换视频保持
    const { volume: vol, muted, setVolume, toggleMuted } = useVolumeMemory();
    // 倍速（M19-5 起为文字按钮 + 弹出档位菜单；K/L 循环切换沿用同一档位表）
    const RATES = PLAYBACK_RATES;
    const [rate, setRate] = useState(1);
    const [ratesOpen, setRatesOpen] = useState(false);
    // 框选放大（M19-6，FR-397）
    const [zoom, setZoom] = useState<ZoomState | null>(null);
    const [sel, setSel] = useState<SelRect | null>(null);
    const [ctrlDown, setCtrlDown] = useState(false);
    /** 本次指针手势发生过移动/框选（松手后的 click 不再当作播放切换） */
    const interactedRef = useRef(false);
    /** 进行中的指针拖拽收尾器：组件卸载时摘监听（红线 20） */
    const dragDetachRef = useRef<(() => void) | null>(null);
    useEffect(
      () => () => {
        dragDetachRef.current?.();
      },
      [],
    );

    useImperativeHandle(ref, () => ({
      seek(t: number) {
        const v = videoRef.current;
        if (v) {
          v.currentTime = t;
          setCur(t);
        }
      },
      play() {
        safePlay(videoRef.current);
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

    // 框选放大：Ctrl 键提示光标 + Esc 还原（全屏时让 UA 先退全屏，再按一次才还原）
    useEffect(() => {
      if (!allowZoom) return;
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Control") setCtrlDown(true);
        if (e.key === "Escape" && zoom && !document.fullscreenElement) setZoom(null);
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.key === "Control") setCtrlDown(false);
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      };
    }, [allowZoom, zoom]);

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
        playIntentRef.current = true;
        setPlaying(true);
        start();
        onPlayStateRef.current?.(true);
      };
      const onPause = () => {
        playIntentRef.current = false;
        setPlaying(false);
        stop();
        report();
        onPlayStateRef.current?.(false);
      };
      // seeked 会打断 rAF 链，但播放中 seek 不再触发 play 事件 → 必须自行重启，
      // 否则时间上报永久冻结（播放头停住、方向键步进失效、M9-5 区间预览首次到出点即静默失效）。
      const onStop = () => {
        report();
        // seeked 是"seek 已落地"的确定信号：上层靠它接续 seek 之后要做的事（见 onSeeked 注释）
        onSeekedRef.current?.();
        if (v.paused || v.ended) stop();
        else start();
      };
      /**
       * 媒体**重新加载**（`src` 被换掉：代理就绪切源、换素材、重新 `load()`）会把 `paused`
       * 置回 true，但**按规范不触发 `pause` 事件**——只靠 `onPause` 回写播放态的话，UI 会
       * 一直以为还在播：按钮卡在「暂停」、且播放态为 true 会让上层"再按=暂停"彻底锁死
       * （`BUG-018`：真机实测 代理任务完成切源后按钮永久停在「暂停」、画面不动）。
       * 此处只同步播放态；位置不在这里上报——换源后上层通常会在 `loadedmetadata` 重新定位。
       */
      const onLoad = () => {
        playIntentRef.current = false;
        setPlaying(false);
        stop();
        onPlayStateRef.current?.(false);
      };
      /**
       * **自然播放到底**只触发 `ended`、**不触发 `pause`**（规范：到底后 `paused` 仍为 false，
       * 只有 `ended` 置 true）——不补这条，播放态会停在 true：按钮显示「暂停」而画面已停在
       * 末尾，再点一次只是空 `pause()`，要点两次才重播（`BUG-018` 同族；片段加工里
       * `seg = null` 的全段片段正好走这条路径，即用户说的"全段可以播放"实际也要多点一下）。
       */
      const onEnded = () => {
        playIntentRef.current = false;
        setPlaying(false);
        stop();
        report();
        onPlayStateRef.current?.(false);
      };
      /**
       * **解码管线错误自愈**（`BUG-024`）：WebView2 在"向后 seek 重解码 GOP"等场景下可能
       * `PIPELINE_ERROR_DECODE`（code=3，解 GOP 内非关键帧包失败），此后 media element 进入
       * **永久故障态**——`play` 事件照发但解码管线不再出帧（`play()` promise 永久 pending），
       * 怎么点都播不起来。唯一自愈路径是 `v.load()` 重建管线：记下出错位置与播放意图，
       * 重建完成（`loadedmetadata`）后 seek 回原位、原在播放则续播。**自愈路径不转发
       * `onError`**——上层把 code=3 当"格式不支持"会误触发代理切换；连续
       * `RECOVERY_MAX` 次重建仍失败才转交上层（真正出帧即清零计数，见 `onActuallyPlaying`）。
       * code=4（格式不支持）等其他错误仍走 `onError` 既有语义。
       */
      const MEDIA_ERR_DECODE = 3; // MediaError 实例常量（lib.dom 无静态引用）
      const RECOVERY_MAX = 3;
      const onErr = () => {
        const err = v.error;
        stop();
        onPlayStateRef.current?.(false);
        if (err?.code !== MEDIA_ERR_DECODE) {
          onErrorRef.current?.();
          return;
        }
        if (decodeAttemptsRef.current >= RECOVERY_MAX) {
          void appendFrontendLog(
            "error",
            `[decode] 连续 ${RECOVERY_MAX} 次软重建仍 MEDIA_ERR_DECODE，放弃自愈转交上层：${err.message}`,
          );
          onErrorRef.current?.();
          return;
        }
        decodeAttemptsRef.current += 1;
        // 续播判定：`!v.paused`（error 前无 pause）**或**播放意图仍为 true（错误路径已把
        // `paused` 置 true 但 `pause` 事件尚未派发——两种事件序都覆盖；见 playIntentRef 注释）
        decodeRecoveryRef.current = { t: v.currentTime, resume: !v.paused || playIntentRef.current };
        void appendFrontendLog(
          "warn",
          `[decode] MEDIA_ERR_DECODE（第 ${decodeAttemptsRef.current} 次）→ 软重建 load()，落地后回 ${v.currentTime.toFixed(3)}s${v.paused ? "" : "并续播"}：${err.message}`,
        );
        v.load();
      };
      /** 软重建的落地动作：`load()` 后元素重走 `loadedmetadata`，此时回原位 + 按意图续播 */
      const onRecoveredMeta = () => {
        const rec = decodeRecoveryRef.current;
        if (!rec) return;
        decodeRecoveryRef.current = null;
        v.currentTime = rec.t;
        if (rec.resume) safePlay(v);
      };
      /** 真正出帧（`playing`）＝ 解码管线健康：软重建失败计数清零 */
      const onActuallyPlaying = () => {
        decodeAttemptsRef.current = 0;
      };
      v.addEventListener("play", onPlay);
      v.addEventListener("playing", onActuallyPlaying);
      v.addEventListener("pause", onPause);
      v.addEventListener("seeked", onStop);
      v.addEventListener("loadstart", onLoad);
      v.addEventListener("ended", onEnded);
      v.addEventListener("loadedmetadata", onRecoveredMeta);
      v.addEventListener("error", onErr);
      return () => {
        ticking = false;
        cancelAnimationFrame(rafRef.current);
        v.removeEventListener("play", onPlay);
        v.removeEventListener("playing", onActuallyPlaying);
        v.removeEventListener("pause", onPause);
        v.removeEventListener("seeked", onStop);
        v.removeEventListener("loadstart", onLoad);
        v.removeEventListener("ended", onEnded);
        v.removeEventListener("loadedmetadata", onRecoveredMeta);
        v.removeEventListener("error", onErr);
      };
    }, []);

    const toggleFullscreen = () => {
      const el = rootRef.current;
      if (!el) return;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen();
    };

    const commitSeek = (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = t;
      setCur(t);
    };

    // ---------- 框选放大（M19-6，FR-397） ----------

    const onVideoPointerDown = (e: React.PointerEvent) => {
      if (!allowZoom) return;
      const box = videoRef.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return;
      const frac = (clientX: number, clientY: number) => ({
        x: clamp01((clientX - box.left) / box.width),
        y: clamp01((clientY - box.top) / box.height),
      });
      if (e.ctrlKey && !zoom) {
        // Ctrl+拖拽：框选（红线 20 统一走 beginPointerDrag）
        const p0 = frac(e.clientX, e.clientY);
        interactedRef.current = true;
        dragDetachRef.current = beginPointerDrag(
          (ev) => {
            const p = frac(ev.clientX, ev.clientY);
            setSel({ x0: p0.x, y0: p0.y, x1: p.x, y1: p.y });
          },
          (ev) => {
            dragDetachRef.current = null;
            setSel(null);
            if (!ev) return;
            const p1 = frac(ev.clientX, ev.clientY);
            const rw = Math.abs(p1.x - p0.x);
            const rh = Math.abs(p1.y - p0.y);
            if (rw < 0.03 || rh < 0.03) return; // 过小的误框不放大
            setZoom(
              clampOffset({
                rx: Math.min(p0.x, p1.x),
                ry: Math.min(p0.y, p1.y),
                rw,
                rh,
                ox: Math.min(p0.x, p1.x),
                oy: Math.min(p0.y, p1.y),
              }),
            );
          },
        );
        return;
      }
      if (zoom && !e.ctrlKey) {
        // 放大态拖拽 = 平移（内容跟手：可视窗口起点随位移反向变化）
        const s = zoomScale(zoom);
        const o0 = { x: zoom.ox, y: zoom.oy };
        let moved = false;
        dragDetachRef.current = beginPointerDrag(
          (ev) => {
            const dx = (ev.clientX - e.clientX) / box.width / s;
            const dy = (ev.clientY - e.clientY) / box.height / s;
            if (!moved && Math.hypot(dx * box.width, dy * box.height) > 4) moved = true;
            if (moved) {
              interactedRef.current = true;
              setZoom(clampOffset({ ...zoom, ox: o0.x - dx, oy: o0.y - dy }));
            }
          },
          () => {
            dragDetachRef.current = null;
          },
        );
      }
    };

    const onVideoClickInternal = (e: React.MouseEvent) => {
      // 拖拽过（框选/平移）或 Ctrl 修饰的点击都不是"点画面走带"
      if (interactedRef.current) {
        interactedRef.current = false;
        return;
      }
      if (allowZoom && e.ctrlKey) return;
      if (onVideoClick) {
        onVideoClick();
        return;
      }
      togglePlay();
    };

    const zoomStyle: CSSProperties | undefined = zoom
      ? (() => {
          const s = zoomScale(zoom);
          return {
            transform: `scale(${s}) translate(${-zoom.ox * 100}%, ${-zoom.oy * 100}%)`,
            transformOrigin: "0 0",
          };
        })()
      : undefined;

    const togglePlay = () => {
      const v = videoRef.current;
      if (!v) return;
      // `ended` 也要当作"可以起播"：到底后规范只置 `ended`、`paused` **仍是 false**
      // （自然播放到底不触发 `pause`），只按 `paused` 判向会把"播完点画面"当成暂停，
      // 用户要点两次才重播（`BUG-023` 同族）。
      if (v.paused || v.ended) safePlay(v);
      else v.pause();
    };

    const cursorClass = allowZoom
      ? zoom
        ? "cursor-move"
        : ctrlDown
          ? "cursor-crosshair"
          : "cursor-pointer"
      : "cursor-pointer";

    return (
      <div
        ref={rootRef}
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
          style={zoom ? zoomStyle : videoStyle}
          className={
            fill
              ? `h-full w-full bg-black object-contain ${cursorClass}`
              : `mx-auto ${videoMaxClass ?? "max-h-[44vh]"} w-full bg-black object-contain ${cursorClass}`
          }
          onPointerDown={onVideoPointerDown}
          onDoubleClick={() => {
            if (allowZoom) setZoom(null);
          }}
          onClick={onVideoClickInternal}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDur(d);
            onLoadedMetadata?.(e.currentTarget.duration);
          }}
        />
        {/* 框选中的选区可视化（M19-6）：视频盒 == 根盒（非 fill 模式视频满宽、fill 模式满容器） */}
        {sel && (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute border-2 border-signal bg-signal/10"
              style={{
                left: `${Math.min(sel.x0, sel.x1) * 100}%`,
                top: `${Math.min(sel.y0, sel.y1) * 100}%`,
                width: `${Math.abs(sel.x1 - sel.x0) * 100}%`,
                height: `${Math.abs(sel.y1 - sel.y0) * 100}%`,
              }}
            />
          </div>
        )}
        {overlay}
        {banner && (
          <div className="absolute left-2 top-2 rounded bg-ink/80 px-2 py-1 text-xs text-warn backdrop-blur-sm">
            {banner}
          </div>
        )}
        {controls && (
          <div className="absolute inset-x-0 bottom-0 select-none">
            {/* 细进度条置顶（M19-5 B 站样式）：hover 加粗 */}
            <div className="px-2 pb-0.5">
              <input
                type="range"
                min={0}
                max={dur || 0}
                step={0.05}
                value={Math.min(cur, dur || 0)}
                onChange={(e) => commitSeek(Number(e.target.value))}
                aria-label="播放进度"
                className="h-1 w-full cursor-pointer accent-signal transition-all hover:h-1.5"
              />
            </div>
            <div className="flex items-center gap-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pb-2 pt-1">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "暂停" : "播放"}
                className="shrink-0 text-paper/85 transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <span className="shrink-0 font-mono text-[11px] text-paper/85">
                {formatTime(cur, false)} / {dur > 0 ? formatTime(dur, false) : "--:--"}
              </span>
              <div className="min-w-0 flex-1" />
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setRatesOpen((v) => !v)}
                  aria-label="播放速度"
                  title="播放速度"
                  className={`text-xs transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${ratesOpen || rate !== 1 ? "text-signal" : "text-paper/85"}`}
                >
                  {rate === 1 ? "倍速" : `${rate}x`}
                </button>
                {ratesOpen && (
                  <div
                    className="absolute bottom-full right-0 mb-2 max-h-64 overflow-y-auto rounded-md border border-hairline bg-ink/95 py-1 shadow-lg"
                    onMouseLeave={() => setRatesOpen(false)}
                  >
                    {RATES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setRate(r);
                          setRatesOpen(false);
                        }}
                        className={`block w-full px-4 py-1 text-center text-xs transition-colors hover:bg-paper/10 focus:outline-none ${r === rate ? "text-signal" : "text-paper/85"}`}
                      >
                        {r}x
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="group relative flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => toggleMuted()}
                  aria-label={muted || vol === 0 ? "取消静音" : "静音"}
                  className="text-paper/85 transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  {muted || vol === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                {/* 音量滑条：hover 竖向向上弹出（M21-2——横向展开会压住相邻按钮） */}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : vol}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="音量"
                  className="pointer-events-none absolute bottom-full left-1/2 mb-1 h-16 w-1 -translate-x-1/2 cursor-pointer accent-signal opacity-0 transition-opacity duration-150 [writing-mode:vertical-lr] [direction:rtl] group-hover:pointer-events-auto group-hover:opacity-100"
                />
              </div>
              {allowZoom && zoom && (
                <button
                  type="button"
                  onClick={() => setZoom(null)}
                  aria-label="还原放大"
                  title="还原放大（Esc / 双击画面）"
                  className="shrink-0 text-signal transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  <Restore className="h-4 w-4" />
                </button>
              )}
              {allowZoom && !zoom && (
                <span className="shrink-0 text-paper/60" title="Ctrl + 拖拽画面框选放大">
                  <ZoomIn className="h-4 w-4" />
                </span>
              )}
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="全屏"
                title="全屏（Esc 退出）"
                className="shrink-0 text-paper/85 transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

export default VideoPlayer;
