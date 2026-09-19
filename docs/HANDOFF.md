# 开发状态交接（HANDOFF）

> **职责**：会话上下文压缩后的**状态快照**——现在在哪、下一步做什么、近期踩过的坑。
> **唯一真源**：**"当前状态与下一步"**以本文为准；进度细节以 [PLAN.md](./PLAN.md) 为准（本文里程碑表仅在状态变化时同步，**不单独维护进度**）；长期工程红线以 [../AGENTS.md](../AGENTS.md) 为准。
> **读时机**：会话开场第一条；接续他人工作时。
> **写规则**：只写当前状态与**近期相关**的坑；已定型的长期约定移入 AGENTS.md（本文只留指针）；历史批次要点进 [handoff-archive.md](./archive/handoff-archive.md)，本文不堆积。
> **关联**：[INDEX.md](./INDEX.md)（地图） · [PLAN.md](./PLAN.md)（进度真源） · [../AGENTS.md](../AGENTS.md)（红线）
> **最后更新**：2026-09-19

## 项目

**video-cut**：Windows 无损优先视频工具（工作台流水线 + 剪切/合并/旋转/局部放大）。
技术栈：Tauri 2 + React 19 + TS + Tailwind CSS 4 + Rust + FFmpeg 9.0.1（gyan.dev release-essentials，sidecar 分发，`scripts/fetch-ffmpeg.ps1` 下载，binaries 不入库）。

文档分工（2026-09-19 规范化）：地图与 ID 规范见 [INDEX.md](./INDEX.md)；规格 `DESIGN.md`（仲裁者）/ `FFMPEG.md` / `UI.md` / `TIMELINE.md` §17（行为规格）；决策 [DECISIONS.md](./DECISIONS.md) · 候选 [CANDIDATES.md](./CANDIDATES.md)；M11 实施方案 [plans/M11.md](./plans/M11.md)；进度真源 [PLAN.md](./PLAN.md)；测试 [TESTING.md](./TESTING.md)；工程红线 [../AGENTS.md](../AGENTS.md)；历史批次 [handoff-archive.md](./archive/handoff-archive.md)；本文 = 状态快照。

## 当前状态（2026-09-19）

> **状态真源是 [PLAN.md](./PLAN.md)**（里程碑总览的状态列）；本表是**快照**，只在状态变化时同步，不单独维护进度细节。

| 里程碑 | 状态 | 提交 |
| --- | --- | --- |
| M0 基建（模块树/sidecar/任务系统/UI 骨架） | ✅ | `979f4cc` |
| M1 剪切垂直切片（probe/关键帧吸附/无损剪切/代理预览） | ✅ | `f8107b9` |
| M2 合并（九项参数检测/无损拼接/自动统一/缩略图） | ✅ | `6964f41` |
| M3 旋转（组合）/局部放大/精确剪切 | ✅ | `ae24685` |
| M4 打磨 | ✅ M4-1/2/3/5/6/7/8（M4-5 实机冒烟待用户）；M4-4 取消立项（决策 #20 → M6-8） | 第三批 + M4-3 提交 |
| M5 工作台（多文件流水线） | ✅ | `9b96210` |
| M6 工作台 2.0（多片段/片段池/合成时间轴/成品连播） | ✅ M6-0~M6-8（含 M6-7 自动化，UI 手测归用户） | 工作台 2.0 批次 |
| M7 反馈修复与体验 | ✅ M7-1~M7-9 | 各批次提交 |
| M8 候选池晋升批次 1（B1 probe 缓存 / B2 磁盘预检 / B14 e2e） | ✅ | `a0df7d7`(docs) `c7b67da` `8d8dc65` `09e717d` |
| M9 工作台修复冲刺（成品预览 fileSrc / 切换重置 / 时间轴布局+整块拖拽 / 区间预览） | ✅（验收归用户统一手测） | `341f02c` `9c1b15d` `36c4846` |
| 文档拆分与订正（DESIGN 拆 5 份 + 引用改写 + HANDOFF 瘦身） | ✅ | `36662a3` |
| 文档规范化 B1/B2/B3（INDEX/测试/日志/AGENTS.md；候选池与 M11 方案迁出；FR/NFR/AC 发号 + 追踪矩阵） | ✅ | `af7df66` `7aee978` + B3 提交 |
| 评审修复批次 R1/R2/R3 | ✅ R1-1~R1-5 全部完成（2026-09-19）；R2/R3 未开工（R2 并入 M11-0，R3 在 M12-2 前） | R1：`23c3623` `eea9422` `70a991e` + R1-4/R1-5 提交 |
| M10 保活 + 深浅主题 | ⏸ 暂缓（决策 #32） | — |
| M11 单轨时间线核心 | 🔜 **下一步**（M11-0~M11-9 全部未开工） | — |
| M12 预览强化 / M13 打磨 | ⏳ 待实施 | — |

