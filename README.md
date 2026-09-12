# video-cut

基于 **Tauri 2 + React + Rust + FFmpeg** 的 Windows 视频剪辑软件。使用系统自带 WebView 渲染界面，体积小、启动快；视频解码、剪辑与导出等重活交给 Rust 侧调用 FFmpeg 完成。

> 项目目前处于起步阶段，界面与核心功能正在搭建中，欢迎 Star / Fork 一起完善。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite 8 |
| 样式 | Tailwind CSS 4（通过 `@tailwindcss/vite` 插件接入） |
| 后端 | Rust（Tauri Command） |
| 音视频处理 | FFmpeg（规划接入） |

## 环境要求（Windows）

- [Node.js](https://nodejs.org/) ≥ 20.19（Vite 8 要求）与 [pnpm](https://pnpm.io/) `npm i -g pnpm`
- [Rust](https://rustup.dev/)（MSVC 工具链，建议最新稳定版）
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含 "使用 C++ 的桌面开发" 工作负载）
- [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) 运行时（Windows 10/11 一般已内置）
- FFmpeg：用于后续音视频处理，可从 [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) 或 [BtbN builds](https://github.com/BtbN/FFmpeg-Builds/releases) 下载并将 `ffmpeg` / `ffprobe` 加入 PATH

> 推荐使用 [VS Code](https://code.visualstudio.com/) 并安装 [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) 与 [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) 扩展（见 `.vscode/extensions.json`）。

## 快速开始

```bash
# 1. 安装前端依赖
pnpm install

# 2. 以开发模式启动（自动启动 Vite 与 Tauri 窗口，支持热更新）
pnpm tauri dev

# 3. 构建发行版安装包（输出位于 src-tauri/target/release/bundle/）
pnpm tauri build
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 仅启动 Vite 前端开发服务器（http://localhost:1420） |
| `pnpm build` | TypeScript 类型检查 + 前端产物构建 |
| `pnpm tauri dev` | 启动 Tauri 桌面应用开发模式 |
| `pnpm tauri build` | 打包 Windows 安装程序 / 可执行文件 |

## 项目结构

```
video-cut/
├── index.html                  # 前端入口 HTML
├── src/                        # React 前端源码
│   ├── main.tsx                # 应用挂载入口
│   ├── App.tsx                 # 根组件
│   ├── components/             # 通用组件
│   └── global.css              # 全局样式（引入 Tailwind CSS）
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 程序入口
│   │   └── lib.rs              # 应用构建与 Tauri Command
│   ├── capabilities/           # Tauri 权限配置（capability）
│   ├── icons/                  # 应用图标
│   ├── tauri.conf.json         # Tauri 配置（窗口、打包等）
│   └── Cargo.toml              # Rust 依赖配置
├── vite.config.ts              # Vite 配置（固定 1420 端口供 Tauri 使用）
└── package.json
```

## 开发说明

- Vite 固定监听 **1420** 端口（`strictPort: true`），这是 Tauri 开发模式所依赖的，请勿改动；如需局域网/移动设备调试，可设置 `TAURI_DEV_HOST` 环境变量。
- Rust 代码变更后，`tauri dev` 会自动重新编译并重启应用。
- 前端通过 `@tauri-apps/api` 的 `invoke` 调用 Rust 侧命令；新增命令需在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中注册，并按需在 `src-tauri/capabilities/` 中补充权限。
- `Cargo.toml` 中已针对发布构建做了体积与性能优化（LTO、单 codegen unit、符号剥离等）。

## 功能规划

- [ ] 视频导入与素材管理
- [ ] 时间线编辑：多轨道、拖拽排序
- [ ] 片段裁剪、分割、删除
- [ ] 实时预览与逐帧定位
- [ ] 字幕 / 水印 / 滤镜
- [ ] 基于 FFmpeg 的高性能导出（自定义分辨率、码率、格式）
- [ ] 打包为独立安装程序分发

## 许可证

暂未确定，规划中。
