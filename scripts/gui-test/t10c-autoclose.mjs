import { clickText, sleep, js, setInputValue } from "./cdp-lib.mjs";
import { addFile } from "./add-file.mjs";

const FIX = "C:\\code\\rust\\tauri\\video-cut\\scripts\\fixtures";
const cards = () =>
  js(`[...document.querySelectorAll('.fixed.bottom-4 > div')].length`);

// 回工作台 → 设置页（全局导航只在工作台）
await js(
  `[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&b.getAttribute('aria-label')==='返回工作台')[0]?.click();'ok'`,
);
await sleep(700);
await js(
  `[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null&&b.getAttribute('aria-label')==='设置').click();'ok'`,
);
await sleep(900);
console.log(
  "设置前值:",
  await js(`document.querySelector('input[aria-label=任务浮层自动关闭秒数]')?.value`),
);
await setInputValue("input[aria-label=任务浮层自动关闭秒数]", 0, "5");
await sleep(800);
console.log(
  "设置后值:",
  await js(`document.querySelector('input[aria-label=任务浮层自动关闭秒数]')?.value`),
);

// 回剪切页触发一个 GIF 任务
await js(
  `[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&b.getAttribute('aria-label')==='返回工作台')[0]?.click();'ok'`,
);
await sleep(600);
await clickText("剪切");
await sleep(900);
const hasSeg = await js(
  `[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.getAttribute('aria-label')==='导出片段 1 为 GIF').length`,
);
if (hasSeg !== 1) {
  console.log("重新加载源（页面状态已重置）");
  await addFile(`${FIX}/h264_aac_720p.mp4`, "打开视频");
  await sleep(1500);
  await js(`(async()=>{document.querySelector('video').currentTime=2;return 1})()`);
  await sleep(400);
  await clickText("结束=当前帧");
  await sleep(300);
  await clickText("添加片段");
  await sleep(600);
}
await js(
  `[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.getAttribute('aria-label')==='导出片段 1 为 GIF').click();'ok'`,
);
console.log("GIF 已提交");

// 等出现「完成」终态
let done = false;
for (let i = 0; i < 12 && !done; i++) {
  await sleep(2000);
  done = await js(
    `[...document.querySelectorAll('.fixed.bottom-4 span')].some(s=>s.offsetParent!==null&&s.textContent==='完成')`,
  );
}
console.log("任务到终态:", done);
const c1 = await cards();
console.log("终态卡片数:", c1, "→ 等 8s");
await sleep(8000);
const c2 = await cards();
console.log("8s 后卡片数:", c2, "| 自动关闭生效:", c2 < c1);
