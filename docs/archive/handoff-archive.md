# video-cut 开发档案（历史批次要点）

> **职责**：已交付批次的实施要点逐条留档——为什么这么写、踩了哪些坑、关键常量在哪。
> **唯一真源**：**历史批次的实施细节**以本文为准；当前状态看 [HANDOFF.md](../HANDOFF.md)，进度看 [PLAN.md](../PLAN.md)。
> **读时机**：追溯某个历史决策的实现细节时；接手某个老模块前。
> **写规则**：**只追加、不改写历史**——各节标题里的"待提交 / 待实施 / 待用户指令"等字样写于当时，多数已落地，不代表当前状态；不回溯修正历史结论。
> **关联**：[INDEX.md](../INDEX.md) · [HANDOFF.md](../HANDOFF.md) · [PLAN.md](../PLAN.md) · 规格 [DESIGN.md](../DESIGN.md)
> **最后更新**：2026-09-19（B1 元数据头；正文未改动）


## M4-1 设置页要点（UI.md §9.9、DESIGN.md §12）

- 六项配置：默认输出目录 / 默认剪切模式 / 关键帧吸附 / 代理预览（自动·始终·关闭三态）/ 编码器锁定 / 默认质量档位；存 `settings.json`（plugin-store，app_config_dir），读取时 sanitize 回退默认，**改动即保存**
- 输出位置统一规则（`utils/paths.ts::resolveOutputDir`）：设了默认目录则全部页面用它，否则跟随源文件目录
- 编码器锁定走任务载荷：`VideoTask` 四变体新增 `encoder: Option<String>`，Rust `command::effective_encoder` 校验（`LOCKABLE_ENCODERS`），非法值回退自动探测
- 设置由 App 层启动加载一次（`settingsReady` 门控页面渲染），页面按导航条件挂载即拿到最终值；pages/Settings 为受控组件，App 持有 state

---

## M4-2 历史记录要点（UI.md §9.10、DESIGN.md §12）

- 记录点在 **Rust 侧终态**：`TaskManager::set_on_terminal`（lib.rs setup 接线，白名单 cut/merge/rotate/crop_zoom/pipeline，代理不入库）→ `history.json`（app_data_dir，200 条上限，.tmp+rename 原子写）
- TaskHandle 新增 `created_at/started_at/terminal_recorded`；`Shared::record_terminal` 的防重护栏覆盖三处终态（worker 正常分支、worker 排队取消兜底、cancel 排队直接取消）——取消与执行器并发只记首次
- 前端 pages/History 只读：状态徽标 + 类型标签 + 耗时 + 产物点击 `revealInFolder` 重新定位 + 清空（dialog ask 二次确认）；`list_history`/`clear_history` 命令

---

## M5 工作台要点（DESIGN.md §3.8、FFMPEG.md §6.3⑨⑩、UI.md §9.8）

- 单 `pipeline` 任务 = 逐片段处理 → 定向参数统一 → concat；`plan_items` 纯函数决定每片段 copy/transcode
- 前端 `pages/Workbench`：文件列表 + 展开式每片段编辑器（剪切/旋转/放大三标签）+ 检测面板 + 导出；共享 `components/RotateControls`（Editor 页复用）；VideoPlayer 新增 `fill` 模式（旋转预览内层盒）
- 裁剪坐标是**显示空间**（用户所见，含旋转效果）；90°/270° 时后端按交换宽高校验、滤镜链旋转在裁剪前

---

## 工作台 2.0 方案要点（M6，DESIGN v0.3 DESIGN.md §3.8/UI.md §9.8，2026-09-13 定稿）

