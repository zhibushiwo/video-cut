/**
 * 工作台合成时间轴（DESIGN §9.8 ②）：
 * - 坐标 = PPS 世界坐标（M11-1，TIMELINE.md §17.3 / plans/M11.md §18.2）：块位置/宽度、
 *   刻度、播放头、seek 换算全走 `geometry.ts` 一套公式——块宽**差值法**（M9-3 重叠的
 *   理论根源在该文件注释）。
 * - 缩放与滚动（M11-2，plans/M11.md §18.3）：PPS 是页面级 state（Workbench 持有，本组件
 *   经 props 读、onChangePps 写）；用户手动缩放前自动跟随适应窗口（M11-1 行为延续），
 *   首次手动缩放/适应后交还控制权。Ctrl+滚轮以鼠标为中心缩放；滚轮 = 横向滚动；
 *   +/− 键以视口中心为锚、\ 适应窗口。
 * - 整块拖拽排序（M9-4）：块本体进拖拽（指针事件 + 4px 死区），点击仍选中。
 * - 池→轴跨容器拖入（M6-3）。
 * - 帧时间埋点（plans/M11.md §18.6 drag 场景）挂在拖拽激活/收尾上。
 * - 播放头（M11-3 §18.4）：DOM 注册进 playheadElRef，位置由 ProductPreview 的 rAF tick
 *   与 Workbench 的离散同步 effect 直写 transform——本组件渲染不定位播放头；标尺 seek
 *   带片段边缘吸附（8px 窗，Alt 旁路）。
 * - 边缘修剪（M11-6 §18.5 状态机）：块边缘 ≤8px 热区（与拖拽重排互斥，≥4px 激活），
 *   拖动经 computeTrim（与提交同一钳制实现）本地预览块形与 tooltip，关键帧吸附
 *   （S 开关 / Alt 旁路在 Workbench 与指针事件侧）；pointerup 才 execute(buildTrim)
 *   入栈一条；双击边缘 = 修剪到播放头；Esc / pointercancel 丢弃。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useDragSort } from "../../hooks/useDragSort";
import { useHotkeys } from "../../hooks/useHotkeys";
import { appendFrontendLog } from "../../services/tauri";
import { beginPointerDrag } from "../../utils/pointerDrag";
import { beginFrameSampling, formatPerfLine, type PerfScene, type PerfSummary } from "../../utils/perf";
import { formatTime, formatTimecode } from "../../utils/time";
import { computeTrim, type TrimEdge } from "../../utils/undo/commands";
import {
  buildGeometry,
  clampPps,
  findTrimEdge,
  fitPps,
  snapToEdge,
  snapToKeyframe,
  tickStep,
  type TrimHit,
} from "./geometry";

export interface TimelineClip {
  id: string;
  /** 显示名：来源文件名 + 区间/全段 */
  label: string;
  /** 时长（秒）；0 = 未探测（渲染为 0 宽块，正常数据不会出现——导入必先探测） */
  duration: number;
  /** 无损判定；null = 检测未出 */
  lossless: boolean | null;
  /** 重编码原因（hover 展示） */
  detail?: string;
  /** 源内入点（`seg?.start ?? 0`）：修剪拖动的成品→源换算基准（M11-6） */
  srcIn: number;
  /** 源内出点（`seg?.end ?? 源时长`）：修剪预览的当前区间上界 */
  srcEnd: number;
  /** 源总时长（修剪出点的钳制上界；全段片段 = duration） */
  srcDuration: number;
  /** 源帧率（tooltip 时间码 + 钳制粒度）；0 = 未知（按 30 处理，与 undo 层同口径） */
  srcFps: number;
  /** 源关键帧（秒，升序；Workbench 按源懒加载）——undefined = 未加载，吸附静默降级 */
  keyframes?: readonly number[];
}

/** 修剪预览上抛（§18.5 状态机 ③）：Workbench 融合进导出检测 payload（300ms 尾随防抖） */
export interface TrimPreviewMsg {
  clipId: string;
  /** 预览区间（已钳制 + 规范形态：钳到整段 = null，与 buildTrim 的产出同构） */
  seg: { start: number; end: number } | null;
}

