import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { appendFrontendLog } from "./services/tauri";
import "./global.css";
import "./App.css";

// 前端错误全量入日志（DESIGN §12.1）；转发失败静默（避免错误→上报失败→错误的循环）
const report = (message: string) => {
  void appendFrontendLog("error", message).catch(() => {});
};
window.addEventListener("error", (e) =>
  report(`${e.message}（${e.filename}:${e.lineno}:${e.colno}）`),
);
window.addEventListener("unhandledrejection", (e) =>
  report(`未处理的 Promise 拒绝：${String(e.reason)}`),
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
