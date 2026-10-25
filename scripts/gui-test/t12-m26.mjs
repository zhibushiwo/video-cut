/**
 * M26 真机验证（FR-405 v2 播放器增强）。
 * 断言量化：video.volume / fullscreenElement / seek 落点 / png 落盘 / 窗口标题 / 信息卡内容。
 */
import { evaluate, clickText, clickTextContains, sleep, js, key, setInputValue } from "./cdp-lib.mjs";
import { execSync } from "node:child_process";

const mustClick = async (text) => {
  const r = await clickText(text);
  if (r !== "clicked") throw new Error(`按钮未找到:${text} (${r})`);
};
const winTitle = () =>
  execSync(
    `powershell -NoProfile -Command "(Get-Process video-cut | Where-Object MainWindowTitle -ne '').MainWindowTitle"`,
    { encoding: "utf8" },
  ).trim();

await evaluate("location.reload()");
await sleep(3000);

// ① 首次进页自动恢复最近视频（recents 来自此前会话的 localStorage）
await mustClick("播放");
await sleep(2000);
let autoLoaded = await js(
  `[...document.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()==='更换视频')`,
);
console.log("首进页自动恢复最近视频:", autoLoaded);
if (!autoLoaded) {
  // 首次跑 recents 为空（M26 新键）→ 手动开一次写入,再 reload 验证自动恢复
  console.log("(recents 为空,先手动打开写入)");
  const { addFile } = await import("./add-file.mjs");
  await addFile("C:/code/rust/tauri/video-cut/scripts/fixtures/h264_aac_720p.mp4", "打开视频");
  await sleep(1500);
  await evaluate("location.reload()");
  await sleep(3000);
  await mustClick("播放");
  await sleep(2000);
  autoLoaded = await js(
    `[...document.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()==='更换视频')`,
  );
  console.log("写入 recents 后 reload 再进页自动恢复:", autoLoaded);
}
console.log("窗口标题(随文件名):", winTitle());

// ② 快捷键:↑↓ 音量 / M 静音 / F 全屏 / S 截图（每键间隔让 handle 闭包拿到最新音量 state）
const vol1 = await js(`document.querySelector('video').volume`);
await key("ArrowDown");
await sleep(400);
await key("ArrowDown");
await sleep(400);
const vol2 = await js(`document.querySelector('video').volume`);
console.log("音量 ↓↓:", vol1, "→", vol2, "(应 -0.1)");
await key("ArrowUp");
await sleep(300);
console.log("音量 ↑ 回 0.95:", await js(`document.querySelector('video').volume`));
await key("m");
await sleep(300);
console.log("M 静音 video.muted:", await js(`document.querySelector('video').muted`));
await key("m");
await sleep(200);
await key("f");
await sleep(900);
console.log("F 全屏 document.fullscreenElement:", await js(`!!document.fullscreenElement`));
await key("f");
await sleep(600);
console.log("再按 F 退出全屏:", await js(`!document.fullscreenElement`));

// ③ 跳转时间:TimeField 聚焦输入 + blur 提交（TimeField 失焦/回车 commit）
await js(`(()=>{const el=document.querySelector('input.w-32');el.focus();return 1})()`);
await setInputValue("input.w-32", 0, "00:00:05");
await sleep(200);
await js(`document.querySelector('input.w-32').blur();'ok'`);
await sleep(800);
console.log("跳转后 currentTime(应≈5):", await js(`+document.querySelector('video').currentTime.toFixed(2)`));

// ④ S 截图:输出目录回退源目录 = scripts/fixtures
const pngBefore = execSync(
  `powershell -NoProfile -Command "(Get-ChildItem 'C:/code/rust/tauri/video-cut/scripts/fixtures/*.png' -ErrorAction SilentlyContinue | Measure-Object).Count"`,
  { encoding: "utf8" },
).trim();
await key("s");
await sleep(2500);
const pngAfter = execSync(
  `powershell -NoProfile -Command "(Get-ChildItem 'C:/code/rust/tauri/video-cut/scripts/fixtures/*.png' -ErrorAction SilentlyContinue | Measure-Object).Count"`,
  { encoding: "utf8" },
).trim();
console.log("S 截图 png 数:", pngBefore, "→", pngAfter, "(应 +1)");

// ⑤ 双击全屏(非放大态)
await js(`document.querySelector('video').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
await sleep(800);
console.log("双击全屏:", await js(`!!document.fullscreenElement`));
await key("Escape");
await sleep(600);

// ⑥ 最近播放下拉
await mustClick("最近播放");
await sleep(400);
const recentItems = await js(
  `[...document.querySelectorAll('div.absolute button')].filter(b=>b.offsetParent!==null).map(b=>b.textContent.trim())`,
);
console.log("最近列表项:", JSON.stringify(recentItems));
await clickTextContains(".mp4");
await sleep(1500);
console.log("点选最近项后仍在播放页加载:", await js(`!!document.querySelector('video')`));

// ⑦ 信息卡
await js(`[...document.querySelectorAll('details')].find(d=>d.offsetParent!==null).open=true`);
await sleep(400);
const infoText = await js(
  `[...document.querySelectorAll('details')].find(d=>d.offsetParent!==null)?.textContent.slice(0,200)`,
);
console.log("信息卡含分辨率 1280×720:", infoText.includes("1280×720"), "| 含编码 h264:", /h264|H.264/i.test(infoText));
console.log("== 完成 ==");
