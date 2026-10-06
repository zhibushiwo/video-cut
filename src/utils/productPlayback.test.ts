import { describe, expect, it } from "vitest";
import { OUT_POINT_EPS, shouldRewindOnPlay } from "./productPlayback";

/** 单段成品：4.303–7.320（`BUG-021` 的复现片段），播完停在出点内 22ms */
const single = {
  currentTime: 7.318,
  ended: false,
  segIdx: 0,
  segCount: 1,
  srcEnd: 7.32,
} as const;

describe("shouldRewindOnPlay（虚拟连播重播回绕，BUG-021）", () => {
  it("单段成品停在出点（中段片段，元素不会 ended）：必须回绕", () => {
    expect(shouldRewindOnPlay(single)).toBe(true);
  });

  it("停在出点之外（pause 晚一帧）：同样回绕", () => {
    expect(shouldRewindOnPlay({ ...single, currentTime: 7.324 })).toBe(true);
  });

  it("元素已 ended（全段片段）：同样回绕（与渲染分支的浏览器回绕同口径）", () => {
    expect(shouldRewindOnPlay({ ...single, currentTime: 7.32, ended: true })).toBe(true);
  });

  it("容差边界：恰好落在 出点 − ε 上算停在末尾（与 tick 的停判定同一个数）", () => {
    expect(shouldRewindOnPlay({ ...single, currentTime: 7.32 - OUT_POINT_EPS })).toBe(true);
    expect(shouldRewindOnPlay({ ...single, currentTime: 7.32 - OUT_POINT_EPS - 0.001 })).toBe(
      false,
    );
  });

  it("活动槽在段内：原地续播，不回绕", () => {
    expect(shouldRewindOnPlay({ ...single, currentTime: 5.5 })).toBe(false);
  });

  it("停在非最后一段的出点：不算结束（tick 会切下一段续播），不回绕", () => {
    expect(
      shouldRewindOnPlay({ currentTime: 7.318, ended: false, segIdx: 0, segCount: 2, srcEnd: 7.32 }),
    ).toBe(false);
    expect(
      shouldRewindOnPlay({ currentTime: 3, ended: false, segIdx: 1, segCount: 3, srcEnd: 3 }),
    ).toBe(false);
  });

  it("多段成品的最后一段停在出点：回绕", () => {
    expect(
      shouldRewindOnPlay({ currentTime: 9.99, ended: false, segIdx: 1, segCount: 2, srcEnd: 10 }),
    ).toBe(true);
  });

  it("末段 `ended` 但时间已回到段内（浏览器已回绕）：不重复回绕", () => {
    expect(shouldRewindOnPlay({ ...single, currentTime: 0.2, ended: false })).toBe(false);
  });
});
