import { evaluate, clickText, sleep, bodyText, js } from "./cdp-lib.mjs";

// 合并页续测：重新勾选组 1 → 提交 → 断言任务卡片出现 + 提示语
const ck = await js(
  `(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.offsetParent!==null&&l.textContent.includes('组 1'));if(!l)return 'no-group';l.querySelector('input').click();return l.querySelector('input').checked})()`,
);
console.log("重新勾选组 1:", ck);
await sleep(300);
await clickText("分组无损合并");
await sleep(3500);
const t = await bodyText();
console.log("提交后含『已取消勾选』(应为 false,全选提交):", t.includes("取消勾选"));
const cards = await js(
  `[...document.querySelectorAll('.fixed.bottom-4 span')].filter(s=>s.offsetParent!==null).map(s=>s.textContent.trim()).slice(0,6)`,
);
console.log("任务卡片标签:", JSON.stringify(cards));
const grpMsg = await js(
  `(()=>{const p=[...document.querySelectorAll('p,span')].filter(x=>x.offsetParent!==null&&x.textContent.includes('参数独特'));return p.length>0})()`,
);
console.log("单文件组提示存在:", grpMsg);
