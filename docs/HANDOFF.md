# 开发状态交接（HANDOFF）

> 更新：2026-09-13 · 用途：会话上下文压缩后的状态快照。设计与计划详见 [DESIGN.md](./DESIGN.md) / [PLAN.md](./PLAN.md)。

## 项目

**video-cut**：Windows 无损优先视频工具（工作台流水线 + 剪切/合并/旋转/局部放大）。
技术栈：Tauri 2 + React 19 + TS + Tailwind CSS 4 + Rust + FFmpeg 9.0.1（gyan.dev release-essentials，sidecar 分发，`scripts/fetch-ffmpeg.ps1` 下载，binaries 不入库）。

## 里程碑进度

| 里程碑 | 状态 | 提交 |
| --- | --- | --- |
| M0 基建（模块树/sidecar/任务系统/UI 骨架） | ✅ | `979f4cc` |
| M1 剪切垂直切片（probe/关键帧吸附/无损剪切/代理预览） | ✅ | `f8107b9` |
| M2 合并（九项参数检测/无损拼接/自动统一/缩略图） | ✅ | `6964f41` |
| M3 旋转（组合）/局部放大/精确剪切 | ✅ | `ae24685` |
| M5 工作台（多文件流水线：逐段剪切/旋转/放大 → 合成成品） | ✅ | `9b96210` |
| M4 打磨（设置/历史/快捷键/批量/安装包/日志 M4-7） | M4-1、M4-2 ✅（待提交），其余未开始 | — |

## M4-1 设置页要点（DESIGN §9.9、§12）

- 六项配置：默认输出目录 / 默认剪切模式 / 关键帧吸附 / 代理预览（自动·始终·关闭三态）/ 编码器锁定 / 默认质量档位；存 `settings.json`（plugin-store，app_config_dir），读取时 sanitize 回退默认，**改动即保存**
- 输出位置统一规则（`utils/paths.ts::resolveOutputDir`）：设了默认目录则全部页面用它，否则跟随源文件目录
- 编码器锁定走任务载荷：`VideoTask` 四变体新增 `encoder: Option<String>`，Rust `command::effective_encoder` 校验（`LOCKABLE_ENCODERS`），非法值回退自动探测
- 设置由 App 层启动加载一次（`settingsReady` 门控页面渲染），页面按导航条件挂载即拿到最终值；pages/Settings 为受控组件，App 持有 state

## M4-2 历史记录要点（DESIGN §9.10、§12）

- 记录点在 **Rust 侧终态**：`TaskManager::set_on_terminal`（lib.rs setup 接线，白名单 cut/merge/rotate/crop_zoom/pipeline，代理不入库）→ `history.json`（app_data_dir，200 条上限，.tmp+rename 原子写）
- TaskHandle 新增 `created_at/started_at/terminal_recorded`；`Shared::record_terminal` 的防重护栏覆盖三处终态（worker 正常分支、worker 排队取消兜底、cancel 排队直接取消）——取消与执行器并发只记首次
- 前端 pages/History 只读：状态徽标 + 类型标签 + 耗时 + 产物点击 `revealInFolder` 重新定位 + 清空（dialog ask 二次确认）；`list_history`/`clear_history` 命令

## M5 工作台要点（DESIGN §3.8、§6.3⑨⑩、§9.8）

- 单 `pipeline` 任务 = 逐片段处理 → 定向参数统一 → concat；`plan_items` 纯函数决定每片段 copy/transcode
- 前端 `pages/Workbench`：文件列表 + 展开式每片段编辑器（剪切/旋转/放大三标签）+ 检测面板 + 导出；共享 `components/RotateControls`（Editor 页复用）；VideoPlayer 新增 `fill` 模式（旋转预览内层盒）
- 裁剪坐标是**显示空间**（用户所见，含旋转效果）；90°/270° 时后端按交换宽高校验、滤镜链旋转在裁剪前

## 关键事实（避免重新踩坑）