**代码侧现状核对（2026-09-19）**：R1 已全部完成——`useTauriEvent` / `utils/crop.ts` / `components/CropOverlay` 已就位，任务系统带终态清理钩子，`eslint.config.js` + `pnpm lint` 可用（存量 0 problems）；`src/utils/` 仍无 `undo/`、`src/pages/Workbench/index.tsx` 仍 1585 行单文件、无 Vitest 配置、`src/App.css` 与 `less` 依赖仍在——即 R2 与 M11 均未动工。

## 下一步（按序）

**R1 已完成（2026-09-19）→ 下一步 M11-0（状态层/撤销基座，吸收 R2）→ M11-1~M11-9 → R3（M12-2 前）→ M12-2 → M12-1/3 → M13**；M10 与时间线核心零耦合，视反馈随时插入。

- 待用户统一手测：M4-5 NSIS 干净环境冒烟（中文向导/新图标/SmartScreen）、M7-1/2/3、第一批快改、工作台 2.0 全流程、快捷键（剪切页与工作台各模式）、M4-8（主题色/缓存/关闭确认/重置与关于）、**M9 五项**（成品预览可连播可 seek / 切换无残留 / 多短片段不压盖且整块可拖 / 加工视图播完出点即停）
- 遗留小项：规则 B 下"有片段裁剪 + 其他片段非恒等旋转"时后者也转码（已文档化）；硬编路径未在真 GPU 验证；旋转覆盖源 flip 元数据（罕见）；代理关闭时不支持格式仅显示提示条；日志跨天不切文件；README 截图待补

## 待办

1. **代码主线**：R1 ✅ → M11（顺序见上）→ M12；候选池编号与说明见 [CANDIDATES.md](./CANDIDATES.md)
2. **工程面硬门槛**：发布前 asset scope 收窄 + CSP（B15，见 PLAN R3 之外的收尾项）
3. **文档维护约定**：新决策只追加进 DECISIONS.md（新条目用 `ADR-0NN`）；新候选进 CANDIDATES.md；进度只改 PLAN.md 的 checkbox；历史批次要点追加进 handoff-archive.md，本文不再堆积批次细节；文档分工与 ID 规则见 [INDEX.md](./INDEX.md)
4. **独立技术任务（T）**：[PLAN.md](./PLAN.md)「技术任务」节的 T-001（消除 TIMELINE.md §17.4 ↔ plans/M11.md §18.5 的重复描述，逐条报告后删）、T-002 清理 `src/components/{CropEditor,RotateEditor,MergeEditor}` 空目录（需放开"不碰代码"）

## 关键事实（避免重新踩坑）

> 长期红线与命令已收敛到 [../AGENTS.md](../AGENTS.md)（FFmpeg 参数唯一拼装处、`spawn_hidden`、timescale、临时令牌、IPC 入口、拖拽实现等）。本节只留**与当前阶段（M11 时间线）相关**的踩坑与基线。

