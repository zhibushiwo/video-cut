import { RotateCcw, RotateCw } from "lucide-react";
import type { CSSProperties } from "react";
import type { RotateState } from "../../types";

export const NO_ROTATE: RotateState = { deg: 0, hflip: false, vflip: false };

/**
 * 旋转舞台内层样式（T-005 收敛 EditModeView / ProductPreview 两份同构）：
 * 四分之一旋转交换宽高铺满容器 + 平移居中 + rotate/scale 变换。
 * `dims` 传**源**宽高（显示空间 = 源画面经此变换）。
 */
export function displayedStageStyle(
  dims: { w: number; h: number },
  rot: RotateState,
): CSSProperties {
  const quarter = rot.deg === 90 || rot.deg === 270;
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: quarter ? `${(dims.h / dims.w) * 100}%` : "100%",
    height: quarter ? `${(dims.w / dims.h) * 100}%` : "100%",
    transform: `translate(-50%, -50%) rotate(${rot.deg}deg) scaleX(${rot.hflip ? -1 : 1}) scaleY(${rot.vflip ? -1 : 1})`,
  };
}

/** 叠加式旋转按钮组：旋转与翻转任意组合，预览即所得（DESIGN §3.4、§9.8） */
export function RotateControls({
  rot,
  onChange,
  currentRotation,
}: {
  rot: RotateState;
  onChange: (r: RotateState) => void;
  currentRotation: number | null;
}) {
  const hasChange = rot.deg !== 0 || rot.hflip || rot.vflip;
  const btn = (active: boolean) =>
    `flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
      active
        ? "border-signal/50 bg-signal/10 text-signal"
        : "border-hairline text-mute hover:border-mute hover:text-paper"
    }`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...rot, deg: (rot.deg + 270) % 360 })}
          className={btn(false)}
        >
          <RotateCcw className="h-3.5 w-3.5" /> 左转 90°
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...rot, deg: (rot.deg + 90) % 360 })}
          className={btn(false)}
        >
          <RotateCw className="h-3.5 w-3.5" /> 右转 90°
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...rot, deg: (rot.deg + 180) % 360 })}
          className={btn(false)}
        >
          旋转 180°
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...rot, hflip: !rot.hflip })}
          className={btn(rot.hflip)}
        >
          水平翻转
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...rot, vflip: !rot.vflip })}
          className={btn(rot.vflip)}
        >
          垂直翻转
        </button>
        {hasChange && (
          <button
            type="button"
            onClick={() => onChange(NO_ROTATE)}
            className="rounded-md px-3 py-2 text-sm text-mute transition-colors hover:text-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            重置
          </button>
        )}
      </div>
      <p className="text-xs text-mute">
        当前方向元数据：
        {currentRotation ? `${currentRotation}°（顺时针）` : "无旋转"}
        。按钮可叠加组合（先旋转再翻转），预览即所得。
        {hasChange && ` 已选：${rot.deg}°${rot.hflip ? " + 水平翻转" : ""}${rot.vflip ? " + 垂直翻转" : ""}`}
      </p>
    </div>
  );
}
