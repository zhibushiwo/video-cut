/**
 * M24 真机验证（CAND-046/047/048/051 + CAND-021 剪切页拖高）。
 * 前置：vite 1420 + 应用带 CDP（CDP_PORT 可换端口）；夹具 = scripts/fixtures 合成文件。
 * 断言全部落到可比对量化值（文件存在 / 尺寸 / DOM 状态 / localStorage）。
 */
import { evaluate, clickText, clickTextContains, sleep, bodyText, js, shot } from "./cdp-lib.mjs";
import { addFile } from "./add-file.mjs";
import { execSync } from "node:child_process";
import { existsSync, statSync, readFileSync } from "node:fs";

const ps = (mode) =>
  execSync(
    `powershell -ExecutionPolicy Bypass -File scripts/gui-test/dialog-lib.ps1 -Mode ${mode}`,
    { encoding: "utf8", timeout: 30000 },
  ).trim();
const okDialog = () => execSync(`powershell -ExecutionPolicy Bypass -File scripts/gui-test/dialog-clickok.ps1`, { encoding: "utf8", timeout: 30000 });
const FIX = "C:\\code\\rust\\tauri\\video-cut\\scripts\\fixtures";
const OUTDIR = "C:/code/rust/tauri/video-cut/scripts/fixtures/out-m24";
execSync(`powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'C:/code/rust/tauri/video-cut/scripts/fixtures/out-m24' | Out-Null"`);

const visibleButtons = () =>
  js(`[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).map(b=>b.textContent.trim()+ '|' +(b.getAttribute('aria-label')??''))`);

// ───────── 剪切页：GIF 片段级 + 截图 ─────────
console.log("== 剪切页 ==");
await clickText("剪切");
await sleep(900);
console.log("加载源:", await addFile(`${FIX}/h264_aac_720p.mp4`, "打开视频"));
await sleep(1200);

// 选区默认 0~时长? 用「开始=当前帧/结束=当前帧」做 0~2s:先结束=当前帧后再推进。
// 简化:直接点「添加片段」用当前选区(初始可能 0~0),先设出点。
await clickText("结束=当前帧").catch(async () => console.log("出点按钮未找到,跳过"));
await sleep(300);
await js(`(async()=>{const v=document.querySelector('video');v.currentTime=2;return v.currentTime})()`);
await sleep(500);
await clickText("结束=当前帧");
await sleep(300);
console.log("添加片段:", await clickText("添加片段"));
await sleep(600);

const segRow = async () =>
  js(`(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.getAttribute('aria-label')==='截取片段 1 中点帧');return b.length})()`);
console.log("截图按钮存在:", await segRow());
console.log("GIF 按钮存在:", await js(`[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.getAttribute('aria-label')==='导出片段 1 为 GIF').length`));
console.log("页脚无『导出 GIF』按钮:", await js(`[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.textContent.trim()==='导出 GIF').length`) === 0);

// 截图:先改输出目录到 out-m24
await clickText("更改目录");
await sleep(1000);
if (ps("count") !== "count=1") throw new Error("目录对话框未出现");
process.env.DIALOG_PATH = `${FIX}\\out-m24`;
ps("fill");
await okDialog();
await sleep(1500);
const cutBody = await bodyText();
console.log("输出目录已指向 out-m24:", cutBody.includes("out-m24"));

const pngBefore = existsSync(`${FIX}/out-m24`);
await js(`[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.getAttribute('aria-label')==='截取片段 1 中点帧').click();'ok'`);
await sleep(2500);
const pngFiles = execSync(`powershell -NoProfile -Command "(Get-ChildItem 'C:/code/rust/tauri/video-cut/scripts/fixtures/out-m24/*.png' | Measure-Object).Count"`, { encoding: "utf8" }).trim();
console.log("截图落盘 png 数:", pngFiles);

// GIF:点片段行按钮,等任务完成
await js(`[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.getAttribute('aria-label')==='导出片段 1 为 GIF').click();'ok'`);
await sleep(4000);
let gifFiles = execSync(`powershell -NoProfile -Command "(Get-ChildItem 'C:/code/rust/tauri/video-cut/scripts/fixtures/out-m24/*.gif' -ErrorAction SilentlyContinue | Measure-Object).Count"`, { encoding: "utf8" }).trim();
console.log("GIF 落盘(4s):", gifFiles);
for (let i = 0; i < 6 && gifFiles === "0"; i++) {
  await sleep(2000);
  gifFiles = execSync(`powershell -NoProfile -Command "(Get-ChildItem 'C:/code/rust/tauri/video-cut/scripts/fixtures/out-m24/*.gif' -ErrorAction SilentlyContinue | Measure-Object).Count"`, { encoding: "utf8" }).trim();
}
console.log("GIF 落盘(终):", gifFiles);

