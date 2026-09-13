import { useEffect, useRef } from "react";

/**
 * 页面级快捷键（DESIGN §9.4 / M4-3）：window keydown，
 * 焦点在输入框/下拉/可编辑元素时忽略，避免打断文字输入。
 * handler 经 ref 读最新闭包，无需关心依赖。
 */
export function useHotkeys(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
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
  }, []);
}