- Rust 类型集中在 `src-tauri/src/lib.rs`（serde `rename_all = "camelCase"`；枚举 snake_case：数字前不加下划线）。`VideoTask::Pipeline { items, output, quality, encoder }`，`PipelineItem { input, segment?, rotateDeg, hflip, vflip, crop?, outWidth?, outHeight? }`。
- FFmpeg 命令只在 `ffmpeg/command.rs` 拼装；统一规则：`-map 0`、`-progress pipe:1`（禁止解析 stderr）、半成品 `<name>.part.<令牌>.<扩展名>`、copy 剪切 `-ss` 在 `-i` 前而精确剪切在后、`-avoid_negative_ts make_zero`。
- **concat 时间戳陷阱**：copy 片段 tb=1/60000，libx264 转码默认 tb=1/15360，concat demuxer 拼接 tb 不一致文件会把后续段视频 pts 压坏（23s→2.1s、时长元数据对但 seek/播放坏）。修复=所有重编码统一带 `-video_track_timescale <首片段源 tb 分母>`（`command::parse_timescale`）；归一化路径同理。
- **临时文件令牌**：`commands::pipeline::temp_token`（fnv1a+序号）用于所有任务的 `.part`/中间文件，防同名输出并发任务互写（并发 2，双击导出即可触发；曾实测产出"时长对但只有前 15s 可解码"的损坏成品）。
- 本机 nvenc/qsv/amf 全不可用（试跑探测 + OnceLock 缓存 + 回退 libx264/libx265，10bit 走 HEVC 路径）。
- sidecar 运行时命名是裸 `ffmpeg.exe`/`ffprobe.exe`；`resolve_sidecar` 已对齐插件行为，测试二进制需上溯 deps 目录。
- 任务系统：并发 2、kill 取消、`.part`→rename、事件 `task-status`/`task-progress`（payload camelCase）。`submit_pipeline` 有 debug 日志（`[pipeline] item i: …`）打印收到的载荷，e2e 排查时看 tauri dev 控制台。
- 前端 `services/tauri.ts` 是唯一 IPC 入口；主题令牌在 `global.css`（signal 绿=无损，warn 琥珀=重编码，mono 只用于时间码）。
- 测试：52 个 Rust 单测；e2e 素材 = `video/merge_test_a/b.mp4`（`gen-fixtures.ps1` 产物，参数一致可无损拼）+ `video/极乐净土 1080p ultra.mp4`（1GB）。
- UI 自动化经验：WebView2 a11y 树常要等一会才出内容；文件对话框行元素 AXPress 是"打开"不是"选中"（多选用文件名输入框 set_value + 打开按钮）；受控输入框用坐标点击 + ctrl+a + 键入 + Enter 提交；底部任务通知浮层会遮挡导出按钮，操作前先关掉。

## M5 提交内容（`9b96210`，22 文件 +2467/-273）

新增 `commands/pipeline.rs`、`pages/Workbench/`、`components/RotateControls/`；修改 `lib.rs`（PipelineItem/CropRect/Pipeline 变体 + check_pipeline 注册）、`command.rs`（pipeline/normalize 构建器 + parse_timescale）、`merge/crop/cut/rotate.rs`（diff_pair 抽取、align_rect 抽取、临时令牌）、`types/index.ts`、`services/tauri.ts`、`pages/{Home,Editor,Cut,Merge,Workbench}`、`App.tsx`（拖入原地分发）、`components/VideoPlayer`（进度/音量控制条）、`utils/time.ts`（导出名时间戳）、`docs/{DESIGN,PLAN,HANDOFF}.md`（含 §12.1 日志系统设计 = M4-7）。

## 待办

1. 用户手测：拖入文件不再跳页（OS 级拖拽无法自动化模拟）；设置页改动重启后保留
2. M4 余项：M4-3 快捷键、M4-4 批量处理、M4-5 NSIS/MSI 安装包实机验证、M4-6 文档收尾、**M4-7 日志系统（最后一项，§12.1）**
3. 遗留小项：规则 B 下"有片段裁剪 + 其他片段非恒等旋转"时后者也转码（方向一致性优先，已文档化）；硬编路径未在真 GPU 上验证；旋转覆盖源 flip 元数据（罕见）；代理关闭时不支持格式仅显示提示条（无占位封面图）