// 自动关闭:任务完成卡片 5s 消失(设置默认 5)。记录当前卡片数,等 7s 再数。
const cards1 = await js(`[...document.querySelectorAll('.fixed.bottom-4 > div')].length`);
await sleep(7000);
const cards2 = await js(`[...document.querySelectorAll('.fixed.bottom-4 > div')].length`);
console.log("任务卡片数(完成后→7s 后):", cards1, "→", cards2);

// 拖高:记录热区与 video 高度,CDP 派发 pointer 拖拽 +80px
const h1 = await js(`(()=>{const p=document.querySelector('input[aria-label]')?.closest('div');const v=document.querySelector('video[src*=preview]');const panel=[...document.querySelectorAll('div')].find(d=>d.style.height&&d.className.includes('border-t'));return {panel:panel?.style.height,ls:localStorage.getItem('panel-height:cut.preview')}})()`);
console.log("拖前面板:", JSON.stringify(h1));
await js(`(async()=>{const hot=[...document.querySelectorAll('div')].find(d=>d.title==='拖拽调高预览；双击复位');if(!hot)return 'no-hot';const r=hot.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const mk=(t,ty,y2)=>new PointerEvent(t,{bubbles:true,pointerId:1,pointerType:'mouse',isPrimary:true,buttons:t==='pointerup'?0:1,clientX:x,clientY:y2??y});hot.dispatchEvent(mk('pointerdown','d'));for(let i=1;i<=8;i++)window.dispatchEvent(mk('pointermove','m',y+i*10));window.dispatchEvent(mk('pointerup','u',y+80));return 'ok'})()`);
await sleep(600);
const h2 = await js(`(()=>{const panel=[...document.querySelectorAll('div')].find(d=>d.style.height&&d.className.includes('border-t'));return {panel:panel?.style.height,ls:localStorage.getItem('panel-height:cut.preview')}})()`);
console.log("拖后面板:", JSON.stringify(h2));
// 双击复位
await js(`(async()=>{const hot=[...document.querySelectorAll('div')].find(d=>d.title==='拖拽调高预览；双击复位');hot.dispatchEvent(new PointerEvent('dblclick',{bubbles:true}));return 'ok'})()`);
await sleep(400);
const h3 = await js(`(()=>{const panel=[...document.querySelectorAll('div')].find(d=>d.style.height&&d.className.includes('border-t'));return {panel:panel?.style.height,ls:localStorage.getItem('panel-height:cut.preview')}})()`);
console.log("双击复位后:", JSON.stringify(h3));

// ───────── 合并页：分组卡片 + 勾选 ─────────
console.log("== 合并页 ==");
await js(`[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&b.getAttribute('aria-label')==='返回工作台')[0]?.click();'ok'`);
await sleep(600);
await clickText("合并");
await sleep(800);
await clickTextContains("添加视频");
await sleep(1200);
if (ps("count") !== "count=1") throw new Error("文件对话框未出现");
process.env.DIALOG_PATH = `${FIX}\\h264_aac_720p.mp4`;
ps("fill");
await okDialog();
await sleep(2000);
await clickTextContains("添加视频");
await sleep(1200);
process.env.DIALOG_PATH = `${FIX}\\h264_aac_2nd.mp4`;
ps("fill");
await okDialog();
await sleep(2000);
await clickTextContains("添加视频");
await sleep(1200);
process.env.DIALOG_PATH = `${FIX}\\hevc_mp4.mp4`;
ps("fill");
await okDialog();
await sleep(3000);

const grp = await js(`(()=>{const labels=[...document.querySelectorAll('label')].filter(l=>l.offsetParent!==null&&l.textContent.includes('组 '));return {groups:labels.length,checked:[...document.querySelectorAll('label')].filter(l=>l.offsetParent!==null&&l.querySelector('input[type=checkbox]')).map(l=>l.querySelector('input').checked)}})()`);
console.log("分组卡片:", JSON.stringify(grp));
// 取消勾选组 1 → 按钮仍可用(组2勾着),提交后 groupMsg 应提到取消 1 组
await js(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.offsetParent!==null&&l.textContent.includes('组 1'));l.querySelector('input').click();return 'ok'})()`);
await sleep(400);
const after = await js(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.offsetParent!==null&&l.textContent.includes('组 1'));const btn=[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null&&b.textContent.trim()==='分组无损合并');return {group1:l?.querySelector('input').checked,btnDisabled:btn?.disabled}})()`);
console.log("取消组 1 后:", JSON.stringify(after));
await clickText("分组无损合并");
await sleep(3500);
const body = await bodyText();
console.log("提交提示含『取消勾选 1 组』:", body.includes("取消勾选 1 组"));
await shot("scripts/gui-test/t10-m24-final.png");
console.log("== 完成 ==");