- **后端零必须改动**：`PipelineItem` 即片段，同源多片段 = 多条 item，`plan_items`/`check_pipeline`/`submit_pipeline` 现有语义已正确（临时令牌按条目隔离）；重构收敛在前端
- 三层数据模型：素材 SourceFile（卡片，排序仅组织用）→ 片段 Clip（= PipelineItem，一个素材可剪多段）→ timeline（片段 id 有序表，**唯一**决定成品顺序；片段池不做独立排序，决策记录 13）
- 页面四区：成品预览（flex-1）/ 合成时间轴（ClipTimeline 新组件，块宽∝时长）/ 片段池 / 素材卡片；预览区三态复用（成品/源剪切/片段加工）
- 成品预览 = `<video>` 虚拟连播（决策记录 14）：播放列表派生成品内↔源内时间对，双 video 轮换预加载；±1 帧边界误差与切换停顿已知，UI 明示"以导出为准"
- 可复用资产：Timeline（双柄+吸附）、RotateControls、显示空间裁剪交互（cropHandlers/displayedDims/cropPx）、generateThumbnails、代理逻辑
- 实施顺序：M6-1~M6-5 结构与导出链路 → M6-6 连播 → M6-8 增强（可选：缩略图支持 (input, timeSec) 取片段起点帧）

---

## 落地页改造（M6-0，待提交）

- `pages/Home` 已删除（BrandMark/EnvChip 迁入 Workbench 头部）；`PageShell` 遗留空壳一并删除
- `PageName` 去掉 `"home"`，初始页 `"workbench"`；App 层拖拽路由简化为"一律落在当前页面"（原主页按数量跳剪切/合并的逻辑随 Home 移除）
- 各页返回按钮 aria-label 改"返回工作台"，onBack 指向 workbench
- Workbench props 变化：`onBack` → `env: EnvironmentInfo | null` + `onNavigate: (page: PageName) => void`；头部右上角 NAV_ITEMS（剪切/合并/旋转/放大）+ 历史/设置图标按钮

---

## M5 提交内容（`9b96210`，22 文件 +2467/-273）

新增 `commands/pipeline.rs`、`pages/Workbench/`、`components/RotateControls/`；修改 `lib.rs`（PipelineItem/CropRect/Pipeline 变体 + check_pipeline 注册）、`command.rs`（pipeline/normalize 构建器 + parse_timescale）、`merge/crop/cut/rotate.rs`（diff_pair 抽取、align_rect 抽取、临时令牌）、`types/index.ts`、`services/tauri.ts`、`pages/{Home,Editor,Cut,Merge,Workbench}`、`App.tsx`（拖入原地分发）、`components/VideoPlayer`（进度/音量控制条）、`utils/time.ts`（导出名时间戳）、`docs/{DESIGN,PLAN,HANDOFF}.md`（含 DESIGN.md §12.1 日志系统设计 = M4-7）。

---

## M4-8 设置页二期方案（2026-09-13 定稿，UI.md §9.9/UI.md §9.1，待实施）

- 主题色：`AppSettings.accent` 预设枚举（默认绿 + 3~4 备选，避开 warn 琥珀色相）；实现 = 启动/切换时 `documentElement.style.setProperty('--color-signal', …)`；**清理三处硬编码强调色**：Settings 吸附开关与 Workbench 比例锁定的 `accent-[#4cc38a]`、global.css 的 `::selection` rgba
- 缓存管理：Rust `cache_usage`/`clear_cache` 两命令，清 `app_cache_dir` 下 `thumbs/` 与 `*.proxy.mp4`（删除失败跳过计数，Windows 文件占用常态）；设置页显示占用 + ask 二次确认
- ~~`appendTimestamp` 开关~~ 决策 #19：取消该设置项，"同名才追加时间戳"为固定行为（M7-4；实际仅 Merge/Workbench 两个用户命名调用点，剪切/编辑页自动命名不涉及）
- 关闭确认：App 层 listen CloseRequested，`list_tasks` 有 Pending/Probing/Running 时 `confirmDialog` 拦截；固定行为无开关（决策 17）
- 重置设置 = `saveSettings(DEFAULT_SETTINGS)` + ask；关于区 = `getVersion()` + env 的 FFmpeg 版本 + GPL 注记

---

## M7 反馈诊断（2026-09-14，三个 bug 根因）

