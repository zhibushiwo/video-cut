import { ArrowLeft, Film, GripVertical, Plus, Scissors, Sparkles, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  NO_ROTATE,
  RotateControls,
  type RotateState,
} from "../../components/RotateControls";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import {
  checkPipeline,
  fileSrc,
  generateProxy,
  generateThumbnails,
  onTaskStatus,
  pickVideos,
  probeMedia,
  submitTask,
} from "../../services/tauri";
import type { MediaInfo, PipelineItem, PipelineCheck, QualityPreset } from "../../types";
import { formatBytes, formatTime, parseTime, withFileTimestamp } from "../../utils/time";
import { needsProxy } from "../../utils/media";

const QUALITY_LABELS: Record<QualityPreset, string> = {
  high: "高质量",
  balanced: "平衡",
  small: "小体积",
};

type EditorTab = "cut" | "rotate" | "crop";

interface CropNorm {
  /** 归一化坐标 0..1（显示空间：含旋转效果的用户所见画面） */
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

interface WorkItem {
  id: number;
  path: string;
  info: MediaInfo | null;
  probeError: string | null;
  /** 剪切区间（秒），null = 整段保留 */
  seg: { start: number; end: number } | null;
  rot: RotateState;
  crop: CropNorm | null;
  lockRatio: boolean;
}

let nextId = 1;

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

export default function WorkbenchPage({
  onBack,
  initialFiles,
}: {
  onBack: () => void;
  initialFiles?: string[] | null;
}) {
  const [items, setItems] = useState<WorkItem[]>([]);  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<PipelineCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState("workbench.mp4");
  const [quality, setQuality] = useState<QualityPreset>("balanced");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);
  /** 一次只展开一个片段的编辑器 */
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const addFiles = useCallback(async (paths: string[]) => {
    setItems((prev) => {
      const fresh = paths
        .filter((p) => !prev.some((it) => it.path === p))
        .map((p) => ({
          id: nextId++,
          path: p,
          info: null,
          probeError: null,
          seg: null,
          rot: NO_ROTATE,
          crop: null,
          lockRatio: true,
        }));
      return [...prev, ...fresh];
    });
    // 逐个探测媒体信息（顺序即可，文件数通常不多）
    for (const p of paths) {
      try {
        const mi = await probeMedia(p);
        setItems((prev) =>
          prev.map((it) => (it.path === p ? { ...it, info: mi } : it)),
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((it) =>
            it.path === p ? { ...it, probeError: String(err) } : it,
          ),
        );
      }
    }
  }, []);

  // 拖拽导入：每次新的拖入都追加（App 层原地分发，页面不跳转；addFiles 内部去重）
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

  const updateItem = (id: number, patch: Partial<WorkItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const removeAt = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setCheck(null);
  };

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // 列表缩略图（缓存命中时接近即时）
  useEffect(() => {
    if (items.length === 0) return;
    let alive = true;
    generateThumbnails(items.map((it) => it.path))
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
  }, [items]);

  /** 提交后端的数据形态（探测完成才有意义） */
  const payload = useMemo<PipelineItem[]>(
    () =>
      items.map((it) => {
        const dims = it.info ? displayedDims(it.info, it.rot) : { w: 0, h: 0 };
        const px = it.crop ? cropPx(it.crop, dims) : null;
        return {
          input: it.path,
          segment:
            it.seg && it.seg.end > it.seg.start + 0.05
              ? { startSec: it.seg.start, endSec: it.seg.end }
              : null,
          rotateDeg: it.rot.deg,
          hflip: it.rot.hflip,
          vflip: it.rot.vflip,
          crop: px && px.w >= 16 && px.h >= 16 ? { x: px.x, y: px.y, width: px.w, height: px.h } : null,
          outWidth: null,
          outHeight: null,
        };
      }),
    [items],
  );

  const allProbed = items.length > 0 && items.every((it) => it.info || it.probeError);

