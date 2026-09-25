/**
 * 代理预览（设置三态感知）：按需生成代理并在任务完成后切换播放源。
 * 返回 onError 供 <video> 原文件播放失败时兜底请求代理。
 *
 * 四端共用（R2-2 收敛）：剪切页 / 编辑器页 / 工作台源剪切 / 片段加工。
 * 成品连播（ProductPreview）是多路径映射、形态不同，不经本 hook。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { generateProxy, onTaskStatus } from "../services/tauri";

export function useProxyPreview(
  path: string,
  useProxy: boolean,
  /**
   * <video> 播放失败时的兜底门槛。默认与 `useProxy` 同门（工作台两视图的既有口径）；
   * 剪切/编辑器页传 `proxyMode !== "off"`——源文件本可原生播放却播不了时也兜底一次
   * （宁可多代理一次也不黑屏，DESIGN §3.7）。
   */
  fallbackOnVideoError: boolean = useProxy,
) {
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
    if (fallbackOnVideoError && !proxyPath && !taskIdRef.current) {
      void generateProxy(path).then((s) => {
        if (s.taskId) taskIdRef.current = s.taskId;
        else setProxyPath(s.proxyPath);
      });
    }
  }, [fallbackOnVideoError, proxyPath, path]);

  return { proxyPath, onError };
}
