import { describe, expect, it } from "vitest";
import { moveAt } from "./array";

describe("moveAt", () => {
  it("向后移动（前 → 后）", () => {
    expect(moveAt(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("向前移动（后 → 前）", () => {
    expect(moveAt(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("同下标 = 原序（取出再放回同一位置）", () => {
    expect(moveAt(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("单元素数组与空数组不炸", () => {
    expect(moveAt(["x"], 0, 0)).toEqual(["x"]);
    expect(moveAt([], 0, 0)).toEqual([]);
  });

  it("返回新数组、不改原数组（拖拽排序依赖 setState 不可变性）", () => {
    const src = ["a", "b", "c"];
    const out = moveAt(src, 0, 2);
    expect(src).toEqual(["a", "b", "c"]);
    expect(out).not.toBe(src);
  });
});
