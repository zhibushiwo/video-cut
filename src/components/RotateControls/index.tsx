import { RotateCcw, RotateCw } from "lucide-react";
import type { RotateState } from "../../types";

/** 旋转组合状态（0/90/180/270 + 独立翻转）——定义已收进共享模型 `types/`（M11-0），此处再导出保持既有 import 不变 */
export type { RotateState };

export const NO_ROTATE: RotateState = { deg: 0, hflip: false, vflip: false };

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
