import { describe, expect, it } from "vitest";
import { decidePreview } from "./previewRender";

/** 默认输入：无损、有时间线、签名 k1、什么都没提交过 */
const base = {
  hasEntries: true,
  allLossless: true,
  key: "k1",
  readyKey: null,
  submittedKey: null,
  failedKey: null,
} as const;

describe("decidePreview（M12-2 渲染即预览的判定）", () => {
  it("时间线为空：既不渲染也不用真实文件", () => {
    expect(decidePreview({ ...base, hasEntries: false })).toEqual({
      autoRender: false,
      useRendered: false,
    });
  });

  it("全程无损 + 新签名：自动渲染", () => {
    expect(decidePreview(base)).toEqual({ autoRender: true, useRendered: false });
  });

  it("含重编码：不自动渲染（回退虚拟连播，FR-1761）", () => {
    expect(decidePreview({ ...base, allLossless: false }).autoRender).toBe(false);
  });

  it("含重编码但已有该签名的成品（手动「精确预览」产出）：仍用真实文件播放", () => {
    expect(
      decidePreview({ ...base, allLossless: false, readyKey: "k1" }),
    ).toEqual({ autoRender: false, useRendered: true });
  });

  it("同签名已提交过：不重复提交（StrictMode / 无关重渲染）", () => {
    expect(decidePreview({ ...base, submittedKey: "k1" }).autoRender).toBe(false);
  });

  it("同签名失败过：不自动重试（避免失败风暴）", () => {
    expect(decidePreview({ ...base, failedKey: "k1" }).autoRender).toBe(false);
  });

  it("失败后内容变了：重新获得一次机会", () => {
    expect(decidePreview({ ...base, key: "k2", failedKey: "k1" }).autoRender).toBe(true);
  });

  it("签名与已有成品不匹配：回落虚拟连播（绝不显示过期画面）", () => {
    expect(decidePreview({ ...base, key: "k2", readyKey: "k1" }).useRendered).toBe(false);
  });

  it("空时间线即使有历史成品也不用真实文件", () => {
    expect(
      decidePreview({ ...base, hasEntries: false, readyKey: "k1", key: "k1" }),
    ).toEqual({ autoRender: false, useRendered: false });
  });
});
