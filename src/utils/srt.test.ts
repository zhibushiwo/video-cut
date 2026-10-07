import { describe, expect, it } from "vitest";
import { activeCueText, parseSrt, parseTimecode } from "./srt";

const SAMPLE = [
  "1",
  "00:00:01,950 --> 00:00:04,690",
  "人民公园",
  "",
  "2",
  "00:00:04,690 --> 00:00:06,750",
  "老红军练剑",
  "第二行文本",
  "",
].join("\r\n");

describe("parseTimecode", () => {
  it("parses full timecodes with comma or dot", () => {
    expect(parseTimecode("01:02:03,500")).toBe(3723.5);
    expect(parseTimecode("01:02:03.250")).toBe(3723.25);
  });

  it("parses short timecodes without hour", () => {
    expect(parseTimecode("02:03,250")).toBe(123.25);
  });

  it("rejects garbage", () => {
    expect(parseTimecode("abc")).toBeNull();
    expect(parseTimecode("")).toBeNull();
  });
});

describe("parseSrt", () => {
  it("parses CRLF content with cue index and multiline text", () => {
    const cues = parseSrt(SAMPLE);
    expect(cues).toEqual([
      { startSec: 1.95, endSec: 4.69, text: "人民公园" },
      { startSec: 4.69, endSec: 6.75, text: "老红军练剑\n第二行文本" },
    ]);
  });

  it("skips malformed blocks but keeps the rest", () => {
    const srt = [
      "不是字幕块",
      "",
      "9",
      "00:00:10,000 --> 00:00:12,000",
      "有效块",
      "",
      "10",
      "时间行缺失 --> 没有箭头的块",
      "",
      "11",
      "00:00:99,000 --> 00:00:05,000",
      "结束早于开始",
      "",
    ].join("\n");
    const cues = parseSrt(srt);
    expect(cues).toEqual([{ startSec: 10, endSec: 12, text: "有效块" }]);
  });

  it("tolerates missing cue index and drops empty-text cues", () => {
    const srt = [
      "00:00:01,000 --> 00:00:02,000",
      "无序号块",
      "",
      "00:00:03,000 --> 00:00:04,000",
      "",
      "",
    ].join("\n");
    expect(parseSrt(srt)).toEqual([
      { startSec: 1, endSec: 2, text: "无序号块" },
    ]);
  });

  it("returns empty array for empty or garbage input", () => {
    expect(parseSrt("")).toEqual([]);
    expect(parseSrt("完全不是 srt 的文本")).toEqual([]);
  });
});

describe("activeCueText", () => {
  const cues = parseSrt(SAMPLE);

  it("returns the active cue inside its interval", () => {
    expect(activeCueText(cues, 2.0)).toBe("人民公园");
    expect(activeCueText(cues, 1.95)).toBe("人民公园");
    expect(activeCueText(cues, 5.0)).toBe("老红军练剑\n第二行文本");
  });

  it("returns null before, between and after cues", () => {
    expect(activeCueText(cues, 0)).toBeNull();
    expect(activeCueText(cues, 4.69)).toBe("老红军练剑\n第二行文本");
    expect(activeCueText(cues, 6.75)).toBeNull();
  });
});
