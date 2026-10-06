/**
 * 裁剪（局部放大）框选交互与数值字段（R1-4）：编辑器页与工作台片段加工共用一套实现
 * （UI.md §9.8）。此前两页各有一份逐行同构的拷贝，任何一边修 bug 都要同步改两处。
 *
 * 三个导出，按页面的 DOM 结构选用：
 * - `useCropSelect`：交互内核（悬停光标态 + 拖拽框选/移动），handlers 挂到任意元素上。
 *   工作台把 handlers 挂在旋转舞台上，这样视频自身的点击播放不被遮挡；
 * - `<CropOverlay>`：绝对定位整层覆盖（含 `CropBox`），编辑器页塞进 VideoPlayer 的 overlay 插槽；
 * - `<CropBox>`：只画选区框——框必须画在选区所属的坐标系里（工作台的框在旋转舞台上、与旋转层同级）。
 *
 * 坐标一律为归一化值，量尺容器由 `boundsRef` 指定（选区按它的矩形换算）。
 * 拖拽在 window 上收 pointermove/pointerup/pointercancel，指针移出容器、甚至移出窗口也不丢收尾
 * （统一走 `utils/pointerDrag` 的 `beginPointerDrag`）。
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CropRect } from "../../types";
import { pxToCrop, type CropPx } from "../../utils/crop";
import { beginPointerDrag } from "../../utils/pointerDrag";

/** 边缘热区宽度（显示像素，M16-6）——与时间轴修剪手柄的热区同量级 */
const EDGE_HOT_PX = 8;
/** 拖边调整的最小选区（显示像素） */
const MIN_RECT_PX = 8;

interface CropSelectOptions {
  /** 量尺容器：归一化坐标相对它的矩形换算 */
  boundsRef: RefObject<HTMLElement | null>;
  /** 当前选区（null = 未框选） */
  rect: CropRect | null;
  onChange(rect: CropRect): void;
  /** 框选时锁定画面比例（归一化空间里 nw == nh，宽高比约掉） */
  lockRatio: boolean;
}

/**
 * 框选交互内核：返回悬停光标与可挂到任意元素上的指针 handlers。
 * 交互规则（M16-6 起三层）：**边缘热区**（约 8px）按下 = 拖该边调整大小（角 = 两边同时）；
 * 框内按下 = 平移选区（保持尺寸）；框外按下 = 从按下点拉出新区选（任意方向）。
 * 比例锁只作用于"拉新框"；逐边调整不锁比例（锁哪条边的比例在交互上无定义）。
 */
