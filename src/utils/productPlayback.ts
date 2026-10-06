/**
 * 虚拟连播（`ProductPreview` 双槽分支）的**起播落点**判定（`BUG-021`）。
 *
 * 为什么需要它：连播靠 rAF tick 的「活动槽当前时间 ≥ 该段出点 − ε」一条判定同时管两件事
 * ——「播到段末切下一段」与「播到成品末尾停下」。**停**的分支只 `pause()`、不改
 * `currentTime`，于是元素就停在这条 ε 区间之内；下一次 `play()` 会在**第一帧**再次命中
 * 同一条判定、立刻被 `onPlayingChange(false)` 按停 —— 用户看到的就是"点了播放、画面不动"
 * （`BUG-021`，只有回退虚拟连播时才有；渲染分支是单文件 `<video>`，末尾 `ended` 后
 * `play()` 由浏览器自动回绕，所以那边一直正常）。
 *
 * 结论：成品停在末尾时再按播放，必须先回到**成品起点**再起播 —— 与渲染分支同一口径。
 * 判定本身抽成纯函数，为的是能进 `pnpm test`（本仓无组件/DOM 测试载体）。
 */

/** 段末容差（秒）。越界停与"是否停在末尾"两处判定**必须同源**，否则两侧各差一帧。 */
export const OUT_POINT_EPS = 0.03;

/**
 * 起播前是否需要回绕到成品起点（仅虚拟连播用）。
 *
 * 只有「活动槽就是最后一段」且「它已停在/越过该段出点」才成立：
 * - 非最后一段停在出点不算结束 —— tick 会正常切下一段续播，回绕反而丢内容；
 * - 活动槽仍在段内 → 原地续播（暂停/拖动后继续的正常路径）；
 * - `ended`（元素真的到了媒体末尾）与 ε 判定互为兜底：末段是"全段片段"时元素会走到
 *   `ended`，中段的片段则只会停在 ε 区间里。
 */
export function shouldRewindOnPlay(input: {
  /** 活动槽当前媒体时间（源内秒） */
  currentTime: number;
  /** 活动槽是否已到媒体末尾（`<video>.ended`） */
  ended: boolean;
  /** 活动槽所在片段下标 */
  segIdx: number;
  /** 片段总数 */
  segCount: number;
  /** 活动槽片段的源内出点（秒） */
  srcEnd: number;
}): boolean {
  const isLast = input.segIdx >= input.segCount - 1;
  const atOrPastOut = input.ended || input.currentTime >= input.srcEnd - OUT_POINT_EPS;
  return isLast && atOrPastOut;
}
