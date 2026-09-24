import { defineConfig } from "vitest/config";

// 刻意与 vite.config.ts 分开：那份是 Tauri 开发服务器的配置（固定端口 1420、HMR host、
// 忽略 src-tauri 监听），单元测试既不需要、也不该被它影响。
export default defineConfig({
  test: {
    // 命令层与工具层都是纯 TS，不需要 DOM 环境
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
