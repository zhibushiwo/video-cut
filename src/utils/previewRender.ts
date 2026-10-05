/**
 * 渲染即预览的判定（M12-2，纯函数——本仓无组件/hook 测试载体，策略必须抽出来才测得到）。
 *
 * 规格：TIMELINE.md §17.6（`FR-1760` 自动渲染 / `FR-1761` 回退与手动精确预览）。
 *
 * 三条策略：
 * 1. 只有**全程无损**的时间线才自动渲染真实成品；含重编码时回退虚拟连播，由页脚
 *    「精确预览」手动发起（渲染一版重编码成品很慢，不该在编辑时自动跑）。
 * 2. 内容签名未变就不重复提交——React StrictMode 双提交、以及无关重渲染都会命中。
 * 3. **同一签名渲染失败过就不再自动重试**（避免失败风暴，如磁盘持续不足）；
 *    内容一变（签名不同）就重新获得一次机会。
 */
export interface PreviewDecision {
  /** 是否应发起一次自动渲染 */
  autoRender: boolean;
  /** 是否用真实成品文件播放（否则回退虚拟连播） */
  useRendered: boolean;
}

export function decidePreview(input: {
  /** 时间线是否有片段 */
  hasEntries: boolean;
  /** 当前时间线是否全程无损（`check.allLossless`） */
  allLossless: boolean;
  /** 当前时间线内容签名 */
  key: string;
  /** 最近一次**成功**产出对应的签名 */
  readyKey: string | null;
  /** 最近一次**已提交**（进行中或已完成）的签名 */
  submittedKey: string | null;
  /** 最近一次**失败**的签名 */
  failedKey: string | null;
}): PreviewDecision {
  if (!input.hasEntries) return { autoRender: false, useRendered: false };
  return {
    autoRender:
      input.allLossless &&
      input.key !== input.submittedKey &&
      input.key !== input.failedKey,
    // 真实文件按签名匹配：签名一变立刻回落虚拟连播，绝不显示过期画面
    useRendered: input.readyKey !== null && input.readyKey === input.key,
  };
}
