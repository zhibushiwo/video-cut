import { evaluate, clickText, clickTextContains, sleep, bodyText } from "./cdp-lib.mjs";
import { addFile } from "./add-file.mjs";
import { execSync } from "node:child_process";
const ps = (mode) => execSync(`powershell -ExecutionPolicy Bypass -File scripts/gui-test/dialog-lib.ps1 -Mode ${mode}`, { encoding: "utf8", timeout: 30000 }).trim();

// 工作台 → 合并
await evaluate(`[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&b.getAttribute('aria-label')==='返回工作台')[0]?.click(); 'ok'`);
await sleep(600);
await clickText("合并");
await sleep(900);
console.log("加载文件:", await addFile("C:/code/rust/tauri/video-cut/scripts/fixtures/h264_aac_2nd.mp4", "添加视频"));
await sleep(800);
console.log("更改目录:", await clickText("更改目录"));
await sleep(1300);
if (ps("count") !== "count=1") throw new Error("目录对话框未出现:" + ps("count"));
process.env.DIALOG_PATH = "C:\code\rust\tauri\video-cut\scripts\fixtures\out-test";
ps("fill");
await execSync(`powershell -ExecutionPolicy Bypass -File scripts/gui-test/dialog-clickok.ps1`);
await sleep(2000);
const t = await bodyText();
console.log("输出区:", (t.match(/输出到[\s\S]{0,120}/)?.[0] ?? "").replace(/\n+/g, " | "));
console.log("恢复默认:", t.includes("恢复默认"), "| 本次临时:", t.includes("本次临时"), "| 新目录:", t.includes("out-test"));
