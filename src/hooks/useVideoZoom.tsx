/**
 * 预览框选放大交互（M19-6 `FR-397` 抽出为可复用 hook，M21-6 推广）：
 * Ctrl+拖拽框选 → 放大充满容器；放大态拖拽平移（边界钳制）；Esc / 双击 / 宿主按钮还原。
 * 纯前端 transform（`utils/videoZoom.ts` 纯函数），实时预览专用**不参与导出**。
 *
 * 宿主（VideoPlayer / 裸 `<video>` 页面）接线：
 * - `<video>` 上挂 `onPointerDown` / `onDoubleClick` / `style={videoStyle}` / `className` 拼 `cursorClass`
 * - 宿主自己的 onClick **首行**调用 `suppressClick(e)`，为真即 return（拖拽过 / Ctrl 修饰的点击不是走带）
 * - `selOverlay` 渲染在预览容器（absolute inset-0）内
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { clampOffset, zoomScale, type ZoomState } from "../utils/videoZoom";
import { beginPointerDrag } from "../utils/pointerDrag";

interface SelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function useVideoZoom(enabled: boolean) {
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const [sel, setSel] = useState<SelRect | null>(null);
  const [ctrlDown, setCtrlDown] = useState(false);
  /** 本次指针手势发生过移动/框选（松手后的 click 不再当作走带） */
  const interactedRef = useRef(false);
  const dragDetachRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      dragDetachRef.current?.();
    },
    [],
  );

  // Ctrl 键提示光标 + Esc 还原（全屏时让 UA 先退全屏，再按一次才还原）
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") setCtrlDown(true);
      if (e.key === "Escape" && zoom && !document.fullscreenElement) setZoom(null);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") setCtrlDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [enabled, zoom]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLVideoElement>) => {
      if (!enabled) return;
      const box = e.currentTarget.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const frac = (clientX: number, clientY: number) => ({
        x: clamp01((clientX - box.left) / box.width),
        y: clamp01((clientY - box.top) / box.height),
      });
      if (e.ctrlKey && !zoom) {
        // Ctrl+拖拽：框选（红线 20 统一走 beginPointerDrag）
        const p0 = frac(e.clientX, e.clientY);
        interactedRef.current = true;
        dragDetachRef.current = beginPointerDrag(
          (ev) => {
            const p = frac(ev.clientX, ev.clientY);
            setSel({ x0: p0.x, y0: p0.y, x1: p.x, y1: p.y });
          },
          (ev) => {
            dragDetachRef.current = null;
            setSel(null);
            if (!ev) return;
            const p1 = frac(ev.clientX, ev.clientY);
            const rw = Math.abs(p1.x - p0.x);
            const rh = Math.abs(p1.y - p0.y);
            if (rw < 0.03 || rh < 0.03) return; // 过小的误框不放大
            setZoom(
              clampOffset({
                rx: Math.min(p0.x, p1.x),
                ry: Math.min(p0.y, p1.y),
                rw,
                rh,
                ox: Math.min(p0.x, p1.x),
                oy: Math.min(p0.y, p1.y),
              }),
            );
          },
        );
        return;
      }
      if (zoom && !e.ctrlKey) {
        // 放大态拖拽 = 平移（内容跟手：可视窗口起点随位移反向变化）
        const s = zoomScale(zoom);
        const o0 = { x: zoom.ox, y: zoom.oy };
        let moved = false;
        dragDetachRef.current = beginPointerDrag(
          (ev) => {
            const dx = (ev.clientX - e.clientX) / box.width / s;
            const dy = (ev.clientY - e.clientY) / box.height / s;
            if (!moved && Math.hypot(dx * box.width, dy * box.height) > 4) moved = true;
            if (moved) {
              interactedRef.current = true;
              setZoom(clampOffset({ ...zoom, ox: o0.x - dx, oy: o0.y - dy }));
            }
          },
          () => {
            dragDetachRef.current = null;
          },
        );
      }
    },
    [enabled, zoom],
  );

  const onDoubleClick = useCallback(() => {
    if (enabled) setZoom(null);
  }, [enabled]);

  /** 宿主 onClick 首行调用：拖拽过 / Ctrl 修饰的点击返回 true（不是走带意图） */
  const suppressClick = useCallback(
    (e: React.MouseEvent) => {
      if (interactedRef.current) {
        interactedRef.current = false;
        return true;
      }
      if (enabled && e.ctrlKey) return true;
      return false;
    },
    [enabled],
  );

  const videoStyle: CSSProperties | undefined = zoom
    ? (() => {
        const s = zoomScale(zoom);
        return {
          transform: `scale(${s}) translate(${-zoom.ox * 100}%, ${-zoom.oy * 100}%)`,
          transformOrigin: "0 0",
        };
      })()
    : undefined;

  const cursorClass = zoom ? "cursor-move" : ctrlDown ? "cursor-crosshair" : "cursor-pointer";

  const selOverlay: ReactNode =
    sel !== null ? (
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute border-2 border-signal bg-signal/10"
          style={{
            left: `${Math.min(sel.x0, sel.x1) * 100}%`,
            top: `${Math.min(sel.y0, sel.y1) * 100}%`,
            width: `${Math.abs(sel.x1 - sel.x0) * 100}%`,
            height: `${Math.abs(sel.y1 - sel.y0) * 100}%`,
          }}
        />
      </div>
    ) : null;

  const reset = useCallback(() => setZoom(null), []);

  return {
    zoomed: zoom !== null,
    onPointerDown,
    onDoubleClick,
    suppressClick,
    videoStyle,
    cursorClass,
    selOverlay,
    reset,
  };
}
