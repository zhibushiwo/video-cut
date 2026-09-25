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
import ProductPreview, { type ProductEntry } from "../../components/ProductPreview";
import { NO_ROTATE, type RotateState } from "../../components/RotateControls";
import { usePlaybackHotkeys } from "../../hooks/usePlaybackHotkeys";
import { useHotkeys } from "../../hooks/useHotkeys";
import {
  checkPipeline,
  confirmDialog,
  fileExists,
  generateClipThumbnails,
  generateThumbnails,
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
import { formatTime } from "../../utils/time";
import {
  buildAppendToTimeline,
  buildComposite,
  buildCreateClip,
  buildInsert,
  buildRemoveAndDelete,
  buildReorder,
  productDurationOf,
} from "../../utils/undo/commands";
import { useUndoStack } from "../../utils/undo/store";
import type { BuildCtx, EditorDoc } from "../../utils/undo/types";
import { BatchBar } from "./BatchBar";
import { ClipPool } from "./ClipPool";
import { CutModeView } from "./CutModeView";
import { EditModeView } from "./EditModeView";
import { WorkbenchFooter } from "./Footer";
import { WorkbenchHeader } from "./Header";
import {
  displayedDims,
  freshId,
  MIN_SEG_DURATION_SEC,
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
}: {
  settings: AppSettings;
  /** FFmpeg 环境状态（App 启动检测；落地页头部展示） */
  env: EnvironmentInfo | null;
  onNavigate: (page: PageName) => void;
  initialFiles?: string[] | null;
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
  const { execute, applyRaw } = useUndoStack({ doc, setDoc, ctx: buildCtx });

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
   * 块 ✕ / 拖出时间轴：**M11-0 保持既有语义**（片段同时出池 = `buildRemoveAndDelete`）。
   * M11-4 按决策 #13 改为只出轴、池保留（`buildRemoveFromTimeline`）。
   */
  const removeClip = useCallback(
    (id: string) => {
      execute(buildRemoveAndDelete(id));
      setMode((m) => (m.type === "edit" && m.clipId === id ? { type: "product" } : m));
      setCheck(null);
    },
    [execute],
  );

  const reorderTimeline = useCallback(
    (from: number, to: number) => {
      execute(buildReorder(from, to));
    },
    [execute],
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
        return {
          input: clipSource(c)?.path ?? "",
          segment:
            c.seg && c.seg.end > c.seg.start + MIN_SEG_DURATION_SEC
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

  const productSeek = useCallback((t: number) => {
    setPlayhead(t);
    seekNonce.current += 1;
    setSeekReq({ t, nonce: seekNonce.current });
  }, []);

  // 快捷键（M4-3，成品模式）：走带共用块见 usePlaybackHotkeys；页面专属：Delete 删选中片段
  usePlaybackHotkeys({
    enabled: mode.type === "product",
    currentTime: playhead,
    maxT: totalDuration,
    onTogglePlay: () => setPlaying((p) => !p),
    onSeek: productSeek,
  });
  useHotkeys((e) => {
    if (mode.type !== "product") return;
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
              onSelect={(id) => setMode({ type: "edit", clipId: id })}
              onReorder={reorderTimeline}
              onInsert={insertToTimeline}
              onExternalDragEnd={() => setExtDrag(null)}
              onRemove={removeClip}
              onSeek={productSeek}
              currentTime={playhead}
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
              onRemove={removeClip}
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
