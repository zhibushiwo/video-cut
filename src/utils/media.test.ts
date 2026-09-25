import { describe, expect, it } from "vitest";
import { containerPlayable, needsProxy, wantsProxy } from "./media";
import type { MediaInfo } from "../types";

/**
 * TC-024（BUG-006）的容器维度矩阵，2026-09-25（`T-004`）由一次性命令级脚本固化为常驻用例
 * （矩阵记录见 docs/TESTING.md §3.4 注）——27 条断言一比一转写：
 * A 九容器 9 + B 其余三维 7 + C 容器串健壮性 7 + D wantsProxy 三态 4。
 * 容器取值 = 真实 ffprobe 9.0.1 实测的 `format_name`（九种容器的编码全是原生可播组合，
 * 正是 BUG-006 的陷阱）。
 */

/** ISO-BMFF / QuickTime 家族（mp4 / mov / m4v 实测同一串 format_name） */
const ISO_BMFF = "mov,mp4,m4a,3gp,3g2,mj2";

/** 基准夹具：H.264 + yuv420p + AAC / mp4（WebView2 全维度原生可播），按需覆盖容器与编码 */
function info(over: {
  container?: string;
  vcodec?: string;
  pixFmt?: string;
  audio?: string[];
} = {}): MediaInfo {
  return {
    container: over.container ?? ISO_BMFF,
    durationSec: 10,
    sizeBytes: 1_000_000,
    bitrate: null,
    video: {
      codec: over.vcodec ?? "h264",
      profile: null,
      width: 1920,
      height: 1080,
      pixFmt: over.pixFmt ?? "yuv420p",
      frameRate: 30,
      bitrate: null,
    },
    audio: (over.audio ?? ["aac"]).map((codec) => ({
      codec,
      sampleRate: 48000,
      channels: 2,
      bitrate: null,
    })),
    subtitleCount: 0,
    rotation: null,
  };
}

describe("needsProxy 容器维度（TC-024，BUG-006）", () => {
  it("A. 九种容器的真实 format_name 逐一判定", () => {
    expect(needsProxy(info({ container: ISO_BMFF }))).toBe(false); // mp4
    expect(needsProxy(info({ container: ISO_BMFF }))).toBe(false); // mov（同名 format_name）
    expect(needsProxy(info({ container: ISO_BMFF }))).toBe(false); // m4v（同上）
    expect(needsProxy(info({ container: "matroska,webm" }))).toBe(false); // mkv
    expect(needsProxy(info({ container: "matroska,webm" }))).toBe(false); // webm
    // BUG-006 的缺陷面：编码全「原生可播」但容器不可播——修复前这四处均误判「不代理」
    expect(needsProxy(info({ container: "avi" }))).toBe(true);
    expect(needsProxy(info({ container: "flv" }))).toBe(true);
    expect(needsProxy(info({ container: "mpegts" }))).toBe(true); // ts
    expect(needsProxy(info({ container: "asf" }))).toBe(true); // wmv
  });

  it("B. 容器可播时，编码 / 像素格式 / 音轨仍各自一票否决", () => {
    expect(needsProxy(info({ vcodec: "h265" }))).toBe(true);
    expect(needsProxy(info({ pixFmt: "yuv420p10le" }))).toBe(true);
    expect(needsProxy(info({ audio: ["ac3"] }))).toBe(true);
    expect(needsProxy(info({ audio: ["aac", "eac3"] }))).toBe(true); // 多音轨其一不可播即代理
    expect(needsProxy(info({ audio: [] }))).toBe(false); // 无音轨不否决
    expect(needsProxy(info({ vcodec: "vp9", audio: ["opus"] }))).toBe(false);
    expect(needsProxy(info({ audio: ["vorbis"] }))).toBe(false);
  });

  it("C. 容器串健壮性：小写化、trim、只取首位、判不出保守代理", () => {
    expect(containerPlayable("MOV,MP4,M4A,3GP,3G2,MJ2")).toBe(true); // 全大写
    expect(containerPlayable(" matroska , webm ")).toBe(true); // 带空格
    expect(containerPlayable("")).toBe(false); // 空串 → 代理
    expect(containerPlayable("unknown")).toBe(false);
    expect(containerPlayable("mpegts,matroska")).toBe(false); // 跨族列表取首位：首位不可播 → 保守代理
    expect(containerPlayable("avi,mp4")).toBe(false);
    expect(containerPlayable("matroska,mpegts")).toBe(true); // 首位可播 → 不代理
  });

  it("D. wantsProxy 三态（DESIGN §3.7/§12）", () => {
    const playable = info();
    const needs = info({ container: "avi" });
    expect(wantsProxy(needs, "off")).toBe(false); // 只提示、不生成
    expect(wantsProxy(playable, "always")).toBe(true); // 强制代理
    expect(wantsProxy(needs, "auto")).toBe(true); // 按需 → 代理
    expect(wantsProxy(playable, "auto")).toBe(false);
  });
});
