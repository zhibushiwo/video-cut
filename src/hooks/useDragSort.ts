import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * 列表拖拽排序，指针事件实现（DESIGN 决策 #18：Tauri 在 Windows 接管 WebView2
 * 拖拽通道处理文件拖入，HTML5 DnD 事件被吞，窗口内部拖拽一律禁用 HTML5 DnD）。
 *
 * 用法：列表容器挂 listRef，每行挂 data-sort-row 与 rowCls(i) 样式，
 * 行内排序手柄的 onPointerDown 接 beginDrag(e, i)，手柄需带 touch-none。
 */
export function useDragSort(onReorder: (from: number, to: number) => void) {
  const listRef = useRef<HTMLDivElement>(null);
  const overRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  /** 指针所在的行：取与各行中线距离最近者 */
  const indexAt = (y: number): number | null => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-sort-row]");
    if (!rows || rows.length === 0) return null;
    let best = 0;
    let bestDist = Infinity;
    rows.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(y - (r.top + r.height / 2));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const beginDrag = (e: ReactPointerEvent, index: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    let active = false;

    const move = (ev: PointerEvent) => {
      if (!active) {
        // 死区：按住未明显移动视为普通点击，不进入拖拽
        if (Math.abs(ev.clientY - startY) < 4) return;
        active = true;
        setDragIndex(index);
      }
      const to = indexAt(ev.clientY);
      overRef.current = to;
      setOverIndex(to);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (active) {
        const to = overRef.current;
        if (to !== null && to !== index) onReorder(index, to);
        setDragIndex(null);
        setOverIndex(null);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  /** 行的拖拽视觉反馈：拖动行半透明；目标行按移动方向显示信号色上/下边界线（box-shadow，无布局位移） */
  const rowCls = (index: number): string => {
    if (dragIndex === null) return "";
    if (dragIndex === index) return "opacity-40";
    if (overIndex !== index) return "";
    return dragIndex < index
      ? "shadow-[inset_0_-2px_0_0_var(--color-signal)]"
      : "shadow-[inset_0_2px_0_0_var(--color-signal)]";
  };

  return { listRef, beginDrag, rowCls };
}