1. **拖拽遮罩残留**：遮罩清除依赖 `onDragHover` 的 `leave` 分支，但拖放松手 Tauri 只发 `drop` 不发 `leave`；拖入非视频时 `onVideoDropped` 因扩展名过滤不触发 → 遮罩永远挂着。修复 = `onDragHover` 对 `drop` 一律置 false。
2. **局部放大无法播放**：裁剪框选层是 `absolute inset-0` 覆盖整个视频盒（含 VideoPlayer 控制条），所有点击被拦截；旋转页无此层所以正常。修复 = VideoPlayer 增加 `overlay` 插槽（渲染在 video/banner 之后、控制条之前，DOM 顺序保证控制条仍在上层可点），Editor 裁剪层迁入。
3. **合并页拖拽失效**（Workbench 素材列表同模式同病）：HTML5 DnD（`draggable`+`onDrop`）在 Tauri Windows 下被文件拖拽通道吞掉（WebView2 拖拽接管，已知冲突）。修复 = `hooks/useDragSort` 指针事件实现：grip 手柄 pointerdown → 4px 死区 → move 命中 `[data-sort-row]` 行 → up 提交 reorder；视觉反馈为拖动行半透明 + 目标行信号色 box-shadow 边界线。**工作台 2.0（M6-3）的池↔时间轴拖拽也必须用此方案**（DESIGN 决策 #18）。

---

## M4-7 日志系统要点（DESIGN.md §12.1，2026-09-14 实施）

- `logger.rs`：fern 单 dispatch 写 `app_log_dir()/video-cut.YYYY-MM-DD.log`（目录已含 logs，勿再拼）；启动清理 7 天前 .log（按 mtime）；级别 release=info / debug 构建=debug，`VIDEO_CUT_LOG=debug|trace` 覆盖；**跨天不切文件**（下次启动切换，已知简化）；格式 `YYYY-MM-DD HH:MM:SS.mmm [INFO] [target] msg`
- 埋点位置：任务提交载荷（cut.rs submit_task 入口，serde_json 全量）、ffmpeg argv（worker::run_ffmpeg，debug 级）、任务终态（manager::record_terminal，完成=输出+耗时 / 失败=stderr 尾部全文 / 取消）、probe 摘要（media.rs，debug）、应用启动版本（lib.rs setup）
- 前端错误：main.tsx 全局 error + unhandledrejection → `append_frontend_log`（转发失败静默防循环）；失败行"复制日志"= 剪贴板写 TaskSnapshot.error（execCommand 兜底）；面板顶部"打开日志文件夹" = `open_log_dir` 命令（plugin-opener open_path）
- pipeline 的 `[pipeline] item i` eprintln 已替换为 log（载荷入 debug 日志）

---

## 第一批快改要点（M7-4~M7-7，2026-09-14）

- **M7-4**：`file_exists` 命令；Merge/Workbench 导出前检查目标路径，存在同名才 `withFileTimestamp`（决策 #19 固定行为，仅这两个页面有用户命名输入）
- **M7-5**：`toastAutoCloseSec`（默认 0=不关闭，sanitize 钳制 0~600）；TaskProgress 对终态任务 setTimeout 自动 dismiss——timersRef 管理、手动 dismiss 清定时器、卸载全清；App 传 prop（ref 读最新值防事件闭包过期）
- **M7-6**：VideoPlayer 控制条右侧倍速按钮，RATES [0.5,1,1.5,2] 循环；playbackRate 经 effect 应用，src 换代理时不丢
- **M7-7**：`expand_video_inputs`（递归 ≤8 层、跳过 `.` 隐藏项、按路径排序；视频扩展名表与前端 VIDEO_EXTENSIONS 手工同步）；前端 drop 一律经此展开、空结果不回调

---

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

---

## 第三批实施要点（M7-8/M7-9 + M4-8 + M4-5 + M4-6，2026-09-14）