export function useCropSelect({ boundsRef, rect, onChange, lockRatio }: CropSelectOptions) {
  const [cursor, setCursor] = useState("cursor-crosshair");
  // 指针事件在 window 上，闭包可能过期 → 用 ref 读最新值
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const lockRatioRef = useRef(lockRatio);
  lockRatioRef.current = lockRatio;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /** 归一化坐标（越出容器的部分贴到 0/1） */
  const toNorm = (r: DOMRect, cx: number, cy: number) => ({
    nx: Math.min(1, Math.max(0, (cx - r.left) / r.width)),
    ny: Math.min(1, Math.max(0, (cy - r.top) / r.height)),
  });

  const inRect = (p: { nx: number; ny: number }, r: CropRect) =>
    p.nx >= r.nx && p.nx <= r.nx + r.nw && p.ny >= r.ny && p.ny <= r.ny + r.nh;

  /** 显示像素下的边缘命中（M16-6）：'h' = 左/右缘、'v' = 上/下缘，角 = 两者 */
  const edgeHit = (
    p: { nx: number; ny: number },
    base: CropRect,
    r: DOMRect,
  ): { h: "L" | "R" | null; v: "T" | "B" | null } | null => {
    if (!inRect(p, base)) return null;
    const px = p.nx * r.width;
    const py = p.ny * r.height;
    const nearL = Math.abs(px - base.nx * r.width) <= EDGE_HOT_PX;
    const nearR = Math.abs(px - (base.nx + base.nw) * r.width) <= EDGE_HOT_PX;
    const nearT = Math.abs(py - base.ny * r.height) <= EDGE_HOT_PX;
    const nearB = Math.abs(py - (base.ny + base.nh) * r.height) <= EDGE_HOT_PX;
    const h: "L" | "R" | null =
      nearL === nearR ? (nearL ? (px < ((base.nx + base.nw / 2) * r.width) ? "L" : "R") : null) : nearL ? "L" : "R";
    const v: "T" | "B" | null =
      nearT === nearB ? (nearT ? (py < ((base.ny + base.nh / 2) * r.height) ? "T" : "B") : null) : nearT ? "T" : "B";
    if (!h && !v) return null;
    return { h, v };
  };

  const cursorFor = (hit: { h: "L" | "R" | null; v: "T" | "B" | null } | null): string => {
    if (!hit) return "cursor-crosshair";
    if (hit.h && hit.v) return (hit.h === "L") === (hit.v === "T") ? "cursor-nwse-resize" : "cursor-nesw-resize";
    return hit.h ? "cursor-ew-resize" : "cursor-ns-resize";
  };

  const handlers = {
    onMouseMove: (e: React.MouseEvent) => {
      const box = boundsRef.current;
      const cur = rectRef.current;
      if (!box || !cur) {
        setCursor("cursor-crosshair");
        return;
      }
      const r = box.getBoundingClientRect();
      const p = toNorm(r, e.clientX, e.clientY);
      setCursor(cursorFor(edgeHit(p, cur, r)));
    },
    onPointerDown: (e: React.PointerEvent) => {
      const box = boundsRef.current;
      if (!box || e.button !== 0) return;
      e.preventDefault();
      const r = box.getBoundingClientRect();
      const p = toNorm(r, e.clientX, e.clientY);
      const base = rectRef.current;

      const attach = (move: (ev: PointerEvent) => void) => {
        // 收尾兜底（窗口外松手 / pointercancel）统一在 utils/pointerDrag 里，
        // 四处拖拽共用一份，别再本地手写（BUG-003 / AGENTS.md §3 第 20 条）
        beginPointerDrag(move);
      };

      const hit = base ? edgeHit(p, base, r) : null;
      if (base && hit) {
        // 边缘调整模式（M16-6）：拖到的边跟随指针，对边锚定；下限 = 最小选区
        const minNw = MIN_RECT_PX / r.width;
        const minNh = MIN_RECT_PX / r.height;
        const dragL = hit.h === "L";
        const dragR = hit.h === "R";
        const dragT = hit.v === "T";
        const dragB = hit.v === "B";
        attach((ev) => {
          const q = toNorm(r, ev.clientX, ev.clientY);
          let { nx, ny, nw, nh } = base;
          if (dragL) {
            const left = Math.min(Math.max(0, q.nx), nx + nw - minNw);
            nw = nx + nw - left;
            nx = left;
          }
          if (dragR) nw = Math.min(Math.max(minNw, q.nx - nx), 1 - nx);
          if (dragT) {
            const top = Math.min(Math.max(0, q.ny), ny + nh - minNh);
            nh = ny + nh - top;
            ny = top;
          }
          if (dragB) nh = Math.min(Math.max(minNh, q.ny - ny), 1 - ny);
          onChangeRef.current({ nx, ny, nw, nh });
        });
        return;
      }

      if (base && inRect(p, base)) {
        // 移动模式：平移现有选区，保持尺寸
        const offX = p.nx - base.nx;
        const offY = p.ny - base.ny;
        attach((ev) => {
          const q = toNorm(r, ev.clientX, ev.clientY);
          onChangeRef.current({
            ...base,
            nx: Math.min(1 - base.nw, Math.max(0, q.nx - offX)),
            ny: Math.min(1 - base.nh, Math.max(0, q.ny - offY)),
          });
        });
        return;
      }

      // 框选模式：从按下点拉出选区（支持任意方向）
      const startN = p;
      attach((ev) => {
        const endN = toNorm(r, ev.clientX, ev.clientY);
        const nxMin = Math.min(startN.nx, endN.nx);
        const nyMin = Math.min(startN.ny, endN.ny);
        let nw = Math.abs(endN.nx - startN.nx);
        let nh = Math.abs(endN.ny - startN.ny);
        if (lockRatioRef.current && nw > 0) {
          // 锁比例：归一化空间里取正方，等价于显示空间里的原始宽高比
          nh = Math.min(nh, nw);
          nw = nh;
        }
        nw = Math.min(nw, 1 - nxMin);
        nh = Math.min(nh, 1 - nyMin);
        onChangeRef.current({ nx: nxMin, ny: nyMin, nw, nh });
      });
    },
  };

  return { cursor, handlers };
}

