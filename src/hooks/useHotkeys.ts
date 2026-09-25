import { useEffect, useRef } from "react";

/**
 * 页面级快捷键（DESIGN §9.4 / M4-3）：window keydown，
 * 焦点在输入框/下拉/可编辑元素时忽略，避免打断文字输入。
 * handler 经 ref 读最新闭包，无需关心依赖。
 *
 * **激活门控（R2-3，M11-8 / M10-1 前置）**：`enabled = false` 时**不挂监听**。
 * App 当前按页面条件挂载（挂载即激活，调用点默认即可）；但 M10-1 keep-alive
 * （页面隐藏不卸载）落地后，各页面必须传入激活态，否则隐藏页的快捷键仍会响应
 * ——Cut 与 Workbench 的 I/O 将同时触发（M10 冲突清单 ③）。组件"挂载但语义上
 * 不激活"的场景（如工作台非成品模式的 Delete）也用它，替代 handler 内手动 gate。
 */
export function useHotkeys(handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      ref.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
