/** ① 片段加工模式（预览区三态）：旋转 / 显示空间放大（裁剪叠加层贴显示空间外层盒，坐标即所见即所得）。
 *  R2-1 自 index.tsx 迁出；R2-2 走带键收敛进 hooks/usePlaybackHotkeys、代理预览收敛进 hooks/useProxyPreview。 */
import { useRef, useState } from "react";
import { RotateCw, ZoomIn } from "lucide-react";
import { CropBox, CropFields, useCropSelect } from "../../components/CropOverlay";
import { displayedStageStyle, RotateControls } from "../../components/RotateControls";
import VideoPlayer, { type VideoPlayerHandle } from "../../components/VideoPlayer";
import { usePlaybackHotkeys } from "../../hooks/usePlaybackHotkeys";
import { useProxyPreview } from "../../hooks/useProxyPreview";
import { fileSrc } from "../../services/tauri";
import type { Clip, EditorToolTab } from "../../types";
import { cropPreviewTransform, cropSizeText, cropToPx } from "../../utils/crop";
import { formatTime, frameStepOf } from "../../utils/time";
import { displayedDims, fieldBtn, type ClipEdit, type SourceFile } from "./shared";

export function EditModeView({
  clip,
  source,
  active,
  useProxy,
  onChange,
}: {
  clip: Clip;
  source: SourceFile;
  /** M10-1 页面保活：本页是否为当前活动页（false = 被隐藏保活）；热键经它门控 */
  active: boolean;
  useProxy: boolean;
  onChange(patch: ClipEdit): void;
}) {
  const info = source.info!;
  const { proxyPath, onError } = useProxyPreview(source.path, useProxy);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [tab, setTab] = useState<EditorToolTab>("rotate");
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

  /**
   * 「起播回退」门（`BUG-017` → `BUG-020` → `BUG-022`，三代同源）：播完停在出点后重播要先
   * `seek` 回入点，而 `seek()` 是异步的——落地前的上报还是**旧位置**（恰好停在出点），
   * 拿它做越界判定就会"刚起播就被自己按停"（表现为"进度条回到原点、按钮没变、画面不动"，
   * 从中间剪的段因 seek 慢而稳定复现）。故置此标志挡住回退期间的越界判定。
   *
   * **解除信号只有 `seeked`**（`VideoPlayer.onSeeked`）：`onTime` 主要由 rAF 驱动、而 rAF
   * 只在 `play` 之后才跑，拿它当解除条件会形成鸡生蛋（`BUG-020`）。起播**不等**这个门
   * ——`togglePlay` 里 seek 与 play 当场一起发出（长 GOP 源回退 seek 要 1.6~2s，
   * 等落地再 play() 期间按钮一直是「播放」，用户以为没反应就反复点击，每次点击又打断
   * 上一次未落地的 play()，重播就此永不发生 = `BUG-022` 的用户可见面）。
   */
  const pendingPlayRef = useRef(false);

  const handleTime = (t: number) => {
    setCurrent(t);
    // 「起播回退」门（`BUG-017` / `BUG-020`）：回退 seek 落地前的上报可能还是**回退前的
    // 旧位置**（恰好停在出点），拿它做越界判定就会"刚起播就被自己按停"；解除信号只有
    // `seeked`（`VideoPlayer.onSeeked`）。
    if (pendingPlayRef.current) return;
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

  /**
   * seek 落地 = 「起播回退」门解除（`seeked` 是唯一可靠的"已落地"信号，见 `VideoPlayer.onSeeked`）。
   * **不在这里补 `play()`**：起播已在 `togglePlay` 里当场发起（不等 seeked，见其注释），
   * 若用户在这段等待里按了暂停，补一次 play() 会把他的暂停抢回来。
   */
  const handleSeeked = () => {
    pendingPlayRef.current = false;
  };

  /**
   * 播放态**只由 `<video>` 的事件回写**（`VideoPlayer` 的 `onPlayStateChange`，见其
   * `play`/`pause`/`loadstart` 三处监听）——不再在这里乐观地 `setPlaying(true/false)`。
   * 乐观写会让按钮"抢跑"：`play()` 万一没真起来（被中断、换源重载），按钮已经翻成「暂停」，
   * 用户看到的就是"按钮说在播、画面一动不动"（`BUG-018`）。
   */
  const togglePlay = () => {
    if (playing) {
      playerRef.current?.pause();
      return;
    }
    // 区间内预览：起播点在区间外（含播完暂停在出点）时先回到入点。
    // seek 与 play **当场一起发出**（`BUG-022`）：从中间剪出的段回退 seek 要回退解码到
    // 关键帧，实测 1.6~2s（长 GOP 的 1080p60 源）——若等 `seeked` 再 play()，这段时间按钮
    // 仍是「播放」、画面不动，用户以为没反应就会连点，而每次连点都会打断上一次未落地的
    // play()（日志里的 `AbortError`），重播就此永不发生。当场 play() 让播放态/按钮立刻有
    // 反馈，seek 落地即续播；回退期间的旧位置上报由 handleTime 的门挡住。
    if (seg && (current < seg.start - 0.02 || current >= seg.end - 0.02)) {
      pendingPlayRef.current = true;
      playerRef.current?.seek(seg.start);
      setCurrent(seg.start);
      playerRef.current?.play();
      return;
    }
    playerRef.current?.play();
  };

  // 快捷键（M4-3，片段加工）：走带共用块见 usePlaybackHotkeys（无页面专属键）
  const frameStep = frameStepOf(info.video.frameRate);
  // 键盘走带同样以区间为界（否则 ←/→ 仍能走到区间外，与刻度自相矛盾）
  usePlaybackHotkeys({
    enabled: active,
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
  const innerStyle = displayedStageStyle(dims, clip.rot);

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

  const tabBtn = (t: EditorToolTab) =>
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
                  onSeeked={handleSeeked}
                  onPlayStateChange={setPlaying}
                  onError={onError}
                  onLoadedMetadata={() => playerRef.current?.seek(clip.seg?.start ?? 0)}
                  // 点画面 = 点「播放」按钮（同一条走带切换）：默认的"点画面只 play()"会绕过
                  // 区间回退 —— 播完停在出点后点画面，位置仍在出点之外，越界判定下一帧就把
                  // 自己按停，怎么点都只起播一帧（`BUG-023`；全段片段不参与越界判定，所以
                  // 只有"从中间剪出来的片段"会这样）
                  onVideoClick={togglePlay}
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
          {/* 刻度 = 片段区间（`BUG-016`）：`toRel`/`toSrc` 负责与源内时间互转并钳在区间内。
              `step="any"`（`BUG-017`）：片段长度（如 3.017）通常不是 0.05 的整数倍，用固定 step
              会把取值吸附到网格上（3.017→3.00），播到出点时拇指就**差一小截到不了最右端**。 */}
          <input
            type="range"
            min={0}
            max={rangeLen}
            step="any"
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
