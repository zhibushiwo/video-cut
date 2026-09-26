/**
 * 成品虚拟连播预览（DESIGN §3.8 / M6-6）：按时间轴顺序近似连播全部片段。
 *
 * - 播放列表：父层派生成品内↔源内时间对（entries）
 * - 双 <video> 轮换：活动槽播放，另一槽预加载下一段的源，切换零等待（近似）
 * - 越界自动切下一段；seek（时间轴点击/进度条）映射到对应片段对应源位置
 * - 播放头渲染路径（M11-3，§18.4）：rAF tick 把权威时间写进 playheadRef 并直写时间轴
 *   播放头 transform 与进度条 .value（0 setState）；onPlayhead 降频为离散汇
 *   （seek/段切换/暂停/结束），供 React 侧时间读数与进度条离散同步
 * - 代理沿用：需要代理的源按路径生成/缓存，播放用代理
 * - 已知限制（UI 明示）：片段边界 ±1 帧级误差与切换停顿，导出以 FFmpeg 输出为准
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { appendFrontendLog, fileSrc, generateProxy, onTaskStatus } from "../../services/tauri";
import { beginFrameSampling, formatPerfLine, type PerfScene, type PerfSummary } from "../../utils/perf";
import type { RotateState } from "../RotateControls";
import { formatTime } from "../../utils/time";

/** 成品连播的一个播放单元（父层由 timeline 派生） */
export interface ProductEntry {
  clipId: string;
  sourcePath: string;
  /** 源内区间 [start, end)（秒） */
  srcStart: number;
  srcEnd: number;
  /** 成品内起点（秒） */
  productStart: number;
  rot: RotateState;
  crop: { nx: number; ny: number; nw: number; nh: number } | null;
  /** 显示空间宽高（旋转交换后） */
  dims: { w: number; h: number };
  /** 该源是否需要代理预览 */
  proxy: boolean;
}

interface ProductPreviewProps {
  entries: ProductEntry[];
  playhead: number;
  /** 离散播放头镜像（§18.4）：仅在 seek/段切换/结束/复位时到达——同步 ref 与 React state */
  onPlayhead(t: number): void;
  /** 时间轴点击等外部 seek 请求（nonce 触发） */
  seekRequest: { t: number; nonce: number } | null;
  playing: boolean;
  onPlayingChange(p: boolean): void;
  /** 权威播放头（秒）——rAF tick 每帧直写，React 不经它渲染（§18.4） */
  playheadRef: { current: number };
  /** 时间轴播放头 DOM（ClipTimeline 注册）：tick 内直写 transform，免 React */
  playheadElRef: { current: HTMLElement | null };
  /** 时间轴滚动容器（ClipTimeline 注册）：播放中跟随滚动用 */
  scrollElRef: { current: HTMLElement | null };
  /** 页面级 PPS 的 ref 镜像（§18.3）：tick 连续帧之间不重渲染，必须读 ref */
  ppsRef: { current: number };
  /** 播放倍率（M11-8 K/L 走带，复用 M7-6 档位 0.5/1/1.5/2；默认 1）。
   *  新媒体加载会把 playbackRate 重置回 1，故除 effect 外还要在 onLoadedMetadata 补挂 */
  playbackRate: number;
}

type Slot = "a" | "b";

