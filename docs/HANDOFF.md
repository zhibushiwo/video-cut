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
| M4 打磨 | M4-1/2/3/5/6/7/8 全部 ✅（M4-5 实机冒烟待用户）；M4-4 取消立项（决策 #20，批量能力由 M6-8 实现） | 第三批 + M4-3 提交 |
| M6 工作台 2.0（多片段/片段池/合成时间轴/成品连播） | M6-0~M6-8 全部 ✅（M6-7 e2e 手测归用户统一验证） | 本批提交 |
| M7 反馈修复与体验 | M7-1~M7-9 全部 ✅（第一批 bug 修复与快改 + 第三批打包项） | 各批次提交 |

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

## M4-7 日志系统要点（DESIGN §12.1，2026-09-14 实施）

- `logger.rs`：fern 单 dispatch 写 `app_log_dir()/video-cut.YYYY-MM-DD.log`（目录已含 logs，勿再拼）；启动清理 7 天前 .log（按 mtime）；级别 release=info / debug 构建=debug，`VIDEO_CUT_LOG=debug|trace` 覆盖；**跨天不切文件**（下次启动切换，已知简化）；格式 `YYYY-MM-DD HH:MM:SS.mmm [INFO] [target] msg`
- 埋点位置：任务提交载荷（cut.rs submit_task 入口，serde_json 全量）、ffmpeg argv（worker::run_ffmpeg，debug 级）、任务终态（manager::record_terminal，完成=输出+耗时 / 失败=stderr 尾部全文 / 取消）、probe 摘要（media.rs，debug）、应用启动版本（lib.rs setup）
- 前端错误：main.tsx 全局 error + unhandledrejection → `append_frontend_log`（转发失败静默防循环）；失败行"复制日志"= 剪贴板写 TaskSnapshot.error（execCommand 兜底）；面板顶部"打开日志文件夹" = `open_log_dir` 命令（plugin-opener open_path）
- pipeline 的 `[pipeline] item i` eprintln 已替换为 log（载荷入 debug 日志）

## 第一批快改要点（M7-4~M7-7，2026-09-14）

- **M7-4**：`file_exists` 命令；Merge/Workbench 导出前检查目标路径，存在同名才 `withFileTimestamp`（决策 #19 固定行为，仅这两个页面有用户命名输入）
- **M7-5**：`toastAutoCloseSec`（默认 0=不关闭，sanitize 钳制 0~600）；TaskProgress 对终态任务 setTimeout 自动 dismiss——timersRef 管理、手动 dismiss 清定时器、卸载全清；App 传 prop（ref 读最新值防事件闭包过期）
- **M7-6**：VideoPlayer 控制条右侧倍速按钮，RATES [0.5,1,1.5,2] 循环；playbackRate 经 effect 应用，src 换代理时不丢
- **M7-7**：`expand_video_inputs`（递归 ≤8 层、跳过 `.` 隐藏项、按路径排序；视频扩展名表与前端 VIDEO_EXTENSIONS 手工同步）；前端 drop 一律经此展开、空结果不回调

## 工作台 2.0 实施要点（M6-1~M6-5，2026-09-14）

- 数据模型在 `pages/Workbench`：`SourceFile{id,path,info,probeError}` / `Clip{id,sourceId,seg,rot,crop,lockRatio}` / `timeline: string[]`（唯一顺序语义）；id 用模块级 `freshId(prefix)` 递增
- 新组件 `components/ClipTimeline`：块宽∝时长（minWidth 28 保底）、最近中线命中（比例换算在有 minWidth 时失真，故按 DOM 矩形命中）、`externalDrag` prop 承接池→轴跨容器拖拽（插入指示线贴目标块左缘）、`onExternalDragEnd` 让父层清状态
- `hooks/useDragSort` 升级支持 `axis: "x" | "y"`（横向卡片行用 x，边界线方向随轴切换）
- 预览三态 `PreviewMode`：product（占位，M6-6 连播）/ cut（Timeline 双柄+listKeyframes+「添加为片段」，可反复剪多段）/ edit（旋转+显示空间放大）
- **edit 模式走带控制外置**：VideoPlayer `controls={false}`，播放/进度条放变换盒外面——控制条在旋转/裁剪变换盒内会被遮挡（M7-2 同源问题）且旋转后位置错乱
- `VideoPlayer` 新增 `videoMaxClass` prop（非填充模式视频最大高度类，默认 max-h-[44vh]；剪切模式传 max-h-[20vh] 给时间轴腾位）
- 代理预览抽成 `useProxyPreview(path, useProxy)` hook（wantsProxy 三态感知 + onTaskStatus 切源 + onError 兜底），与旧 ItemEditor 逻辑等价
- `check_pipeline` 结果按 **payload 下标**对应（同源多片段 input 重复，不能按路径查）；未入轴的池卡无检测结果（灰点）
- 删素材联动删片段（有片段时 confirmDialog）；删片段/素材会复位引用它们的预览模式
- **M6-6 连播**（`components/ProductPreview`）：双 video 槽（a/b 轮换，隐藏槽预载下一段并停在其起点）；metadata 前设 currentTime 不可靠 → pendingSeek 在 onLoadedMetadata 应用；播放头/playing 状态在页面层（与 ClipTimeline 联动），ProductPreview 用 refs 读最新值防 rAF 闭包过期；代理按路径去重请求、task-status 完成回填；切走预览模式自动暂停、切回 productSeek(playhead) 同步

