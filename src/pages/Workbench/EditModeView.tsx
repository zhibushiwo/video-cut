/** ① 片段加工模式（预览区三态）：旋转 / 显示空间放大（裁剪叠加层贴显示空间外层盒，坐标即所见即所得）。
 *  R2-1 自 index.tsx 迁出；R2-2 走带键收敛进 hooks/usePlaybackHotkeys、代理预览收敛进 hooks/useProxyPreview。 */
import { useRef, useState, type CSSProperties } from "react";
import { RotateCw, ZoomIn } from "lucide-react";
import { CropBox, CropFields, useCropSelect } from "../../components/CropOverlay";
import { RotateControls } from "../../components/RotateControls";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import { usePlaybackHotkeys } from "../../hooks/usePlaybackHotkeys";
import { useProxyPreview } from "../../hooks/useProxyPreview";
import { fileSrc } from "../../services/tauri";
import type { Clip } from "../../types";
import { cropPreviewTransform, cropSizeText, cropToPx } from "../../utils/crop";
import { formatTime } from "../../utils/time";
import { displayedDims, fieldBtn, type ClipEdit, type EditorTab, type SourceFile } from "./shared";

export function EditModeView({
  clip,
  source,
  useProxy,
  onChange,
}: {
  clip: Clip;
  source: SourceFile;
  useProxy: boolean;
  onChange(patch: ClipEdit): void;
}) {
  const info = source.info!;
  const { proxyPath, onError } = useProxyPreview(source.path, useProxy);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [tab, setTab] = useState<EditorTab>("rotate");
  /**
   * 放大预览双态（`FR-354` / `ADR-035`，`M14-5`）：编辑态 = 全画面 + 可拖选区框；
   * 预览态 = 套用 `crop → scale` 后的画面（与导出构图一致，选区框只读）。切换**不重置选区**。
   */
  const [cropPreview, setCropPreview] = useState(false);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  // 片段区间内预览（M9-5）：越过出点自动暂停；循环 = 回到入点继续播
  const [loop, setLoop] = useState(false);
  const seg = clip.seg;
  /**
   * 区间内预览的**时间刻度**（`BUG-016` / UI.md §9.8）：进度条、时间读数与键盘走带
   * 一律以**片段区间**为准，不是整源——此前刻度按整源画，用户选了个 5 秒的片段却看到
   * 30 秒的条，而且能拖到区间外再被"弹回"入点。`seg = null`（全段片段）时退化为整源。
   */
  const rangeStart = seg ? seg.start : 0;
  const rangeEnd = seg ? seg.end : info.durationSec;
  const rangeLen = Math.max(0, rangeEnd - rangeStart);
  /** 源内时间 → 区间内相对时间（0..rangeLen） */
  const toRel = (t: number) => Math.min(Math.max(0, t - rangeStart), rangeLen);
  /** 区间内相对时间 → 源内时间（钳在区间内，拖不到外面） */
  const toSrc = (rel: number) => rangeStart + Math.min(Math.max(0, rel), rangeLen);

  const handleTime = (t: number) => {
    setCurrent(t);
    // 仅播放中触发：暂停态拖动进度越过出点不打断（再按播放会先回入点）
    if (seg && playing && t >= seg.end) {
      if (loop) {
        playerRef.current?.seek(seg.start);
      } else {
        playerRef.current?.pause();
        playerRef.current?.seek(seg.end);
      }
    }
  };

  const togglePlay = () => {
    if (playing) {
      playerRef.current?.pause();
      setPlaying(false);
    } else {
      // 区间内预览：起播点在区间外（含播完暂停在出点）时先回到入点
      if (seg && (current < seg.start - 0.02 || current >= seg.end - 0.02)) {
        playerRef.current?.seek(seg.start);
        setCurrent(seg.start);
      }
      playerRef.current?.play();
      setPlaying(true);
    }
  };

  // 快捷键（M4-3，片段加工）：走带共用块见 usePlaybackHotkeys（无页面专属键）
  const frameStep = info.video.frameRate > 0 ? 1 / info.video.frameRate : 1 / 30;
  // 键盘走带同样以区间为界（否则 ←/→ 仍能走到区间外，与刻度自相矛盾）
  usePlaybackHotkeys({
    currentTime: toRel(current),
    maxT: rangeLen,
    frameStep,
    onTogglePlay: togglePlay,
    onSeek: (rel) => {
      const t = toSrc(rel);
      playerRef.current?.seek(t);
      setCurrent(t);
    },
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

  // ---------- 放大：显示空间框选 / 移动（R1-4：与编辑器页共用 components/CropOverlay） ----------
  const stageRef = useRef<HTMLDivElement>(null);
  // handlers 挂在旋转舞台上（覆盖层会挡住视频自身的点击播放）；框在舞台坐标系里画
  const { overRect, handlers: cropHandlers } = useCropSelect({
    boundsRef: stageRef,
    rect: clip.crop,
    onChange: (crop) => onChange({ crop }),
    lockRatio: clip.lockRatio,
  });

  const px = clip.crop ? cropToPx(clip.crop, dims) : null;
  /** 编辑态（可拖框、数值字段生效）：仅放大 tab 且不在预览态 */
  const cropEditing = tab === "crop" && !cropPreview;

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
            className={`relative ${cropPreview ? "overflow-hidden" : ""} ${cropEditing ? (overRect ? "cursor-move" : "cursor-crosshair") : ""}`}
            style={{ aspectRatio: `${dims.w} / ${dims.h}`, height: "100%", maxWidth: "100%" }}
            {...(cropEditing ? cropHandlers : {})}
          >
            {/* 预览态（M14-5）：裁切映射只作用于这一层——旋转盒留在层内，选区框在外层坐标系里 */}
            <div
              className="absolute inset-0"
              style={
                cropPreview ? { transform: cropPreviewTransform(clip.crop) ?? undefined } : undefined
              }
            >
              <div style={innerStyle}>
                <VideoPlayer
                  ref={playerRef}
                  fill
                  controls={false}
                  src={fileSrc(proxyPath ?? source.path)}
                  banner={proxyPath ? "当前为代理预览画面，导出使用原始文件" : null}
                  onTime={handleTime}
                  onPlayStateChange={setPlaying}
                  onError={onError}
                  onLoadedMetadata={() => playerRef.current?.seek(clip.seg?.start ?? 0)}
                />
              </div>
            </div>
            {cropEditing && clip.crop && <CropBox rect={clip.crop} />}
            {tab === "crop" && (
              <div
                className="absolute right-1 top-1 flex overflow-hidden rounded-md border border-hairline bg-ink/80 backdrop-blur-sm"
                role="group"
                aria-label="放大预览：编辑 / 预览"
                // 舞台上有框选 handlers（onPointerDown 拉选区），切换控件必须拦掉冒泡
                onPointerDown={(e) => e.stopPropagation()}
              >
                {[
                  ["edit", "编辑"],
                  ["preview", "预览"],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCropPreview(v === "preview")}
                    aria-pressed={cropPreview === (v === "preview")}
                    className={`px-2 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal ${
                      cropPreview === (v === "preview")
                        ? "bg-panel text-paper"
                        : "text-mute hover:text-paper"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* 走带控制外置：控制条在变换盒内会被旋转/裁剪层遮挡（§9.8 预览约定） */}
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={togglePlay} className={fieldBtn}>
            {playing ? "暂停" : "播放"}
          </button>
          {/* 刻度 = 片段区间（`BUG-016`）：`toRel`/`toSrc` 负责与源内时间互转并钳在区间内 */}
          <input
            type="range"
            min={0}
            max={rangeLen}
            step={0.05}
            value={toRel(current)}
            onChange={(e) => {
              const t = toSrc(Number(e.target.value));
              playerRef.current?.seek(t);
              setCurrent(t);
            }}
            aria-label="播放进度"
            className="h-1 min-w-0 flex-1 cursor-pointer accent-signal"
          />
          <span className="shrink-0 font-mono text-[10px] text-mute">
            {formatTime(toRel(current), false)} / {formatTime(rangeLen, false)}
          </span>
          {seg && (
            <button
              type="button"
              onClick={() => setLoop((v) => !v)}
              aria-pressed={loop}
              title="循环播放片段区间"
              className={`${fieldBtn} ${loop ? "text-signal" : ""}`}
            >
              循环
            </button>
          )}
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
            dense
            dims={dims}
            rect={px}
            onChange={(crop) => onChange({ crop })}
            lockRatio={clip.lockRatio}
            onLockRatio={(v) => onChange({ lockRatio: v })}
            disabled={cropPreview}
            hint={
              cropPreview
                ? "预览态：画面即导出构图（裁切区被拉伸填满，宽高比不保持）。切回编辑态可继续调整；导出以 FFmpeg 实际输出为准。"
                : `在预览上拖拽框选（框内拖动=移动选区），坐标基于旋转后的画面。${cropSizeText(px, dims)}放大必然重编码，画质用页脚质量档位权衡。`
            }
            extra={
              !cropPreview &&
              px && (
                <button
                  type="button"
                  onClick={() => onChange({ crop: null })}
                  className="rounded-md px-2 py-1 text-xs text-mute transition-colors hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  清除选区
                </button>
              )
            }
          />
        )}
        <p className="text-[11px] leading-relaxed text-mute/70">
          区间 {clip.seg ? `${formatTime(clip.seg.start, false)}–${formatTime(clip.seg.end, false)}` : "全段"}
          {clip.seg ? "，播放限制在区间内、播完出点即停（可开循环）" : ""}；如需重剪，删除此片段后从素材卡重新剪切。
        </p>
      </div>
    </div>
  );
}
