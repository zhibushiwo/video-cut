import { ArrowLeft, Film } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import { NO_ROTATE, RotateControls, type RotateState } from "../../components/RotateControls";
import {
  fileSrc,
  generateProxy,
  onTaskStatus,
  pickVideo,
  probeMedia,
  submitTask,
} from "../../services/tauri";
import type { AppSettings, MediaInfo, QualityPreset } from "../../types";
import { needsProxy, wantsProxy } from "../../utils/media";
import { resolveOutputDir } from "../../utils/paths";

export type EditorTool = "rotate" | "crop";

interface CropRect {
  /** 归一化坐标 0..1（相对视频画面） */
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

const QUALITY_LABELS: Record<QualityPreset, string> = {
  high: "高质量",
  balanced: "平衡",
  small: "小体积",
};

export default function EditorPage({
  tool,
  settings,
  onBack,
  initialFiles,
}: {
  tool: EditorTool;
  settings: AppSettings;
  onBack: () => void;
  initialFiles?: string[] | null;
}) {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [proxyPath, setProxyPath] = useState<string | null>(null);
  const proxyTaskIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 旋转
  const [rot, setRot] = useState<RotateState>(NO_ROTATE);
  const [rotateTranscode, setRotateTranscode] = useState(false);
  const [quality, setQuality] = useState<QualityPreset>(settings.quality);

  // 设置在页面生命周期内不变，loadFile 闭包经 ref 读取
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // 裁剪
  const [rect, setRect] = useState<CropRect | null>(null);
  const [lockRatio, setLockRatio] = useState(true);
  const [overRect, setOverRect] = useState(false);
  const videoBoxRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);

  const playerRef = useRef<VideoPlayerHandle>(null);

  // 代理任务完成 → 切换画面
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

  const loadFile = useCallback(async (path: string) => {
    setError(null);
    setProbeError(null);
    setInputPath(path);
    setInfo(null);
    setRot(NO_ROTATE);
    setRect(null);
    setProxyPath(null);
    proxyTaskIdRef.current = null;
    try {
      const mi = await probeMedia(path);
      setInfo(mi);
      // 代理三态：auto 按需 / always 强制 / off 不生成（DESIGN §3.7/§10/§12）
      if (wantsProxy(mi, settingsRef.current.proxyMode)) {
        const started = await generateProxy(path);
        if (started.taskId) proxyTaskIdRef.current = started.taskId;
        else setProxyPath(started.proxyPath);
      }
    } catch (err) {
      setProbeError(String(err));
      setInputPath(null);
    }
  }, []);

  const openFile = useCallback(async () => {
    const path = await pickVideo();
    if (path) void loadFile(path);
  }, [loadFile]);