## 第三批实施要点（M7-8/M7-9 + M4-8 + M4-5 + M4-6，2026-09-14）

- **M7-8**：tauri.conf `targets: ["nsis"]` + `windows.nsis.languages: ["SimpChinese"]`；无 MSI
- **M7-9 图标**：`scripts/icon.svg`（墨底圆角方 rx185 + BrandMark 40 倍居中）+ `scripts/render-icon.mjs`（**纯 Node PNG 编码器**：zlib + 手写 chunk + CRC32，3×3 超采样；System.Drawing 在本机 PowerShell 7 不可用才走此路）→ `pnpm tauri icon` 全套再生成；改图标流程 = 改 svg → node 渲染 → tauri icon；android/ios 产物目录已 gitignore
- **M4-8 主题色**：`theme.ts` ACCENTS 4 预设 + `applyAccent`（覆写 :root `--color-signal`）；App 启动加载后与 updateSettings 时应用；5 处 `accent-[#4cc38a]` 硬编码全部改 `accent-signal`；`::selection` 用 color-mix 跟随 token
- **M4-8 缓存**：Rust `cache_usage`/`clear_cache`（`app_cache_dir/proxy|thumbs` 目录级统计与删除，占用文件跳过计数）
- **M4-8 关闭确认**：services `onWindowCloseGuard`（onCloseRequested + listTasks 忙判断 + ask + destroy）；**capability 补了 `core:window:allow-destroy`**（destroy 不再触发 CloseRequested，不会死循环）
- **M4-8 重置/关于**：重置 = onUpdate({...DEFAULT_SETTINGS})（App 侧 patch.accent 会同步 applyAccent）；关于区 = getAppVersion() + env 的 FFmpeg 版本 + GPL 注记
- **M4-6**：README 重写（功能表/快速开始含 fetch-ffmpeg/结构/开发约定/许可证注意）；DESIGN §5.2 组件树修正为实际组件、决策 #4 版本改 9.x

## M4-3 快捷键 + M6-8 增强要点（2026-09-14）

- **快捷键**：`hooks/useHotkeys`（window keydown，INPUT/TEXTAREA/SELECT/contentEditable 聚焦时忽略，handler 走 ref 免依赖）；VideoPlayer 新增 `onPlayStateChange`（play/pause 事件回调，空格用真实状态而非手动翻转）。覆盖：剪切页（空格/←→/Shift 逐帧=1/fps/I 入点/O 出点/Delete 删最近片段）、工作台成品模式（空格/←→/Delete 删选中片段）、源剪切（空格/←→/I/O）、片段加工（空格/←→）
- **拖出移除（M6-8）**：`useDragSort` 第三参 `{ boundsRef, onDropOutside }`——move 记录 lastX/Y，finish 时出界则调 onDropOutside(index) 跳过 reorder；ClipTimeline 以自身 track 为边界，拖出 = onRemove（"拖回池"的等价实现）
- **批量能力（M6-8 = 原 M4-4）**：SourceCards 卡片右上角圆形勾选（选中态边框 signal）→ 批量条（全选/清除/各建全段片段/RotateControls+旋转应用到片段）；applyBatchRot 计数在 updater 外算（StrictMode 双调用会翻倍——已踩）
- **片段起点帧缩略图（M6-8）**：`thumbnail_args(input, start_sec, output)`；`generate_clip_thumbnails` 缓存 key = fnv1a("路径@时间两位小数")，单个失败跳过；前端 clipThumbs map（key 同构）+ requestedThumbsRef 去重，池卡优先用起点帧、回退源首帧

## 待办

1. **用户统一手测**：M7-1/2/3 bug 修复、第一批快改、工作台 2.0 全流程（含连播/批量/片段缩略图/拖出移除）、快捷键（剪切页与工作台各模式）、M4-8（主题色/缓存/关闭确认/重置与关于）；**M4-5 实机冒烟**——NSIS 包装干净环境，验证中文向导/新图标/全功能/SmartScreen
2. 遗留小项：规则 B 下"有片段裁剪 + 其他片段非恒等旋转"时后者也转码（已文档化）；硬编路径未在真 GPU 上验证；旋转覆盖源 flip 元数据（罕见）；代理关闭时不支持格式仅显示提示条；日志跨天不切文件；时间轴块边缘拖动微调未做（M6-8 未列入的剩余候选）；README 截图待补
3. 远期候选：smart cut（精确剪切仅重编码切点附近 GOP）；深浅主题切换；i18n（已明确不做）
