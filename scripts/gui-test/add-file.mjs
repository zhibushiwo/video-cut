import { execSync } from "node:child_process";
import { clickTextContains, sleep, bodyText } from "./cdp-lib.mjs";

const ps = (file, mode, extra = "") => execSync(
  `powershell -ExecutionPolicy Bypass -File scripts/gui-test/${file} -Mode ${mode} ${extra}`,
  { encoding: "utf8", timeout: 30000 },
).trim();

/** 经原生对话框向当前页添加一个文件(合并/字幕/剪切通用) */
export async function addFile(path, label = "添加视频") {
  ps("dialog-lib.ps1", "close-all");
  const click = await clickTextContains(label);
  if (click !== "clicked") throw new Error(`按钮未找到:${label}`);
  await sleep(800);
  let c = ps("dialog-lib.ps1", "count");
  for (let i = 0; i < 10 && c !== "count=1"; i++) { await sleep(500); c = ps("dialog-lib.ps1", "count"); }
  if (c !== "count=1") throw new Error(`对话框未出现:${c}`);
  // IFileDialog 只认反斜杠路径(正斜杠会报"文件名无效")
  process.env.DIALOG_PATH = path.split("/").join("\\");
  ps("dialog-lib.ps1", "fill");
  await sleep(400);
  console.log("clickok:", ps("dialog-clickok.ps1"));
  await sleep(500);
  c = ps("dialog-lib.ps1", "count");
  if (c !== "count=0") throw new Error(`确认后对话框未关闭:${c}`);
  await sleep(2500);
  const name = path.split("/").pop();
  const text = await bodyText();
  if (!text.includes(name)) throw new Error(`未入列:${name}`);
  return `added ${name}`;
}
