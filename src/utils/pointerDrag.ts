/**
 * 指针拖拽的收尾兜底（`BUG-003` / AGENTS.md §3 第 20 条）。
 *
 * 拖拽期间在 window 上挂 `pointermove` / `pointerup` / `pointercancel`。**指针在窗口外
 * （或 WebView 之外）松开时 `pointerup` 根本不会派发到页面**，监听器就会永久留在 window 上：
 * 之后任何一次无关的移动/点击都会继续跑拖拽逻辑——表现是选区或播放头跟着鼠标乱跑、
 * 列表"莫名其妙重排"、拖拽态卡死。
 *
 * 两道防线（缺一不可）：
 * 1. `pointermove` 里发现 `buttons === 0` 就当"其实早就松手了"立即收工——按键状态由浏览器
 *    一直维护，窗口外松手也能在下一次移动时被发现；
 * 2. 注册 `pointercancel`（触摸被系统手势接管、指针设备拔出等场景不发 `pointerup`）。
 *
 * 四处拖拽（裁剪框选 / 列表排序 / 时间轴手柄 / 时间轴块与池→轴）统一走这里，
 * 别再各自手写监听——少一处漏写就是同一个 bug 换个地方复发。
 */

/**
 * 开始一次指针拖拽。
 *
 * @param onMove 拖动中的处理；**只在按键仍按下时**调用
 * @param onEnd  收尾处理（正常松手 / 窗口外松手 / `pointercancel` 都会调用，且只调一次）；
 *               参数是最后一次见到的指针事件（用于取落点坐标），拿不到时为 `null`
 * @returns **只摘监听**的 `detach`：组件卸载时用，**不触发 `onEnd`**（否则卸载后还会去
 *          插入片段、重排列表）
 */
export function beginPointerDrag(
  onMove: (e: PointerEvent) => void,
  onEnd?: (last: PointerEvent | null) => void,
): () => void {
  let last: PointerEvent | null = null;
  let done = false;

  function detach() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
  }

  function move(e: PointerEvent) {
    last = e;
    if (e.buttons === 0) {
      // 窗口外松手的兜底：pointerup 没来，但按键已经松了
      finish();
      return;
    }
    onMove(e);
  }

  function finish(e?: PointerEvent) {
    if (e) last = e;
    if (done) return;
    done = true;
    detach();
    onEnd?.(last);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
  return detach;
}
