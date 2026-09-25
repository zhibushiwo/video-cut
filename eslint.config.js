/**
 * ESLint 基线（R1-5 接入，R2-4 加严为 type-aware）。此前仓库没有任何 lint 配置，hooks
 * 依赖、IPC 入口约定（只允许 services 碰 @tauri-apps）、订阅退订模式全靠人肉审查。
 *
 * 分档：
 * - `react-hooks/rules-of-hooks` + `exhaustive-deps`：error —— 组件正确性底线；
 * - `no-restricted-imports`：error —— DESIGN §5.2「UI 不得直接 import @tauri-apps」，仅 services/ 例外；
 * - type-aware（R2-4）：`no-floating-promises` / `no-misused-promises` 显式启用 —— IPC 密集
 *   代码里漏 await/漏 .catch 的 promise 静默丢失、Promise 传给 void 位置（如 onClick）是
 *   最高频的隐患类别。**注意**：升级 recommendedTypeChecked 还隐式生效了其集内其余
 *   type-aware 规则（restrict-template-expressions / restrict-plus-operands / no-for-in-array /
 *   only-throw-error / prefer-promise-reject-errors 等，当前零命中）——off 清单只列"被显式
 *   关闭"的，没列的不代表不存在；
 * - typescript-eslint 推荐集：其余；未使用变量交给 tsc 的 noUnusedLocals/noUnusedParameters，
 *   避免同一问题两处报错。
 *
 * 用法：`pnpm lint`（全量）/ `pnpm lint:fix`。
 */
import reactHooks from "eslint-plugin-react-hooks";
import ts from "typescript-eslint";

export default ts.config(
  // 构建产物、Rust 侧、脚本与生成物不在范围内（.workbuddy 是 agent 工作目录，已 gitignore）。
  // eslint.config.js 自身也不 lint：type-aware 规则对无类型信息的 .js 无法工作（R2-4）
  { ignores: ["dist/", "node_modules/", "src-tauri/", "scripts/", ".workbuddy/", "eslint.config.js"] },
  ...ts.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // tsc 已强制（noUnusedLocals / noUnusedParameters），此处不重复报
      "@typescript-eslint/no-unused-vars": "off",
      // R2-4 启用的两条 type-aware 规则
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: true } },
      ],
      // type-checked 推荐集中暂不启用的部分（存量噪音多、收益低；后续按需逐条开）
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/unbound-method": "off",
      // 严格档 / 风格档（strictTypeChecked / stylisticTypeChecked）的规则，不在推荐集内——
      // 此处预关闭只为显式声明"未启用"；将来升级 strict 档时需逐条显式决策，勿沿用
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-readonly-parameter-types": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
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