export default function ProductPreview({
  entries,
  playhead,
  onPlayhead,
  seekRequest,
  playing,
  onPlayingChange,
  playheadRef,
  playheadElRef,
  scrollElRef,
  ppsRef,
  playbackRate,
}: ProductPreviewProps) {
  const [segIdx, setSegIdx] = useState(0);
  const [slot, setSlot] = useState<Slot>("a");
  /** 每个槽当前装载的条目 index；null = 空 */
  const [slotContent, setSlotContent] = useState<{ a: number | null; b: number | null }>({
    a: 0,
    b: null,
  });
  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  /** 进度条（非受控，§18.4）：rAF tick 每帧直写 .value，拖动经 seekInternal 通路 */
  const progressRef = useRef<HTMLInputElement>(null);
  /** 进度条拖动中：tick 暂停直写 .value，避免视频滞后位置回弹覆盖用户拖动值 */
  const draggingRef = useRef(false);
  /** 槽就绪后待应用的源内绝对时间（metadata 前设 currentTime 不可靠） */
  const pendingSeekRef = useRef<{ a: number | null; b: number | null }>({ a: 0, b: null });

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const segIdxRef = useRef(0);
  const slotRef = useRef<Slot>("a");
  const slotContentRef = useRef(slotContent);
  slotContentRef.current = slotContent;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const cbsRef = useRef({ onPlayhead, onPlayingChange });
  cbsRef.current = { onPlayhead, onPlayingChange };
  // 帧时间埋点（§18.6 playing 场景，M11-9 接线）：播放中按 rAF 间隔采样，5s 窗口汇总
  const onPerfReport = useCallback(
    (scene: PerfScene, s: PerfSummary) => void appendFrontendLog("debug", formatPerfLine(scene, s)),
    [],
  );
  // 倍率 ref：onLoadedMetadata（新媒体加载重置 playbackRate）与槽切换时补挂用
  const rateRef = useRef(playbackRate);
  rateRef.current = playbackRate;
  // 双槽都挂（预载槽播下一段时沿用同一倍率）；槽切换换活动元素后再补一次
  useEffect(() => {
    for (const v of [videoA.current, videoB.current]) if (v) v.playbackRate = playbackRate;
  }, [playbackRate, slot]);

  // ---------- 代理映射：按需为需要代理的源生成，完成后按路径缓存 ----------
  const [proxyMap, setProxyMap] = useState<Record<string, string>>({});
  const requestedRef = useRef<Set<string>>(new Set());
  const taskPathRef = useRef<Map<string, string>>(new Map());
  const proxyMapRef = useRef(proxyMap);
  proxyMapRef.current = proxyMap;

  const needProxyPaths = useMemo(
    () => Array.from(new Set(entries.filter((e) => e.proxy).map((e) => e.sourcePath))),
    [entries],
  );

  useEffect(() => {
    for (const p of needProxyPaths) {
      if (proxyMapRef.current[p] || requestedRef.current.has(p)) continue;
      requestedRef.current.add(p);
      void generateProxy(p)
        .then((s) => {
          if (s.taskId) taskPathRef.current.set(s.taskId, p);
          else setProxyMap((m) => ({ ...m, [p]: s.proxyPath }));
        })
        .catch(() => {
          requestedRef.current.delete(p);
        });
    }
  }, [needProxyPaths]);

  // 代理任务完成 → 补上代理路径（R1-2：订阅退订走 useTauriEvent）
  useTauriEvent(() =>
    onTaskStatus((p) => {
      const path = taskPathRef.current.get(p.taskId);
      const out = p.outputs[0];
      if (path && p.status === "completed" && out) {
        setProxyMap((m) => ({ ...m, [path]: out }));
        taskPathRef.current.delete(p.taskId);
      }
    }),
  );

  const playablePath = useCallback(
    (idx: number) => {
      const e = entriesRef.current[idx];
      if (!e) return "";
      const proxy = e.proxy ? proxyMapRef.current[e.sourcePath] : undefined;
      return proxy ?? e.sourcePath;
    },
    [],
  );

  /** 把活动槽视频的实时位置落进离散镜像（§18.4：暂停/外部暂停的同步点） */
  const syncDiscreteFromVideo = useCallback(() => {
    const e = entriesRef.current[segIdxRef.current];
    const v = slotRef.current === "a" ? videoA.current : videoB.current;
    if (!e || !v) return;
    cbsRef.current.onPlayhead(
      e.productStart + Math.min(Math.max(0, v.currentTime - e.srcStart), e.srcEnd - e.srcStart),
    );
  }, []);

  // ---------- 槽切换：写另一槽（或复用已预载的）并激活 ----------
  const switchTo = useCallback((idx: number, srcPos: number) => {
    const es = entriesRef.current;
    if (idx < 0 || idx >= es.length) return;
    const prev = slotRef.current;
    const other: Slot = prev === "a" ? "b" : "a";
    if (slotContentRef.current[other] === idx) {
      // 已预载同一 index：直接定位，不重载
      pendingSeekRef.current[other] = null;
      const v = other === "a" ? videoA.current : videoB.current;
      if (v) v.currentTime = srcPos;
    } else {
      pendingSeekRef.current[other] = srcPos;
      setSlotContent((s) => ({ ...s, [other]: idx }));
    }
    slotRef.current = other;
    setSlot(other);
    segIdxRef.current = idx;
    setSegIdx(idx);
    // 离场槽位停住（已切到其出点附近，正常即将 ended；防其继续出声）
    (prev === "a" ? videoA.current : videoB.current)?.pause();
    // 段切换是离散镜像的同步点（§18.4）：时间读数/进度条跳到新段起点（seekInternal 随后
    // 的离散汇是同值，React bail）
    const target = es[idx];
    if (target) cbsRef.current.onPlayhead(target.productStart + (srcPos - target.srcStart));
  }, []);

  /** 成品时间 → 片段内 seek（同段直接定位，跨段切换槽） */
  const seekInternal = useCallback(
    (t: number) => {
      const es = entriesRef.current;
      if (es.length === 0) return;
      let idx = es.findIndex(
        (e) => t >= e.productStart && t < e.productStart + (e.srcEnd - e.srcStart),
      );
      if (idx < 0) idx = es.length - 1;
      const e = es[idx];
      if (!e) return; // idx 已钳到有效界，防御
      const offset = Math.min(Math.max(0, t - e.productStart), e.srcEnd - e.srcStart);
      if (idx === segIdxRef.current) {
        const v = slotRef.current === "a" ? videoA.current : videoB.current;
        if (v) v.currentTime = e.srcStart + offset;
      } else {
        switchTo(idx, e.srcStart + offset);
      }
      cbsRef.current.onPlayhead(t);
    },
    [switchTo],
  );

  // 外部 seek 请求（时间轴点击 / 进入页面同步播放头）
  useEffect(() => {
    if (!seekRequest) return;
    seekInternal(seekRequest.t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.nonce]);

  // 播放/暂停跟随活动槽；播放→暂停的沿把实时位置落进离散镜像（§18.4：暂停时读数与
  // 进度条要对齐实际位置）。用沿触发避免"暂停中切槽"（跨段 seek 的 switchTo）误报位置。
  const prevPlayingRef = useRef(false);
  useEffect(() => {
    const v = slot === "a" ? videoA.current : videoB.current;
    if (!v) return;
    if (playing) void v.play();
    else {
      v.pause();
      if (prevPlayingRef.current) syncDiscreteFromVideo();
    }
    prevPlayingRef.current = playing;
  }, [playing, slot, syncDiscreteFromVideo]);

  // rAF 驱动播放头；越界切下一段 / 结尾停止
  useEffect(() => {
    if (!playing) return;
    // playing 场景采样（§18.6）：起播开窗、停播冲掉不足一窗的余量
    const stopPerf = beginFrameSampling("playing", onPerfReport);
    let alive = true;
    let raf = 0;
    const tick = () => {
      if (!alive) return;
      const es = entriesRef.current;
      const e = es[segIdxRef.current];
      const v = slotRef.current === "a" ? videoA.current : videoB.current;
      if (e && v && !v.paused) {
        if (v.currentTime >= e.srcEnd - 0.03 || v.ended) {
          const next = segIdxRef.current + 1;
          const ne = es[next];
          if (next < es.length && ne) {
            switchTo(next, ne.srcStart);
          } else {
            cbsRef.current.onPlayingChange(false);
            cbsRef.current.onPlayhead(e.productStart + (e.srcEnd - e.srcStart));
            return;
          }
        } else if (v.currentTime >= e.srcStart) {
          // 播放头渲染路径（§18.4）：ref + DOM 直写，整条路径 0 个 setState——
          // React 侧 playhead 是离散镜像，播放中不更新（时间读数随之降频）
          const t = e.productStart + Math.min(v.currentTime - e.srcStart, e.srcEnd - e.srcStart);
          playheadRef.current = t;
          const ph = playheadElRef.current;
          if (ph) ph.style.transform = `translateX(${t * ppsRef.current}px)`;
          // 进度条每帧直写（拖动中挂起，防视频滞后位置回弹覆盖用户拖动值）
          if (!draggingRef.current && progressRef.current) {
            progressRef.current.value = String(t);
          }
          // 跟随滚动：越过视口右缘 90% → 贴回 10%（条件式边缘触发，不逐帧强推）
          const sc = scrollElRef.current;
          if (sc) {
            const x = t * ppsRef.current;
            if (x > sc.scrollLeft + 0.9 * sc.clientWidth) {
              sc.scrollLeft = x - 0.1 * sc.clientWidth;
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stopPerf();
    };
  }, [playing, switchTo, playheadRef, playheadElRef, scrollElRef, ppsRef, onPerfReport]);

  // 预加载下一段到另一槽（停在其起点）
  useEffect(() => {
    const es = entriesRef.current;
    const next = segIdxRef.current + 1;
    const ne = es[next];
    if (next >= es.length || !ne) return;
    const other: Slot = slotRef.current === "a" ? "b" : "a";
    if (slotContentRef.current[other] === next) return;
    pendingSeekRef.current[other] = ne.srcStart;
    setSlotContent((s) => ({ ...s, [other]: next }));
  }, [segIdx, entries]);

  // 时间轴变化：当前段越界则整体复位（其余情况沿用现有槽，视觉属性经 props 实时更新）
  useEffect(() => {
    const first = entries[0];
    if (!first) return;
    if (segIdxRef.current < entries.length && (slotContentRef.current.a ?? 0) < entries.length) {
      return;
    }
    segIdxRef.current = 0;
    setSegIdx(0);
    slotRef.current = "a";
    setSlot("a");
    slotContentRef.current = { a: 0, b: null };
    setSlotContent({ a: 0, b: null });
    pendingSeekRef.current = { a: first.srcStart, b: null };
    cbsRef.current.onPlayingChange(false);
    cbsRef.current.onPlayhead(0);
  }, [entries]);

  const totalDuration = entries.reduce((s, e) => s + (e.srcEnd - e.srcStart), 0);
  const entry = entries[segIdx];

  // 进度条离散同步（tick 管播放中的每帧；seek/段切换/结束/暂停走这里）
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.value = String(Math.min(playhead, totalDuration));
    }
  }, [playhead, totalDuration]);

  if (entries.length === 0 || !entry) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-mute">
        时间轴为空——先从片段池把片段加入时间轴
      </div>
    );
  }

  const slotRender = (name: Slot) => {
    const idx = slotContent[name];
    if (idx === null) return null;
    const e = entries[idx];
    if (!e) return null;
    const q = e.rot.deg === 90 || e.rot.deg === 270;
    const inner: CSSProperties = {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: q ? `${(e.dims.h / e.dims.w) * 100}%` : "100%",
      height: q ? `${(e.dims.w / e.dims.h) * 100}%` : "100%",
      transform: `translate(-50%, -50%) rotate(${e.rot.deg}deg) scaleX(${e.rot.hflip ? -1 : 1}) scaleY(${e.rot.vflip ? -1 : 1})`,
    };
    return (
      <div key={name} className="absolute inset-0" style={{ opacity: name === slot ? 1 : 0 }}>
        <div style={inner}>
          <video
            ref={name === "a" ? videoA : videoB}
            src={fileSrc(playablePath(idx))}
            preload="auto"
            playsInline
            className="h-full w-full bg-black"
            onPause={() => {
              // 外部暂停（如页面隐藏保活）同步回播放状态（M10-1）；位置也落进离散镜像
              if (name === slot) {
                cbsRef.current.onPlayingChange(false);
                syncDiscreteFromVideo();
              }
            }}
            onLoadedMetadata={() => {
              const v = name === "a" ? videoA.current : videoB.current;
              const t = pendingSeekRef.current[name];
              if (v && t !== null) {
                v.currentTime = t;
                pendingSeekRef.current[name] = null;
              }
              if (v) v.playbackRate = rateRef.current; // 新媒体加载重置倍率 → 补挂（M11-8）
              if (name === slot && playingRef.current) void v?.play();
            }}
            onEnded={() => {
              if (name !== slot) return;
              const next = segIdxRef.current + 1;
              const es = entriesRef.current;
              const ne = es[next];
              if (next < es.length && ne) switchTo(next, ne.srcStart);
              else {
                cbsRef.current.onPlayingChange(false);
              }
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col gap-1.5 p-2">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className="relative"
          style={{
            aspectRatio: `${entry.dims.w} / ${entry.dims.h}`,
            height: "100%",
            maxWidth: "100%",
          }}
        >
          {slotRender("a")}
          {slotRender("b")}
          {entry.crop && (
            <div
              className="pointer-events-none absolute border-2 border-signal bg-signal/10"
              style={{
                left: `${entry.crop.nx * 100}%`,
                top: `${entry.crop.ny * 100}%`,
                width: `${entry.crop.nw * 100}%`,
                height: `${entry.crop.nh * 100}%`,
              }}
            />
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onPlayingChange(!playing)}
          className="rounded-md border border-hairline px-2.5 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          {playing ? "暂停" : "播放"}
        </button>
        {playbackRate !== 1 && (
          <span className="shrink-0 rounded border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-mute">
            {playbackRate}×
          </span>
        )}
        <input
          ref={progressRef}
          type="range"
          min={0}
          max={totalDuration || 0}
          step={0.05}
          defaultValue={0}
          onPointerDown={() => {
            draggingRef.current = true;
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
          onChange={(e) => seekInternal(Number(e.target.value))}
          aria-label="成品播放进度"
          className="h-1 min-w-0 flex-1 cursor-pointer accent-signal"
        />
        <span className="shrink-0 font-mono text-[10px] text-mute">
          {formatTime(playhead, false)} / {formatTime(totalDuration, false)}
        </span>
      </div>
      <p className="shrink-0 text-center text-[10px] text-mute/60">
        近似预览：片段边界可能有 ±1 帧误差与短暂切换停顿；导出以 FFmpeg 实际输出为准
      </p>
    </div>
  );
}
