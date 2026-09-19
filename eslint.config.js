/**
 * ESLint 基线（R1-5）。此前仓库没有任何 lint 配置，hooks 依赖、IPC 入口约定
 * （只允许 services 碰 @tauri-apps）、订阅退订模式全靠人肉审查。
 *
 * 分档：
 * - `react-hooks/rules-of-hooks` + `exhaustive-deps`：error —— 组件正确性底线；
 * - `no-restricted-imports`：error —— DESIGN §5.2「UI 不得直接 import @tauri-apps」，仅 services/ 例外；
 * - typescript-eslint 推荐集：其余；未使用变量交给 tsc 的 noUnusedLocals/noUnusedParameters，
 *   避免同一问题两处报错。
 *
 * 用法：`pnpm lint`（全量）/ `pnpm lint:fix`。
 */
import reactHooks from "eslint-plugin-react-hooks";
import ts from "typescript-eslint";

export default ts.config(
  // 构建产物、Rust 侧、脚本与生成物不在范围内（.workbuddy 是 agent 工作目录，已 gitignore）
  { ignores: ["dist/", "node_modules/", "src-tauri/", "scripts/", ".workbuddy/"] },
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // tsc 已强制（noUnusedLocals / noUnusedParameters），此处不重复报
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tauri-apps/*"],
              message:
                "IPC 只经 services/tauri.ts（DESIGN §5.2）：页面 / 组件 / hooks 不得直接 import @tauri-apps/*",
            },
          ],
        },
      ],
    },
  },
  {
    // services/ 是唯一允许直接调 IPC 的层（含事件订阅的 listen）
    files: ["src/services/**"],
    rules: { "no-restricted-imports": "off" },
  },
);