interface ClipTimelineProps {
  clips: TimelineClip[];
  /** 池→轴拖拽进行中的片段 id；null = 无 */
  externalDrag: { clipId: string } | null;
  selectedId: string | null;
  onSelect(id: string): void;
  onReorder(from: number, to: number): void;
  /** 池拖入/块拖动落点插入：目标 index 处放该片段（已在轴内则为移动语义） */
  onInsert(clipId: string, index: number): void;
  /** 池拖拽结束（无论是否落进轴内），父层据此清 externalDrag */
  onExternalDragEnd(): void;
  /** 从成品移除（块 hover ✕） */
  onRemove(id: string): void;
  /** 点击空白处按渲染位置 seek（成品内时间，秒） */
  onSeek(t: number): void;
  /** 时间码帧率（刻度标签，§17.3 总帧数时间码）：轴上首个片段的源帧率，Workbench 缺省 30 */
  fps: number;
  /** PPS（§18.3 页面级 state，Workbench 持有）：本组件经 onChangePps 写回 */
  pps: number;
  onChangePps(next: number): void;
  /** 播放头 DOM 注册（M11-3 §18.4）：ProductPreview 的 rAF tick 经它直写 transform */
  playheadElRef: { current: HTMLElement | null };
  /** 滚动容器注册（M11-3）：ProductPreview 的 rAF tick 做播放头跟随滚动用 */
  scrollElRef: { current: HTMLElement | null };
  // ------------------------------------------------------------ 修剪（M11-6 §18.5）
  /** 修剪边缘关键帧吸附开关（§17.4/§17.8：设置项 keyframeSnap，S 键在 Workbench 切换） */
  snapEnabled: boolean;
  /** 修剪手势起手：Workbench 据此懒加载该片段源的关键帧（B1 缓存兜底） */
  onTrimStart(clipId: string): void;
  /** 拖动中的预览区间上抛（逐 move 调用；Workbench 侧 ref + 300ms 尾随防抖，勿逐帧重渲染）。
   *  手势期间本组件以同一引用复用该回调——实现方须 useCallback 稳定。 */
  onTrimPreview(p: TrimPreviewMsg | null): void;
  /** 松手提交（§18.5 状态机 ⑤）：源内时间已预钳制，builder 会再钳一次（幂等） */
  onTrimCommit(clipId: string, edge: TrimEdge, srcTime: number): void;
  /** 双击边缘 = 修剪到播放头（§17.4）：播放头不在该片段内时由 Workbench 判 no-op */
  onTrimToPlayhead(clipId: string, edge: TrimEdge): void;
}

/** 刻度目标间距（px，§18.2：刻度间距 ≥60px） */
const TICK_MIN_PX = 60;

/** 键控缩放步进因子（+/− 键；规格只给了滚轮系数，此为实现自定——一次按键 ≈ 一档明显缩放） */
const KEY_ZOOM_FACTOR = 1.2;

/** 播放头吸附窗（px，§17.3：threshold = 8px / PPS 秒） */
const SNAP_PX = 8;

/** 修剪热区（px，§17.4"6~8px"取上限；命中判定见 geometry.findTrimEdge） */
const TRIM_HOT_PX = 8;

/** 修剪激活死区（px，与 useDragSort 的死区同参——§18.5 状态机 ②） */
const TRIM_DEAD_ZONE_PX = 4;

/** 修剪手势的进行中状态（§18.5 状态机；回调闭包可能跨越多次渲染，可变数据走 trimCtxRef） */
interface TrimGesture {
  clipId: string;
  index: number;
  edge: TrimEdge;
  startClientX: number;
  startWorldX: number;
  activated: boolean;
  cancelled: boolean;
  /** 最近一次预览的源端点值（提交用——与预览钳制同值，builder 会再钳一次） */
  lastSrcTime: number | null;
  detachEsc: () => void;
  detachDrag: () => void;
}

