/**
 * 工作台（DESIGN §3.8 / §9.8 v0.3 = 2.0 布局）：
 * 素材卡片 → 剪切成片段 → 片段池 → 合成时间轴编排 → 合成一个成品。
 * 三层数据模型：SourceFile（素材）/ Clip（片段 = 后端一个 PipelineItem）/ timeline（成品顺序）。
 */
import {
  Clock,
  Film,
  GripVertical,
  Layers,
  Plus,
  RotateCw,
  Scissors,
  Settings as SettingsIcon,
  Sparkles,
  X,
  ZoomIn,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import ClipTimeline, { type TimelineClip } from "../../components/ClipTimeline";
import ProductPreview, { type ProductEntry } from "../../components/ProductPreview";
import {
  NO_ROTATE,
  RotateControls,
  type RotateState,
} from "../../components/RotateControls";
import Timeline, { type Selection } from "../../components/Timeline";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import { useDragSort } from "../../hooks/useDragSort";
import { useHotkeys } from "../../hooks/useHotkeys";
import {
  checkPipeline,
  confirmDialog,
  fileExists,
  fileSrc,
  generateClipThumbnails,
  generateProxy,
  generateThumbnails,
  listKeyframes,
  onTaskStatus,
  pickVideos,
  probeMedia,
  submitTask,
} from "../../services/tauri";
import type {
  AppSettings,
  EnvironmentInfo,
  MediaInfo,
  PageName,
  PipelineCheck,
  PipelineItem,
  QualityPreset,
} from "../../types";
import { formatTime, parseTime, withFileTimestamp } from "../../utils/time";
import { wantsProxy } from "../../utils/media";
import { resolveOutputDir } from "../../utils/paths";

const QUALITY_LABELS: Record<QualityPreset, string> = {
  high: "高质量",
  balanced: "平衡",
  small: "小体积",
};

/** 右上角功能导航（DESIGN §9.2：工作台为落地页，其余功能经此跳转） */
const NAV_ITEMS: { page: PageName; label: string; icon: typeof Scissors }[] = [
  { page: "cut", label: "剪切", icon: Scissors },
  { page: "merge", label: "合并", icon: Layers },
  { page: "rotate", label: "旋转", icon: RotateCw },
  { page: "crop", label: "放大", icon: ZoomIn },
];

/** 品牌标记：一条斜切线把画面分成两块——"剪开"本身。 */
function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path d="M6 4.5h9.8L12.7 11H6z" fill="currentColor" />
      <path d="M11.4 13H18v6.5H8.1z" fill="currentColor" />
    </svg>
  );
}