- **M7-8**：tauri.conf `targets: ["nsis"]` + `windows.nsis.languages: ["SimpChinese"]`；无 MSI
- **M7-9 图标**：`scripts/icon.svg`（墨底圆角方 rx185 + BrandMark 40 倍居中）+ `scripts/render-icon.mjs`（**纯 Node PNG 编码器**：zlib + 手写 chunk + CRC32，3×3 超采样；System.Drawing 在本机 PowerShell 7 不可用才走此路）→ `pnpm tauri icon` 全套再生成；改图标流程 = 改 svg → node 渲染 → tauri icon；android/ios 产物目录已 gitignore
- **M4-8 主题色**：`theme.ts` ACCENTS 4 预设 + `applyAccent`（覆写 :root `--color-signal`）；App 启动加载后与 updateSettings 时应用；5 处 `accent-[#4cc38a]` 硬编码全部改 `accent-signal`；`::selection` 用 color-mix 跟随 token
- **M4-8 缓存**：Rust `cache_usage`/`clear_cache`（`app_cache_dir/proxy|thumbs` 目录级统计与删除，占用文件跳过计数）
- **M4-8 关闭确认**：services `onWindowCloseGuard`（onCloseRequested + listTasks 忙判断 + ask + destroy）；**capability 补了 `core:window:allow-destroy`**（destroy 不再触发 CloseRequested，不会死循环）
- **M4-8 重置/关于**：重置 = onUpdate({...DEFAULT_SETTINGS})（App 侧 patch.accent 会同步 applyAccent）；关于区 = getAppVersion() + env 的 FFmpeg 版本 + GPL 注记
- **M4-6**：README 重写（功能表/快速开始含 fetch-ffmpeg/结构/开发约定/许可证注意）；DESIGN.md §5.2 组件树修正为实际组件、决策 #4 版本改 9.x

---

## M4-3 快捷键 + M6-8 增强要点（2026-09-14）

- **快捷键**：`hooks/useHotkeys`（window keydown，INPUT/TEXTAREA/SELECT/contentEditable 聚焦时忽略，handler 走 ref 免依赖）；VideoPlayer 新增 `onPlayStateChange`（play/pause 事件回调，空格用真实状态而非手动翻转）。覆盖：剪切页（空格/←→/Shift 逐帧=1/fps/I 入点/O 出点/Delete 删最近片段）、工作台成品模式（空格/←→/Delete 删选中片段）、源剪切（空格/←→/I/O）、片段加工（空格/←→）
- **拖出移除（M6-8）**：`useDragSort` 第三参 `{ boundsRef, onDropOutside }`——move 记录 lastX/Y，finish 时出界则调 onDropOutside(index) 跳过 reorder；ClipTimeline 以自身 track 为边界，拖出 = onRemove（"拖回池"的等价实现）
- **批量能力（M6-8 = 原 M4-4）**：SourceCards 卡片右上角圆形勾选（选中态边框 signal）→ 批量条（全选/清除/各建全段片段/RotateControls+旋转应用到片段）；applyBatchRot 计数在 updater 外算（StrictMode 双调用会翻倍——已踩）
- **片段起点帧缩略图（M6-8）**：`thumbnail_args(input, start_sec, output)`；`generate_clip_thumbnails` 缓存 key = fnv1a("路径@时间两位小数")，单个失败跳过；前端 clipThumbs map（key 同构）+ requestedThumbsRef 去重，池卡优先用起点帧、回退源首帧

---

## M8 候选池晋升批次 1 要点（B1/B2/B14，2026-09-14）

- **B1 probe 缓存**（`probe.rs`，决策 #22）：五个探测入口（media/facts 异步、facts/duration 同步、关键帧）进程内缓存，键 = (路径, size, mtime_ns) 天然失效；仅缓存成功结果；条目 ≥512 整体清空（pipeline 中间文件路径每任务唯一）。异步与作业线程共用同一缓存，无跨 await 持锁
- **B2 磁盘预检**（`commands/mod.rs::require_disk_space`，DESIGN.md §8.2 估算表）：cut（改用公共函数）/rotate/crop/merge/pipeline/proxy 全部接入，**在作业线程内运行时检查**；merge 两段式（先 Σ输入，进重编码路径前再 2×Σ）；estimate=0（元数据读不到）跳过
- **B14 e2e**（`src-tauri/tests/e2e.rs`，决策 #23）：夹具自建（sidecar lavfi 320×240 h264+aac，`-g 30` 关键帧确定）；三条链 = 极速剪切×2→concat、精确剪切、pipeline 全链（copy + 裁剪/翻转重编码 + timescale 对齐 + normalize + concat）；断言时长 ±0.3/±0.5s + `-v error -f null -` 全帧可解码（concat 接缝 dts 重复为 null muxer 已知无害投诉，单独放行该行）；sidecar 缺失打印 skip 直接通过；`lib.rs` 的 `ffmpeg` 模块改 pub 供测试复用
- 测试基线：60 单测 + 3 e2e（tsc/build 不受影响）；单测注意：cap 测试用独立缓存实例，避免与并行测试的整体清空互相干扰

