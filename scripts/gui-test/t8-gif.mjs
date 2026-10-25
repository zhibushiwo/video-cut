import { evaluate, clickText, clickTextContains, key, sleep, bodyText } from "./cdp-lib.mjs";
import { addFile } from "./add-file.mjs";
import { execSync } from "node:child_process";

await clickText("剪切");
await sleep(800);
console.log(await addFile("C:/code/rust/tauri/video-cut/scripts/fixtures/h264_aac_720p.mp4", "打开视频"));
await sleep(1000);
// 选区 1s~3s
await key("ArrowRight");
console.log("入点:", await clickText("开始=当前帧"));
await key("ArrowRight", 2);
console.log("出点:", await clickText("结束=当前帧"));
console.log("GIF 按钮:", await clickText("导出 GIF"));
await sleep(1500);
console.log("提交后:", (await bodyText()).slice(0, 60).replace(/\n/g, " | "));
