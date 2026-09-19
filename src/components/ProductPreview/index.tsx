/**
 * 成品虚拟连播预览（DESIGN §3.8 / M6-6）：按时间轴顺序近似连播全部片段。
 *
 * - 播放列表：父层派生成品内↔源内时间对（entries）
 * - 双 <video> 轮换：活动槽播放，另一槽预加载下一段的源，切换零等待（近似）
 * - 越界自动切下一段；seek（时间轴点击/进度条）映射到对应片段对应源位置
 * - 代理沿用：需要代理的源按路径生成/缓存，播放用代理
 * - 已知限制（UI 明示）：片段边界 ±1 帧级误差与切换停顿，导出以 FFmpeg 输出为准
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { fileSrc, generateProxy, onTaskStatus } from "../../services/tauri";
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
  onPlayhead(t: number): void;
  /** 时间轴点击等外部 seek 请求（nonce 触发） */
  seekRequest: { t: number; nonce: number } | null;
  playing: boolean;
  onPlayingChange(p: boolean): void;
}

type Slot = "a" | "b";

export default function ProductPreview({
  entries,
  playhead,
  onPlayhead,
  seekRequest,
  playing,
  onPlayingChange,
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
      if (path && p.status === "completed" && p.outputs[0]) {
        setProxyMap((m) => ({ ...m, [path]: p.outputs[0] }));
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

  // 播放/暂停跟随活动槽
  useEffect(() => {
    const v = slot === "a" ? videoA.current : videoB.current;
    if (!v) return;
    if (playing) void v.play();
    else v.pause();
  }, [playing, slot]);

  // rAF 驱动播放头；越界切下一段 / 结尾停止
  useEffect(() => {
    if (!playing) return;
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
          if (next < es.length) {
            switchTo(next, es[next].srcStart);
          } else {
            cbsRef.current.onPlayingChange(false);
            cbsRef.current.onPlayhead(e.productStart + (e.srcEnd - e.srcStart));
            return;
          }
        } else if (v.currentTime >= e.srcStart) {
          cbsRef.current.onPlayhead(
            e.productStart + Math.min(v.currentTime - e.srcStart, e.srcEnd - e.srcStart),
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [playing, switchTo]);

  // 预加载下一段到另一槽（停在其起点）
  useEffect(() => {
    const es = entriesRef.current;
    const next = segIdxRef.current + 1;
    if (next >= es.length) return;
    const other: Slot = slotRef.current === "a" ? "b" : "a";
    if (slotContentRef.current[other] === next) return;
    pendingSeekRef.current[other] = es[next].srcStart;
    setSlotContent((s) => ({ ...s, [other]: next }));
  }, [segIdx, entries]);

  // 时间轴变化：当前段越界则整体复位（其余情况沿用现有槽，视觉属性经 props 实时更新）
  useEffect(() => {
    if (entries.length === 0) return;
    if (segIdxRef.current < entries.length && (slotContentRef.current.a ?? 0) < entries.length) {
      return;
    }
    segIdxRef.current = 0;
    setSegIdx(0);
    slotRef.current = "a";
    setSlot("a");
    slotContentRef.current = { a: 0, b: null };
    setSlotContent({ a: 0, b: null });
    pendingSeekRef.current = { a: entries[0].srcStart, b: null };
    cbsRef.current.onPlayingChange(false);
    cbsRef.current.onPlayhead(0);
  }, [entries]);

  const totalDuration = entries.reduce((s, e) => s + (e.srcEnd - e.srcStart), 0);
  const entry = entries[segIdx];

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
              // 外部暂停（如页面隐藏保活）同步回播放状态（M10-1）
              if (name === slot) cbsRef.current.onPlayingChange(false);
            }}
            onLoadedMetadata={() => {
              const v = name === "a" ? videoA.current : videoB.current;
              const t = pendingSeekRef.current[name];
              if (v && t !== null) {
                v.currentTime = t;
                pendingSeekRef.current[name] = null;
              }
              if (name === slot && playingRef.current) void v?.play();
            }}
            onEnded={() => {
              if (name !== slot) return;
              const next = segIdxRef.current + 1;
              const es = entriesRef.current;
              if (next < es.length) switchTo(next, es[next].srcStart);
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
        <input
          type="range"
          min={0}
          max={totalDuration || 0}
          step={0.05}
          value={Math.min(playhead, totalDuration)}
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