---

## Code Review（2026-09-14，全量走读）

**已修（`dc1b395` P1 / `0858e9b` P2）**：
- P1 重编码路径 `-map 0:a` → `0:a?`（4 处，无音轨源不再失败）
- P1 history append/clear 进程级写锁（终态回调多线程并发读改写会丢条目；锁中毒 into_inner 恢复）
- P1 自动命名同名不覆盖：cut.rs 分片名存在即追加 `_YYYYMMDD_HHMMSS`；编辑页走 fileExists + withFileTimestamp（决策 #19 补齐到全部导出入口）
- P2 补实现 DESIGN.md §5.4 的 `clear_finished_tasks`（TaskManager::clear_finished 保留活跃任务）+ 任务面板「清空已完成」
- P2 `generate_proxy` 进行中去重（pending_proxies 表 input→taskId，同源复用任务，收尾移除）

**已知未修（评估过、暂不处理）**：
- 调度线程 `cv.wait/spawn` 的 unwrap/expect 在锁中毒/线程创建失败时会静默瘫痪任务系统（概率极低；触发即全任务排队无提示）——如要加固，改为错误日志 + 任务失败事件
- `resolve_encoder` 高位深判定只认 `10le/12le`，16bit/大端变体误走 H.264（输入极罕见）
- ClipTimeline 拖入指示线按比例定位，与 minWidth 保底块的实际位置有视觉偏差（落点本身正确）
- asset protocol scope `["**"]` + CSP null：自用可接受，公开发布前收窄
- check_pipeline 每次全量 ffprobe（片段多时慢，可加 facts 缓存）；expand_video_inputs 无条数上限
- 合并"自动统一"硬编码 libx264/平衡档，不跟随编码器锁定（与 UI.md §9.9 范围一致；要吃硬编需先改 DESIGN）

---

## M9/M10 反馈诊断（2026-09-15，工作台手测批次 2，7 项）

> 用户手测工作台 2.0 后反馈。根因均已到代码定位；立项 M9（bug+片段预览）/ M10（保活+主题），代码待用户指令后实施。

| # | 反馈 | 定性 | 根因 | 优先级 |
| --- | --- | --- | --- | --- |
| 5 | 无法预览成品，只能播片段 | **bug** | ProductPreview 的 `<video src>` 用裸磁盘路径，未经 `convertFileSrc` 资源协议转换，WebView 加载不出来；剪切/编辑视图走了 `fileSrc()` 所以正常——正是"片段能播、成品不能播"的原因 | **P0**（M9-1） |
| 1 | 切换素材后进度条/出入点不重置 | **bug** | CutModeView/EditModeView 渲染无 `key`，切换时 React 复用实例，`sel`/`current` 残留上个文件 | P1（M9-2） |
| 4 | 时间轴片段叠在一起 | **bug** | 块 `left` 按百分比、宽度有 `minWidth: 28px` 保底，短片段多时实际渲染比比例宽，互相压盖 | P1（M9-3） |
| 2 | 片段之间不能拖拽排序 | **bug** | 排序已实现但手柄是块左缘 6px 竖条，无法命中；叠加 #4 的块重叠，手柄被盖住。**池内排序维持不做**（决策 #13，顺序只在时间轴表达——反馈轮说明后用户未再要求） | P1（M9-4） |
| 3 | 点片段播的是整个源视频，希望直接预览片段 | 需求 | 现设计点片段=进入加工视图，播放不限区间。改为加工视图播放限制在片段区间、越过出点暂停（M9-5） | P2 |
| 6 | 去历史/设置再回来页面重置 | 需求（架构） | App 按页面条件挂载，跳转即卸载工作台。改 keep-alive：工作页隐藏不卸载、隐藏即暂停；设置变更一律不重置页面（决策 #24） | P1（M10-1） |
| 7 | 需要系统黑白色 | 功能 | 即候选池 B17 晋升：三态深色/浅色/跟随系统（决策 #25，设计 UI.md §9.1） | P2（M10-2） |

