import { describe, expect, it } from "vitest";
import { basename, resolveUniqueTarget } from "./paths";

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
