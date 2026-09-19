# video-cut

基于 **Tauri 2 + React + Rust + FFmpeg** 的 Windows 本地视频工具。
核心卖点：**无损优先**——能不重新编码的绝不重编码，剪切/合并/旋转默认走 stream copy，
画质与文件大小和原视频一致、秒级完成；所有操作向用户明示"无损 / 重编码"。

## 功能

| 功能 | 说明 |
| --- | --- |
| **工作台**（落地页） | 多素材 → 剪出任意多片段 → 逐段旋转/放大加工 → 合成时间轴编排 → 连播预览 → 合成一个成品；全程无损时秒级 |
| **剪切** | 极速（关键帧对齐，`-c copy`）与精确（帧级，重编码）双模式；多片段一次导出；入点吸附关键帧、所见即所得 |
| **合并** | 九项参数一致性检测，一致直接无损拼接；不一致可"自动统一后合并" |
| **旋转** | 默认元数据级旋转（`-display_rotation` + remux），秒级且无损；重编码旋转作为高级选项 |
| **局部放大** | 框选画面区域裁剪并放大（crop + lanczos），自动探测 GPU 编码器、失败回退软件编码 |
| **其他** | 代理预览（AVI/HEVC 等不被 WebView2 支持的格式自动生成低清代理，导出仍用原文件）、任务队列（进度/取消/历史记录）、设置（输出目录/编码器锁定/主题色/缓存管理）、按天滚动日志 |

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| 后端 | Rust（Tauri Command，只负责生成 FFmpeg 命令与任务管理，不做编解码） |
| 音视频 | FFmpeg 9.x（gyan.dev 构建，sidecar 随安装包分发，用户无需安装） |

## 环境要求（开发）

- [Node.js](https://nodejs.org/) ≥ 20.19 与 [pnpm](https://pnpm.io/) `npm i -g pnpm`
- [Rust](https://rustup.dev/)（MSVC 工具链）
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（"使用 C++ 的桌面开发"工作负载）
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) 运行时（Windows 10/11 一般已内置）

## 快速开始

```bash
# 1. 安装前端依赖
pnpm install

# 2. 下载 FFmpeg sidecar（放到 src-tauri/binaries/，不入 git）
powershell -ExecutionPolicy Bypass -File scripts/fetch-ffmpeg.ps1

# 3. 开发模式（自动启动 Vite 与 Tauri 窗口，支持热更新）
pnpm tauri dev

# 4. 构建安装包（NSIS，简体中文向导；输出 src-tauri/target/release/bundle/nsis/）
pnpm tauri build
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 仅启动 Vite 前端开发服务器（固定 1420 端口，勿改） |
| `pnpm build` | TypeScript 类型检查 + 前端产物构建 |
| `pnpm tauri dev` | Tauri 桌面应用开发模式 |
| `pnpm tauri build` | 打包 NSIS 安装程序 |
| `cargo test`（src-tauri 下） | Rust 单元测试（命令构建器全量断言） |
| `pnpm lint` | ESLint 静态检查 |
| `node scripts/check-docs.mjs`（或 `pnpm check:docs`） | 文档一致性四项：链接可达 / `§` 引用归属 / ID 交叉定义 / skip 区间合规 |
| `pnpm hooks:install` | 启用仓库内 git 钩子（`core.hooksPath=.githooks`，克隆后跑一次；提交时自动跑 check-docs） |
| `node scripts/render-icon.mjs` | 重渲染图标源 PNG（改 `scripts/icon.svg` 后执行） |
| `pnpm tauri icon src-tauri/icons/icon-source.png --output src-tauri/icons` | 从源 PNG 生成全套应用图标 |

## 项目结构

```
video-cut/
├── docs/                        # 文档（见下方「文档地图」）
├── scripts/                     # fetch-ffmpeg / 图标源与渲染脚本 / 测试夹具生成
├── src/                         # React 前端
│   ├── components/              # VideoPlayer / Timeline / ClipTimeline / ProductPreview / TaskProgress 等
│   ├── pages/                   # Workbench（落地页）/ Cut / Merge / Editor / Settings / History
│   ├── hooks/                   # useDragSort（指针拖拽排序，决策 #18）/ useHotkeys
│   ├── services/tauri.ts        # 唯一 IPC 入口（invoke 封装 + 事件订阅）
│   └── types/                   # 与 Rust 数据模型对齐的 TS 类型
└── src-tauri/                   # Rust 后端
    ├── src/commands/            # 命令入口（校验与任务提交）
    ├── src/ffmpeg/              # 命令构建器 / ffprobe / 进度解析
    ├── src/task/                # 任务队列（并发 2 / 取消 / .part→rename）
    └── binaries/                # FFmpeg sidecar（不入 git，fetch-ffmpeg.ps1 下载）
```

## 文档地图

完整文档清单、ID 规范与"改什么读什么"的对照表统一维护在 **[`docs/INDEX.md`](docs/INDEX.md)**（避免多处重复）；开发约定与工程红线见 **[`AGENTS.md`](AGENTS.md)**。

> 文档体系最后更新：2026-09-19（此后各文档以自身首部「最后更新」为准）

## 开发说明

- **设计即文档**：实现与设计冲突时先改 `docs/DESIGN.md` 再改代码；进度只改 `docs/PLAN.md` 的 checkbox；历史批次要点追加到 `docs/archive/handoff-archive.md`
- 文档引用约定：同文档写 `§N`，跨文档写 `文件名 §N`（章节号沿用旧编号，DESIGN.md 编号不连续属预期）
- **命令、禁区与完事标准见 [`AGENTS.md`](AGENTS.md)**（FFmpeg 参数唯一拼装处、`spawn_hidden`、IPC 入口、拖拽实现、测试三项全绿等）
- `Cargo.toml` 已做发布构建优化（LTO、单 codegen unit、符号剥离）

## 许可证

暂未确定，规划中。注意：内置 FFmpeg（gyan.dev 构建）含 GPL 组件，建议个人/内部使用；
若公开发布或商用需评估 GPL 合规（详见 `docs/DESIGN.md` §11）。
