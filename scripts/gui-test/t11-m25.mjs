/**
 * M25 真机验证（CAND-050 片段再编辑 + CAND-053 纯播放页）——reload 重置后全流程确定性执行。
 * 断言量化：DOM 状态 / transform 值 / video.loop / 恢复位置秒数 / 列表区间文本。
 */
import { evaluate, clickText, clickTextContains, sleep, bodyText, js, key } from "./cdp-lib.mjs";
import { addFile } from "./add-file.mjs";

const FIX = "C:\\code\\rust\\tauri\\video-cut\\scripts\\fixtures";
const mustClick = async (text) => {
  const r = await clickText(text);
  if (r !== "clicked") throw new Error(`按钮未找到:${text} (${r})`);
};
const rowText = () =>
  js(
    `(()=>{const rows=[...document.querySelectorAll('div')].filter(d=>d.offsetParent!==null&&/^片段 1/.test(d.textContent.trim()));return rows[0]?.textContent.trim().slice(0,60)})()`,
  );

// ───────── 播放页 ─────────
console.log("== 播放页 ==");
await evaluate("location.reload()");
await sleep(3000);
const navBtns = await js(
  `[...document.querySelectorAll('nav button')].filter(b=>b.offsetParent!==null).map(b=>b.textContent.trim())`,
);
console.log("导航项(工作台):", JSON.stringify(navBtns));
if (!navBtns.includes("播放")) throw new Error("导航缺少「播放」项");
await mustClick("播放");
await sleep(900);
console.log("打开视频:", await addFile(`${FIX}/h264_aac_720p.mp4`, "打开视频"));
await sleep(1500);
console.log(
  "video 初始:",
  await js(
    `(()=>{const v=document.querySelector('video');return {dur:+v.duration.toFixed(2),loop:v.loop,transform:v.style.transform||'(none)'}})()`,
  ),
);

await mustClick("水平翻转");
await sleep(400);
console.log("水平翻转 transform:", await js(`document.querySelector('video').style.transform`));
await mustClick("垂直翻转");
await sleep(400);
console.log("双翻转 transform:", await js(`document.querySelector('video').style.transform`));
await mustClick("垂直翻转");
await mustClick("水平翻转");
await sleep(300);
console.log(
  "还原 transform:",
  await js(`document.querySelector('video').style.transform || '(none)'`),
);

await mustClick("循环播放");
await sleep(300);
console.log("循环开启 video.loop:", await js(`document.querySelector('video').loop`));

// 记忆位置:seek 3s,等 >2s 节流落盘,切页再回来
await js(`(async()=>{document.querySelector('video').currentTime=3;return 1})()`);
await sleep(2600);
await js(
  `[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&b.getAttribute('aria-label')==='返回工作台')[0]?.click();'ok'`,
);
await sleep(700);
await mustClick("播放");
await sleep(1500);
console.log(
  "切页返回恢复:",
  await js(
    `(()=>{const v=document.querySelector('video');return {t:+v.currentTime.toFixed(2),loop:v.loop}})()`,
  ),
);

// ───────── 剪切页再编辑 ─────────
console.log("== 剪切页再编辑 ==");
await js(
  `[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&b.getAttribute('aria-label')==='返回工作台')[0]?.click();'ok'`,
);
await sleep(600);
await mustClick("剪切");
await sleep(900);
console.log("加载源:", await addFile(`${FIX}/h264_aac_720p.mp4`, "打开视频"));
await sleep(1500);
await js(`(async()=>{document.querySelector('video').currentTime=2;return 1})()`);
await sleep(400);
await mustClick("结束=当前帧");
await sleep(300);
await mustClick("添加片段");
await sleep(600);
console.log("编辑前列 1:", JSON.stringify(await rowText()));

await js(
  `[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.getAttribute('aria-label')==='编辑片段 1').click();'ok'`,
);
await sleep(500);
console.log(
  "编辑态按钮:",
  await js(
    `[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&(b.textContent.includes('保存修改')||b.textContent.trim()==='取消')).map(b=>b.textContent.trim())`,
  ),
);
console.log(
  "添加片段按钮已被替换(应 false):",
  await js(
    `[...document.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()==='添加片段')`,
  ),
);
await js(`(async()=>{document.querySelector('video').currentTime=4;return 1})()`);
await sleep(400);
await mustClick("结束=当前帧");
await sleep(300);
await clickTextContains("保存修改");
await sleep(500);
console.log("保存后列 1(应含 00:00:04):", JSON.stringify(await rowText()));

// Esc 取消路径
await js(
  `[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.getAttribute('aria-label')==='编辑片段 1').click();'ok'`,
);
await sleep(400);
await key("Escape");
await sleep(300);
console.log(
  "Esc 后保存按钮残留(应 false):",
  await js(
    `[...document.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.includes('保存修改'))`,
  ),
);
console.log("Esc 后列 1 不变(仍 4s):", JSON.stringify(await rowText()));
console.log("== 完成 ==");