  // 导出前检测（防抖 500ms；全部探测完成后才请求）
  useEffect(() => {
    if (!allProbed || items.some((it) => it.probeError)) {
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
  }, [payload, allProbed]);

  const outputDir = items.length > 0 ? items[0].path.replace(/[\\/][^\\/]+$/, "") : "";
  const probedItems = items.filter((it) => it.info);

  const startExport = async () => {
    if (probedItems.length === 0 || !outputDir || !outputName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitTask({
        type: "pipeline",
        items: payload,
        output: `${outputDir.replace(/[\\/]+$/, "")}\\${withFileTimestamp(outputName.trim())}`,
        quality,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const checkOf = (path: string) => check?.items.find((c) => c.input === path);
  const allLossless = check?.allLossless === true;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回主页"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold tracking-tight">工作台</h1>
        <span className="text-xs text-mute">逐段加工，合成一个成品</span>
        {items.length > 0 && (
          <span className="ml-auto text-xs text-mute">{items.length} 个片段</span>
        )}
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-3 overflow-y-auto p-4">
        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => void openFiles()}
            className="group flex h-64 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-hairline transition-colors hover:border-signal/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <Sparkles className="h-8 w-8 text-mute transition-colors group-hover:text-signal" strokeWidth={1.5} />
            <span className="text-sm text-mute transition-colors group-hover:text-paper">
              添加视频文件
            </span>
            <span className="text-xs text-mute/70">
              每个文件可剪切、旋转、放大，最后合成一条视频；无重编码操作时全程无损
            </span>
          </button>
        ) : (
          <>
            <div className="divide-y divide-hairline rounded-md border border-hairline">
              {items.map((it, i) => {
                const name = it.path.split(/[\\/]/).pop() ?? it.path;
                const c = checkOf(it.path);
                const expanded = expandedId === it.id;
                return (
                  <div key={it.id}>
                    <div
                      draggable
                      onDragStart={() => {
                        dragFrom.current = i;
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragFrom.current !== null) reorder(dragFrom.current, i);
                        dragFrom.current = null;
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-panel"
                    >
                      <GripVertical
                        className="h-4 w-4 shrink-0 cursor-grab text-mute/60"
                        aria-hidden="true"
                      />
                      <span className="w-5 shrink-0 text-center font-mono text-xs text-mute">
                        {i + 1}
                      </span>
                      {thumbs[it.path] ? (
                        <img
                          src={fileSrc(thumbs[it.path])}
                          alt=""
                          className="h-9 w-16 shrink-0 rounded border border-hairline object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded border border-hairline bg-panel">
                          <Film className="h-4 w-4 text-mute/60" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : it.id)}
                        className="min-w-0 flex-1 text-left focus:outline-none"
                      >
                        <span className="block truncate text-sm text-paper" title={it.path}>
                          {name}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <OpChip active={!!it.seg} label={it.seg ? `剪 ${formatTime(it.seg.start, false)}–${formatTime(it.seg.end, false)}` : "不剪切"} />
                          <OpChip active={it.rot.deg !== 0 || it.rot.hflip || it.rot.vflip} label={rotLabel(it.rot)} />
                          <OpChip active={!!it.crop} label={it.crop ? "放大" : "不放大"} />
                        </span>
                      </button>
                      {it.probeError ? (
                        <span className="shrink-0 text-xs text-warn" title={it.probeError}>
                          读取失败
                        </span>
                      ) : !it.info ? (
                        <span className="shrink-0 text-xs text-mute">读取中…</span>
                      ) : c ? (
                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-xs ${
                            c.copy
                              ? "border-signal/30 bg-signal/10 text-signal"
                              : "border-warn/30 bg-warn/10 text-warn"
                          }`}
                          title={c.copy ? "无损片段" : c.reasons.join("；")}
                        >
                          {c.copy ? "无损" : "重编码"}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeAt(i)}
                        aria-label={`移除 ${name}`}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-mute transition-colors hover:bg-warn/10 hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {expanded && it.info && (
                      <ItemEditor
                        item={it}
                        onChange={(patch) => updateItem(it.id, patch)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void openFiles()}
              className="flex items-center justify-center gap-2 rounded-md border border-dashed border-hairline py-2 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              <Plus className="h-3.5 w-3.5" /> 添加视频
            </button>
            <p className="text-[11px] text-mute/70">拖动左侧手柄调整合成顺序；点击文件名展开编辑。</p>

            {/* 检测面板（DESIGN §9.8） */}
            {items.length > 0 && (
              <div
                className={`rounded-md border p-4 ${
                  !allProbed || check
                    ? allLossless
                      ? "border-signal/30 bg-signal/5"
                      : check
                        ? "border-warn/40 bg-warn/5"
                        : "border-hairline bg-panel/60"
                    : "border-hairline bg-panel/60"
                }`}
              >
                {!allProbed ? (
                  <p className="text-sm text-mute">正在读取媒体信息…</p>
                ) : items.some((it) => it.probeError) ? (
                  <p className="text-sm text-warn">有片段读取失败，请先移除无法识别的文件。</p>
                ) : checkError ? (
                  <p className="text-sm text-warn">{checkError}</p>
                ) : !check ? (
                  <p className="text-sm text-mute">正在检测处理方式…</p>
                ) : (
                  <div>
                    <p className={`text-sm font-medium ${allLossless ? "text-signal" : "text-warn"}`}>
                      {allLossless ? "✓ 全程无损" : "⚠ 部分片段需要重编码"}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-mute">
                      {check.items
                        .filter((c) => !c.copy)
                        .map((c) => (
                          <li key={c.input}>
                            {c.input.split(/[\\/]/).pop()}：{c.reasons.join("；")}
                          </li>
                        ))}
                      {check.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-hairline px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-xs text-mute" title={outputDir}>
            输出到 {outputDir || "（先添加视频）"}
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
              probedItems.length === 0 ||
              items.some((it) => it.probeError)
            }
            onClick={() => void startExport()}
            title={items.length === 0 ? "请先添加视频" : undefined}
            className="rounded-md bg-signal px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "提交中…" : "合成导出"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function OpChip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded px-1 py-0.5 text-[10px] ${
        active ? "bg-signal/10 text-signal" : "bg-panel text-mute/60"
      }`}
    >
      {label}
    </span>
  );
}

function rotLabel(rot: RotateState) {
  if (rot.deg === 0 && !rot.hflip && !rot.vflip) return "不旋转";
  const parts: string[] = [];
  if (rot.deg !== 0) parts.push(`${rot.deg}°`);
  if (rot.hflip) parts.push("水平翻转");
  if (rot.vflip) parts.push("垂直翻转");
  return parts.join("+");
}

/** 单片段编辑器：剪切 / 旋转 / 放大 三个标签页 + 显示空间预览 */
function ItemEditor({
  item,
  onChange,
}: {
  item: WorkItem;
  onChange: (patch: Partial<WorkItem>) => void;
}) {
  const [tab, setTab] = useState<EditorTab>("cut");
  const info = item.info!;
  const dims = displayedDims(info, item.rot);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [proxyPath, setProxyPath] = useState<string | null>(null);
  const proxyTaskIdRef = useRef<string | null>(null);
  const [overRect, setOverRect] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);

  // 代理预览（与编辑器页同一套逻辑）
  useEffect(() => {
    let alive = true;
    if (needsProxy(info)) {
      generateProxy(item.path)
        .then((s) => {
          if (!alive) return;
          if (s.taskId) proxyTaskIdRef.current = s.taskId;
          else setProxyPath(s.proxyPath);
        })
        .catch(() => {
          /* 预览失败不阻塞数值编辑 */
        });
    }
    return () => {
      alive = false;
    };
  }, [info, item.path]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onTaskStatus((p) => {
      const tid = proxyTaskIdRef.current;
      if (tid && p.taskId === tid && p.status === "completed" && p.outputs[0]) {
        setProxyPath(p.outputs[0]);
      }
    }).then((f) => {
      unlisten = f;
    });
    return () => unlisten?.();
  }, []);

  const duration = info.durationSec;
  const setSeg = (seg: { start: number; end: number } | null) => onChange({ seg });

  /** 旋转改变显示空间，已框选的放大区域作废 */
  const changeRot = (rot: RotateState) => onChange({ rot, crop: null });

  const tabBtn = (t: EditorTab) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
      tab === t ? "bg-panel text-paper" : "text-mute hover:text-paper"
    }`;

  const stageAspect = `${dims.w} / ${dims.h}`;
  const quarter = item.rot.deg === 90 || item.rot.deg === 270;
  const innerStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: quarter ? `${(dims.h / dims.w) * 100}%` : "100%",
    height: quarter ? `${(dims.w / dims.h) * 100}%` : "100%",
    transform: `translate(-50%, -50%) rotate(${item.rot.deg}deg) scaleX(${item.rot.hflip ? -1 : 1}) scaleY(${item.rot.vflip ? -1 : 1})`,
  };

  // ---------- 放大：显示空间框选 / 移动（与编辑器页同一交互） ----------
  const cropHandlers = {
    onMouseMove: (e: ReactMouseEvent) => {
      const box = stageRef.current;
      if (!box || !item.crop) {
        setOverRect(false);
        return;
      }
      const r = box.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      setOverRect(
        nx >= item.crop.nx &&
          nx <= item.crop.nx + item.crop.nw &&
          ny >= item.crop.ny &&
          ny <= item.crop.ny + item.crop.nh,
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
      const base = item.crop;
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
        if (item.lockRatio && nw > 0) {
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

  const px = item.crop ? cropPx(item.crop, dims) : null;

  return (
    <div className="flex flex-col gap-3 border-t border-hairline bg-panel/40 px-3 py-3">
      {/* 预览：外层=显示空间（宽高随旋转交换），内层视频盒反向旋转回源比例 */}
      <div className="flex h-[40vh] w-full items-center justify-center overflow-hidden rounded-md border border-hairline bg-black">
        <div
          ref={stageRef}
          className={`relative ${tab === "crop" ? (overRect ? "cursor-move" : "cursor-crosshair") : ""}`}
          style={{ aspectRatio: stageAspect, height: "100%", maxWidth: "100%" }}
          {...(tab === "crop" ? cropHandlers : {})}
        >
          <div style={innerStyle}>
            <VideoPlayer
              ref={playerRef}
              fill
              src={fileSrc(proxyPath ?? item.path)}
              banner={proxyPath ? "当前为代理预览画面，导出使用原始文件" : null}
              onTime={tab === "cut" ? setCurrentTime : undefined}
              onError={() => {
                if (!proxyPath && !proxyTaskIdRef.current) {
                  void generateProxy(item.path).then((s) => {
                    if (s.taskId) proxyTaskIdRef.current = s.taskId;
                    else setProxyPath(s.proxyPath);
                  });
                }
              }}
            />
          </div>
          {tab === "crop" && item.crop && (
            <div
              className="pointer-events-none absolute border-2 border-signal bg-signal/10"
              style={{
                left: `${item.crop.nx * 100}%`,
                top: `${item.crop.ny * 100}%`,
                width: `${item.crop.nw * 100}%`,
                height: `${item.crop.nh * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      {/* 标签页 */}
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setTab("cut")} className={tabBtn("cut")}>
          <Scissors className="h-3.5 w-3.5" /> 剪切
        </button>
        <button type="button" onClick={() => setTab("rotate")} className={tabBtn("rotate")}>
          旋转
        </button>
        <button type="button" onClick={() => setTab("crop")} className={tabBtn("crop")}>
          <Sparkles className="h-3.5 w-3.5" /> 放大
        </button>
        <span className="ml-auto font-mono text-[11px] text-mute">
          {info.video.codec.toUpperCase()} {info.video.width}×{info.video.height} ·{" "}
          {formatTime(duration, false)} · {formatBytes(info.sizeBytes)}
        </span>
      </div>

      {tab === "cut" && (
        <CutTab item={item} duration={duration} currentTime={currentTime} playerRef={playerRef} onSeg={setSeg} />
      )}
      {tab === "rotate" && (
        <div className="flex flex-col gap-2">
          <RotateControls rot={item.rot} onChange={changeRot} currentRotation={info.rotation} />
          {item.crop && (
            <p className="text-xs text-warn">修改旋转会清除已框选的放大区域（框选基于旋转后的画面）。</p>
          )}
        </div>
      )}
      {tab === "crop" && (
        <CropTab item={item} dims={dims} px={px} onChange={onChange} />
      )}
    </div>
  );
}

function CutTab({
  item,
  duration,
  currentTime,
  playerRef,
  onSeg,
}: {
  item: WorkItem;
  duration: number;
  currentTime: number;
  playerRef: RefObject<VideoPlayerHandle | null>;
  onSeg: (seg: { start: number; end: number } | null) => void;
}) {
  const [startText, setStartText] = useState(item.seg ? formatTime(item.seg.start) : "");
  const [endText, setEndText] = useState(item.seg ? formatTime(item.seg.end) : "");

  useEffect(() => {
    setStartText(item.seg ? formatTime(item.seg.start) : "");
    setEndText(item.seg ? formatTime(item.seg.end) : "");
  }, [item.seg]);

  const commit = (which: "start" | "end", text: string) => {
    const t = parseTime(text);
    if (t === null) {
      setStartText(item.seg ? formatTime(item.seg.start) : "");
      setEndText(item.seg ? formatTime(item.seg.end) : "");
      return;
    }
    if (which === "start") {
      const start = Math.min(Math.max(0, t), duration);
      const end = item.seg ? Math.max(item.seg.end, start + 0.1) : duration;
      onSeg({ start, end: Math.min(end, duration) });
    } else {
      const end = Math.min(Math.max(0, t), duration);
      const start = item.seg ? Math.min(item.seg.start, Math.max(0, end - 0.1)) : 0;
      onSeg({ start, end });
    }
  };

  const field = (which: "start" | "end", label: string, text: string, setText: (v: string) => void) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-mute">{label}</span>
      <input
        value={text}
        placeholder="不剪切"
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(which, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-32 rounded border border-hairline bg-panel px-2 py-1.5 font-mono text-sm text-paper focus:border-signal focus:outline-none"
      />
    </label>
  );

  const btn =
    "rounded-md border border-hairline px-2.5 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        {field("start", "入点", startText, setStartText)}
        {field("end", "出点", endText, setEndText)}
        <button
          type="button"
          className={`${btn} mb-0.5`}
          onClick={() => {
            const start = Math.min(Math.max(0, currentTime), duration);
            const end = item.seg ? Math.max(item.seg.end, start + 0.1) : duration;
            onSeg({ start, end: Math.min(end, duration) });
          }}
        >
          入点=当前帧
        </button>
        <button
          type="button"
          className={`${btn} mb-0.5`}
          onClick={() => {
            const end = Math.min(Math.max(0, currentTime), duration);
            const start = item.seg ? Math.min(item.seg.start, Math.max(0, end - 0.1)) : 0;
            onSeg({ start, end });
          }}
        >
          出点=当前帧
        </button>
        <button
          type="button"
          className={`${btn} mb-0.5`}
          onClick={() => playerRef.current?.seek(item.seg?.start ?? 0)}
        >
          预览入点
        </button>
        <button
          type="button"
          className={`${btn} mb-0.5`}
          onClick={() => playerRef.current?.seek(item.seg?.end ?? duration)}
        >
          预览出点
        </button>
        {item.seg && (
          <button
            type="button"
            className="mb-0.5 rounded-md px-2.5 py-1.5 text-xs text-mute transition-colors hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            onClick={() => onSeg(null)}
          >
            清除区间
          </button>
        )}
      </div>
      <p className="text-xs text-mute">
        播放到想要的位置后"设为当前帧"；区间为 [{formatTime(item.seg?.start ?? 0)}, {formatTime(item.seg?.end ?? duration)})
        {item.seg ? `，共 ${(item.seg.end - item.seg.start).toFixed(3)} 秒` : "（当前整段保留）"}。
        无剪切/旋转/放大时此片段直接无损复制。
      </p>
    </div>
  );
}

function CropTab({
  item,
  dims,
  px,
  onChange,
}: {
  item: WorkItem;
  dims: { w: number; h: number };
  px: { x: number; y: number; w: number; h: number } | null;
  onChange: (patch: Partial<WorkItem>) => void;
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
    onChange({ crop: { nx: x / dims.w, ny: y / dims.h, nw: w / dims.w, nh: h / dims.h } });
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
        className="w-24 rounded border border-hairline bg-panel px-2 py-1.5 font-mono text-sm text-paper focus:border-signal focus:outline-none"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        {field("x", "X")}
        {field("y", "Y")}
        {field("w", "宽度")}
        {field("h", "高度")}
        <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-mute">
          <input
            type="checkbox"
            checked={item.lockRatio}
            onChange={(e) => onChange({ lockRatio: e.target.checked })}
            className="accent-[#4cc38a]"
          />
          锁定画面比例
        </label>
        {item.crop && (
          <button
            type="button"
            onClick={() => onChange({ crop: null })}
            className="mb-0.5 rounded-md px-2.5 py-1.5 text-xs text-mute transition-colors hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            清除选区
          </button>
        )}
      </div>
      <p className="text-xs text-mute">
        在预览上拖拽框选区域（框内拖动=移动选区），坐标基于旋转后的画面。
        {px
          ? `已选 ${px.w}×${px.h} @ (${px.x}, ${px.y})，输出将放大回 ${dims.w}×${dims.h}。`
          : "尚未框选。"}
        放大必然重编码，画质可用底部质量档位权衡。
      </p>
    </div>
  );
}
