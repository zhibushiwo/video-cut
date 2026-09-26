/**
 * 右键菜单（M11-8，TIMELINE.md §17.4 菜单表）：自研无依赖——fixed 定位 + 视口内钳制，
 * Escape / 点击菜单外部 / 再按右键关闭；菜单项点击后自动收起。
 * 不用 HTML5 DnD / 原生 <menu>，事件全部指针 + 键盘（AGENTS.md §3 第 12 条同族约束）。
 */
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  /** 右侧快捷键提示（如 "Ctrl+Z"） */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect(): void;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 视口内钳制：先按自然位置渲染，测量后校正（无 deps——菜单打开期间条目活更新会改
  // 菜单尺寸，每渲染重测一次，长标签才不会溢出右/下缘）
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 4))}px`;
    el.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 4))}px`;
  });

  // 关闭路径：Escape / 按下点在菜单外（含右键另开）/ contextmenu 在别处。pointerdown 用
  // 捕获段先于菜单项的 click——外部按下即收起，菜单项自身点击 stopPropagation 免误关。
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const onContext = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("contextmenu", onContext);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("contextmenu", onContext);
    };
  }, []);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 min-w-40 select-none rounded-md border border-hairline bg-panel py-1 shadow-lg"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          disabled={item.disabled}
          onClick={(e) => {
            e.stopPropagation();
            item.onSelect();
            onClose();
          }}
          className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs transition-colors focus:outline-none ${
            item.disabled
              ? "cursor-default text-mute/40"
              : item.danger
                ? "text-warn hover:bg-warn/10"
                : "text-paper hover:bg-hairline/25"
          }`}
        >
          <span className="flex-1 truncate">{item.label}</span>
          {item.hint && (
            <span className="shrink-0 font-mono text-[10px] text-mute/70">{item.hint}</span>
          )}
        </button>
      ))}
    </div>,
    document.body,
  );
}
