import { describe, expect, it } from "vitest";
import { formatTimecode, nextKeyframeAtOrAfter, realCutStart } from "./time";

describe("formatTimecode（总帧数时间码，TIMELINE.md §17.3）", () => {
  it("零点与普通时刻", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00:00");
    expect(formatTimecode(1, 30)).toBe("00:00:01:00");
    expect(formatTimecode(3661.5, 30)).toBe("01:01:01:15");
  });

  it("先取总帧再分解：59.97 → 59s29F；59.99 帧级进位到整分（不是 59:30 的帧溢出）", () => {
    // 逐段取整的错误形态是 00:00:59:30（帧字段 ≥ 每秒帧数）
    expect(formatTimecode(59.97, 30)).toBe("00:00:59:29");
    expect(formatTimecode(59.99, 30)).toBe("00:01:00:00"); // 59.99×30 = 1799.7 → 1800 帧 = 整 1 分钟
  });

  it("负值钳到零", () => {
    expect(formatTimecode(-1, 30)).toBe("00:00:00:00");
  });

  it("fps 缺省/非正按 30（与 undo 层 DEFAULT_FPS 同口径）", () => {
    expect(formatTimecode(0.5)).toBe("00:00:00:15");
    expect(formatTimecode(1, 0)).toBe("00:00:01:00");
    expect(formatTimecode(1, -5)).toBe("00:00:01:00");
  });

  it("非整数帧率（NTSC 浮点）：总帧数按原始帧率取、仅 FF 除数取整", () => {
    // 1s @ 29.97：round(29.97)=30 帧，每秒帧数 round(29.97)=30 → 恰 1s 0 帧
    expect(formatTimecode(1, 29.97)).toBe("00:00:01:00");
    // 锁住两种读法的分歧：100s@29.97 → 总帧 2997（非 3000）→ 00:01:39:27
    expect(formatTimecode(100, 29.97)).toBe("00:01:39:27");
  });
});

describe("nextKeyframeAtOrAfter（保留段起点向上对齐，FR-326）", () => {
  const kf = [0, 2, 4, 6];

  it("命中：取 ≥ t 的最近关键帧；恰在关键帧上取自身", () => {
    expect(nextKeyframeAtOrAfter(3, kf)).toBe(4);
    expect(nextKeyframeAtOrAfter(4, kf)).toBe(4);
    expect(nextKeyframeAtOrAfter(4.0001, kf)).toBe(6);
  });

  it("t ≤ 首个关键帧 ⇒ 首个；t 超过最后一个 ⇒ null（调用方按片尾处理）", () => {
    expect(nextKeyframeAtOrAfter(-1, kf)).toBe(0);
    expect(nextKeyframeAtOrAfter(0, kf)).toBe(0);
    expect(nextKeyframeAtOrAfter(7, kf)).toBeNull();
  });

  it("空表 / 非有限 t ⇒ null（不抛、不返回非法关键帧）", () => {
    expect(nextKeyframeAtOrAfter(1, [])).toBeNull();
    expect(nextKeyframeAtOrAfter(Number.NaN, kf)).toBeNull();
  });

  it("与 realCutStart 方向相反：同一 t 一个向上、一个向下（不得混用）", () => {
    expect(realCutStart(3, kf)).toBe(2); // 提取式：宁可多留
    expect(nextKeyframeAtOrAfter(3, kf)).toBe(4); // 删除式：宁多删不残留
  });
});