合并关系：#2+#4 同根（ClipTimeline 布局+手柄，一个提交组）；#3 依赖 #5 修好后的预览体系；#6/#7 相互独立。

---

## M9 实施要点（2026-09-17）

- **M9-1**：ProductPreview `<video src>` 经 `fileSrc()`（含代理路径）；switchTo 切槽时离场槽显式 pause；video onPause 在活动槽时回写 onPlayingChange(false)（为 keep-alive 隐藏暂停预埋）
- **M9-2**：CutModeView 按 `key={src.id}`、EditModeView 按 `key={clip.id}` 重挂载，切换素材/片段进度与出入点全部重建
- **M9-3/4**：ClipTimeline 重写为逐块像素排布——`trackW` 由 ResizeObserver 实测，`rects = [{left,width}]` 累进计算（下一块左缘 = 前块实际右缘），刻度/播放头/插入指示线/seek 换算全部走同一套 `timeToX/xToTime`（含 minWidth 膨胀的逐块插值）；块本体 onPointerDown 进 useDragSort（4px 死区保点击选中），取消独立手柄；overflow-hidden 容器容忍极短片段溢出（永不重叠，M11-1 PPS 动态下限接管后此边界消失）
- **M9-5**：EditModeView `handleTime` 在播放态判定越过 `seg.end` → pause + seek 出点（循环开关 = 回入点续播）；togglePlay 起播时区间外先回入点
- 构建验证：`pnpm build` 通过；行为变更一处——块 ✕ 按钮仍是"删除片段（含池）"，M11-4 波纹删除落地后统一为"仅移出时间轴"

---

## 时间线需求收敛（2026-09-16，M11–M13 立项）

> 用户提交完整时间线需求稿（三轨结构/磁吸/边缘修剪/拖拽重排等 13 节），经三轮讨论收敛为**单轨装配驾驶舱**。完整规格 = TIMELINE.md §17；决策 #26–#31；计划 = PLAN M11（核心 2.5~3 周）/ M12（预览强化 1~2 周）/ M13（打磨可选）。

