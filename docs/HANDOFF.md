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
| M4 打磨（设置/历史/快捷键/批量/安装包/日志 M4-7） | M4-1、M4-2 ✅（`497177a`），M4-3~M4-7 未开始 | `497177a` |
| M6 工作台 2.0（多片段/片段池/合成时间轴/成品连播） | 方案定稿（DESIGN v0.4）；M6-0 落地页改造 ✅，M6-1~M6-8 未开始 | `b38721a` |
| M7 反馈修复与体验 | M7-1/2/3 bug 修复 ✅；M7-4~M7-9 按批次规划实施（决策 #19/#20/#21） | `16468f7` `5d25884` `8c52d6f` |

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

## 工作台 2.0 方案要点（M6，DESIGN v0.3 §3.8/§9.8，2026-09-13 定稿）

- **后端零必须改动**：`PipelineItem` 即片段，同源多片段 = 多条 item，`plan_items`/`check_pipeline`/`submit_pipeline` 现有语义已正确（临时令牌按条目隔离）；重构收敛在前端
- 三层数据模型：素材 SourceFile（卡片，排序仅组织用）→ 片段 Clip（= PipelineItem，一个素材可剪多段）→ timeline（片段 id 有序表，**唯一**决定成品顺序；片段池不做独立排序，决策记录 13）
- 页面四区：成品预览（flex-1）/ 合成时间轴（ClipTimeline 新组件，块宽∝时长）/ 片段池 / 素材卡片；预览区三态复用（成品/源剪切/片段加工）
- 成品预览 = `<video>` 虚拟连播（决策记录 14）：播放列表派生成品内↔源内时间对，双 video 轮换预加载；±1 帧边界误差与切换停顿已知，UI 明示"以导出为准"
- 可复用资产：Timeline（双柄+吸附）、RotateControls、显示空间裁剪交互（cropHandlers/displayedDims/cropPx）、generateThumbnails、代理逻辑
- 实施顺序：M6-1~M6-5 结构与导出链路 → M6-6 连播 → M6-8 增强（可选：缩略图支持 (input, timeSec) 取片段起点帧）

## 落地页改造（M6-0，待提交）

- `pages/Home` 已删除（BrandMark/EnvChip 迁入 Workbench 头部）；`PageShell` 遗留空壳一并删除
- `PageName` 去掉 `"home"`，初始页 `"workbench"`；App 层拖拽路由简化为"一律落在当前页面"（原主页按数量跳剪切/合并的逻辑随 Home 移除）
- 各页返回按钮 aria-label 改"返回工作台"，onBack 指向 workbench
- Workbench props 变化：`onBack` → `env: EnvironmentInfo | null` + `onNavigate: (page: PageName) => void`；头部右上角 NAV_ITEMS（剪切/合并/旋转/放大）+ 历史/设置图标按钮

## 关键事实（避免重新踩坑）

- Rust 类型集中在 `src-tauri/src/lib.rs`（serde `rename_all = "camelCase"`；枚举 snake_case：数字前不加下划线）。`VideoTask::Pipeline { items, output, quality, encoder }`，`PipelineItem { input, segment?, rotateDeg, hflip, vflip, crop?, outWidth?, outHeight? }`。
- FFmpeg 命令只在 `ffmpeg/command.rs` 拼装；统一规则：`-map 0`、`-progress pipe:1`（禁止解析 stderr）、半成品 `<name>.part.<令牌>.<扩展名>`、copy 剪切 `-ss` 在 `-i` 前而精确剪切在后、`-avoid_negative_ts make_zero`。
- **concat 时间戳陷阱**：copy 片段 tb=1/60000，libx264 转码默认 tb=1/15360，concat demuxer 拼接 tb 不一致文件会把后续段视频 pts 压坏（23s→2.1s、时长元数据对但 seek/播放坏）。修复=所有重编码统一带 `-video_track_timescale <首片段源 tb 分母>`（`command::parse_timescale`）；归一化路径同理。
- **临时文件令牌**：`commands::pipeline::temp_token`（fnv1a+序号）用于所有任务的 `.part`/中间文件，防同名输出并发任务互写（并发 2，双击导出即可触发；曾实测产出"时长对但只有前 15s 可解码"的损坏成品）。
- 本机 nvenc/qsv/amf 全不可用（试跑探测 + OnceLock 缓存 + 回退 libx264/libx265，10bit 走 HEVC 路径）。
- sidecar 运行时命名是裸 `ffmpeg.exe`/`ffprobe.exe`；`resolve_sidecar` 已对齐插件行为，测试二进制需上溯 deps 目录。
- **release 是 GUI 子系统**（main.rs `windows_subsystem="windows"`）：Rust 侧直接 spawn ffmpeg/ffprobe 会闪 CMD 窗口（用户装包实测反馈，2026-09-13 修复）。所有直接 spawn 必须先调 `command::spawn_hidden`（CREATE_NO_WINDOW；五处已接线：probe×2、缩略图、worker、编码器探测）；经 shell 插件的 sidecar 调用插件已内置处理。dev 是 console 子系统，看不到此问题。
- 任务系统：并发 2、kill 取消、`.part`→rename、事件 `task-status`/`task-progress`（payload camelCase）。`submit_pipeline` 有 debug 日志（`[pipeline] item i: …`）打印收到的载荷，e2e 排查时看 tauri dev 控制台。
- 前端 `services/tauri.ts` 是唯一 IPC 入口；主题令牌在 `global.css`（signal 绿=无损，warn 琥珀=重编码，mono 只用于时间码）。
- 测试：52 个 Rust 单测；e2e 素材 = `video/merge_test_a/b.mp4`（`gen-fixtures.ps1` 产物，参数一致可无损拼）+ `video/极乐净土 1080p ultra.mp4`（1GB）。
- UI 自动化经验：WebView2 a11y 树常要等一会才出内容；文件对话框行元素 AXPress 是"打开"不是"选中"（多选用文件名输入框 set_value + 打开按钮）；受控输入框用坐标点击 + ctrl+a + 键入 + Enter 提交；底部任务通知浮层会遮挡导出按钮，操作前先关掉。

