import { useEffect, useRef } from "react";

/** 退订函数（与 @tauri-apps/api 的 UnlistenFn 结构一致；此处不引该包，UI 只经 services 碰 IPC） */
type Unsubscribe = () => void;

/**
 * 订阅一个 Tauri 事件并在卸载时退订（R1-2）。
 *
 * 必须写成「先拿 Promise、卸载时再退订」两段式：`listen()` 返回 Promise，
 * 若在 resolve 前就卸载（React StrictMode dev 态必现），只记变量的写法
 * `void onX().then(f => un = f); return () => un?.()` 会拿不到退订函数，
 * 监听器永久泄漏（重复订阅、旧闭包继续跑）。已卸载后才 resolve 的，这里补一次退订。
 *
 * subscribe 只在挂载时调用一次，回调闭包经 ref 取最新（同 useHotkeys）——
 * 订阅回调里读 state 需自备 ref，或只用 setState。
 *
 * 用法：`useTauriEvent(() => onTaskStatus(handler))`
 */
export function useTauriEvent(subscribe: () => Promise<Unsubscribe>) {
  const ref = useRef(subscribe);
  ref.current = subscribe;
  useEffect(() => {
    let alive = true;
    let unlisten: Unsubscribe | undefined;
    void ref.current().then((f) => {
      if (alive) unlisten = f;
      else f();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
}
