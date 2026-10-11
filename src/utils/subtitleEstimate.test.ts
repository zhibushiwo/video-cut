import { describe, expect, it } from "vitest";
import {
  estimateTranscribeSec,
  formatEstimate,
  transcribeFactor,
} from "./subtitleEstimate";

describe("transcribeFactor（ADR-039 spike 实测口径）", () => {
  it("白名单三档命中各自系数", () => {
    expect(transcribeFactor("tiny")).toBe(0.15);
    expect(transcribeFactor("small")).toBe(0.4);
    expect(transcribeFactor("large-v3-turbo")).toBe(1.85);
  });

  it("自定义模型（ADR-042）按 small 同级估算", () => {
    expect(transcribeFactor("F16-turbo")).toBe(0.4);
    expect(transcribeFactor("")).toBe(0.4);
  });
});

describe("estimateTranscribeSec", () => {
  it("视频时长 × 系数（spike 锚点：238s 音频 small ≈ 95.2s）", () => {
    expect(estimateTranscribeSec(238, "small")).toBeCloseTo(95.2, 5);
    expect(estimateTranscribeSec(238, "large-v3-turbo")).toBeCloseTo(440.3, 5);
  });

  it("非正时长返回 0", () => {
    expect(estimateTranscribeSec(0, "small")).toBe(0);
    expect(estimateTranscribeSec(-5, "tiny")).toBe(0);
  });
});

describe("formatEstimate（粗粒度展示）", () => {
  it("非正数返回 —", () => {
    expect(formatEstimate(0)).toBe("—");
    expect(formatEstimate(-1)).toBe("—");
  });

  it("不足一分钟 / 分钟 / 小时三态", () => {
    expect(formatEstimate(30)).toBe("不到 1 分钟");
    expect(formatEstimate(600)).toBe("约 10 分钟");
    expect(formatEstimate(3600)).toBe("约 1 小时");
    expect(formatEstimate(3660 * 2)).toBe("约 2 小时 2 分钟");
  });
});
