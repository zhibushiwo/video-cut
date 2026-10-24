/**
 * CDP 助手库(gui-test 共用):单连接 + 常用驱动/断言原语。
 * cdp.mjs 是 CLI 壳;测试脚本 import 本模块避免 shell 引号层叠。
 */
const PORT = 9222;

async function findTarget() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(
    (t) => t.type === "page" && (t.url.includes("localhost:1420") || t.title.includes("video-cut")),
  );
  if (!page) throw new Error("未找到 video-cut 页面目标");
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
    ws.onerror = () => reject(new Error("WebSocket 连接失败"));
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
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function evaluate(expr) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}

/** 页面上下文里执行并返回 JSON(表达式需以 IIFE 结尾) */
export const js = (body) => evaluate(body);

export async function clickText(text) {
  return evaluate(
    `(function(){const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()===${JSON.stringify(text)});if(!b)return 'no-button:'+${JSON.stringify(text)};b.click();return 'clicked';})()`,
  );
}

export async function clickTextContains(text) {
  return evaluate(
    `(function(){const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes(${JSON.stringify(text)}));if(!b)return 'no-button:'+${JSON.stringify(text)};b.click();return 'clicked';})()`,
  );
}

export async function key(k, n = 1, mod) {
  const modifiers =
    (mod?.includes("ctrl") ? 2 : 0) | (mod?.includes("shift") ? 8 : 0) | (mod?.includes("alt") ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const params = { key: k, code: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) };
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...params, modifiers });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...params, modifiers });
  }
  return "ok";
}

export async function mousePress(x, y, mods = 0) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, modifiers: mods });
}
export async function mouseRelease(x, y, mods = 0) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, modifiers: mods });
}
export async function mouseMove(x, y, mods = 0) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1, modifiers: mods });
}

export async function drag(x1, y1, x2, y2, steps = 12, mods = 0) {
  await mousePress(x1, y1, mods);
  for (let i = 1; i <= steps; i++) {
    await mouseMove(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, mods);
    await sleep(16);
  }
  await mouseRelease(x2, y2, mods);
  return "ok";
}

/** React 受控 input 赋值(原生 setter + input 事件) */
export async function setInputValue(selector, idx, value) {
  return evaluate(
    `(function(){const el=document.querySelectorAll(${JSON.stringify(selector)})[${idx}];if(!el)return 'no-element';const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})()`,
  );
}

export async function bodyText() {
  return evaluate("document.body.innerText");
}

export async function shot(path) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png" });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path, Buffer.from(r.data, "base64"));
  return path;
}
