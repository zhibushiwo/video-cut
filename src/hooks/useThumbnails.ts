/**
 * 素材首帧缩略图批量加载（T-005 收敛 Merge / Workbench 两份同构 effect）。
 *
 * 依赖按**内容 key**（`paths.join`）判定，不按数组引用——调用方常传 `.map()` 派生数组，
 * 每次渲染都是新引用，按引用判定会每帧重复 IPC（T-003「缩略图 effect 稳定 key」口径）。
 * 失败静默（缩略图是装饰性资源，行内显示占位图标）。
 */
import { useEffect, useRef, useState } from "react";
import { generateThumbnails } from "../services/tauri";

export function useThumbnails(paths: string[]): {
  thumbs: Record<string, string>;
  clearThumbs: () => void;
} {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const key = paths.join("\n");
  const pathsRef = useRef(paths);
  pathsRef.current = paths;

  useEffect(() => {
    if (key.length === 0) return; // 空列表不发 IPC
    let alive = true;
    generateThumbnails(pathsRef.current)
      .then((list) => {
        if (!alive) return;
        setThumbs((prev) => {
          const next = { ...prev };
          for (const t of list) next[t.input] = t.thumbPath;
          return next;
        });
      })
      .catch(() => {
        /* 缩略图失败不阻塞，行内显示占位图标 */
      });
    return () => {
      alive = false;
    };
  }, [key]);

  const clearThumbs = () => setThumbs({});
  return { thumbs, clearThumbs };
}
