# 开发状态交接（HANDOFF）

> 更新：2026-09-13 · 用途：会话上下文压缩后的状态快照。设计与计划详见 [DESIGN.md](./DESIGN.md) / [PLAN.md](./PLAN.md)。

## 项目

**video-cut**：Windows 无损优先视频工具（剪切/合并/旋转/局部放大）。
技术栈：Tauri 2 + React 19 + TS + Tailwind CSS 4 + Rust + FFmpeg 9.0.1（gyan.dev release-essentials，sidecar 分发，`scripts/fetch-ffmpeg.ps1` 下载，binaries 不入库）。

## 里程碑进度

| 里程碑 | 状态 | 提交 |
| --- | --- | --- |
| M0 基建（模块树/sidecar/任务系统/UI 骨架） | ✅ | `979f4cc` |
| M1 剪切垂直切片（probe/关键帧吸附/无损剪切/代理预览） | ✅ | `f8107b9` |
| M2 合并（九项参数检测/无损拼接/自动统一/缩略图） | ✅ | `6964f41` |
| M3 旋转（组合）/局部放大/精确剪切 | ✅ 已验证，**未提交** | — |
| M4 打磨（设置/历史/快捷键/批量/安装包） | 未开始 | — |

M3 后追加三项修复（同样未提交）：crop 选区渲染缺 `absolute` 的锚点 bug + 框内拖拽移动选区；旋转改累积组合（deg+双翻转）；窗口拖拽导入文件（单文件→Cut，多文件→Merge，App 层覆盖层路由）。

## 关键事实（避免重新踩坑）

- Rust 类型集中在 `src-tauri/src/lib.rs`（serde `rename_all = "camelCase"`；枚举 snake_case：`Cw90`→`cw90`，**数字前不加下划线**）。VideoTask::Rotate 字段为 `rotate_deg/hflip/vflip`（Rotation 枚举已删除）。
- FFmpeg 命令只在 `ffmpeg/command.rs` 拼装；统一规则：`-map 0`、`-progress pipe:1`（禁止解析 stderr）、半成品命名 `<name>.part.<原扩展名>`、copy 剪切 `-ss` 在 `-i` 前而精确剪切在后、`-avoid_negative_ts make_zero`。
- 本机 nvenc/qsv/amf 全不可用（试跑探测 + OnceLock 缓存 + 回退 libx264/libx265，10bit 走 HEVC 路径）。
- sidecar 运行时命名是裸 `ffmpeg.exe`/`ffprobe.exe`（tauri-build 去 triple 后缀），`resolve_sidecar` 已对齐插件行为，测试二进制需上溯 deps 目录。
- 任务系统：并发 2、kill 取消、磁盘预检、`.part`→rename、事件 `task-status`/`task-progress`（payload camelCase）。
- 前端 `services/tauri.ts` 是唯一 IPC 入口；主题令牌在 `global.css`（signal 绿=无损，warn 琥珀=重编码，mono 只用于时间码）。
- 测试：36 个 Rust 单测；e2e 素材 = `video/极乐净土 1080p ultra.mp4`（1GB H.264 1080p60，不入库）+ `scripts/fixtures/legacy_avi_mpeg4.mp4.avi`（`gen-fixtures.ps1` 可再生）。

## 未提交变更（M3 + 三项修复）

约 15 个文件：`commands/{rotate,crop,cut,media}.rs`、`ffmpeg/command.rs`、`lib.rs`、`pages/Editor` 全重写、`pages/{Cut,Merge}` 增量、`App.tsx`（拖拽路由）、`services/tauri.ts`、`types/index.ts`、`docs/PLAN.md`。

## 待办

1. 用户手测拖拽导入（OS 级拖拽无法自动化模拟）→ 提交 M3 + 修复
2. M4：设置页（tauri-plugin-store）、历史记录、快捷键、批量处理、NSIS/MSI 安装包实机验证
3. 遗留小项：旋转基于源 metadata 叠加会覆盖源 flip（罕见）；硬编路径未在真 GPU 上验证