- **定位裁决**（决策 #26）：只需"剪切合并方便 + 预览做好 + 导出快"。音频轨 UI、调色、命令面板、空隙模型、禁用/黑场、多选（推迟 M13）全砍；需求稿中与单轨冲突条目（分离音频后波纹错位、"仅音频"选择、B 覆盖在连续模型下与插入等价、允许空隙伤有序表模型）一并记为不做。S 键双义（切割+吸附）裁决为切割 C / 吸附 S（决策 #30）
- **对现状的影响**：后端唯一必须改动 = 渲染即预览的 Pipeline preview 标志（输出 cache/preview/ + TaskHandle internal 不进历史 + clear_cache 覆盖 + 进行中去重，M12-2）；ClipTimeline **就地演进**不新建组件（M9-3/4 = 地基）；设置零新增（修剪关键帧吸附复用现有"关键帧吸附"开关）；片段池语义不变（时间线删除 ≠ 池删除，决策 #13）
- **与未实施项的关系**：B10/B11 并入 M11（决策 #29）；B6 音频提取是文件级工具与时间线无关、保持候选；B7 Smart cut 必要性下降（关键帧吸附引导 copy 路径）仍保留；check_pipeline facts 缓存（B15 项）并入 M12-2（自动渲染预览频繁提交，探测必须命中 B1 缓存）
- **关键技术决定**：① PPS 单参数缩放 + 块宽差值公式（禁 round(时长×PPS)——M9-3 重叠 bug 的理论根源）+ 8px/PPS 吸附窗 + 总帧数时间码，全部引自 Clypra 精度文档（TIMELINE.md §17.3）；② 撤销 = 命令模式快照对（纯函数 builder + apply/invert + no-op 返回 null + 6 条单测基线，Clypra undoable-clip-drag 蓝图，TIMELINE.md §17.5）；③ 预览三层 = 连播改进 → **渲染即预览**（无损 concat 秒级，"预览 = 导出文件"，100% 所见即所得，决策 #28）→ 暂停帧服务 spike（红线：连续播放不走逐帧 IPC，TIMELINE.md §17.6）；④ 性能预算表 + 帧时间埋点进 logger（TIMELINE.md §17.9，"100 片段 60fps"从口号变可测数字）
- **参照项目**：Clypra（github.com/AIEraDev/Clypra，Tauri 2 + React 19 + Rust + FFmpeg 同栈，3.2k stars）——6 篇关键架构文档已存 `%USERPROFILE%\clypra-docs\`（precision/undo/filmstrip/perf-contract/golden-frame/split-audio）。结论：只抄架构思想与踩坑结论（Rust 拥有管线、意图解耦、精度公式、预算表），不抄工程规模（wgpu 合成、原生子表面、多轨 store、Zustand 全不需要）
- **需求稿补充（2026-09-17）**：用户提交完整快捷键表（并入 TIMELINE.md §17.8 状态表——可行新增 6 组进 M11-8/M11-6：K/L 走带、A 追加入轴、Ctrl+E 导出、I/O 修剪到播放头、按住 Alt 临时关吸附；冲突 6 项维持决策 #26/#30/TIMELINE.md §17.10 不变：J 倒放、V 插入、B 覆盖、Ctrl+K 命令面板、Ctrl+Shift+C/V 复制变换、S 双义）与三类右键菜单稿（并入 TIMELINE.md §17.4——v1 最小集维持并补空白右键；片段复制/粘贴与属性面板进候选池 B18/B19；调色/启用禁用/分离音频/项目设置/设为章节按既有裁决不做）

---

## Code Review（2026-09-17，M11 动工前全量走读）

> 三路并行审查（前端组件 / 页面与服务层 / Rust 后端），仅记录、实施待用户指令。总评：工程质量高于同规模均值（clippy 7 warning、60 单测全绿、tsc 零错误、架构约定逐条可指认）；主线债务 = **跨文件复制粘贴式膨胀**（Workbench 1766 行为重灾区）；"造轮子"结论 = **不引任何新 npm 包**，问题是内部轮子未复用。

**批次 R1——P0/P1 必修（动 M11 前，全是小改）**：
- **[P0] VideoPlayer `seeked` 无条件杀 rAF 循环**（`components/VideoPlayer/index.tsx:99-115`）：循环只在 play 事件重启，播放中 seek 后时间上报永久冻结——Timeline 播放头停住、方向键步进失效；**M9-5 区间预览依赖 onTime，第一次到出点即静默失效**；M11 播放头 ref 直改 DOM 建立在此通路上。修法 = onStop 仅 paused 时 cancel / 未运行且 !paused 则重启
- **[P1] 事件订阅 unlisten 竞态 ×6**（App.tsx:46/64、ProductPreview:102、Cut:55、Editor:73、Workbench:212）：promise resolve 前卸载则监听器永久泄漏（StrictMode dev 态必现）；TaskProgress:146 有正确写法 → 抽 `useTauriEvent` 统一替换
- **[P1] pending_proxies 取消泄漏**（`commands/media.rs:253-314` + `task/manager.rs:307-322`）：去重条目只在 job 末尾移除，排队中取消走 queue.retain 直接出队 → 条目永久残留，该源视频代理直到重启都无法再生成；M12-2 preview"新编辑取消旧任务"同模式且取消是常态，**必须先修**
- **[P1] 裁剪交互双实现**（Editor:274-376 vs Workbench:1468-1549，约 200 行×2 逐行同构）→ M11 前抽 `CropOverlay`+数值字段组件
- **[P1] 无 ESLint**：hooks 依赖 / IPC 入口约定 / unlisten 模式全靠人肉 → typescript-eslint + react-hooks + no-restricted-imports（禁 services 外 import @tauri-apps）

**批次 R2——并入 M11-0 实施**：Workbench 拆分（SourceCards/CutModeView/EditModeView/CropFields/TimeField/useProxyPreview 各自成文件，净减约 700 行）+ 重复收敛（useProxyPreview 提升 hooks/ 四端复用、CropOverlay 统一、TimeField 以 CutEditor 版为准、basename/resolveUniqueTarget/moveAt/QUALITY_LABELS 进 utils、播放快捷键块抽 usePlaybackHotkeys）+ **useHotkeys 页面激活门控**（M11 新快捷键前置，否则 Cut 与 Workbench 的 I/O 同时响应）+ ESLint 基线 + tsconfig `noUncheckedIndexedAccess`（可选）

**批次 R3——M12-2 前置**：probe 缓存改 LRU 逐条淘汰（现 ≥512 整体 clear，preview 高频提交会周期清光关键帧缓存致反复重扫）→ 取消清理由 TaskManager 按 kind 统一管理（替代 pending_proxies 手工模式）→ **snapshot 过滤 internal 任务**（否则常驻 preview 任务令关闭窗口确认失效；跳历史已由终态回调白名单免费达成）→ 进度节流样板收敛（7 份）+ **speed 接通**（现 speed 恒 None 前端速度列空壳）→ prepare_output 提交前导抽取（4 份）→ parking_lot 统一锁中毒策略（现裸 unwrap/into_inner/静默吞三种并存）→ finalize_output 消除"先删后改名"旧成品丢失窗口（pipeline/merge/crop/rotate 四处）→ 输出=输入比较改 canonicalize（大小写/斜杠绕过会覆盖源）→ cargo fmt --check 纳入流程

**记录不做**：clsx/tailwind-merge（语义色 arbitrary class 误合并风险）、thiserror/anyhow（String 错误即用户话术无需分层）、fnv crate、radix 类 UI 库；useDragSort/confirmDialog/自研时间格式化为合理自研（决策 #18 背书）

**死代码清理清单**（随 R1/R2 顺手）：`App.css` 整文件 + main.tsx:6 import、`TaskStatus::Probing`（前后端类型，从未构造）、4 处 `#[allow(dead_code)]`（manager×3/command.rs:190）、TaskProgress:109 死三目、Editor CropControls `rect` prop、drawingRef 只置 true ×2、`fileTimestamp`/`EditorTool` 过度导出、package.json 删 `less`、tailwind 两包移 devDependencies、types 四个"后端发前端不收"字段加注释（不删）