export default function ClipTimeline({
  clips,
  externalDrag,
  selectedId,
  onSelect,
  onReorder,
  onInsert,
  onExternalDragEnd,
  onRemove,
  onSeek,
  fps,
  pps,
  onChangePps,
  playheadElRef,
  scrollElRef,
  snapEnabled,
  onTrimStart,
  onTrimPreview,
  onTrimCommit,
  onTrimToPlayhead,
}: ClipTimelineProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // 帧时间埋点（§18.6 drag 场景）：拖拽激活时开采样、收尾时停（stop 冲掉不足一窗的余量）
  const dragSampleStop = useRef<(() => void) | null>(null);
  const onPerfReport = useCallback(
    (scene: PerfScene, s: PerfSummary) => void appendFrontendLog("debug", formatPerfLine(scene, s)),
    [],
  );
  useEffect(
    () => () => {
      dragSampleStop.current?.();
      // 卸载时手势还挂着（理论窗口极小）：只摘监听、不触发提交（pointerDrag 契约）；
      // 同时清 Workbench 融合（否则其 300ms 定时器会把陈旧预览写进导出 payload）
      trimRef.current?.detachDrag();
      trimRef.current?.detachEsc();
      onTrimPreview(null);
    },
    [onTrimPreview],
  );

  const { listRef, beginDrag, rowCls } = useDragSort(onReorder, "x", {
    boundsRef: viewportRef,
    onDropOutside: (i) => {
      const id = clips[i]?.id;
      if (id) onRemove(id);
    },
    onDragActive: (active) => {
      dragSampleStop.current?.();
      dragSampleStop.current = active ? beginFrameSampling("drag", onPerfReport) : null;
    },
  });

  /** 池拖入时的插入位置指示（目标块 index） */
  const [extIndex, setExtIndex] = useState<number | null>(null);

  // 修剪手势（M11-6 §18.5）：预览/热区悬停是本地 state（逐 move 只重渲染本组件），
  // 手势进行中状态在 ref（跨渲染读取）；预览上抛/提交经 props 回调。
  const [trimPreview, setTrimPreview] = useState<
    (TrimPreviewMsg & { edge: TrimEdge; index: number; srcTime: number; pointerX: number }) | null
  >(null);
  const [trimHot, setTrimHot] = useState<number | null>(null);
  const trimRef = useRef<TrimGesture | null>(null);
  /** 激活过的手势松手在块上会派发 click——状态机②只把"未激活松手"定义为普通点击，
   *  这里吞掉该次 click（否则每次修剪提交都会把预览区切进加工视图） */
  const suppressClickRef = useRef(false);

  // 视口实测宽：适应窗口 fit 的基础（ResizeObserver 保留，§18.2）
  const [viewportW, setViewportW] = useState(0);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      setViewportW(0);
      return;
    }
    const measure = () => setViewportW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clips.length]);

  const shortest = useMemo(
    () =>
      clips.reduce(
        (m, c) => (c.duration > 0 && (m <= 0 || c.duration < m) ? c.duration : m),
        0,
      ),
    [clips],
  );
  // 向父层桥接滚动容器（ProductPreview 的 rAF tick 做播放头跟随滚动用，§18.4）；
  // viewportRef 在空/非空时间轴间会换元素，故每次渲染后同步
  useEffect(() => {
    scrollElRef.current = viewportRef.current;
    return () => {
      scrollElRef.current = null;
    };
  });

  // 修剪预览驱动几何（§18.5 状态机 ③）：拖动中的块用预览区间重算块形与邻块位移
  //（波纹重排直接由差值法前缀和推出），文档本身松手前不动（execute 只在 pointerup）
  const effectiveDurations = useMemo(
    () =>
      clips.map((c) => {
        if (!trimPreview || trimPreview.clipId !== c.id) return c.duration;
        return trimPreview.seg
          ? Math.max(0, trimPreview.seg.end - trimPreview.seg.start)
          : c.srcDuration;
      }),
    [clips, trimPreview],
  );
  const geo = useMemo(() => buildGeometry(effectiveDurations, pps), [effectiveDurations, pps]);

  // PPS 来自页面级 state（§18.3）；ref 镜像供滚轮/按键的连续事件读最新值——连续两次
  // Ctrl+滚轮之间可能不发生渲染，读 props 会拿到陈旧值（与 undo/store 的 docRef 同模式：
  // 渲染期同步一次，本组件写入时也立即推进）。
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  // 修剪手势回调在 pointerdown 时创建、可能跨越多次渲染：块/几何/pps/吸附开关经 ref 读
  // 最新值（与 ppsRef 同模式），防止闭包拿到起手时的旧 props
  const trimCtxRef = useRef({ clips, geo, pps, snapEnabled });
  trimCtxRef.current = { clips, geo, pps, snapEnabled };
  /** 用户尚未手动缩放时 pps 跟随适应窗口（M11-1 行为的延续）；手动缩放/适应后交还控制权 */
  const autoFitRef = useRef(true);
  /** 待补偿的 scrollLeft（缩放锚点公式）：等 pps commit 后、绘制前写入（useLayoutEffect）——
   *  「先改 pps 再补偿 scroll」同帧完成、无视觉跳动（§18.3） */
  const pendingScroll = useRef<number | null>(null);

  // 布局 effect：setState 在绘制前 flush，保持 M11-1"同帧算完"的单帧绘制等价
  useLayoutEffect(() => {
    // 修剪拖动中跳过重适应：预览逐 move 改 geo.total 会把 pps 拉着重拟合（整页跟着
    // 重渲染、世界坐标在指针下泳动）；松手后随 total 变化重跑一次，"素材增删自动适应"不变
    if (!autoFitRef.current || trimPreview) return;
    const next = fitPps(viewportW, geo.total, shortest);
    if (next !== ppsRef.current) {
      ppsRef.current = next; // 与 zoomAt/zoomFit 同口径：写入时立即推进
      onChangePps(next);
    }
  }, [viewportW, geo.total, shortest, onChangePps, trimPreview]);

  /** 缩放（§18.3）：放大/缩小 factor 倍，以视口内 mouseLocalX（px）为锚——
   *  t_anchor = (scrollLeft + mouseX) / pps；pps' = clamp(pps × factor)；scroll 补偿待 commit */
  const zoomAt = useCallback(
    (factor: number, mouseLocalX: number) => {
      const el = viewportRef.current;
      if (!el || geo.total <= 0) return;
      const cur = ppsRef.current;
      const next = clampPps(cur * factor, shortest);
      if (next === cur) return; // 已在钳制边界，缩放无操作
      autoFitRef.current = false;
      // 连发滚轮同帧时 commit 未发生：pendingScroll 是 cur 档 pps 下的目标 scrollLeft，
      // 比 el.scrollLeft（上一档的旧值）新鲜——基准取前者，否则触控板连发会锚点漂移
      const base = pendingScroll.current ?? el.scrollLeft;
      pendingScroll.current = ((base + mouseLocalX) / cur) * next - mouseLocalX;
      ppsRef.current = next;
      onChangePps(next);
    },
    [geo.total, shortest, onChangePps],
  );

  /** \ 适应窗口：pps 取 fit 值并回到起点 */
  const zoomFit = useCallback(() => {
    if (geo.total <= 0) return;
    autoFitRef.current = false;
    const next = fitPps(viewportW, geo.total, shortest);
    if (next !== ppsRef.current) {
      pendingScroll.current = 0;
      ppsRef.current = next;
      onChangePps(next);
    } else {
      pendingScroll.current = null; // 同帧先 zoomAt 后 fit 的陈旧补偿不反噬
      const el = viewportRef.current;
      if (el) el.scrollLeft = 0;
    }
  }, [viewportW, geo.total, shortest, onChangePps]);

  // pps commit 后补偿 scrollLeft：布局 effect 在 DOM 按新 pps 更新之后、绘制之前执行
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || pendingScroll.current === null) return;
    el.scrollLeft = pendingScroll.current;
    pendingScroll.current = null;
  }, [pps]);

  // 滚轮（§18.3）：无 Ctrl = 横向滚动（编辑器惯例，时间轴吃掉滚轮不放行页面纵滚）；
  // Ctrl+滚轮 = 以鼠标为中心缩放。React 挂在 root 上的 onWheel 是 passive，preventDefault
  // 无效——必须原生非 passive 监听。
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const mouseX = e.clientX - el.getBoundingClientRect().left;
        zoomAt(Math.exp(-e.deltaY * 0.0015), mouseX);
      } else {
        el.scrollLeft += e.deltaY + e.deltaX;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // +/− 键：以视口中心为锚（mouseX 取半宽）；\：适应窗口（§18.3；M11-8 快捷键全表
  // 整合时如需归页级再挪）。无 Shift 的 + 是 =，一并接受。
  useHotkeys(
    (e) => {
      if (e.key === "+" || e.key === "=") zoomAt(KEY_ZOOM_FACTOR, viewportW / 2);
      else if (e.key === "-" || e.key === "_") zoomAt(1 / KEY_ZOOM_FACTOR, viewportW / 2);
      else if (e.key === "\\") zoomFit();
    },
    clips.length > 0 && geo.total > 0,
  );

  /** 点击空白/标尺 → seek：世界 x = 视口本地 x + scrollLeft（§18.3 滚动容器），线性换算；
   *  播放头吸附片段边缘（§17.3 吸附窗 8px/pps 秒，按住 Alt 临时关闭，§17.8）；
   *  x 钳进内容宽、时间钳进 [0, total]（round 舍入可能让 contentWidth 折算出半像素超尾，
   *  右端死区语义 = seek 到末尾） */
  const seekAt = (clientX: number, altKey: boolean) => {
    const el = viewportRef.current;
    if (!el || geo.total <= 0) return;
    const x = Math.min(
      geo.contentWidth,
      Math.max(0, clientX - el.getBoundingClientRect().left + el.scrollLeft),
    );
    const raw = Math.min(geo.total, geo.xToTime(x));
    onSeek(
      altKey ? raw : snapToEdge(raw, [...geo.starts, geo.total], SNAP_PX / pps),
    );
  };

  // ------------------------------------------------------------ 修剪手势（M11-6 §18.5）

  /** 屏幕 x → 世界 x（§18.3 滚动容器换算，与 seekAt 同式） */
  const worldXAt = (clientX: number): number => {
    const el = viewportRef.current;
    if (!el) return 0;
    return clientX - el.getBoundingClientRect().left + el.scrollLeft;
  };

  /** 修剪热区命中（状态机 ①）：世界 x → 全局最近块边缘，≤8px */
  const trimHitAt = (clientX: number): TrimHit | null =>
    findTrimEdge(clips.map((_, i) => geo.block(i)), worldXAt(clientX), TRIM_HOT_PX);

  /**
   * 拖动中（状态机 ③）：指针 → 源端点候选 → 关键帧吸附（Alt 旁路 / S 开关关时不吸）→
   * [`computeTrim`] 钳制（与提交共用同一实现，看到的即松手后的）→ 本地预览 + 上抛。
   * 出边拖动边界跟手；入边拖动边界被前缀和钉死（连续模型下几何上不可移动），
   * 指针位移映射为源入点增量——视觉反馈 = 块宽收缩 + tooltip（§18.5 注记披露）。
   */
  const updateTrimPreview = (ev: PointerEvent, g: TrimGesture) => {
    const ctx = trimCtxRef.current;
    const clip = ctx.clips[g.index];
    if (!clip || clip.id !== g.clipId) return;
    const blk = ctx.geo.block(g.index);
    const pointerX = Math.min(ctx.geo.contentWidth, Math.max(0, worldXAt(ev.clientX)));
    let srcTime: number;
    if (g.edge === "out") {
      // 出边：边界跟随指针，钳到不越过本块左缘；px → 成品时间 → 源内时间（§17.2 一一映射）。
      // **不钳 contentWidth**——末块右缘与 contentWidth 逐位相等，钳住就永远无法向右延伸；
      // 源端点越界交给 computeTrim 钳到源时长
      const x = Math.max(blk.left, worldXAt(ev.clientX));
      srcTime = clip.srcIn + (x - blk.left) / ctx.pps;
    } else {
      srcTime = clip.srcIn + (pointerX - g.startWorldX) / ctx.pps;
    }
    if (!ev.altKey && ctx.snapEnabled) {
      srcTime = snapToKeyframe(srcTime, clip.keyframes, SNAP_PX / ctx.pps);
    }
    const next = computeTrim(
      { start: clip.srcIn, end: clip.srcEnd },
      clip.srcDuration,
      clip.srcFps,
      g.edge,
      srcTime,
    );
    if (!next) return;
    g.lastSrcTime = g.edge === "in" ? next.start : next.end;
    setTrimPreview({
      clipId: clip.id,
      seg: next.seg,
      edge: g.edge,
      index: g.index,
      srcTime: g.lastSrcTime,
      pointerX,
    });
    onTrimPreview({ clipId: clip.id, seg: next.seg });
  };

  /** 起手（状态机 ①②）：块 pointerdown 命中热区；≥4px 激活，未激活松手 = 普通点击（选中） */
  const startTrim = (e: React.PointerEvent, index: number, edge: TrimEdge) => {
    const clip = clips[index];
    if (!clip) return;
    onTrimStart(clip.id); // 关键帧按源懒加载（Workbench，B1 缓存兜底；未到货时吸附静默降级）
    const g: TrimGesture = {
      clipId: clip.id,
      index,
      edge,
      startClientX: e.clientX,
      startWorldX: worldXAt(e.clientX),
      activated: false,
      cancelled: false,
      lastSrcTime: null,
      detachEsc: () => {},
      detachDrag: () => {},
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      g.cancelled = true; // 状态机 ⑤：Esc 丢弃并清预览；之后的 move 不再更新
      setTrimPreview(null);
      onTrimPreview(null);
    };
    window.addEventListener("keydown", onEsc);
    g.detachEsc = () => window.removeEventListener("keydown", onEsc);
    trimRef.current = g;
    // 收尾兜底走公共实现（AGENTS.md §3 第 20 条）：pointercancel / 窗口外松手都收敛
    //（pointercancel 的 last 是取消事件，提交分支按 type 识别并丢弃）；连续拖动只在
    // 松手提交一条（状态机 ⑤）
    g.detachDrag = beginPointerDrag(
      (ev) => {
        if (g.cancelled) return;
        if (!g.activated) {
          if (Math.abs(ev.clientX - g.startClientX) < TRIM_DEAD_ZONE_PX) return;
          g.activated = true;
          dragSampleStop.current?.();
          dragSampleStop.current = beginFrameSampling("drag", onPerfReport); // §18.6 drag 场景
        }
        updateTrimPreview(ev, g);
      },
      (last) => {
        g.detachEsc();
        dragSampleStop.current?.();
        dragSampleStop.current = null;
        if (
          g.activated &&
          !g.cancelled &&
          last &&
          // pointercancel 的 last 是取消事件本身（非 null）——状态机⑤要求丢弃，按 type 识别
          last.type !== "pointercancel" &&
          g.lastSrcTime !== null
        ) {
          onTrimCommit(g.clipId, g.edge, g.lastSrcTime);
        }
        if (g.activated) suppressClickRef.current = true;
        setTrimPreview(null);
        onTrimPreview(null);
        setTrimHot(null);
        if (trimRef.current === g) trimRef.current = null;
      },
    );
  };

  /** 热区悬停光标（§17.4"变左右箭头"）：只在块矩形纵向范围内生效——标尺/上下留白区
   *  保持 seek 语义与十字光标，点击不会误起修剪手势 */
  const hoverTrim = (e: React.PointerEvent) => {
    if (trimRef.current) return; // 手势中光标固定 ew-resize（由 trimPreview 分支接管）
    const first = viewportRef.current?.querySelector<HTMLElement>("[data-sort-row]");
    const r = first?.getBoundingClientRect();
    if (r && (e.clientY < r.top || e.clientY > r.bottom)) {
      setTrimHot((prev) => (prev === null ? prev : null));
      return;
    }
    const hit = trimHitAt(e.clientX);
    const hot = hit ? hit.index : null;
    setTrimHot((prev) => (prev === hot ? prev : hot));
  };

  /** 指针所在块：与渲染块矩形做最近中线命中 */
  const indexAtX = (clientX: number): number | null => {
    const blocks = viewportRef.current?.querySelectorAll<HTMLElement>("[data-sort-row]");
    if (!blocks || blocks.length === 0) return 0;
    let best = 0;
    let bestDist = Infinity;
    blocks.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(clientX - (r.left + r.width / 2));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const insideViewport = (clientX: number, clientY: number): boolean => {
    const el = viewportRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return (
      clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    );
  };

  // 池→轴跨容器拖拽：拖拽期间监听指针，落点在轴内则插入
  useEffect(() => {
    if (!externalDrag) {
      setExtIndex(null);
      return;
    }
    // 收尾兜底（窗口外松手 / pointercancel）走公共实现（BUG-003 / AGENTS.md §3 第 20 条）
    const detach = beginPointerDrag(
      (ev) => {
        setExtIndex(insideViewport(ev.clientX, ev.clientY) ? indexAtX(ev.clientX) : null);
      },
      (last) => {
        if (last && insideViewport(last.clientX, last.clientY)) {
          const idx = indexAtX(last.clientX);
          if (idx !== null) onInsert(externalDrag.clipId, idx);
        }
        onExternalDragEnd();
      },
    );
    // 卸载/依赖变化只摘监听、不触发落点处理（否则重挂载时会把上次的落点再插一遍）
    return detach;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalDrag?.clipId, clips.length]);

  // 刻度步长：≥60px 对应的秒数向上取整刻度（§18.2）；i×step 逐项相乘避免浮点累加漂移
  const step = tickStep(TICK_MIN_PX / pps);
  const ticks: number[] = [];
  for (let i = 0; i * step <= geo.total + 1e-6; i++) ticks.push(i * step);

  return (
    <div
      ref={listRef}
      className="relative select-none overflow-hidden rounded-md border border-hairline bg-panel/60"
      style={{ height: 64 }}
    >
      {clips.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-xs text-mute/70">
          时间轴为空——从片段池点击「+」加入，或拖拽片段卡到此处
        </div>
      ) : (
        <div
          ref={viewportRef}
          className="relative h-full w-full cursor-crosshair overflow-x-auto overflow-y-hidden"
          style={trimPreview ? { cursor: "ew-resize" } : undefined}
          onPointerDown={(e) => {
            if (geo.total > 0) seekAt(e.clientX, e.altKey);
          }}
          onPointerMove={hoverTrim}
        >
          {/* 世界坐标层：宽 = contentWidth，超出视口即横向滚动（§18.3）；播放头/块/刻度
              全部世界坐标定位，随内容滚动、无补偿计算 */}
          <div className="relative h-full" style={{ width: geo.contentWidth }}>
            {/* 刻度（世界坐标；标签 = 总帧数时间码 §17.3/§18.5） */}
            {ticks.map((t, i) => (
              <span
                key={i}
                className="pointer-events-none absolute bottom-0 w-px bg-hairline/60"
                style={{ left: geo.timeToX(t), height: "35%" }}
              >
                {t > 0 && t < geo.total - 1e-6 && (
                  <span className="absolute bottom-1 left-1 whitespace-nowrap font-mono text-[9px] text-mute/80">
                    {formatTimecode(t, fps)}
                  </span>
                )}
              </span>
            ))}

            {/* 片段块：边缘 ≤8px 热区 = 修剪手势（与拖拽重排互斥，§18.5 状态机）；
                整块可拖（M9-4），点击选中；双击边缘 = 修剪到播放头；位置/宽度 = geometry 差值法 */}
            {clips.map((c, i) => {
              const r = geo.block(i);
              const shownDur =
                trimPreview && trimPreview.clipId === c.id
                  ? trimPreview.seg
                    ? trimPreview.seg.end - trimPreview.seg.start
                    : c.srcDuration
                  : c.duration;
              return (
                <div
                  key={c.id}
                  data-sort-row
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    suppressClickRef.current = false; // click 未派发时兜底复位，防吞后续真实点击
                    // 右键/中键不起手势（与 useDragSort 同门禁）；手势进行中忽略第二指针
                    if (e.button !== 0 || trimRef.current) return;
                    const hit = trimHitAt(e.clientX);
                    if (hit && hit.index === i) {
                      startTrim(e, i, hit.edge);
                      return;
                    }
                    beginDrag(e, i);
                  }}
                  onDoubleClick={(e) => {
                    const hit = trimHitAt(e.clientX);
                    if (hit && hit.index === i) onTrimToPlayhead(c.id, hit.edge);
                  }}
                  onClick={() => {
                    // 激活过的修剪手势松手在块上派发的 click 不算选择（状态机②：未激活松手
                    // 才是普通点击），吞掉防"每修一次就切进加工视图"
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    onSelect(c.id);
                  }}
                  title={c.detail ? `${c.label}\n${c.detail}` : c.label}
                  className={`group absolute bottom-1.5 top-1 flex touch-none cursor-grab flex-col justify-center overflow-hidden rounded border px-1.5 transition-colors ${rowCls(i)} ${
                    c.id === selectedId
                      ? "border-signal/70 bg-signal/15"
                      : "border-hairline bg-panel hover:border-mute/60"
                  }`}
                  style={{
                    left: r.left,
                    width: r.width,
                    zIndex: 1,
                    cursor: trimHot === i ? "ew-resize" : undefined,
                  }}
                >
                  <span className="truncate text-[10px] leading-tight text-paper">{c.label}</span>
                  <span className="flex items-center gap-1">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        c.lossless === null
                          ? "bg-mute/50"
                          : c.lossless
                            ? "bg-signal"
                            : "bg-warn"
                      }`}
                    />
                    <span className="truncate font-mono text-[9px] text-mute">
                      {shownDur > 0 ? `${shownDur.toFixed(1)}s` : "…"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(c.id);
                    }}
                    aria-label={`从时间轴移除 ${c.label}`}
                    className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded text-mute hover:bg-warn/20 hover:text-warn focus:outline-none group-hover:flex"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}

            {/* 池拖入的插入指示线：贴目标块左缘（或末块右缘 = 世界宽） */}
            {extIndex !== null && (
              <span
                className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-signal"
                style={{
                  left: extIndex < clips.length ? geo.block(extIndex).left : geo.contentWidth,
                }}
              />
            )}

            {/* 修剪预览 tooltip（§17.4）：新端点总帧数时间码 + 新时长 + copy/transcode 徽标
                （徽标随 check_pipeline 防抖回包实时变化，§18.5 状态机 ③） */}
            {trimPreview &&
              (() => {
                const blk = geo.block(trimPreview.index);
                const c = clips[trimPreview.index];
                // 手势期间文档可能被并发改掉（Delete 等）：下标易主就不再显示
                if (!c || c.id !== trimPreview.clipId) return null;
                const x = trimPreview.edge === "out" ? blk.left + blk.width : trimPreview.pointerX;
                const dur = trimPreview.seg
                  ? trimPreview.seg.end - trimPreview.seg.start
                  : c.srcDuration;
                return (
                  <span
                    className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 whitespace-nowrap rounded border border-hairline bg-panel px-1.5 py-0.5 font-mono text-[9px] text-paper"
                    style={{ left: x }}
                  >
                    {trimPreview.edge === "in" ? "入" : "出"}{" "}
                    {formatTimecode(trimPreview.srcTime, c.srcFps || fps)} · 时长{" "}
                    {formatTime(Math.max(0, dur), false)}
                    {c.lossless === null ? "" : c.lossless ? " · 无损" : " · 重编码"}
                  </span>
                );
              })()}

            {/* 播放头（M11-3 §18.4 脱离 React）：位置由 rAF tick / 离散同步 effect 直写
                transform，本组件渲染不再管它——注册 DOM 供 ProductPreview 直写 */}
            <span
              ref={(el) => {
                playheadElRef.current = el;
              }}
              className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-px bg-paper/80"
            >
              <span className="absolute -top-px left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-paper/80" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
