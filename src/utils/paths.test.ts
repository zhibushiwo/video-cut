import { describe, expect, it } from "vitest";
import {
  basename,
  defaultOutputName,
  dirname,
  predictedExt,
  resolveUniqueTarget,
  sourceExtOf,
  stemOf,
  subtitleMuxExt,
} from "./paths";

describe("dirname（M22-2 / CAND-043 弹窗起始目录）", () => {
  it("Windows 反斜杠", () => {
    expect(dirname("D:\\片\\a.mp4")).toBe("D:\\片");
  });

  it("正斜杠", () => {
    expect(dirname("D:/片/a.mp4")).toBe("D:/片");
  });

  it("混合分隔符取最后一个", () => {
    expect(dirname("D:\\片/sub/a.mp4")).toBe("D:\\片/sub");
  });

  it("无分隔符返回空串（回退系统默认起始目录）", () => {
    expect(dirname("a.mp4")).toBe("");
  });
});

describe("basename", () => {
  it("Windows 反斜杠", () => {
    expect(basename("D:\\片\\a.mp4")).toBe("a.mp4");
  });

  it("正斜杠", () => {
    expect(basename("D:/片/a.mp4")).toBe("a.mp4");
  });

  it("混合分隔符", () => {
    expect(basename("D:/片\\b.mkv")).toBe("b.mkv");
  });

  it("无分隔符时原样返回", () => {
    expect(basename("a.mp4")).toBe("a.mp4");
  });
});

describe("resolveUniqueTarget", () => {
  const dir = "D:\\out";

  it("目标不存在 → 原名直用", async () => {
    const target = await resolveUniqueTarget(dir, "a.mp4", async () => false);
    expect(target).toBe("D:\\out\\a.mp4");
  });

  it("目标已存在 → 扩展名前插时间戳（决策 #19）", async () => {
    const target = await resolveUniqueTarget(dir, "a.mp4", async () => true);
    expect(target).toMatch(/^D:\\out\\a_\d{8}_\d{6}\.mp4$/);
  });

  it("无扩展名的名字也能加时间戳（回落 .mp4）", async () => {
    const target = await resolveUniqueTarget(dir, "merged", async () => true);
    expect(target).toMatch(/^D:\\out\\merged_\d{8}_\d{6}\.mp4$/);
  });

  it("exists 只以完整 base 路径调用一次（与旧实现同查询口径）", async () => {
    const calls: string[] = [];
    await resolveUniqueTarget(dir, "a.mp4", async (p) => {
      calls.push(p);
      return false;
    });
    expect(calls).toEqual(["D:\\out\\a.mp4"]);
  });
});

/**
 * `M14-3` 的默认命名口径（`ADR-033`）：copy 类跟随源容器（用源扩展名表达）、重编码类固定 mp4。
 * 真正的容器校正仍在后端（`fs::with_container_ext`），这里只锁"界面写的名字"。
 */
describe("stemOf / sourceExtOf", () => {
  it("取文件名与扩展名（大小写归一到小写）", () => {
    expect(stemOf("D:\\片\\a.mkv")).toBe("a");
    expect(sourceExtOf("D:\\片\\a.mkv")).toBe("mkv");
    expect(sourceExtOf("D:/片/Show.MP4")).toBe("mp4");
  });

  it("无扩展名 / 末尾只有一个点 ⇒ 回落 mp4", () => {
    expect(stemOf("D:\\片\\noext")).toBe("noext");
    expect(sourceExtOf("D:\\片\\noext")).toBe("mp4");
    expect(sourceExtOf("D:\\片\\weird.")).toBe("mp4");
  });

  it("目录名里的点不参与（只看末段）", () => {
    expect(stemOf("D:\\v1.2\\clip")).toBe("clip");
    expect(sourceExtOf("D:\\v1.2\\clip")).toBe("mp4");
  });
});

describe("predictedExt / defaultOutputName（ADR-033 预判）", () => {
  it("copy 类跟随源容器：mkv 源 → mkv（不再是硬编码 mp4）", () => {
    expect(predictedExt("D:\\片\\a.mkv", true)).toBe("mkv");
    expect(defaultOutputName("D:\\片\\a.mkv", "merged", true)).toBe("a_merged.mkv");
  });

  it("重编码类固定 mp4（源是 mkv 也要校正成 mp4）", () => {
    expect(predictedExt("D:\\片\\a.mkv", false)).toBe("mp4");
    expect(defaultOutputName("D:\\片\\a.mkv", "workbench", false)).toBe("a_workbench.mp4");
  });

  it("三个消费点共用同一实现：_merged / _workbench / _rotated / _zoomed", () => {
    expect(defaultOutputName("D:\\片\\a.mp4", "merged", true)).toBe("a_merged.mp4");
    expect(defaultOutputName("D:\\片\\a.mp4", "workbench", true)).toBe("a_workbench.mp4");
    expect(defaultOutputName("D:\\片\\a.mkv", "rotated", true)).toBe("a_rotated.mkv");
    expect(defaultOutputName("D:\\片\\a.mkv", "zoomed", false)).toBe("a_zoomed.mp4");
  });
});

describe("subtitleMuxExt（M18-12 ADR-044② 预判）", () => {
  it("mp4 系源 → mp4（字幕 mov_text）", () => {
    expect(subtitleMuxExt("D:\\片\\a.mp4")).toBe("mp4");
    expect(subtitleMuxExt("D:\\片\\a.MOV")).toBe("mp4");
    expect(subtitleMuxExt("D:\\片\\a.m4v")).toBe("mp4");
  });

  it("其余源一律 mkv（字幕 srt，不跟随源容器）", () => {
    expect(subtitleMuxExt("D:\\片\\a.mkv")).toBe("mkv");
    expect(subtitleMuxExt("D:\\片\\a.webm")).toBe("mkv");
    expect(subtitleMuxExt("D:\\片\\a.ts")).toBe("mkv");
    expect(subtitleMuxExt("D:\\片\\noext")).toBe("mkv");
  });
});