/** FFmpeg 环境状态徽标（原主页头部组件，随落地页迁移）。 */
function EnvChip({ env }: { env: EnvironmentInfo | null }) {
  if (!env) {
    return (
      <div className="flex shrink-0 items-center gap-2 font-mono text-xs text-mute" title="正在检查内置 FFmpeg">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mute" />
        正在检测 FFmpeg…
      </div>
    );
  }
  if (env.ok) {
    return (
      <div
        className="flex shrink-0 items-center gap-2 font-mono text-xs text-mute"
        title={`ffmpeg ${env.ffmpegVersion ?? ""} / ffprobe ${env.ffprobeVersion ?? ""}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        FFmpeg {env.ffmpegVersion?.split("-")[0]} 就绪
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center gap-2 font-mono text-xs text-warn"
      title={env.message ?? "FFmpeg 不可用"}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
      FFmpeg 未就绪
    </div>
  );
}

type EditorTab = "rotate" | "crop";

interface CropNorm {
  /** 归一化坐标 0..1（显示空间：含旋转效果的用户所见画面） */
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

/** 素材：导入的源文件（§3.8 三层数据模型之一） */
interface SourceFile {
  id: string;
  path: string;
  info: MediaInfo | null;
  probeError: string | null;
}

/** 片段：加工与合成的最小单元，= 后端一个 PipelineItem */
interface Clip {
  id: string;
  sourceId: string;
  /** 源内区间（秒），null = 整段保留 */
  seg: { start: number; end: number } | null;
  rot: RotateState;
  crop: CropNorm | null;
  lockRatio: boolean;
}

/** 预览区三态（§9.8 ①）：成品（M6-6 连播）/ 源剪切 / 片段加工 */
type PreviewMode =
  | { type: "product" }
  | { type: "cut"; sourceId: string }
  | { type: "edit"; clipId: string };

let nextId = 1;
const freshId = (prefix: string) => `${prefix}-${nextId++}`;

/** 显示空间宽高：90°/270° 时为源宽高交换（DESIGN §9.8 预览约定） */
function displayedDims(info: MediaInfo, rot: RotateState) {
  const quarter = rot.deg === 90 || rot.deg === 270;
  return quarter
    ? { w: info.video.height, h: info.video.width }
    : { w: info.video.width, h: info.video.height };
}

const even = (v: number) => Math.max(0, Math.round(v / 2) * 2);

function cropPx(crop: CropNorm, dims: { w: number; h: number }) {
  return {
    x: even(crop.nx * dims.w),
    y: even(crop.ny * dims.h),
    w: even(crop.nw * dims.w),
    h: even(crop.nh * dims.h),
  };
}

function basename(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}

/**
 * 代理预览（设置三态感知）：按需生成代理并在任务完成后切换播放源。
 * 返回 onError 供 <video> 原文件播放失败时兜底请求代理。
 */
function useProxyPreview(path: string, useProxy: boolean) {
  const [proxyPath, setProxyPath] = useState<string | null>(null);
  const taskIdRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    setProxyPath(null);
    taskIdRef.current = null;
    if (useProxy) {
      generateProxy(path)
        .then((s) => {
          if (!alive) return;
          if (s.taskId) taskIdRef.current = s.taskId;
          else setProxyPath(s.proxyPath);
        })
        .catch(() => {
          /* 预览失败不阻塞数值编辑 */
        });
    }
    return () => {
      alive = false;
    };
  }, [path, useProxy]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onTaskStatus((p) => {
      const tid = taskIdRef.current;
      if (tid && p.taskId === tid && p.status === "completed" && p.outputs[0]) {
        setProxyPath(p.outputs[0]);
      }
    }).then((f) => {
      unlisten = f;
    });
    return () => unlisten?.();
  }, []);

  const onError = useCallback(() => {
    if (useProxy && !proxyPath && !taskIdRef.current) {
      void generateProxy(path).then((s) => {
        if (s.taskId) taskIdRef.current = s.taskId;
        else setProxyPath(s.proxyPath);
      });
    }
  }, [useProxy, proxyPath, path]);

  return { proxyPath, onError };
}

export default function WorkbenchPage({
  settings,
  env,
  onNavigate,
  initialFiles,
}: {
  settings: AppSettings;
  /** FFmpeg 环境状态（App 启动检测；落地页头部展示） */
  env: EnvironmentInfo | null;
  onNavigate: (page: PageName) => void;
  initialFiles?: string[] | null;
}) {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  /** 成品顺序：片段 id 有序表（唯一顺序语义，决策 #13） */
  const [timeline, setTimeline] = useState<string[]>([]);
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
  const clipDuration = useCallback(
    (c: Clip) => {
      const info = clipSource(c)?.info;
      if (!info) return 0;
      return c.seg ? c.seg.end - c.seg.start : info.durationSec;
    },
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
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
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
      setClips((prev) => prev.filter((c) => c.sourceId !== file.id));
      setTimeline((prev) => prev.filter((id) => !ownedIds.has(id)));
      setMode((m) =>
        (m.type === "cut" && m.sourceId === file.id) ||
        (m.type === "edit" && ownedIds.has(m.clipId))
          ? { type: "product" }
          : m,
      );
      setCheck(null);
    },
    [clips],
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
  const addClip = useCallback(
    (sourceId: string, seg: { start: number; end: number } | null) => {
      const clip: Clip = {
        id: freshId("clip"),
        sourceId,
        seg,
        rot: NO_ROTATE,
        crop: null,
        lockRatio: true,
      };
      setClips((prev) => [...prev, clip]);
      setTimeline((prev) => [...prev, clip.id]);
      setCheck(null);
      return clip.id;
    },
    [],
  );

  const updateClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setCheck(null);
  }, []);

  const removeClip = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    setTimeline((prev) => prev.filter((x) => x !== id));
    setMode((m) => (m.type === "edit" && m.clipId === id ? { type: "product" } : m));
    setCheck(null);
  }, []);

  const reorderTimeline = useCallback((from: number, to: number) => {
    if (from === to) return;
    setTimeline((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  /** 池「+」加入时间轴末尾（已在轴内则无操作） */
  const appendToTimeline = useCallback((clipId: string) => {
    setTimeline((prev) => (prev.includes(clipId) ? prev : [...prev, clipId]));
  }, []);

  /** 池拖入/块拖动插入：已在轴内 = 移动，否则插入（M6-3） */
  const insertToTimeline = useCallback((clipId: string, index: number) => {
    setTimeline((prev) => {
      const next = prev.filter((x) => x !== clipId);
      next.splice(Math.min(index, next.length), 0, clipId);
      return next;
    });
  }, []);

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
    for (const f of targets) addClip(f.id, null);
    setBatchMsg(`已为 ${targets.length} 个素材各建全段片段并入轴`);
    setSelectedSources(new Set());
    window.setTimeout(() => setBatchMsg(null), 2500);
  }, [files, selectedSources, addClip]);

  const applyBatchRot = useCallback(() => {
    const targets = clips.filter((c) => selectedSources.has(c.sourceId));
    if (targets.length === 0) {
      setBatchMsg("选中素材没有片段");
      window.setTimeout(() => setBatchMsg(null), 2500);
      return;
    }
    setClips((prev) =>
      prev.map((c) =>
        selectedSources.has(c.sourceId) ? { ...c, rot: batchRot, crop: null } : c,
      ),
    );
    setCheck(null);
    setBatchMsg(
      `已把 ${batchRot.deg}°${batchRot.hflip ? "+水平翻转" : ""}${batchRot.vflip ? "+垂直翻转" : ""} 应用到 ${targets.length} 个片段`,
    );
    window.setTimeout(() => setBatchMsg(null), 2500);
  }, [clips, selectedSources, batchRot]);

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
        const px = c.crop ? cropPx(c.crop, dims) : null;
        return {
          input: clipSource(c)?.path ?? "",
          segment:
            c.seg && c.seg.end > c.seg.start + 0.05
              ? { startSec: c.seg.start, endSec: c.seg.end }
              : null,
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
    [timelineClips, clipSource],
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
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [payload, allProbed, hasProbeError]);

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
      const base = `${dir}\\${name}`;
      const target = (await fileExists(base)) ? `${dir}\\${withFileTimestamp(name)}` : base;
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
    return {
      id: c.id,
      label: `${src ? basename(src.path) : "?"} ${
        c.seg ? `${formatTime(c.seg.start, false)}–${formatTime(c.seg.end, false)}` : "全段"
      }`,
      duration: clipDuration(c),
      lossless: chk ? chk.copy : null,
      detail: chk && !chk.copy ? chk.reasons.join("；") : undefined,
    };
  });

  const selectedClipId = mode.type === "edit" ? mode.clipId : null;
  const proxyEnabled = (info: MediaInfo | null) =>
    !!info && wantsProxy(info, settings.proxyMode);

  // ---------- 成品连播（M6-6） ----------
  const productEntries = useMemo<ProductEntry[]>(() => {
    let acc = 0;
    return timelineClips.map((c) => {
      const info = clipSource(c)?.info ?? null;
      const dur = c.seg ? c.seg.end - c.seg.start : info?.durationSec ?? 0;
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
  }, [timelineClips, clipSource, settings.proxyMode]);

  const productSeek = useCallback((t: number) => {
    setPlayhead(t);
    seekNonce.current += 1;
    setSeekReq({ t, nonce: seekNonce.current });
  }, []);

  // 快捷键（M4-3，成品模式）：空格 播放/暂停 · ←/→ ±1s · Shift+←/→ 细步 · Delete 删选中片段
  useHotkeys((e) => {
    if (mode.type !== "product") return;
    if (e.code === "Space") {
      if (e.repeat) return;
      e.preventDefault();
      setPlaying((p) => !p);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 / 30 : 1);
      productSeek(Math.min(Math.max(0, playhead + delta), totalDuration));
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !e.repeat && selectedClipId) {
      removeClip(selectedClipId);
    }
  });

  // 切走预览模式时暂停连播；切回成品模式时把播放头同步给播放器
  const prevModeRef = useRef<PreviewMode>(mode);
  useEffect(() => {
    if (prevModeRef.current.type !== mode.type) {
      if (mode.type !== "product" && playing) setPlaying(false);
      if (mode.type === "product") productSeek(playhead);
      prevModeRef.current = mode;
    }
  }, [mode, playing, playhead, productSeek]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
        <BrandMark />
        <div className="shrink-0 leading-tight">
          <div className="text-sm font-semibold tracking-tight">video-cut</div>
          <div className="text-[11px] text-mute">工作台 · 逐段加工，合成一个成品</div>
        </div>
        <EnvChip env={env} />
        {files.length > 0 && (
          <span className="shrink-0 text-xs text-mute">
            {files.length} 个素材 · {timeline.length} 个片段
          </span>
        )}
        <nav className="ml-auto flex shrink-0 items-center gap-1" aria-label="功能导航">
          {NAV_ITEMS.map(({ page, label, icon: Icon }) => (
            <button
              key={page}
              type="button"
              onClick={() => onNavigate(page)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-mute transition-colors hover:bg-panel hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-hairline" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onNavigate("history")}
            aria-label="历史记录"
            title="历史记录"
            className="flex h-8 w-8 items-center justify-center rounded-md text-mute transition-colors hover:bg-panel hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <Clock className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate("settings")}
            aria-label="设置"
            title="设置"
            className="flex h-8 w-8 items-center justify-center rounded-md text-mute transition-colors hover:bg-panel hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </nav>
      </header>

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
                      onPlayhead={setPlayhead}
                      seekRequest={seekReq}
                      playing={playing}
                      onPlayingChange={setPlaying}
                    />
                  ))}
                {mode.type === "cut" &&
                  (() => {
                    const src = fileById(mode.sourceId);
                    if (!src) return null;
                    return (
                      <CutModeView
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
              onSelect={(id) => setMode({ type: "edit", clipId: id })}
              onReorder={reorderTimeline}
              onInsert={insertToTimeline}
              onExternalDragEnd={() => setExtDrag(null)}
              onRemove={removeClip}
              onSeek={productSeek}
              currentTime={playhead}
            />

            {/* ③ 片段池 */}
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-medium text-mute">片段池</h2>
                <span className="text-[11px] text-mute/60">
                  {clips.length === 0
                    ? "点素材卡剪出片段；顺序只在时间轴上表达"
                    : "点击卡片加工 · + 加入时间轴 · 拖手柄入轴"}
                </span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {clips.length === 0 ? (
                  <p className="shrink-0 text-xs text-mute/50">还没有片段。</p>
                ) : (
                  clips.map((c) => {
                    const src = clipSource(c);
                    const chk = clipCheck(c.id);
                    const inTimeline = timeline.includes(c.id);
                    const selected = mode.type === "edit" && mode.clipId === c.id;
                    const thumbKey = clipThumbKey(c);
                    const thumb = src
                      ? (clipThumbs[thumbKey] ?? thumbs[src.path])
                      : null;
                    return (
                      <div
                        key={c.id}
                        className={`group relative w-44 shrink-0 overflow-hidden rounded-md border bg-panel ${
                          selected ? "border-signal/70" : "border-hairline"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setMode({ type: "edit", clipId: c.id })}
                          className="block w-full text-left focus:outline-none"
                          title={chk && !chk.copy ? chk.reasons.join("；") : undefined}
                        >
                          <div className="relative h-16 w-full bg-black">
                            {thumb ? (
                              <img
                                src={fileSrc(thumb)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center">
                                <Film className="h-5 w-5 text-mute/50" />
                              </span>
                            )}
                            <span className="absolute bottom-1 left-1 rounded bg-ink/80 px-1 font-mono text-[9px] text-paper/90">
                              {c.seg
                                ? `${formatTime(c.seg.start, false)}–${formatTime(c.seg.end, false)}`
                                : "全段"}
                            </span>
                            <span
                              className={`absolute right-1 top-1 h-2 w-2 rounded-full ${
                                chk === null ? "bg-mute/50" : chk.copy ? "bg-signal" : "bg-warn"
                              }`}
                              title={
                                chk
                                  ? chk.copy
                                    ? "无损片段"
                                    : chk.reasons.join("；")
                                  : "检测中"
                              }
                            />
                          </div>
                          <div className="px-2 py-1.5">
                            <p className="truncate text-xs text-paper">
                              {src ? basename(src.path) : "已移除素材"}
                            </p>
                            <p className="font-mono text-[10px] text-mute">
                              {clipDuration(c) > 0 ? `${clipDuration(c).toFixed(1)}s` : "…"}
                              {inTimeline ? " · 已在轴" : ""}
                            </p>
                          </div>
                        </button>
                        <div className="absolute right-1 top-9 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          {!inTimeline && (
                            <button
                              type="button"
                              onClick={() => appendToTimeline(c.id)}
                              aria-label="加入时间轴末尾"
                              title="加入时间轴末尾"
                              className="flex h-5 w-5 items-center justify-center rounded bg-ink/80 text-mute hover:text-signal focus:outline-none"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeClip(c.id)}
                            aria-label="删除片段"
                            title="删除片段"
                            className="flex h-5 w-5 items-center justify-center rounded bg-ink/80 text-mute hover:text-warn focus:outline-none"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            setExtDrag({ clipId: c.id });
                          }}
                          className="absolute bottom-1 right-1 cursor-grab touch-none rounded p-0.5 text-mute/60 hover:text-paper"
                          title="拖入时间轴"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* ④ 素材卡片（含批量操作条，M6-8 = 原 M4-4） */}
            {selectedSources.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-signal/30 bg-signal/5 px-3 py-2">
                <span className="text-xs font-medium text-paper">
                  已选 {selectedSources.size} 个素材
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSources(new Set(files.map((f) => f.id)))}
                  className={fieldBtn}
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSources(new Set())}
                  className={fieldBtn}
                >
                  清除选择
                </button>
                <span className="h-4 w-px bg-hairline" aria-hidden="true" />
                <button
                  type="button"
                  onClick={batchAddClips}
                  title="为每个选中素材各建一个全段片段，并入时间轴末尾"
                  className="rounded-md border border-signal/40 bg-signal/10 px-2.5 py-1.5 text-xs text-signal transition-colors hover:bg-signal/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  各建全段片段
                </button>
                <span className="h-4 w-px bg-hairline" aria-hidden="true" />
                <RotateControls
                  rot={batchRot}
                  onChange={setBatchRot}
                  currentRotation={null}
                />
                <button type="button" onClick={applyBatchRot} className={fieldBtn}>
                  旋转应用到片段
                </button>
                {batchMsg && <span className="text-xs text-signal">{batchMsg}</span>}
              </div>
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

      <footer className="shrink-0 border-t border-hairline px-4 py-3">
        <div className="flex items-center gap-3">
          {checkSummary && (
            <span
              className={`shrink-0 text-xs ${
                checkSummary.startsWith("✓")
                  ? "text-signal"
                  : checkSummary.startsWith("⚠")
                    ? "text-warn"
                    : "text-mute"
              }`}
            >
              {checkSummary}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-mute" title={outputDir}>
            {outputDir ? `输出到 ${outputDir}` : "（先添加视频并剪出片段）"}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-mute">
            质量档位
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as QualityPreset)}
              className="rounded border border-hairline bg-panel px-2 py-1 text-xs text-paper focus:border-signal focus:outline-none"
            >
              {(Object.keys(QUALITY_LABELS) as QualityPreset[]).map((q) => (
                <option key={q} value={q}>
                  {QUALITY_LABELS[q]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-mute">
            文件名
            <input
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              className="w-40 rounded border border-hairline bg-panel px-2 py-1.5 font-mono text-xs text-paper focus:border-signal focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-2.5 flex items-center justify-end gap-2">
          {error && (
            <span className="min-w-0 flex-1 truncate text-xs text-warn" title={error}>
              {error}
            </span>
          )}
          <button
            type="button"
            disabled={
              submitting ||
              timelineClips.length === 0 ||
              !outputDir ||
              !outputName.trim() ||
              hasProbeError
            }
            onClick={() => void startExport()}
            title={timelineClips.length === 0 ? "请先剪出片段并加入时间轴" : undefined}
            className="rounded-md bg-signal px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "提交中…" : "合成导出"}
          </button>
        </div>
      </footer>
    </div>
  );
}

/** ④ 素材卡片区（横向卡片行，拖拽排序用横向轴；勾选支持批量操作，M6-8） */
function SourceCards({
  files,
  thumbs,
  selectedIds,
  onOpen,
  onRemove,
  onAdd,
  onReorder,
  onToggleSelect,
}: {
  files: SourceFile[];
  thumbs: Record<string, string>;
  selectedIds: Set<string>;
  onOpen(id: string): void;
  onRemove(file: SourceFile): void;
  onAdd(): void;
  onReorder(from: number, to: number): void;
  onToggleSelect(id: string): void;
}) {
  const { listRef, beginDrag, rowCls } = useDragSort(onReorder, "x");
  return (
    <div ref={listRef} className="flex gap-2.5 overflow-x-auto pb-1">
      {files.map((f, i) => {
        const isSelected = selectedIds.has(f.id);
        return (
        <div
          key={f.id}
          data-sort-row
          className={`group relative w-40 shrink-0 overflow-hidden rounded-md border bg-panel ${rowCls(i)} ${
            isSelected ? "border-signal/70" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => onOpen(f.id)}
            className="block w-full text-left focus:outline-none"
          >
            <div className="relative h-20 w-full bg-black">
              {thumbs[f.path] ? (
                <img src={fileSrc(thumbs[f.path])} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Film className="h-6 w-6 text-mute/50" />
                </span>
              )}
              {f.info && (
                <span className="absolute bottom-1 right-1 rounded bg-ink/80 px-1 font-mono text-[9px] text-paper/90">
                  {formatTime(f.info.durationSec, false)}
                </span>
              )}
            </div>
            <div className="px-2 py-1.5">
              <p className="truncate text-xs text-paper" title={f.path}>
                {basename(f.path)}
              </p>
              <p className="truncate text-[10px] text-mute">
                {f.probeError
                  ? "⚠ 读取失败"
                  : !f.info
                    ? "读取中…"
                    : `${f.info.video.codec.toUpperCase()} ${f.info.video.width}×${f.info.video.height}`}
              </p>
            </div>
          </button>
          <span
            onPointerDown={(e) => beginDrag(e, i)}
            className="absolute bottom-1 right-1 cursor-grab touch-none rounded p-0.5 text-mute/60 hover:text-paper"
            title="拖动排序"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          <button
            type="button"
            onClick={() => onToggleSelect(f.id)}
            aria-label={isSelected ? "取消选择" : "选择以批量操作"}
            aria-pressed={isSelected}
            title="选择以批量操作"
            className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
              isSelected
                ? "border-signal bg-signal text-ink"
                : "border-paper/50 bg-ink/70 text-transparent hover:border-paper"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onRemove(f)}
            aria-label={`移除 ${basename(f.path)}`}
            className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-ink/80 text-mute opacity-0 transition-opacity hover:text-warn focus:outline-none focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="flex h-28 w-40 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-hairline text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <Plus className="h-4 w-4" />
        添加素材
      </button>
    </div>
  );
}

/** 时间码输入：受控同步 + 失焦/回车提交（非法值回滚） */
function TimeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit(t: number): void;
}) {
  const [text, setText] = useState(formatTime(value));
  useEffect(() => setText(formatTime(value)), [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-mute">{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = parseTime(text);
          if (t !== null) onCommit(t);
          else setText(formatTime(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-28 rounded border border-hairline bg-panel px-2 py-1.5 font-mono text-xs text-paper focus:border-signal focus:outline-none"
      />
    </label>
  );
}

const fieldBtn =
  "rounded-md border border-hairline px-2.5 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal";

/** ① 源剪切模式：选区间 → 添加为片段（一个素材可反复剪出多个片段） */
function CutModeView({
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

  // 快捷键（M4-3，源剪切）：空格 播放/暂停 · ←/→ ±1s · Shift+←/→ 逐帧 · I/O 设入/出点
  const frameStep = info.video.frameRate > 0 ? 1 / info.video.frameRate : 1 / 30;
  useHotkeys((e) => {
    if (e.code === "Space") {
      if (e.repeat) return;
      e.preventDefault();
      if (playing) playerRef.current?.pause();
      else playerRef.current?.play();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? frameStep : 1);
      const t = Math.min(Math.max(0, current + delta), info.durationSec);
      playerRef.current?.seek(t);
      setCurrent(t);
      return;
    }
    if (e.code === "KeyI" && !e.repeat) commitStart(current);
    if (e.code === "KeyO" && !e.repeat) commitEnd(current);
  });

  const addNow = () => {
    const whole = sel.start <= 0.001 && sel.end >= info.durationSec - 0.001;
    const seg = whole || sel.end <= sel.start + 0.05 ? null : { start: sel.start, end: sel.end };
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

/** ① 片段加工模式：旋转 / 显示空间放大（裁剪叠加层贴显示空间外层盒，坐标即所见即所得） */
function EditModeView({
  clip,
  source,
  useProxy,
  onChange,
}: {
  clip: Clip;
  source: SourceFile;
  useProxy: boolean;
  onChange(patch: Partial<Clip>): void;
}) {
  const info = source.info!;
  const { proxyPath, onError } = useProxyPreview(source.path, useProxy);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [tab, setTab] = useState<EditorTab>("rotate");
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  // 快捷键（M4-3，片段加工）：空格 播放/暂停 · ←/→ ±1s · Shift+←/→ 逐帧
  const frameStep = info.video.frameRate > 0 ? 1 / info.video.frameRate : 1 / 30;
  useHotkeys((e) => {
    if (e.code === "Space") {
      if (e.repeat) return;
      e.preventDefault();
      togglePlay();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? frameStep : 1);
      const t = Math.min(Math.max(0, current + delta), info.durationSec);
      playerRef.current?.seek(t);
      setCurrent(t);
    }
  });

  const dims = displayedDims(info, clip.rot);
  const quarter = clip.rot.deg === 90 || clip.rot.deg === 270;
  const innerStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: quarter ? `${(dims.h / dims.w) * 100}%` : "100%",
    height: quarter ? `${(dims.w / dims.h) * 100}%` : "100%",
    transform: `translate(-50%, -50%) rotate(${clip.rot.deg}deg) scaleX(${clip.rot.hflip ? -1 : 1}) scaleY(${clip.rot.vflip ? -1 : 1})`,
  };

  // ---------- 放大：显示空间框选 / 移动（与编辑器页同一交互） ----------
  const stageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const [overRect, setOverRect] = useState(false);

  const cropHandlers = {
    onMouseMove: (e: ReactMouseEvent) => {
      const box = stageRef.current;
      if (!box || !clip.crop) {
        setOverRect(false);
        return;
      }
      const r = box.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      setOverRect(
        nx >= clip.crop.nx &&
          nx <= clip.crop.nx + clip.crop.nw &&
          ny >= clip.crop.ny &&
          ny <= clip.crop.ny + clip.crop.nh,
      );
    },
    onPointerDown: (e: ReactPointerEvent) => {
      const box = stageRef.current;
      if (!box || e.button !== 0) return;
      e.preventDefault();
      const r = box.getBoundingClientRect();
      const toN = (cx: number, cy: number) => ({
        nx: Math.min(1, Math.max(0, (cx - r.left) / r.width)),
        ny: Math.min(1, Math.max(0, (cy - r.top) / r.height)),
      });
      const p = toN(e.clientX, e.clientY);
      const base = clip.crop;
      const inRect =
        !!base &&
        p.nx >= base.nx &&
        p.nx <= base.nx + base.nw &&
        p.ny >= base.ny &&
        p.ny <= base.ny + base.nh;

      const attach = (move: (ev: PointerEvent) => void) => {
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      };

      if (inRect && base) {
        const offX = p.nx - base.nx;
        const offY = p.ny - base.ny;
        drawingRef.current = true;
        attach((ev) => {
          if (!drawingRef.current) return;
          const q = toN(ev.clientX, ev.clientY);
          onChange({
            crop: {
              ...base,
              nx: Math.min(1 - base.nw, Math.max(0, q.nx - offX)),
              ny: Math.min(1 - base.nh, Math.max(0, q.ny - offY)),
            },
          });
        });
        return;
      }

      const startN = p;
      drawingRef.current = true;
      const move = (ev: PointerEvent) => {
        if (!drawingRef.current) return;
        const endN = toN(ev.clientX, ev.clientY);
        const nxMin = Math.min(startN.nx, endN.nx);
        const nyMin = Math.min(startN.ny, endN.ny);
        let nw = Math.abs(endN.nx - startN.nx);
        let nh = Math.abs(endN.ny - startN.ny);
        if (clip.lockRatio && nw > 0) {
          nh = Math.min(nh, nw);
          nw = nh;
        }
        nw = Math.min(nw, 1 - nxMin);
        nh = Math.min(nh, 1 - nyMin);
        onChange({ crop: { nx: nxMin, ny: nyMin, nw, nh } });
      };
      attach(move);
    },
  };

  const px = clip.crop ? cropPx(clip.crop, dims) : null;

  const togglePlay = () => {
    if (playing) {
      playerRef.current?.pause();
      setPlaying(false);
    } else {
      playerRef.current?.play();
      setPlaying(true);
    }
  };

  const tabBtn = (t: EditorTab) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
      tab === t ? "bg-panel text-paper" : "text-mute hover:text-paper"
    }`;

  return (
    <div className="flex h-full w-full gap-2 p-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div
            ref={stageRef}
            className={`relative ${tab === "crop" ? (overRect ? "cursor-move" : "cursor-crosshair") : ""}`}
            style={{ aspectRatio: `${dims.w} / ${dims.h}`, height: "100%", maxWidth: "100%" }}
            {...(tab === "crop" ? cropHandlers : {})}
          >
            <div style={innerStyle}>
              <VideoPlayer
                ref={playerRef}
                fill
                controls={false}
                src={fileSrc(proxyPath ?? source.path)}
                banner={proxyPath ? "当前为代理预览画面，导出使用原始文件" : null}
                onTime={setCurrent}
                onPlayStateChange={setPlaying}
                onError={onError}
                onLoadedMetadata={() => playerRef.current?.seek(clip.seg?.start ?? 0)}
              />
            </div>
            {tab === "crop" && clip.crop && (
              <div
                className="pointer-events-none absolute border-2 border-signal bg-signal/10"
                style={{
                  left: `${clip.crop.nx * 100}%`,
                  top: `${clip.crop.ny * 100}%`,
                  width: `${clip.crop.nw * 100}%`,
                  height: `${clip.crop.nh * 100}%`,
                }}
              />
            )}
          </div>
        </div>
        {/* 走带控制外置：控制条在变换盒内会被旋转/裁剪层遮挡（§9.8 预览约定） */}
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={togglePlay} className={fieldBtn}>
            {playing ? "暂停" : "播放"}
          </button>
          <input
            type="range"
            min={0}
            max={info.durationSec}
            step={0.05}
            value={Math.min(current, info.durationSec)}
            onChange={(e) => playerRef.current?.seek(Number(e.target.value))}
            aria-label="播放进度"
            className="h-1 min-w-0 flex-1 cursor-pointer accent-signal"
          />
          <span className="shrink-0 font-mono text-[10px] text-mute">
            {formatTime(current, false)} / {formatTime(info.durationSec, false)}
          </span>
        </div>
      </div>

      <div className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setTab("rotate")} className={tabBtn("rotate")}>
            <RotateCw className="h-3.5 w-3.5" /> 旋转
          </button>
          <button type="button" onClick={() => setTab("crop")} className={tabBtn("crop")}>
            <ZoomIn className="h-3.5 w-3.5" /> 放大
          </button>
        </div>
        {tab === "rotate" ? (
          <div className="flex flex-col gap-2">
            <RotateControls
              rot={clip.rot}
              onChange={(rot) => onChange({ rot, crop: null })}
              currentRotation={info.rotation}
            />
            {clip.crop && (
              <p className="text-xs text-warn">修改旋转会清除已框选的放大区域（框选基于旋转后的画面）。</p>
            )}
          </div>
        ) : (
          <CropFields
            dims={dims}
            px={px}
            lockRatio={clip.lockRatio}
            onLockRatio={(v) => onChange({ lockRatio: v })}
            onCrop={(crop) => onChange({ crop })}
            onClear={() => onChange({ crop: null })}
          />
        )}
        <p className="text-[11px] leading-relaxed text-mute/70">
          区间 {clip.seg ? `${formatTime(clip.seg.start, false)}–${formatTime(clip.seg.end, false)}` : "全段"}
          ；如需重剪，删除此片段后从素材卡重新剪切。
        </p>
      </div>
    </div>
  );
}

/** 放大数值微调（偶数对齐，坐标基于旋转后的显示空间） */
function CropFields({
  dims,
  px,
  lockRatio,
  onLockRatio,
  onCrop,
  onClear,
}: {
  dims: { w: number; h: number };
  px: { x: number; y: number; w: number; h: number } | null;
  lockRatio: boolean;
  onLockRatio(v: boolean): void;
  onCrop(crop: CropNorm): void;
  onClear(): void;
}) {
  const [fields, setFields] = useState({ x: "0", y: "0", w: "0", h: "0" });

  useEffect(() => {
    if (px) setFields({ x: String(px.x), y: String(px.y), w: String(px.w), h: String(px.h) });
  }, [px]);

  const commit = () => {
    const x = even(Number(fields.x) || 0);
    const y = even(Number(fields.y) || 0);
    let w = even(Number(fields.w) || 0);
    let h = even(Number(fields.h) || 0);
    if (w < 16 || h < 16) return;
    if (x + w > dims.w) w = dims.w - even(Math.min(x, dims.w - 16));
    if (y + h > dims.h) h = dims.h - even(Math.min(y, dims.h - 16));
    if (w < 16 || h < 16) return;
    onCrop({ nx: x / dims.w, ny: y / dims.h, nw: w / dims.w, nh: h / dims.h });
  };

  const field = (key: keyof typeof fields, label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-mute">{label}</span>
      <input
        value={fields[key]}
        onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-20 rounded border border-hairline bg-panel px-2 py-1.5 font-mono text-xs text-paper focus:border-signal focus:outline-none"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {field("x", "X")}
        {field("y", "Y")}
        {field("w", "宽")}
        {field("h", "高")}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-mute">
          <input
            type="checkbox"
            checked={lockRatio}
            onChange={(e) => onLockRatio(e.target.checked)}
            className="accent-signal"
          />
          锁定画面比例
        </label>
        {px && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-2 py-1 text-xs text-mute transition-colors hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            清除选区
          </button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-mute/70">
        在预览上拖拽框选（框内拖动=移动选区），坐标基于旋转后的画面。
        {px
          ? `已选 ${px.w}×${px.h} @ (${px.x}, ${px.y})，输出将放大回 ${dims.w}×${dims.h}。`
          : "尚未框选。"}
        放大必然重编码，画质用页脚质量档位权衡。
      </p>
    </div>
  );
}
