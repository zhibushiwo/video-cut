/**
 * M27 真机验证（播放页打磨）：大画面布局 / 下拉左锚不裁+外点关闭 / 信息卡移除 /
 * 音量弹层 hover 桥（悬停路径不再触发进度条）。
 */
import { evaluate, clickText, sleep, js, mouseMove } from "./cdp-lib.mjs";

await evaluate("location.reload()");
await sleep(3000);
await clickText("播放");
await sleep(1500);

let autoLoaded = await js(
  `[...document.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()==='更换视频')`,
);
console.log("已加载(自动恢复):", autoLoaded);
if (!autoLoaded) {
  const { addFile } = await import("./add-file.mjs");
  await addFile("C:/code/rust/tauri/video-cut/scripts/fixtures/h264_aac_720p.mp4", "打开视频");
  await sleep(1500);
  autoLoaded = true;
}

// ① 大画面:video 元素高度应≈播放容器高度(fill),远大于旧 44vh
const geom = await js(
  `(()=>{const v=document.querySelector('video');const r=v.getBoundingClientRect();const wrap=v.closest('div.min-h-0.flex-1')?.getBoundingClientRect();return {videoH:Math.round(r.height),wrapH:Math.round(wrap?.height??0),winH:window.innerHeight}})()`,
);
console.log("大画面几何:", JSON.stringify(geom));

// ② 信息卡已移除
console.log("视频信息卡残留(应 false):", await js(`[...document.querySelectorAll('details')].some(d=>d.offsetParent!==null&&d.textContent.includes('视频信息'))`));

// ③ 下拉:打开 → 面板左缘不出屏 → 点外部关闭 → Esc 关闭
await clickText("最近播放");
await sleep(400);
const panel = await js(
  `(()=>{const p=[...document.querySelectorAll('div.absolute')].find(d=>d.offsetParent!==null&&d.querySelector('button')?.textContent.includes('.mp4'));const r=p?.getBoundingClientRect();return {left:Math.round(r?.left??-1),items:p?.querySelectorAll('button').length}})()`,
);
console.log("下拉面板(左缘应≥0):", JSON.stringify(panel));
await js(`document.body.click();'ok'`);
await sleep(300);
const closedByOutside = await js(
  `![...document.querySelectorAll('div.absolute')].some(d=>d.offsetParent!==null&&d.querySelector('button')?.textContent.includes('.mp4'))`,
);
console.log("点外部关闭:", closedByOutside);
await clickText("最近播放");
await sleep(300);
await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
await sleep(300);
console.log("Esc 关闭:", await js(
  `![...document.querySelectorAll('div.absolute')].some(d=>d.offsetParent!==null&&d.querySelector('button')?.textContent.includes('.mp4'))`,
));

// ④ 音量弹层 hover 桥:悬停音量按钮 → 沿竖条上移 → 容器 opacity 保持 1,且路径中段元素不是进度条
const vr = await js(
  `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.getAttribute('aria-label')?.includes('静音'));const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
);
await mouseMove(Math.round(vr.x), Math.round(vr.y));
await sleep(300);
await mouseMove(Math.round(vr.x), Math.round(vr.y - 40)); // 桥中段(旧实现这里是进度条)
await sleep(300);
const hoverState = await js(
  `(()=>{const c=[...document.querySelectorAll('div')].find(d=>d.className.includes('h-24 w-8'));const cs=getComputedStyle(c);const el=document.elementFromPoint(${vr.x}, ${vr.y-40});const prog=[...document.querySelectorAll('div,input')].find(x=>x.className.includes&&typeof x.className.includes==='function'&&String(x.className).includes('progress'));return {opacity:cs.opacity,pe:cs.pointerEvents,elemAtMid:el?.tagName+'.'+String(el?.className).slice(0,30)}})()`,
);
console.log("桥中段悬停:", JSON.stringify(hoverState));
console.log("== 完成 ==");
