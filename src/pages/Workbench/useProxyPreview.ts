/**
 * 代理预览（设置三态感知）：按需生成代理并在任务完成后切换播放源。
 * 返回 onError 供 <video> 原文件播放失败时兜底请求代理。
 *
 * R2-1 原样自 `pages/Workbench/index.tsx` 迁出（R2-2 再提升到 `hooks/` 供剪切/编辑器页复用）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { generateProxy, onTaskStatus } from "../../services/tauri";

export function useProxyPreview(path: string, useProxy: boolean) {
  const [proxyPath, setProxyPath] = useState<string | null>(null);
  const taskIdRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    setProxyPath(null);
    taskIdRef.current = null;
    if (useProxy) {
      generateProxy(path)
        .then((s) => {
          if (!alive) return;
          if (s.taskId) taskIdRef.current = s.taskId;
          else setProxyPath(s.proxyPath);
        })
        .catch(() => {
          /* 预览失败不阻塞数值编辑 */
        });
    }
    return () => {
      alive = false;
    };
  }, [path, useProxy]);

  // 代理任务完成 → 切换画面（R1-2：订阅退订走 useTauriEvent）
  useTauriEvent(() =>
    onTaskStatus((p) => {
      const tid = taskIdRef.current;
      if (tid && p.taskId === tid && p.status === "completed" && p.outputs[0]) {
        setProxyPath(p.outputs[0]);
      }
    }),
  );

  const onError = useCallback(() => {
    if (useProxy && !proxyPath && !taskIdRef.current) {
      void generateProxy(path).then((s) => {
        if (s.taskId) taskIdRef.current = s.taskId;
        else setProxyPath(s.proxyPath);
      });
    }
  }, [useProxy, proxyPath, path]);

  return { proxyPath, onError };
}
