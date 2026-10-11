/**
 * 预览面板高度拖拽（`CAND-021`，UI.md §9.1）：
 * 底边热区向下拖变高 / 向上变矮（以**拖起瞬间**的高度为基准加位移，不从零重算防跳动），
 * clamp = 240px ~ 70vh；双击热区复位默认；拖拽统一走 `beginPointerDrag`（红线 20，
 * 窗口外松手兜底）。高度状态用 **px**，持久化 = localStorage 按页键（跨重启记忆，
 * 不入 settings.json——视觉偏好非功能语义）；窗口 resize 时重 clamp。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { beginPointerDrag } from "../utils/pointerDrag";

const MIN = 240;
const STORAGE_PREFIX = "panel-height:";

const maxOf = () => Math.round(window.innerHeight * 0.7);
const clamp = (h: number) => Math.min(maxOf(), Math.max(MIN, h));

function readSaved(pageKey: string): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + pageKey);
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function usePanelHeight(pageKey: string, defaultVh: number) {
  const [height, setHeight] = useState<number>(() =>
    clamp(readSaved(pageKey) ?? Math.round((window.innerHeight * defaultVh) / 100)),
  );
  /** 拖拽闭包拿最新高度用（state 在闭包里会过期） */
  const heightRef = useRef(height);
  heightRef.current = height;
  const dragDetachRef = useRef<(() => void) | null>(null);

  // 窗口 resize 重 clamp（clamp 依赖 innerHeight）
  useEffect(() => {
    const onResize = () => setHeight((h) => clamp(h));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 持久化（内容不变时 set 同值无写入成本可忽略）
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + pageKey, String(height));
    } catch {
      // 隐私模式等 localStorage 不可用：跳过持久化，本次会话内仍生效
    }
  }, [pageKey, height]);

  // 卸载时摘拖拽监听（不触发 onEnd）
  useEffect(
    () => () => {
      dragDetachRef.current?.();
    },
    [],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = heightRef.current;
      dragDetachRef.current = beginPointerDrag(
        (ev) => setHeight(clamp(startH + (ev.clientY - startY))),
        () => {
          dragDetachRef.current = null;
        },
      );
    },
    [],
  );

  const reset = useCallback(() => {
    setHeight(clamp(Math.round((window.innerHeight * defaultVh) / 100)));
  }, [defaultVh]);

  return { height, startDrag, reset };
}
