import { ArrowLeft, Film } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CropFields, CropOverlay } from "../../components/CropOverlay";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import { NO_ROTATE, RotateControls, type RotateState } from "../../components/RotateControls";
import { useProxyPreview } from "../../hooks/useProxyPreview";
import {
  fileExists,
  fileSrc,
  pickVideo,
  probeMedia,
  submitTask,
} from "../../services/tauri";
import type { AppSettings, MediaInfo, QualityPreset } from "../../types";
import { cropSizeText, cropToPx, type CropRect } from "../../utils/crop";
import { needsProxy, wantsProxy } from "../../utils/media";
import { basename, resolveOutputDir, resolveUniqueTarget } from "../../utils/paths";
import { QUALITY_LABELS } from "../../utils/quality";

type EditorTool = "rotate" | "crop";

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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 旋转
  const [rot, setRot] = useState<RotateState>(NO_ROTATE);
  const [rotateTranscode, setRotateTranscode] = useState(false);
  const [quality, setQuality] = useState<QualityPreset>(settings.quality);

  // 设置在页面生命周期内不变，loadFile 闭包经 ref 读取
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // 裁剪（R1-4：框选交互/数值字段/选区框均来自 components/CropOverlay）
  const [rect, setRect] = useState<CropRect | null>(null);
  const [lockRatio, setLockRatio] = useState(true);
  const videoBoxRef = useRef<HTMLDivElement>(null);

  const playerRef = useRef<VideoPlayerHandle>(null);

  // 代理预览（R2-2 收敛走 hooks/useProxyPreview）：探测成功且需要代理时请求；
  // 播放失败兜底的门槛 = proxyMode !== "off"（源文件本可播却播不了时也兜底一次）
  const { proxyPath, onError } = useProxyPreview(
    inputPath ?? "",
    !!info && wantsProxy(info, settings.proxyMode),
    !!info && settings.proxyMode !== "off",
  );

  const loadFile = useCallback(async (path: string) => {
    setError(null);
    setProbeError(null);
    setInputPath(path);
    setInfo(null);
    setRot(NO_ROTATE);
    setRect(null);
    try {
      const mi = await probeMedia(path);
      setInfo(mi);
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

  const pxRect = (r: CropRect) =>
    info ? cropToPx(r, { w: info.video.width, h: info.video.height }) : null;

  const startEdit = async () => {
    if (!inputPath || !info) return;
    const src = inputPath;
    const name = basename(src);
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    // ADR-033：容器由命令决定、名字必须与之一致——元数据旋转是 copy（跟随源容器），
    // 转码旋转与局部放大是重编码（统一 mp4）。这里按同一口径生成名字，免得界面上写的和
    // 实际落盘的扩展名不一致（后端还会再校正一次兜底）。
    const srcExt = dot > 0 ? name.slice(dot + 1).toLowerCase() : "mp4";
    const ext = tool === "rotate" && !rotateTranscode ? srcExt : "mp4";
    const dir = resolveOutputDir(src, settings.defaultOutputDir);
    // 同名才追加时间戳（DESIGN 决策 #19）：上次导出还在时不静默覆盖
    const baseName = `${stem}_${tool === "rotate" ? "rotated" : "zoomed"}.${ext}`;
    const target = await resolveUniqueTarget(dir, baseName, fileExists);
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
          output: target,
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
          output: target,
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
                  onError={onError}
                  overlay={
                    tool === "crop" && (
                      <CropOverlay
                        boundsRef={videoBoxRef}
                        rect={rect}
                        onChange={setRect}
                        lockRatio={lockRatio}
                      />
                    )
                  }
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
                    className="accent-signal"
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
              <CropFields
                dims={{ w: info.video.width, h: info.video.height }}
                rect={px}
                onChange={setRect}
                lockRatio={lockRatio}
                onLockRatio={setLockRatio}
                hint={`在预览上拖拽框选区域（虚线外不可选）。${cropSizeText(px, { w: info.video.width, h: info.video.height })}画质受重编码影响，可用质量档位权衡。`}
                extra={
                  <label className="flex items-center gap-1.5 pb-2 text-xs text-mute">
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
                }
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
          {basename(filePath)}
        </span>
      )}
    </header>
  );
}