- Rust 类型集中在 `src-tauri/src/lib.rs`（serde `rename_all = "camelCase"`；枚举 snake_case：数字前不加下划线）。`VideoTask::Pipeline { items, output, quality, encoder }`，`PipelineItem { input, segment?, rotateDeg, hflip, vflip, crop?, outWidth?, outHeight? }`；除 Merge 外四类任务均带 `encoder: Option<String>`。
- FFmpeg 命令只在 `ffmpeg/command.rs` 拼装；统一规则：`-map 0`、`-progress pipe:1`（禁止解析 stderr）、半成品 `<name>.part.<令牌>.<扩展名>`、copy 剪切 `-ss` 在 `-i` 前而精确剪切在后、`-avoid_negative_ts make_zero`。
- **concat 时间戳陷阱**：copy 片段 tb=1/60000，libx264 转码默认 tb=1/15360，concat demuxer 拼接 tb 不一致文件会把后续段视频 pts 压坏（23s→2.1s、时长元数据对但 seek/播放坏）。修复=所有重编码统一带 `-video_track_timescale <首片段源 tb 分母>`（`command::parse_timescale`）；归一化路径同理。
- **临时文件令牌**：`commands::pipeline::temp_token`（fnv1a+序号）用于所有任务的 `.part`/中间文件，防同名输出并发任务互写（并发 2，双击导出即可触发；曾实测产出"时长对但只有前 15s 可解码"的损坏成品）。
- 本机 nvenc/qsv/amf 全不可用（试跑探测 + OnceLock 缓存 + 回退 libx264/libx265，10bit 走 HEVC 路径）。
- sidecar 运行时命名是裸 `ffmpeg.exe`/`ffprobe.exe`；`resolve_sidecar` 已对齐插件行为，测试二进制需上溯 deps 目录。
- **release 是 GUI 子系统**（main.rs `windows_subsystem="windows"`）：Rust 侧直接 spawn ffmpeg/ffprobe 会闪 CMD 窗口（用户装包实测反馈，2026-09-13 修复）。所有直接 spawn 必须先调 `command::spawn_hidden`（CREATE_NO_WINDOW；五处已接线：probe×2、缩略图、worker、编码器探测）；经 shell 插件的 sidecar 调用插件已内置处理。dev 是 console 子系统，看不到此问题。
- 任务系统：并发 2、kill 取消、`.part`→rename、事件 `task-status`/`task-progress`（payload camelCase）。`submit_pipeline` 有 debug 日志打印收到的载荷，e2e 排查时看日志文件或 tauri dev 控制台。
- 前端 `services/tauri.ts` 是唯一 IPC 入口（`eslint.config.js` 的 `no-restricted-imports` 会拦下 services 之外的 `@tauri-apps/*` 导入，`pnpm lint` 全量扫）；主题令牌在 `global.css`（signal 绿=无损，warn 琥珀=重编码，mono 只用于时间码）。
- 事件订阅统一用 `hooks/useTauriEvent`（`listen()` 的 Promise 在 resolve 前卸载会漏退订）；裁剪框选统一用 `components/CropOverlay` + `utils/crop.ts`（编辑器页整层 overlay，工作台 handlers 挂旋转舞台）。
- **probe 缓存**（B1）键 = 路径+size+mtime_ns，仅缓存成功结果；条目 ≥512 整体清空——M12-2 前须改 LRU（PLAN R3-1）。
- 测试：60 个 Rust 单测 + 3 个命令级 e2e（`tests/e2e.rs`，真实 sidecar 跑核心链路，sidecar 缺失自动跳过）；手工 e2e 素材 = `video/merge_test_a/b.mp4`（`gen-fixtures.ps1` 产物，参数一致可无损拼）+ `video/极乐净土 1080p ultra.mp4`（1GB）。
- UI 自动化经验：WebView2 a11y 树常要等一会才出内容；文件对话框行元素 AXPress 是"打开"不是"选中"（多选用文件名输入框 set_value + 打开按钮）；受控输入框用坐标点击 + ctrl+a + 键入 + Enter 提交；底部任务通知浮层会遮挡导出按钮，操作前先关掉。
- 文档引用约定：同文档写 `§N`，跨文档写 `文件名 §N`；章节号沿用 2026-09-19 拆分前的编号（故 DESIGN.md 编号不连续）。