  // 拖拽导入：每次新的拖入都加载第一个文件（App 层原地分发，页面不跳转）
  const consumedInitialRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (!initialFiles || initialFiles === consumedInitialRef.current) return;
    consumedInitialRef.current = initialFiles;
    if (initialFiles[0]) void loadFile(initialFiles[0]);
  }, [initialFiles, loadFile]);

  const pxRect = (r: CropRect) => {
    if (!info) return null;
    const even = (v: number) => Math.max(0, Math.round(v / 2) * 2);
    const x = even(r.nx * info.video.width);
    const y = even(r.ny * info.video.height);
    const w = even(r.nw * info.video.width);
    const h = even(r.nh * info.video.height);
    return { x, y, w, h };
  };

  const startEdit = async () => {
    if (!inputPath || !info) return;
    const src = inputPath;
    const name = src.split(/[\\/]/).pop() ?? "output";
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "mp4";
    const dir = resolveOutputDir(src, settings.defaultOutputDir);
    setSubmitting(true);
    setError(null);
    try {
      if (tool === "rotate") {
        await submitTask({
          type: "rotate",
          input: src,
          rotateDeg: rot.deg,
          hflip: rot.hflip,
          vflip: rot.vflip,
          output: `${dir}\\${stem}_rotated.${ext}`,
          transcode: rotateTranscode,
          quality,
          encoder: settings.encoder === "auto" ? null : settings.encoder,
        });
      } else {
        const px = pxRect(rect ?? { nx: 0, ny: 0, nw: 1, nh: 1 });
        if (!px || px.w < 16 || px.h < 16) {
          setError("请先在画面上框选至少 16×16 的区域");
          return;
        }
        await submitTask({
          type: "crop_zoom",
          input: src,
          x: px.x,
          y: px.y,
          width: px.w,
          height: px.h,
          outWidth: null,
          outHeight: null,
          quality,
          output: `${dir}\\${stem}_zoomed.${ext}`,
          encoder: settings.encoder === "auto" ? null : settings.encoder,
        });
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 未打开文件 ----------
  if (!inputPath) {
    return (
      <div className="flex h-full flex-col">
        <EditorHeader tool={tool} onBack={onBack} />
        <div className="flex flex-1 items-center justify-center p-6">
          <button
            type="button"
            onClick={() => void openFile()}
            className="group flex h-64 w-full max-w-xl flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-hairline transition-colors hover:border-signal/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <Film className="h-8 w-8 text-mute transition-colors group-hover:text-signal" strokeWidth={1.5} />
            <span className="text-sm text-mute transition-colors group-hover:text-paper">
              打开视频文件
            </span>
            <span className="text-xs text-mute/70">
              {tool === "rotate" ? "默认仅修改方向元数据，秒级无损" : "框选区域，裁切后放大输出"}
            </span>
          </button>
        </div>
        {probeError && <p className="px-6 pb-4 text-center text-xs text-warn">{probeError}</p>}
      </div>
    );
  }

  const fitScale = info ? Math.min(info.video.width / info.video.height, info.video.height / info.video.width) : 1;
  const transform =
    tool === "rotate" && (rot.deg !== 0 || rot.hflip || rot.vflip)
      ? [
          rot.deg !== 0 ? `rotate(${rot.deg}deg)` : "",
          rot.hflip ? "scaleX(-1)" : "",
          rot.vflip ? "scaleY(-1)" : "",
          (rot.deg === 90 || rot.deg === 270) ? `scale(${fitScale.toFixed(4)})` : "",
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;

  const px = info && rect ? pxRect(rect) : null;

  return (
    <div className="flex h-full flex-col">
      <EditorHeader tool={tool} onBack={onBack} filePath={inputPath} />
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto p-4">
        {probeError ? (
          <p className="text-xs text-warn">{probeError}</p>
        ) : (
          <>
            {/* 预览：旋转用 CSS transform 实时呈现；裁剪叠加框选层 */}
            <div className="flex h-[44vh] w-full items-center justify-center overflow-hidden rounded-md border border-hairline bg-black">
              <div
                ref={videoBoxRef}
                className="relative"
                style={
                  info
                    ? {
                        aspectRatio: `${info.video.width} / ${info.video.height}`,
                        height: "100%",
                        transform: transform ?? undefined,
                      }
                    : undefined
                }
              >
                <VideoPlayer
                  ref={playerRef}
                  src={fileSrc(proxyPath ?? inputPath)}
                  banner={
                    proxyPath
                      ? "当前为代理预览画面，导出使用原始文件"
                      : settings.proxyMode === "off" && info && needsProxy(info)
                        ? "代理预览已关闭，此格式无法预览；导出不受影响，可在设置中开启代理预览"
                        : null
                  }
                  onError={() => {
                    // 原始文件播不了且代理还没生成 → 兜底请求代理（设置关闭时不兜底）
                    if (
                      settings.proxyMode !== "off" &&
                      !proxyPath &&
                      !proxyTaskIdRef.current &&
                      info
                    ) {
                      void generateProxy(inputPath).then((s) => {
                        if (s.taskId) proxyTaskIdRef.current = s.taskId;
                        else setProxyPath(s.proxyPath);
                      });
                    }
                  }}
                overlay={tool === "crop" && (
                  <div
                    className={`absolute inset-0 ${overRect ? "cursor-move" : "cursor-crosshair"}`}
                    onMouseMove={(e) => {
                      const box = videoBoxRef.current;
                      if (!box || !rect) {
                        setOverRect(false);
                        return;
                      }
                      const r = box.getBoundingClientRect();
                      const nx = (e.clientX - r.left) / r.width;
                      const ny = (e.clientY - r.top) / r.height;
                      setOverRect(
                        nx >= rect.nx &&
                          nx <= rect.nx + rect.nw &&
                          ny >= rect.ny &&
                          ny <= rect.ny + rect.nh,
                      );
                    }}
                    onPointerDown={(e) => {
                      const box = videoBoxRef.current;
                      if (!box || e.button !== 0) return;
                      e.preventDefault();
                      const r = box.getBoundingClientRect();
                      const toN = (cx: number, cy: number) => ({
                        nx: Math.min(1, Math.max(0, (cx - r.left) / r.width)),
                        ny: Math.min(1, Math.max(0, (cy - r.top) / r.height)),
                      });
                      const p = toN(e.clientX, e.clientY);
                      const inRect =
                        !!rect &&
                        p.nx >= rect.nx &&
                        p.nx <= rect.nx + rect.nw &&
                        p.ny >= rect.ny &&
                        p.ny <= rect.ny + rect.nh;

                      const attach = (move: (ev: PointerEvent) => void) => {
                        const up = () => {
                          window.removeEventListener("pointermove", move);
                          window.removeEventListener("pointerup", up);
                        };
                        window.addEventListener("pointermove", move);
                        window.addEventListener("pointerup", up);
                      };

                      if (inRect && rect) {
                        // 移动模式：平移现有选区，保持尺寸
                        const base = rect;
                        const offX = p.nx - base.nx;
                        const offY = p.ny - base.ny;
                        drawingRef.current = true;
                        attach((ev) => {
                          if (!drawingRef.current) return;
                          const q = toN(ev.clientX, ev.clientY);
                          const nx = Math.min(
                            1 - base.nw,
                            Math.max(0, q.nx - offX),
                          );
                          const ny = Math.min(
                            1 - base.nh,
                            Math.max(0, q.ny - offY),
                          );
                          setRect({ ...base, nx, ny });
                        });
                        return;
                      }

                      // 框选模式：从按下点拉出选区（支持任意方向）
                      const startN = p;
                      drawingRef.current = true;
                      const move = (ev: PointerEvent) => {
                        if (!drawingRef.current) return;
                        const endN = toN(ev.clientX, ev.clientY);
                        const nxMin = Math.min(startN.nx, endN.nx);
                        const nyMin = Math.min(startN.ny, endN.ny);
                        let nw = Math.abs(endN.nx - startN.nx);
                        let nh = Math.abs(endN.ny - startN.ny);
                        if (lockRatio && nw > 0) {
                          // 锁定源比例时，归一化空间里 nw == nh（宽高比约掉）
                          nh = Math.min(nh, nw);
                          nw = nh;
                        }
                        nw = Math.min(nw, 1 - nxMin);
                        nh = Math.min(nh, 1 - nyMin);
                        setRect({ nx: nxMin, ny: nyMin, nw, nh });
                      };
                      attach(move);
                    }}
                  >
                    {rect && (
                      <div
                        className="pointer-events-none absolute border-2 border-signal bg-signal/10"
                        style={{
                          left: `${rect.nx * 100}%`,
                          top: `${rect.ny * 100}%`,
                          width: `${rect.nw * 100}%`,
                          height: `${rect.nh * 100}%`,
                        }}
                      />
                    )}
                  </div>
                )}
                />
              </div>
            </div>

            {info && tool === "rotate" && (
              <div className="flex w-full max-w-3xl flex-col gap-3">
                <RotateControls rot={rot} onChange={setRot} currentRotation={info.rotation} />
                <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-mute">
                  <input
                    type="checkbox"
                    checked={rotateTranscode}
                    onChange={(e) => setRotateTranscode(e.target.checked)}
                    className="accent-[#4cc38a]"
                  />
                  高级：重编码旋转（把方向画进像素，兼容不支持方向元数据的播放器）
                </label>
                {rotateTranscode && (
                  <p className="text-xs text-mute/70">
                    重编码使用平衡档位（libx264 CRF 20 或可用硬件编码器）。
                  </p>
                )}
              </div>
            )}

            {info && tool === "crop" && (
              <CropControls
                info={info}
                rect={rect}
                px={px}
                lockRatio={lockRatio}
                onLockRatio={setLockRatio}
                onRect={setRect}
                quality={quality}
                onQuality={setQuality}
              />
            )}

            {error && <p className="text-xs text-warn">{error}</p>}
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-hairline px-4 py-3">
        <span className="min-w-0 flex-1 text-xs text-mute">
          {info
            ? `输出到视频所在目录，文件名自动加 _${tool === "rotate" ? "rotated" : "zoomed"} 后缀`
            : ""}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-xs ${
            tool === "rotate" && !rotateTranscode
              ? "border-signal/30 bg-signal/10 text-signal"
              : "border-warn/30 bg-warn/10 text-warn"
          }`}
        >
          {tool === "rotate" && !rotateTranscode ? "无损" : "重编码"}
        </span>
        <button
          type="button"
          disabled={
            submitting ||
            !info ||
            (tool === "rotate"
              ? rot.deg === 0 && !rot.hflip && !rot.vflip
              : !px || px.w < 16 || px.h < 16)
          }
          onClick={() => void startEdit()}
          className="rounded-md bg-signal px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "提交中…" : tool === "rotate" ? "开始旋转" : "开始放大"}
        </button>
      </footer>
    </div>
  );
}

function EditorHeader({
  tool,
  onBack,
  filePath,
}: {
  tool: EditorTool;
  onBack: () => void;
  filePath?: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="返回工作台"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <h1 className="text-sm font-semibold tracking-tight">
        {tool === "rotate" ? "旋转" : "局部放大"}
      </h1>
      {filePath && (
        <span className="ml-auto min-w-0 truncate text-xs text-mute" title={filePath}>
          {filePath.split(/[\\/]/).pop()}
        </span>
      )}
    </header>
  );
}

interface CropControlsProps {
  info: MediaInfo;
  rect: CropRect | null;
  px: { x: number; y: number; w: number; h: number } | null;
  lockRatio: boolean;
  onLockRatio: (v: boolean) => void;
  onRect: (r: CropRect) => void;
  quality: QualityPreset;
  onQuality: (q: QualityPreset) => void;
}

function CropControls({
  info,
  px,
  lockRatio,
  onLockRatio,
  onRect,
  quality,
  onQuality,
}: CropControlsProps) {
  const { width: W, height: H } = info.video;
  const even = (v: number) => Math.max(0, Math.round(v / 2) * 2);
  const [fields, setFields] = useState({ x: "0", y: "0", w: "0", h: "0" });

  // 拖拽更新 rect → 同步到输入框
  useEffect(() => {
    if (px) setFields({ x: String(px.x), y: String(px.y), w: String(px.w), h: String(px.h) });
  }, [px]);

  // 任一字段提交：以四个输入框的当前值为整体，校验后生成矩形
  const commit = () => {
    const x = even(Number(fields.x) || 0);
    const y = even(Number(fields.y) || 0);
    let w = even(Number(fields.w) || 0);
    let h = even(Number(fields.h) || 0);
    if (w < 16 || h < 16) return;
    if (x + w > W) w = W - even(Math.min(x, W - 16));
    if (y + h > H) h = H - even(Math.min(y, H - 16));
    if (w < 16 || h < 16) return;
    onRect({ nx: x / W, ny: y / H, nw: w / W, nh: h / H });
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
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {field("x", "X")}
        {field("y", "Y")}
        {field("w", "宽度")}
        {field("h", "高度")}
        <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-mute">
          <input
            type="checkbox"
            checked={lockRatio}
            onChange={(e) => onLockRatio(e.target.checked)}
            className="accent-[#4cc38a]"
          />
          锁定画面比例
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-mute">
          质量档位
          <select
            value={quality}
            onChange={(e) => onQuality(e.target.value as QualityPreset)}
            className="rounded border border-hairline bg-panel px-2 py-1 text-xs text-paper focus:border-signal focus:outline-none"
          >
            {(Object.keys(QUALITY_LABELS) as QualityPreset[]).map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABELS[q]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-mute">
        在预览上拖拽框选区域（虚线外不可选）。
        {px
          ? `已选 ${px.w}×${px.h} @ (${px.x}, ${px.y})，输出将放大回 ${W}×${H}。`
          : "尚未框选。"}
        画质受重编码影响，可用质量档位权衡。
      </p>
    </div>
  );
}