## M5 提交内容（`9b96210`，22 文件 +2467/-273）

新增 `commands/pipeline.rs`、`pages/Workbench/`、`components/RotateControls/`；修改 `lib.rs`（PipelineItem/CropRect/Pipeline 变体 + check_pipeline 注册）、`command.rs`（pipeline/normalize 构建器 + parse_timescale）、`merge/crop/cut/rotate.rs`（diff_pair 抽取、align_rect 抽取、临时令牌）、`types/index.ts`、`services/tauri.ts`、`pages/{Home,Editor,Cut,Merge,Workbench}`、`App.tsx`（拖入原地分发）、`components/VideoPlayer`（进度/音量控制条）、`utils/time.ts`（导出名时间戳）、`docs/{DESIGN,PLAN,HANDOFF}.md`（含 §12.1 日志系统设计 = M4-7）。

## M4-8 设置页二期方案（2026-09-13 定稿，DESIGN §9.9/§9.1，待实施）

- 主题色：`AppSettings.accent` 预设枚举（默认绿 + 3~4 备选，避开 warn 琥珀色相）；实现 = 启动/切换时 `documentElement.style.setProperty('--color-signal', …)`；**清理三处硬编码强调色**：Settings 吸附开关与 Workbench 比例锁定的 `accent-[#4cc38a]`、global.css 的 `::selection` rgba
- 缓存管理：Rust `cache_usage`/`clear_cache` 两命令，清 `app_cache_dir` 下 `thumbs/` 与 `*.proxy.mp4`（删除失败跳过计数，Windows 文件占用常态）；设置页显示占用 + ask 二次确认
- ~~`appendTimestamp` 开关~~ 决策 #19：取消该设置项，"同名才追加时间戳"为固定行为（M7-4；实际仅 Merge/Workbench 两个用户命名调用点，剪切/编辑页自动命名不涉及）
- 关闭确认：App 层 listen CloseRequested，`list_tasks` 有 Pending/Probing/Running 时 `confirmDialog` 拦截；固定行为无开关（决策 17）
- 重置设置 = `saveSettings(DEFAULT_SETTINGS)` + ask；关于区 = `getVersion()` + env 的 FFmpeg 版本 + GPL 注记

## M7 反馈诊断（2026-09-14，三个 bug 根因）

1. **拖拽遮罩残留**：遮罩清除依赖 `onDragHover` 的 `leave` 分支，但拖放松手 Tauri 只发 `drop` 不发 `leave`；拖入非视频时 `onVideoDropped` 因扩展名过滤不触发 → 遮罩永远挂着。修复 = `onDragHover` 对 `drop` 一律置 false。
2. **局部放大无法播放**：裁剪框选层是 `absolute inset-0` 覆盖整个视频盒（含 VideoPlayer 控制条），所有点击被拦截；旋转页无此层所以正常。修复 = VideoPlayer 增加 `overlay` 插槽（渲染在 video/banner 之后、控制条之前，DOM 顺序保证控制条仍在上层可点），Editor 裁剪层迁入。
3. **合并页拖拽失效**（Workbench 素材列表同模式同病）：HTML5 DnD（`draggable`+`onDrop`）在 Tauri Windows 下被文件拖拽通道吞掉（WebView2 拖拽接管，已知冲突）。修复 = `hooks/useDragSort` 指针事件实现：grip 手柄 pointerdown → 4px 死区 → move 命中 `[data-sort-row]` 行 → up 提交 reorder；视觉反馈为拖动行半透明 + 目标行信号色 box-shadow 边界线。**工作台 2.0（M6-3）的池↔时间轴拖拽也必须用此方案**（DESIGN 决策 #18）。

## 待办

1. 用户手测：M7-1/2/3 三项修复（非视频拖入遮罩消失 / 放大页可播放 / 列表拖拽排序）；落地页右上角导航跳转
2. 第一批：M4-7 日志系统（提前实施）+ M7-4/5/6/7 快改（同名才加时间戳/浮层自动关闭/预览倍速/拖入文件夹）
3. 第二批：M6-1~M6-7（M4-4 并入 M6-8，决策 #20）+ M4-3 快捷键（M6-4 后接入）
4. 第三批：M7-8 NSIS 中文（MSI 砍掉，决策 #21）+ M7-9 图标 + M4-5 实机验证；M4-8 设置二期（已无时间戳开关）；M4-6 文档收尾
5. 遗留小项：规则 B 下"有片段裁剪 + 其他片段非恒等旋转"时后者也转码（方向一致性优先，已文档化）；硬编路径未在真 GPU 上验证；旋转覆盖源 flip 元数据（罕见）；代理关闭时不支持格式仅显示提示条（无占位封面图）