/** 选区框：不拦截指针事件（交互全在命中层/舞台上） */
export function CropBox({ rect, className }: { rect: CropRect; className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute border-2 border-signal bg-signal/10 ${className ?? ""}`}
      style={{
        left: `${rect.nx * 100}%`,
        top: `${rect.ny * 100}%`,
        width: `${rect.nw * 100}%`,
        height: `${rect.nh * 100}%`,
      }}
    />
  );
}

/** 整层框选覆盖层：绝对覆盖量尺容器（编辑器页用作 VideoPlayer overlay 插槽） */
export function CropOverlay({
  boundsRef,
  rect,
  onChange,
  lockRatio,
}: CropSelectOptions) {
  const { cursor, handlers } = useCropSelect({ boundsRef, rect, onChange, lockRatio });
  return (
    <div
      className={`absolute inset-0 ${cursor}`}
      {...handlers}
    >
      {rect && <CropBox rect={rect} />}
    </div>
  );
}

interface CropFieldsProps {
  /** 显示空间尺寸（工作台含旋转后的宽高交换） */
  dims: { w: number; h: number };
  /** 当前像素选区（null = 未框选） */
  rect: CropPx | null;
  onChange(rect: CropRect): void;
  lockRatio: boolean;
  onLockRatio(v: boolean): void;
  /** 同排附加控件（质量档位 / 清除选区等） */
  extra?: ReactNode;
  /** 提示文案：各页语义不同（放大回源尺寸 / 坐标基准），由调用方给 */
  hint: ReactNode;
  /** 窄栏（工作台右侧 64 宽面板）用紧凑字号 */
  dense?: boolean;
  /**
   * 只读（`FR-354` / `M14-5` 的预览态）：输入框与比例锁禁用，不提交任何变更。
   * 选区的**显示**仍由调用方决定（预览态通常连选区框一起隐藏）。
   */
  disabled?: boolean;
}

/** 放大数值微调：像素输入（偶数对齐、越界收缩），坐标基于显示空间 */
export function CropFields({
  dims,
  rect,
  onChange,
  lockRatio,
  onLockRatio,
  extra,
  hint,
  dense,
  disabled,
}: CropFieldsProps) {
  const [fields, setFields] = useState({ x: "0", y: "0", w: "0", h: "0" });

  // 拖拽更新选区 → 同步到输入框（props 换新对象即刷新，页面内拖动不覆盖正在输入的值）
  useEffect(() => {
    if (rect) setFields({ x: String(rect.x), y: String(rect.y), w: String(rect.w), h: String(rect.h) });
  }, [rect]);

  // 任一字段提交：以四个输入框的当前值为整体，校验后生成选区
  const commit = () => {
    const next = pxToCrop(
      {
        x: Number(fields.x) || 0,
        y: Number(fields.y) || 0,
        w: Number(fields.w) || 0,
        h: Number(fields.h) || 0,
      },
      dims,
    );
    if (next) onChange(next);
  };

  const field = (key: keyof typeof fields, label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-mute">{label}</span>
      <input
        value={fields[key]}
        disabled={disabled}
        onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={`${dense ? "w-20 text-xs" : "w-24 text-sm"} rounded border border-hairline bg-panel px-2 py-1.5 font-mono text-paper focus:border-signal focus:outline-none disabled:opacity-50`}
      />
    </label>
  );

  return (
    <div className={`flex flex-col ${dense ? "gap-2" : "w-full max-w-3xl gap-3"}`}>
      <div className={`flex flex-wrap items-end ${dense ? "gap-2" : "gap-3"}`}>
        {field("x", "X")}
        {field("y", "Y")}
        {field("w", "宽")}
        {field("h", "高")}
        <label
          className={`flex items-center gap-1.5 text-xs text-mute ${disabled ? "" : "cursor-pointer"} ${dense ? "" : "pb-2"}`}
        >
          <input
            type="checkbox"
            checked={lockRatio}
            disabled={disabled}
            onChange={(e) => onLockRatio(e.target.checked)}
            className="accent-signal disabled:opacity-50"
          />
          锁定画面比例
        </label>
        {extra}
      </div>
      <p className={dense ? "text-[11px] leading-relaxed text-mute/70" : "text-xs text-mute"}>
        {hint}
      </p>
    </div>
  );
}
