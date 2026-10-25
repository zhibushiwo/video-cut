import { clickText, clickTextContains, evaluate, sleep, bodyText } from "./cdp-lib.mjs";
import { execSync } from "node:child_process";
const ps = (mode) => execSync(`powershell -ExecutionPolicy Bypass -File scripts/gui-test/dialog-lib.ps1 -Mode ${mode}`, { encoding: "utf8", timeout: 30000 }).trim();
const ensurePage = async (name, probe) => {
  for (let i = 0; i < 5; i++) {
    await clickText(name);
    await sleep(900);
    if ((await bodyText()).includes(probe)) return;
  }
  throw new Error(`未能切到 ${name}`);
};
// 从剪切页返回工作台,再去合并页
await evaluate(`[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&b.getAttribute('aria-label')==='返回工作台')[0]?.click(); 'ok'`);
await sleep(800);
await ensurePage("合并", "参数一致时可无损拼接");
await clickTextContains("添加视频");
await sleep(1200);
if (ps("count") !== "count=1") throw new Error("文件对话框未出现");
process.env.DIALOG_PATH = "C:\code\rust\tauri\video-cut\scripts\fixtures\h264_aac_2nd.mp4";
ps("fill");
await execSync(`powershell -ExecutionPolicy Bypass -File scripts/gui-test/dialog-clickok.ps1`);
await sleep(2500);
await clickText("更改目录");
await sleep(1200);
if (ps("count") !== "count=1") throw new Error("目录对话框未出现");
process.env.DIALOG_PATH = "C:\code\rust\tauri\video-cut\scripts\fixtures\out-test";
ps("fill");
await execSync(`powershell -ExecutionPolicy Bypass -File scripts/gui-test/dialog-clickok.ps1`);
await sleep(2000);
const t = await bodyText();
console.log("输出区:", (t.match(/输出到[\s\S]{0,140}/)?.[0] ?? "").replace(/\n+/g, " | "));
console.log("恢复默认按钮:", t.includes("恢复默认"), "| 临时标注:", t.includes("本次临时"));