**M10 keep-alive 冲突清单**（届时直接取用）：① pending 一次性消费模型（4 页 consumedInitialRef；keep-alive 下一次 drop 同时流入四页）→ 改队列+按激活页消费；② settings 挂载时快照（Cut outputDir/snap/cutMode、Editor/Workbench quality useState）→ 推广 settingsRef 模式；③ useHotkeys 常驻需激活门控（同 R2）；④ History/Settings 挂载时拉数据需 active 刷新；⑤ TaskProgress/env/关闭守卫在 App 层无需动；⑥ updateSettings 按字段触发副作用的写法（`if (patch.accent)`）→ 改合并后统一 applyTheme(next)，themeMode 接入才不漏路径

**M11/M12 资产确认**：check_pipeline facts 缓存**已天然具备**（facts_cache 已接入 probe_merge_facts/_sync，M12-2 该项零工作量）；useDragSort 的 beginDrag 入口可作修剪手势分流点（不必另起手势系统）；indexAtX 与 useDragSort.indexAt 同构可合并；ProductPreview 的 proxyMap/seekInternal 与 Workbench productEntries 派生、500ms 防抖模式是 M12 现成参照；VideoPlayer/ProductPreview 的外部暂停回流链路已通（onPlayStateChange/onPause），M10 只需接 visibilitychange；浅色主题硬编码盘点：bg-black 8 处（建议改 --color-video-bg 语义令牌）、VideoPlayer 控制条黑渐变、global.css:44 滚动条 hex，其余全走令牌

