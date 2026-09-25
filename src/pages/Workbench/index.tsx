/**
 * 工作台（DESIGN §3.8 / §9.8 v0.3 = 2.0 布局）：
 * 素材卡片 → 剪切成片段 → 片段池 → 合成时间轴编排 → 合成一个成品。
 * 三层数据模型：SourceFile（素材）/ Clip（片段 = 后端一个 PipelineItem）/ timeline（成品顺序）。
 *
 * R2-1：按职责拆为同目录多文件（Header / Footer / ClipPool / BatchBar / SourceCards /
 * CutModeView / EditModeView / shared）；**本文件只保留编排**
 * （state / effects / handlers / derived / 组装），无行为变化。
 * R2-2：TimeField 收敛至 components/TimeField、useProxyPreview 提升至 hooks/，其余收敛见 PLAN R2-2。
 */
import { Film, Scissors, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ClipTimeline, { type TimelineClip } from "../../components/ClipTimeline";
import { PPS_MIN } from "../../components/ClipTimeline/geometry";
import ProductPreview, { type ProductEntry } from "../../components/ProductPreview";
import { NO_ROTATE, type RotateState } from "../../components/RotateControls";
import { usePlaybackHotkeys } from "../../hooks/usePlaybackHotkeys";
import { useHotkeys } from "../../hooks/useHotkeys";
import {
  appendFrontendLog,
  checkPipeline,
  confirmDialog,
  fileExists,
  generateClipThumbnails,
  generateThumbnails,
  listKeyframes,
  pickVideos,
  probeMedia,
  submitTask,
} from "../../services/tauri";
import type {
  AppSettings,
  Clip,
  EnvironmentInfo,
  MediaInfo,
  PageName,
  PipelineCheck,
  PipelineItem,
  QualityPreset,
} from "../../types";
import { moveAt } from "../../utils/array";
import { cropToPx } from "../../utils/crop";
import { wantsProxy } from "../../utils/media";
import { basename, resolveOutputDir, resolveUniqueTarget } from "../../utils/paths";
import { createSpanRecorder, formatPerfLine } from "../../utils/perf";
import { formatTime } from "../../utils/time";
import {
  buildAppendToTimeline,
  buildComposite,
  buildCreateClip,
  buildInsert,
  buildReorder,
  buildRemoveFromTimeline,
  buildSplit,
  buildTrim,
  DEFAULT_FPS,
  exportSegmentOf,
  productDurationOf,
  type TrimEdge,
} from "../../utils/undo/commands";
import { useUndoStack } from "../../utils/undo/store";
import type { BuildCtx, CommandBuilder, EditorDoc } from "../../utils/undo/types";
import { BatchBar } from "./BatchBar";
import { ClipPool } from "./ClipPool";
import { CutModeView } from "./CutModeView";
import { EditModeView } from "./EditModeView";
import { WorkbenchFooter } from "./Footer";
import { WorkbenchHeader } from "./Header";
import {
  displayedDims,
  freshId,
  newClipOf,
  type ClipEdit,
  type PreviewMode,
  type SourceFile,
} from "./shared";
import { SourceCards } from "./SourceCards";

export default function WorkbenchPage({
  settings,
  env,
  onNavigate,
  initialFiles,
  onUpdateSettings,
}: {
  settings: AppSettings;
  /** FFmpeg 环境状态（App 启动检测；落地页头部展示） */
  env: EnvironmentInfo | null;
  onNavigate: (page: PageName) => void;
  initialFiles?: string[] | null;
  /** 设置项写回（M11-6：S 键切换关键帧吸附 write-through，决策 #30 同源切换） */
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}) {
  const [files, setFiles] = useState<SourceFile[]>([]);
  /**
   * 文档状态收敛为单一 `EditorDoc`（plans/M11.md §18.1）：`clips`（池序 = 创建序）+
   * `timeline`（成品顺序）是**唯一可撤销**的部分。UI 状态（mode/playhead/check…）各自 useState；
   * 旁路状态（`files`、片段的 rot/crop/lockRatio）不入栈，直接经 `applyRaw` 改文档。
   */
  const [doc, setDoc] = useState<EditorDoc>({ clips: [], timeline: [] });
  const { clips, timeline } = doc;
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<PreviewMode>({ type: "product" });
  const [check, setCheck] = useState<PipelineCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState("workbench.mp4");
  const [quality, setQuality] = useState<QualityPreset>(settings.quality);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 池 → 时间轴的跨容器拖拽（M6-3） */
  const [extDrag, setExtDrag] = useState<{ clipId: string } | null>(null);
  // 成品连播（M6-6）：播放头（成品内秒）与播放状态在页面层持有，与时间轴播放头联动
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seekReq, setSeekReq] = useState<{ t: number; nonce: number } | null>(null);
  const seekNonce = useRef(0);
  // 时间轴 PPS（M11-2，plans/M11.md §18.3 页面级 state）：初始 PPS_MIN，ClipTimeline 在
  // 用户手动缩放（滚轮/+/−/\）前自动跟随适应窗口（M11-1 行为延续）；M11-3 播放头路径
  // 需要在此读 pps 的 ref 镜像。
  const [pps, setPps] = useState(PPS_MIN);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;

  // 时间轴块选中（M11-4，§17.4 选择）：独立 UI state，不入撤销栈。块点击 = 选中 + 进加工
  // 视图（加工的直达入口；M11-8 右键「加工」菜单落地后点击是否仍切模式再裁）；点空白取消。
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // 修剪预览融合（M11-6 §18.5 状态机 ③）：手势逐 move 只进 ref（不逐帧重渲染页面），
  // 300ms 尾随防抖后进 state → payload 融合 → check_pipeline（徽标实时）；null = 手势结束
  const [trimPreviewSeg, setTrimPreviewSeg] = useState<{
    clipId: string;
    seg: { start: number; end: number } | null;
  } | null>(null);
  const trimPreviewRef = useRef(trimPreviewSeg);
  const trimPreviewTimer = useRef<number | null>(null);
  const onTrimPreview = useCallback(
    (p: { clipId: string; seg: { start: number; end: number } | null } | null) => {
      trimPreviewRef.current = p;
      if (trimPreviewTimer.current !== null) {
        window.clearTimeout(trimPreviewTimer.current);
        trimPreviewTimer.current = null;
      }
      if (p === null) {
        setTrimPreviewSeg(null); // 提交 / Esc / pointercancel：立即清除融合
        return;
      }
      trimPreviewTimer.current = window.setTimeout(() => {
        trimPreviewTimer.current = null;
        setTrimPreviewSeg(trimPreviewRef.current);
      }, 300);
    },
    [],
  );
  useEffect(
    () => () => {
      if (trimPreviewTimer.current !== null) window.clearTimeout(trimPreviewTimer.current);
    },
    [],
  );

  // 源关键帧懒加载（M11-6 §18.5 状态机 ④）：修剪手势起手时按源拉取一次（后端 B1 缓存）；
  // 失败记为空数组防反复请求（吸附静默降级为不吸附）
  const [keyframesBySource, setKeyframesBySource] = useState<Record<string, number[]>>({});
  const keyframesLoadingRef = useRef<Set<string>>(new Set());

  // 播放头渲染路径（M11-3，plans/M11.md §18.4）：权威播放头是 ref——ProductPreview 的
  // rAF tick 每帧直写它与时间轴播放头 DOM 的 transform（整条路径 0 个 setState）；
  // React 的 playhead state 降频为离散镜像（pause/seek/段切换/结束），供时间读数与导出逻辑。
  const playheadRef = useRef(0);
  const playheadElRef = useRef<HTMLElement | null>(null);
  const timelineScrollRef = useRef<HTMLElement | null>(null);
  /** 播放头 transform 直写（§18.4）：ref → DOM。离散汇与 seek 在事件内直接调（state 同值
   *  bail-out 时不靠 effect），effect 只兜 pps 变化与离散 state 变化（span 重挂载等） */
  const writePlayheadTransform = useCallback(() => {
    const el = playheadElRef.current;
    if (el) el.style.transform = `translateX(${playheadRef.current * ppsRef.current}px)`;
  }, [playheadElRef, ppsRef]);
  /** 离散播放头汇（ProductPreview 回调）：同步 ref 与 state，随后由下方 effect 重写 transform */
  const onPlayheadDiscrete = useCallback(
    (t: number) => {
      playheadRef.current = t;
      setPlayhead(t);
      writePlayheadTransform();
    },
    [writePlayheadTransform],
  );
  // 离散 state 变化（seek/暂停/段切换/结束/复位）与 pps 变化时重写一次 transform；
  // 播放中的每帧由 tick 直写——两路写同一属性，互不冲突。事件路径已在离散汇/seek 内
  // 直写（防 state 同值 bail-out 漏写）；本 effect 兜 pps 变化（span 裸重挂载不经 effect，
  // 由 auto-fit 改 pps / 离散汇连带覆盖）
  useEffect(() => {
    writePlayheadTransform();
  }, [playhead, pps, writePlayheadTransform]);
  // 批量能力（M6-8 = 原 M4-4）：素材多选 → 一键建片段 / 批量应用旋转
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [batchRot, setBatchRot] = useState<RotateState>(NO_ROTATE);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  // 片段起点帧缩略图（M6-8）：key = `${path}@${time.toFixed(2)}`
  const [clipThumbs, setClipThumbs] = useState<Record<string, string>>({});
  const requestedThumbsRef = useRef<Set<string>>(new Set());

  const fileById = useCallback((id: string) => files.find((f) => f.id === id), [files]);
  const clipById = useCallback((id: string) => clips.find((c) => c.id === id), [clips]);
  const clipSource = useCallback((c: Clip) => fileById(c.sourceId), [fileById]);
  // 片段成品时长：唯一实现 = 命令层的 productDurationOf（R2-2 收敛，源未探测按 0）
  const clipDuration = useCallback(
    (c: Clip) => productDurationOf(c.seg, clipSource(c)?.info?.durationSec ?? null),
    [clipSource],
  );
  // 片段起点帧缩略图缓存 key（M6-8）
  const clipThumbKey = useCallback(
    (c: Clip) => {
      const src = clipSource(c);
      const t = c.seg ? c.seg.start : 0;
      return src ? `${src.path}@${t.toFixed(2)}` : "";
    },
    [clipSource],
  );

  /** 修剪手势起手（M11-6 §18.5 状态机 ④）：按片段的源懒加载关键帧（B1 缓存兜底） */
  const onTrimStart = useCallback(
    (clipId: string) => {
      const clip = clips.find((c) => c.id === clipId);
      const src = clip ? fileById(clip.sourceId) : null;
      if (!src || !src.info) return;
      if (keyframesBySource[src.id] || keyframesLoadingRef.current.has(src.id)) return;
      keyframesLoadingRef.current.add(src.id);
      listKeyframes(src.path)
        .then((list) => setKeyframesBySource((prev) => ({ ...prev, [src.id]: list })))
        .catch(() => setKeyframesBySource((prev) => ({ ...prev, [src.id]: [] })))
        .finally(() => {
          keyframesLoadingRef.current.delete(src.id);
        });
    },
    [clips, fileById, keyframesBySource],
  );

  /** 命令层上下文（plans/M11.md §18.1）：钳制用的源参数 + id 分配 */
  const buildCtx: BuildCtx = useMemo(
    () => ({
      source: (clipId: string) => {
        const clip = clips.find((c) => c.id === clipId);
        const info = clip ? fileById(clip.sourceId)?.info : null;
        return info ? { fps: info.video.frameRate, durationSec: info.durationSec } : null;
      },
      newId: () => freshId("clip"),
    }),
    [clips, fileById],
  );

  /**
   * 撤销栈基座（TIMELINE.md §17.5）：片段 / 时间轴的结构操作全部经 `execute(builder)` 提交，
   * 一次手势 = 一条撤销记录；加工编辑（rot/crop）与素材增删走 `applyRaw`（旁路状态，不入栈）。
   * Ctrl+Z / Ctrl+Shift+Z 的按键接线归 M11-7（本次只落基座，现有行为不变）。
   */
  const { execute: executeRaw, applyRaw } = useUndoStack({ doc, setDoc, ctx: buildCtx });

  // 帧时间埋点（plans/M11.md §18.6 undo 场景）：结构操作经 performance.now span 采样，
  // 5s 窗口汇总落 logger debug（M11-9 验收取数）；undo/redo 按键归 M11-7 接线，届时同包 span。
  const undoPerf = useMemo(
    () =>
      createSpanRecorder("undo", (scene, s) =>
        void appendFrontendLog("debug", formatPerfLine(scene, s)),
      ),
    [],
  );
  const execute = useCallback(
    (builder: CommandBuilder) => undoPerf.span(() => executeRaw(builder)),
    [executeRaw, undoPerf],
  );

  const addFiles = useCallback(async (paths: string[]) => {
    setFiles((prev) => {
      const fresh = paths
        .filter((p) => !prev.some((f) => f.path === p))
        .map((p) => ({ id: freshId("src"), path: p, info: null, probeError: null }));
      return [...prev, ...fresh];
    });
    // 逐个探测媒体信息（顺序即可，文件数通常不多）
    for (const p of paths) {
      try {
        const mi = await probeMedia(p);
        setFiles((prev) => prev.map((f) => (f.path === p ? { ...f, info: mi } : f)));
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) => (f.path === p ? { ...f, probeError: String(err) } : f)),
        );
      }
    }
  }, []);

  // 拖拽导入：每次新的拖入都追加（App 层原地分发；addFiles 内部去重）
  const consumedInitialRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (!initialFiles || initialFiles === consumedInitialRef.current) return;
    consumedInitialRef.current = initialFiles;
    void addFiles(initialFiles);
  }, [initialFiles, addFiles]);

  const openFiles = useCallback(async () => {
    const picked = await pickVideos();
    if (picked.length > 0) void addFiles(picked);
  }, [addFiles]);

  // 素材缩略图（缓存命中时接近即时）
  useEffect(() => {
    if (files.length === 0) return;
    let alive = true;
    generateThumbnails(files.map((f) => f.path))
      .then((list) => {
        if (!alive) return;
        setThumbs((prev) => {
          const next = { ...prev };
          for (const t of list) next[t.input] = t.thumbPath;
          return next;
        });
      })
      .catch(() => {
        /* 缩略图失败不阻塞 */
      });
    return () => {
      alive = false;
    };
  }, [files]);

  // ---------- 素材操作 ----------
  const reorderSources = useCallback((from: number, to: number) => {
    if (from === to) return;
    setFiles((prev) => moveAt(prev, from, to));
  }, []);

  const removeSource = useCallback(
    async (file: SourceFile) => {
      const ownedIds = new Set(
        clips.filter((c) => c.sourceId === file.id).map((c) => c.id),
      );
      if (ownedIds.size > 0) {
        const ok = await confirmDialog(
          `删除素材「${basename(file.path)}」将同时移除它的 ${ownedIds.size} 个片段（含时间轴中的位置）。`,
          "删除素材",
        );
        if (!ok) return;
      }
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      // 素材增删本身不可撤销（plans/M11.md §18.1 旁路状态），它联动删掉的片段也只能直接改文档：
      // 否则会留下"片段还在、素材没了"的文档 → 导出映射出空 input。
      applyRaw((d) => ({
        clips: d.clips.filter((c) => c.sourceId !== file.id),
        timeline: d.timeline.filter((id) => !ownedIds.has(id)),
      }));
      setMode((m) =>
        (m.type === "cut" && m.sourceId === file.id) ||
        (m.type === "edit" && ownedIds.has(m.clipId))
          ? { type: "product" }
          : m,
      );
      setCheck(null);
    },
    [clips, applyRaw],
  );

  // 片段起点帧缩略图（M6-8）：对有入点的片段取其入点帧，全段片段取 0s
  useEffect(() => {
    const reqs: { input: string; timeSec: number }[] = [];
    for (const c of clips) {
      const src = clipSource(c);
      if (!src) continue;
      const t = c.seg ? c.seg.start : 0;
      const key = `${src.path}@${t.toFixed(2)}`;
      if (clipThumbs[key] || requestedThumbsRef.current.has(key)) continue;
      requestedThumbsRef.current.add(key);
      reqs.push({ input: src.path, timeSec: t });
    }
    if (reqs.length === 0) return;
    let alive = true;
    void generateClipThumbnails(reqs)
      .then((list) => {
        if (!alive) return;
        setClipThumbs((prev) => {
          const next = { ...prev };
          for (const t of list) {
            next[`${t.input}@${t.timeSec.toFixed(2)}`] = t.thumbPath;
          }
          return next;
        });
      })
      .catch(() => {
        /* 缩略图失败不阻塞 */
      });
    return () => {
      alive = false;
    };
  }, [clips, clipThumbs, clipThumbKey, clipSource]);

  // ---------- 片段操作 ----------
  /** 剪出片段并接入轴末尾（id 由命令层在构建时分配 → 重做复现同一 id） */
  const addClip = useCallback(
    (sourceId: string, seg: Clip["seg"]) => {
      execute(buildCreateClip(newClipOf(sourceId, seg)));
      setCheck(null);
    },
    [execute],
  );

  /** 加工编辑（旋转/裁剪/锁比例）：旁路状态，直接改文档、不入撤销栈（plans/M11.md §18.1） */
  const updateClip = useCallback(
    (id: string, patch: ClipEdit) => {
      applyRaw((d) => ({
        ...d,
        clips: d.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
      setCheck(null);
    },
    [applyRaw],
  );

  /**
   * 波纹删除（M11-4，§18.5）：块 ✕ / 拖出时间轴 / Delete 键统一走 `buildRemoveFromTimeline`
   * ——**只出轴、池保留库存**（决策 #13；行为变更：M11-0 前是同时出池）。可撤销（走命令栈，
   * Ctrl+Z 接线归 M11-7）。
   */
  const removeFromTimeline = useCallback(
    (id: string) => {
      execute(buildRemoveFromTimeline(id));
      // 同步清选（与 deleteFromPool 一致）：片段仍在池里，但轴上高亮必须立即消失
      setSelectedClipId((s) => (s === id ? null : s));
      setCheck(null);
    },
    [execute],
  );

  /**
   * 池卡 ✕ = 真删（M11-4）：直接改文档不经栈、不可逆——直接依据是 §18.5 正文
   * 「池卡 ✕ 才是真删」，联动清轴上残留项（否则导出映射出空 input，同素材删除口径）。
   * 可撤销的删除用右键「移除并删除池片段」（复合命令，M11-8 接菜单）。
   */
  const deleteFromPool = useCallback(
    (id: string) => {
      applyRaw((doc) => ({
        clips: doc.clips.filter((c) => c.id !== id),
        timeline: doc.timeline.filter((cid) => cid !== id),
      }));
      setMode((m) => (m.type === "edit" && m.clipId === id ? { type: "product" } : m));
      setSelectedClipId((s) => (s === id ? null : s));
      setCheck(null);
    },
    [applyRaw],
  );

  const reorderTimeline = useCallback(
    (from: number, to: number) => {
      execute(buildReorder(from, to));
      // 与其余结构操作同口径：旧 check.items 按下标映射，重排后立即失效
      setCheck(null);
    },
    [execute],
  );

  /**
   * 成品时间 → 命中片段与前缀偏移（M11-5 前缀和命中的共用形态：切割 / 修剪到播放头
   * 同源；与 buildSplit 内部的 offset 求和同式同源——同用 `productDurationOf` 同序累加，
   * 浮点逐位一致）。
   */
  const locateProduct = useCallback(
    (t: number): { clip: Clip; offset: number } | null => {
      let acc = 0;
      for (const id of timeline) {
        const clip = clips.find((c) => c.id === id);
        if (!clip) continue;
        const dur = clipDuration(clip);
        if (t < acc + dur) return { clip, offset: acc };
        acc += dur;
      }
      return null;
    },
    [timeline, clips, clipDuration],
  );

  /**
   * C 键切割（M11-5，§17.2/§18.5）：播放头处一刀两段，**成品时间**直接交给 builder——
   * 源内换算与"距边缘不足最短时长 / 不在片段上判 no-op"都在 builder 内；
   * 右键菜单入口归 M11-8（届时命中检测抽 geometry 勿复制）。
   */
  const splitAtPlayhead = useCallback(() => {
    const hit = locateProduct(playheadRef.current);
    if (!hit) return; // 播放头不在任何片段上（含恰好压边）→ 不动（builder 亦会判 no-op）
    execute(buildSplit(hit.clip.id, playheadRef.current));
    setCheck(null);
  }, [locateProduct, execute]);

  /**
   * 修剪提交（M11-6 §18.5 状态机 ⑤）：源内时间已由手势预钳制（computeTrim 同实现），
   * builder 再钳一次（幂等）并入栈一条；检测缓存立即失效。
   */
  const onTrimCommit = useCallback(
    (clipId: string, edge: TrimEdge, srcTime: number) => {
      execute(buildTrim(clipId, edge, srcTime));
      setCheck(null);
    },
    [execute],
  );

  /** 双击边缘 = 修剪到播放头（§17.4）：播放头在该片段内才生效，源内换算同 §17.2 */
  const onTrimToPlayhead = useCallback(
    (clipId: string, edge: TrimEdge) => {
      const t = playheadRef.current;
      const hit = locateProduct(t);
      if (!hit || hit.clip.id !== clipId) return;
      execute(buildTrim(clipId, edge, (hit.clip.seg?.start ?? 0) + (t - hit.offset)));
      setCheck(null);
    },
    [locateProduct, execute],
  );

  /** 池「+」加入时间轴末尾（已在轴上 = 无操作，保持既有语义） */
  const appendToTimeline = useCallback(
    (clipId: string) => {
      execute(buildAppendToTimeline(clipId));
    },
    [execute],
  );

  /** 池拖入/块拖动插入：已在轴内 = 移动，否则插入（M6-3） */
  const insertToTimeline = useCallback(
    (clipId: string, index: number) => {
      execute(buildInsert(clipId, index));
    },
    [execute],
  );

  // ---------- 批量能力（M6-8 = 原 M4-4） ----------
  const toggleSourceSelect = useCallback((id: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const batchAddClips = useCallback(() => {
    const targets = files.filter((f) => selectedSources.has(f.id) && f.info);
    if (targets.length === 0) return;
    // 一次手势 = 一条撤销记录：N 个片段用 composite 合成
    execute(
      buildComposite(
        `批量剪出 ${targets.length} 个片段`,
        targets.map((f) => buildCreateClip(newClipOf(f.id, null))),
      ),
    );
    setCheck(null);
    setBatchMsg(`已为 ${targets.length} 个素材各建全段片段并入轴`);
    setSelectedSources(new Set());
    window.setTimeout(() => setBatchMsg(null), 2500);
  }, [files, selectedSources, execute]);

  const applyBatchRot = useCallback(() => {
    const targets = clips.filter((c) => selectedSources.has(c.sourceId));
    if (targets.length === 0) {
      setBatchMsg("选中素材没有片段");
      window.setTimeout(() => setBatchMsg(null), 2500);
      return;
    }
    // 加工编辑是旁路状态：不入撤销栈
    applyRaw((d) => ({
      ...d,
      clips: d.clips.map((c) =>
        selectedSources.has(c.sourceId) ? { ...c, rot: batchRot, crop: null } : c,
      ),
    }));
    setCheck(null);
    setBatchMsg(
      `已把 ${batchRot.deg}°${batchRot.hflip ? "+水平翻转" : ""}${batchRot.vflip ? "+垂直翻转" : ""} 应用到 ${targets.length} 个片段`,
    );
    window.setTimeout(() => setBatchMsg(null), 2500);
  }, [clips, selectedSources, batchRot, applyRaw]);

  // ---------- 导出链路（timeline → PipelineItem[]） ----------
  const timelineClips = useMemo(
    () => timeline.map((id) => clipById(id)).filter((c): c is Clip => !!c),
    [timeline, clipById],
  );

  const payload = useMemo<PipelineItem[]>(
    () =>
      timelineClips.map((c) => {
        const info = clipSource(c)?.info ?? null;
        const dims = info ? displayedDims(info, c.rot) : { w: 0, h: 0 };
        const px = c.crop ? cropToPx(c.crop, dims) : null;
        // 修剪预览融合（M11-6 §18.5 状态机 ③）：拖动中的片段用预览区间出检测
        //（提交前徽标实时反映 copy/transcode）
        const seg =
          trimPreviewSeg && trimPreviewSeg.clipId === c.id ? trimPreviewSeg.seg : c.seg;
        return {
          input: clipSource(c)?.path ?? "",
          segment: exportSegmentOf(seg),
          rotateDeg: c.rot.deg,
          hflip: c.rot.hflip,
          vflip: c.rot.vflip,
          crop:
            px && px.w >= 16 && px.h >= 16
              ? { x: px.x, y: px.y, width: px.w, height: px.h }
              : null,
          outWidth: null,
          outHeight: null,
        };
      }),
    [timelineClips, clipSource, trimPreviewSeg],
  );

  const allProbed =
    timelineClips.length > 0 && timelineClips.every((c) => clipSource(c)?.info);
  const hasProbeError = files.some((f) => f.probeError);

  // 导出前检测（防抖 500ms；时间轴片段全部探测完成后才请求）
  useEffect(() => {
    if (!allProbed || hasProbeError) {
      setCheck(null);
      setCheckError(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      setCheck(null);
      setCheckError(null);
      checkPipeline(payload)
        .then((c) => {
          if (alive) setCheck(c);
        })
        .catch((err: unknown) => {
          if (alive) setCheckError(String(err));
        });
    }, trimPreviewSeg !== null ? 0 : 500); // 修剪预览的融合更新已过 300ms 尾随防抖，不再叠加
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [payload, allProbed, hasProbeError, trimPreviewSeg]);

  // 输出位置：默认输出目录优先，否则跟随首个源文件目录（DESIGN §12）
  const firstSourcePath = timelineClips[0]
    ? clipSource(timelineClips[0])?.path
    : undefined;
  const outputDir = resolveOutputDir(
    firstSourcePath ?? files[0]?.path ?? "",
    settings.defaultOutputDir,
  );

  const startExport = async () => {
    if (timelineClips.length === 0 || !outputDir || !outputName.trim() || hasProbeError) return;
    setSubmitting(true);
    setError(null);
    try {
      const dir = outputDir.replace(/[\\/]+$/, "");
      const name = outputName.trim();
      // 同名才追加时间戳（DESIGN 决策 #19）：目标已存在时自动改名防覆盖
      const target = await resolveUniqueTarget(dir, name, fileExists);
      await submitTask({
        type: "pipeline",
        items: payload,
        output: target,
        quality,
        encoder: settings.encoder === "auto" ? null : settings.encoder,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // 页脚检测汇总一行（§9.8：细节由块/卡徽标 hover 承载）
  const checkSummary = !allProbed
    ? timelineClips.length === 0
      ? null
      : "正在读取媒体信息…"
    : hasProbeError
      ? "⚠ 有素材读取失败，请先移除无法识别的文件"
      : checkError
        ? `⚠ 检测失败：${checkError}`
        : check
          ? check.allLossless
            ? "✓ 全程无损"
            : `⚠ ${check.items.filter((c) => !c.copy).length} 个片段需重编码${
                check.warnings.length > 0 ? ` · ${check.warnings.length} 条参数统一提示` : ""
              }`
          : "正在检测处理方式…";

  // 时间轴/池卡的徽标数据（check.items 与 payload 按下标一一对应）
  const clipCheck = useCallback(
    (clipId: string) => {
      const i = timeline.indexOf(clipId);
      return i >= 0 ? (check?.items[i] ?? null) : null;
    },
    [timeline, check],
  );

  const totalDuration = timelineClips.reduce((s, c) => s + clipDuration(c), 0);

  const tlClips: TimelineClip[] = timelineClips.map((c) => {
    const src = clipSource(c);
    const chk = clipCheck(c.id);
    const info = src?.info ?? null;
    return {
      id: c.id,
      label: `${src ? basename(src.path) : "?"} ${
        c.seg ? `${formatTime(c.seg.start, false)}–${formatTime(c.seg.end, false)}` : "全段"
      }`,
      duration: clipDuration(c),
      lossless: chk ? chk.copy : null,
      detail: chk && !chk.copy ? chk.reasons.join("；") : undefined,
      // 修剪（M11-6）：源内区间/时长/帧率取自文档真实值（预览换算与钳制的基准，
      // 与 buildTrim 所见逐位一致）；keyframes 按源懒加载
      srcIn: c.seg?.start ?? 0,
      srcEnd: c.seg?.end ?? info?.durationSec ?? 0,
      srcDuration: info?.durationSec ?? 0,
      srcFps: info?.video.frameRate ?? 0,
      keyframes: keyframesBySource[c.sourceId],
    };
  });

  /** 时间码帧率（刻度标签，§17.3 总帧数时间码）：轴上首个片段的源帧率，缺省 30（undo 层同口径） */
  const timelineFps = useMemo(() => {
    for (const c of timelineClips) {
      const fps = clipSource(c)?.info?.video.frameRate;
      if (fps && fps > 0) return fps;
    }
    return DEFAULT_FPS;
  }, [timelineClips, clipSource]);

  // 选中清理：选中片段离开时间轴（波纹删除/池真删）后取消高亮（池里还在也不高亮轴外片段）
  useEffect(() => {
    if (selectedClipId && !timeline.includes(selectedClipId)) setSelectedClipId(null);
  }, [timeline, selectedClipId]);
  const proxyEnabled = (info: MediaInfo | null) =>
    !!info && wantsProxy(info, settings.proxyMode);

  // ---------- 成品连播（M6-6） ----------
  const productEntries = useMemo<ProductEntry[]>(() => {
    let acc = 0;
    return timelineClips.map((c) => {
      const info = clipSource(c)?.info ?? null;
      const dur = clipDuration(c);
      const entry: ProductEntry = {
        clipId: c.id,
        sourcePath: clipSource(c)?.path ?? "",
        srcStart: c.seg?.start ?? 0,
        srcEnd: c.seg?.end ?? info?.durationSec ?? 0,
        productStart: acc,
        rot: c.rot,
        crop: c.crop,
        dims: info ? displayedDims(info, c.rot) : { w: 16, h: 9 },
        proxy: !!info && wantsProxy(info, settings.proxyMode),
      };
      acc += dur;
      return entry;
    });
  }, [timelineClips, clipSource, clipDuration, settings.proxyMode]);

  const productSeek = useCallback(
    (t: number) => {
      playheadRef.current = t;
      setPlayhead(t);
      writePlayheadTransform();
      seekNonce.current += 1;
      setSeekReq({ t, nonce: seekNonce.current });
    },
    [playheadRef, writePlayheadTransform],
  );

  // 快捷键（M4-3，成品模式）：走带共用块见 usePlaybackHotkeys；页面专属：Delete 波纹删除。
  // Delete/Backspace 波纹删除选中片段（§17.4/§17.8，无模式限制——时间轴全模式可见）；
  // 选中为 M11-4 的独立 UI state，未选中时不挂监听（enabled 参，激活门控见 useHotkeys）
  usePlaybackHotkeys({
    enabled: mode.type === "product",
    currentTime: playhead,
    getCurrentTime: () => playheadRef.current,
    maxT: totalDuration,
    onTogglePlay: () => setPlaying((p) => !p),
    onSeek: productSeek,
  });
  useHotkeys(
    (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && !e.repeat && selectedClipId) {
        removeFromTimeline(selectedClipId);
      }
    },
    !!selectedClipId,
  );
  // C 键切割（M11-5，§17.4 / 决策 #30）：播放头处一刀两段；右键菜单入口归 M11-8。
  // 播放头不在片段上 / 距边缘 <1 帧时 builder 判 no-op 不入栈；带修饰键的 C（Ctrl+C 等）
  // 不触发（切割是入栈操作，M11-7 前无键盘撤销出口，防误触）
  useHotkeys(
    (e) => {
      if (
        (e.key === "c" || e.key === "C") &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        splitAtPlayhead();
      }
    },
    mode.type === "product" && timeline.length > 0,
  );

  // S 键切换关键帧吸附（M11-6，§17.4 / 决策 #30）：与设置项同源 write-through（App 持久化；
  // 剪切页 Timeline 读同一设置项）。带修饰键不触发（Ctrl+S 是保存类语义，防误触）
  useHotkeys(
    (e) => {
      if (
        (e.key === "s" || e.key === "S") &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        onUpdateSettings({ keyframeSnap: !settings.keyframeSnap });
      }
    },
    mode.type === "product",
  );

  // 切走预览模式时暂停连播；切回成品模式时把播放头同步给播放器。
  // 读 playheadRef（权威值）而非离散镜像 state——播放中 state 冻结在离散点，用它会丢位置
  const prevModeRef = useRef<PreviewMode>(mode);
  useEffect(() => {
    if (prevModeRef.current.type !== mode.type) {
      if (mode.type !== "product" && playing) setPlaying(false);
      if (mode.type === "product") productSeek(playheadRef.current);
      prevModeRef.current = mode;
    }
  }, [mode, playing, productSeek]);

  return (
    <div className="flex h-full flex-col">
      <WorkbenchHeader
        env={env}
        fileCount={files.length}
        timelineCount={timeline.length}
        onNavigate={onNavigate}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {files.length === 0 ? (
          <button
            type="button"
            onClick={() => void openFiles()}
            className="group flex h-64 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-hairline transition-colors hover:border-signal/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <Sparkles className="h-8 w-8 text-mute transition-colors group-hover:text-signal" strokeWidth={1.5} />
            <span className="text-sm text-mute transition-colors group-hover:text-paper">
              添加视频素材
            </span>
            <span className="text-xs text-mute/70">
              每个素材可剪出多个片段，片段支持旋转/放大加工，最后在时间轴上编排合成
            </span>
          </button>
        ) : (
          <>
            {/* ① 预览区（三态复用） */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setMode({ type: "product" })}
                  className={`rounded-md px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
                    mode.type === "product" ? "bg-panel text-paper" : "text-mute hover:text-paper"
                  }`}
                >
                  成品预览
                </button>
                {mode.type === "cut" && (
                  <span className="flex items-center gap-1 text-mute">
                    <Scissors className="h-3 w-3" />
                    正在剪切 {basename(fileById(mode.sourceId)?.path ?? "")}
                  </span>
                )}
                {mode.type === "edit" && (
                  <span className="flex items-center gap-1 text-mute">
                    <Sparkles className="h-3 w-3" />
                    {(() => {
                      const c = clipById(mode.clipId);
                      if (!c) return "正在编辑片段";
                      const idx = clips.findIndex((x) => x.id === c.id);
                      return `正在编辑 片段 ${idx + 1}（${basename(clipSource(c)?.path ?? "")}）`;
                    })()}
                  </span>
                )}
                <span className="ml-auto font-mono text-[11px] text-mute">
                  时间轴 {timeline.length} 段 · 总时长 {formatTime(totalDuration, false)}
                </span>
              </div>

              <div className="flex h-[38vh] min-h-[240px] w-full items-center justify-center overflow-hidden rounded-md border border-hairline bg-black">
                {mode.type === "product" &&
                  (timelineClips.length === 0 ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
                      <Film className="h-8 w-8 text-mute/60" strokeWidth={1.5} />
                      <p className="text-sm text-mute">
                        时间轴为空——从片段池把片段加入时间轴后，这里将连播成品
                      </p>
                    </div>
                  ) : (
                    <ProductPreview
                      entries={productEntries}
                      playhead={playhead}
                      onPlayhead={onPlayheadDiscrete}
                      seekRequest={seekReq}
                      playing={playing}
                      onPlayingChange={setPlaying}
                      playheadRef={playheadRef}
                      playheadElRef={playheadElRef}
                      scrollElRef={timelineScrollRef}
                      ppsRef={ppsRef}
                    />
                  ))}
                {mode.type === "cut" &&
                  (() => {
                    const src = fileById(mode.sourceId);
                    if (!src) return null;
                    return (
                      <CutModeView
                        key={src.id}
                        source={src}
                        snap={settings.keyframeSnap}
                        useProxy={proxyEnabled(src.info)}
                        onAdd={(seg) => addClip(src.id, seg)}
                      />
                    );
                  })()}
                {mode.type === "edit" &&
                  (() => {
                    const clip = clipById(mode.clipId);
                    const src = clip ? clipSource(clip) : undefined;
                    if (!clip || !src) return null;
                    return (
                      <EditModeView
                        key={clip.id}
                        clip={clip}
                        source={src}
                        useProxy={proxyEnabled(src.info)}
                        onChange={(patch) => updateClip(clip.id, patch)}
                      />
                    );
                  })()}
              </div>
            </div>

            {/* ② 合成时间轴 */}
            <ClipTimeline
              clips={tlClips}
              externalDrag={extDrag}
              selectedId={selectedClipId}
              onSelect={(id) => {
                setSelectedClipId(id);
                setMode({ type: "edit", clipId: id });
              }}
              onReorder={reorderTimeline}
              onInsert={insertToTimeline}
              onExternalDragEnd={() => setExtDrag(null)}
              onRemove={removeFromTimeline}
              onSeek={(t) => {
                // 点空白 = seek + 取消选择（§17.4 选择行）；块点击 stopPropagation 不会到这里
                productSeek(t);
                setSelectedClipId(null);
              }}
              fps={timelineFps}
              pps={pps}
              onChangePps={setPps}
              playheadElRef={playheadElRef}
              scrollElRef={timelineScrollRef}
              snapEnabled={settings.keyframeSnap}
              onTrimStart={onTrimStart}
              onTrimPreview={onTrimPreview}
              onTrimCommit={onTrimCommit}
              onTrimToPlayhead={onTrimToPlayhead}
            />

            {/* ③ 片段池 */}
            <ClipPool
              clips={clips}
              timeline={timeline}
              thumbs={thumbs}
              clipThumbs={clipThumbs}
              clipSource={clipSource}
              checkOf={clipCheck}
              clipDurationOf={clipDuration}
              clipThumbKeyOf={clipThumbKey}
              selectedClipId={selectedClipId}
              onOpen={(id) => setMode({ type: "edit", clipId: id })}
              onAppend={appendToTimeline}
              onRemove={deleteFromPool}
              onDragStart={(id) => setExtDrag({ clipId: id })}
            />

            {/* ④ 素材卡片（含批量操作条，M6-8 = 原 M4-4） */}
            {selectedSources.size > 0 && (
              <BatchBar
                count={selectedSources.size}
                onSelectAll={() => setSelectedSources(new Set(files.map((f) => f.id)))}
                onClearSelection={() => setSelectedSources(new Set())}
                onBatchAdd={batchAddClips}
                batchRot={batchRot}
                onBatchRotChange={setBatchRot}
                onApplyBatchRot={applyBatchRot}
                batchMsg={batchMsg}
              />
            )}
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-medium text-mute">素材</h2>
                <span className="text-[11px] text-mute/60">
                  点击进入剪切（可反复剪出多个片段）；勾选卡片可批量建片段/应用旋转
                </span>
              </div>
              <SourceCards
                files={files}
                thumbs={thumbs}
                selectedIds={selectedSources}
                onOpen={(id) => setMode({ type: "cut", sourceId: id })}
                onRemove={(f) => void removeSource(f)}
                onAdd={() => void openFiles()}
                onReorder={reorderSources}
                onToggleSelect={toggleSourceSelect}
              />
            </section>
          </>
        )}
      </div>

      <WorkbenchFooter
        checkSummary={checkSummary}
        outputDir={outputDir}
        quality={quality}
        onQualityChange={setQuality}
        outputName={outputName}
        onOutputNameChange={setOutputName}
        error={error}
        submitting={submitting}
        exportDisabled={
          submitting ||
          timelineClips.length === 0 ||
          !outputDir ||
          !outputName.trim() ||
          hasProbeError
        }
        exportTitle={timelineClips.length === 0 ? "请先剪出片段并加入时间轴" : undefined}
        onExport={() => void startExport()}
      />
    </div>
  );
}
