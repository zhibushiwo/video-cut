/**
 * 零依赖 CDP 客户端（gui-e2e 手册 2.2/2.3 的复刻，M22 真机测试用）。
 * 用法：node cdp.mjs <eval|click|mouse|drag|key|type|shot|dom|targets> [args...]
 * 前置：应用以 --remote-debugging-port=9222 启动、vite 监听 1420。
 */
import { writeFileSync } from "node:fs";

const PORT = 9222;

async function findTarget() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(
    (t) => t.type === "page" && (t.url.includes("localhost:1420") || t.title.includes("video-cut")),
  );
  if (!page) throw new Error("未找到 video-cut 页面目标：" + JSON.stringify(list.map((t) => t.url)));
  return page.webSocketDebuggerUrl;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const mid = ++id;
            pending.set(mid, { res, rej });
            ws.send(JSON.stringify({ id: mid, method, params }));
          });
        },
        close: () => ws.close(),
      });
    ws.onerror = (e) => reject(new Error("WebSocket 连接失败"));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    };
  });
}

const cdp = await connect(await findTarget());
const [, , cmd, ...rest] = process.argv;

async function evaluate(expr) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}

async function centerOf(selector) {
  const box = await evaluate(
    `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`,
  );
  if (!box) throw new Error(`元素不存在：${selector}`);
  return box;
}

async function mousePress(x, y, mods = 0) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, modifiers: mods });
}
async function mouseRelease(x, y, mods = 0) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, modifiers: mods });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

switch (cmd) {
  case "targets": {
    console.log(JSON.stringify(await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(), null, 1));
    break;
  }
  case "eval": {
    console.log(JSON.stringify(await evaluate(rest[0])));
    break;
  }
  case "click": {
    const box = await centerOf(rest[0]);
    await mousePress(box.x, box.y);
    await mouseRelease(box.x, box.y);
    console.log(`clicked ${rest[0]} @${Math.round(box.x)},${Math.round(box.y)}`);
    break;
  }
  case "mouse": {
    const [x, y, m] = rest.map(Number);
    await mousePress(x, y, m || 0);
    await mouseRelease(x, y, m || 0);
    console.log(`mouse ${x},${y}`);
    break;
  }
  case "drag": {
    // drag x1 y1 x2 y2 [steps] [modifiers]
    const [x1, y1, x2, y2, steps = 12, mods = 0] = rest.map(Number);
    await mousePress(x1, y1, mods);
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: x1 + ((x2 - x1) * i) / steps,
        y: y1 + ((y2 - y1) * i) / steps,
        button: "left",
        buttons: 1,
        modifiers: mods,
      });
      await sleep(16);
    }
    await mouseRelease(x2, y2, mods);
    console.log(`drag ${x1},${y1} -> ${x2},${y2}`);
    break;
  }
  case "key": {
    // key <Key> [ctrl|shift|alt]
    const [k, mod] = rest;
    const modifiers =
      (mod?.includes("ctrl") ? 2 : 0) | (mod?.includes("shift") ? 8 : 0) | (mod?.includes("alt") ? 1 : 0);
    const params = { key: k, code: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) };
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...params, modifiers });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...params, modifiers });
    console.log(`key ${k} ${mod ?? ""}`);
    break;
  }
  case "type": {
    await cdp.send("Input.insertText", { text: rest[0] });
    console.log(`typed ${rest[0]}`);
    break;
  }
  case "shot": {
    const r = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(rest[0], Buffer.from(r.data, "base64"));
    console.log(`shot -> ${rest[0]}`);
    break;
  }
  case "dom": {
    const data = await evaluate(
      `(function(){const els=[...document.querySelectorAll(${JSON.stringify(rest[0])})];return els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,text:(el.textContent||'').trim().slice(0,80)};});})()`,
    );
    console.log(JSON.stringify(data, null, 1));
    break;
  }
  default:
    console.error("未知命令：" + cmd);
    process.exit(1);
}
cdp.close();
