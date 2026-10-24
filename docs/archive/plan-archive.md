# video-cut 实施计划·已完成批次归档(M0–M9 · 评审修复 R1–R4 · M11)

> **职责**:2026-10-25 文档瘦身时从 [PLAN.md](../PLAN.md) 原样迁出的**已完成批次任务行**——M0–M9、评审修复批次(R1/R2/R3/R4)、M11(单轨时间线核心)。迁出时全部 checkbox 已勾选。
> **唯一真源**:本文件为**只追加的历史快照**(同 [handoff-archive.md](./handoff-archive.md) 口径)——迁出后不再更新;批次的进度与状态以 [PLAN.md](../PLAN.md) 总览矩阵为准,批次实施要点见 [handoff-archive.md](./handoff-archive.md)。
> **迁出说明**:相对链接已改写适配归档路径;原文照录,未改写任何任务行内容。
> **关联**:[PLAN.md](../PLAN.md)(进度) · [handoff-archive.md](./handoff-archive.md)(批次实施要点) · [completed-task-index.md](./completed-task-index.md)(M0–M9 四段关联)

---

## M0 基建

> **关联**：FR-360（任务系统骨架）· NFR-011（sidecar 可用）　·　**验收**：NFR-011　——　执行：TESTING.md TC-004

**目标：把所有"与业务无关但会卡住后续一切"的事做完。**

- [x] **M0-1 清理模板遗留**：删除 `greet` 命令与调用；清空 `App.tsx` 模板内容；`lib.rs` 声明 `mod commands; mod ffmpeg; mod task;` 空模块树 `DESIGN.md §5.3`
- [x] **M0-2 下载并固定 FFmpeg**：gyan.dev essentials 7.x，放入 `src-tauri/binaries/` 并按 target-triple 命名（`ffmpeg-x86_64-pc-windows-msvc.exe` / `ffprobe-...`）；`binaries/` 加入 `.gitignore`；写 `scripts/fetch-ffmpeg.ps1` 下载脚本 `FFMPEG.md §6.1`
- [x] **M0-3 sidecar 接入**：`tauri.conf.json` 配置 `bundle.externalBin`；引入 `tauri-plugin-shell`；封装路径解析助手
- [x] **M0-4 check_environment**：Rust 命令跑 `ffmpeg -version` / `ffprobe -version`，返回版本与可用性；前端启动时调用，失败阻塞并提示 `DESIGN.md §5.4` `DESIGN.md §13`
- [x] **M0-5 引入插件**：`tauri-plugin-dialog`（文件选择）、`tauri-plugin-store`（配置，先接入不实现设置页）；capability 权限同步补充 `DESIGN.md §5.4` `DESIGN.md §12`
- [x] **M0-6 窗口与主题**：`tauri.conf.json` 调整为 1280×800 / min 1024×680；Tailwind v4 `@theme` 定义深色色板基础变量 `UI.md §9.1`
- [x] **M0-7 前端骨架**：`services/tauri.ts`（invoke 封装 + 事件订阅，唯一 `@tauri-apps/api` 入口）；`types/` 落地与 DESIGN.md §7 对齐的 TS 类型；Home 页四功能卡片 + 顶层 state 页面切换（四个空页）`UI.md §9.2`
- [x] **M0-8 任务系统空壳**：`task/manager.rs` / `task/worker.rs` 最小实现（提交/状态/取消/事件推送接口），先以 sleep 假任务自测事件通路

**⚠ 前置验证（spike，随 M0-3 一并完成）**：sidecar 在 `tauri dev` 与 `tauri build` 两种模式下路径均能解析——这是全项目第一个风险点，跑通后再继续。

**验收**：NFR-011（sidecar 可用）· TC-004（口径见 DESIGN.md §3；执行见 TESTING.md）

---

## M1 剪切垂直切片（MVP 核心）

> **关联**：FR-310–313（导入/信息/关键帧）· FR-320–325（剪切六项）　·　**验收**：AC-311-1 · AC-312-1 · AC-313-1 · AC-321-1 · AC-321-2 · AC-322-1 · AC-323-1 · AC-324-1 · AC-325-1　——　执行：TESTING.md TC-001 · TC-002 · TC-010

**目标：跑通"打开 → 探测 → 预览 → 选区 → 无损剪切 → 进度 → 输出"全链路。**

- [x] **M1-1 测试视频夹具**：写 `scripts/gen-fixtures.ps1` 用 ffmpeg 生成标准夹具：H.264+AAC MP4（主用，含 2 分钟以上时长与已知关键帧间隔）、HEVC MP4、10bit MKV、AVI（MPEG-4 Part 2）`DESIGN.md §10`
- [x] **M1-2 ffprobe 封装**：`ffmpeg/probe.rs`：JSON 解析 → `MediaInfo`（含 displaymatrix 旋转读取）；对夹具写单元测试 `FFMPEG.md §6.5`
- [x] **M1-3 关键帧扫描**：`list_keyframes` 实现；**spike：1 小时视频扫描耗时**，若 >3s 改用 `-read_intervals` 按需分段扫描（Timeline 可视区域懒加载）`FFMPEG.md §6.5` `DESIGN.md §13`
- [x] **M1-4 命令构建器**：`ffmpeg/command.rs` 实现 `build_cut_command`（极速剪切，参数数组返回）；单测断言生成的参数序列（不真跑 ffmpeg）`FFMPEG.md §6.3①` `FFMPEG.md §6.2`
- [x] **M1-5 任务系统实战化**：worker 启动子进程、stdout `-progress` 解析循环（`ffmpeg/progress.rs`）、stderr 收集、取消 kill + `.part` 清理、磁盘空间预检 `FFMPEG.md §6.4` `DESIGN.md §8`
- [x] **M1-6 提交链路**：`commands/cut.rs` `submit_cut_task`（多片段 = 任务内串行多子进程，进度汇总）`DESIGN.md §8.1`
- [x] **M1-7 VideoPlayer 组件**：`<video>` 封装：播放/暂停、时间上报（requestAnimationFrame 节流）、逐帧步进（预留）、加载失败回调 `UI.md §9.4`
- [x] **M1-8 代理预览**：`needsProxy` 判定逻辑 + `generate_proxy` 任务 + 播放器无缝切换代理源；UI 提示条 `DESIGN.md §3.7` `DESIGN.md §10`。**spike：用 canPlayType + video error 事件双探测定不支持格式**
- [x] **M1-9 Timeline 组件**：双手柄区间选择、关键帧刻度渲染（Canvas 或 SVG，长列表需虚拟化或分段绘制）、入点吸附 + 实际落点 tooltip、数字输入双向同步 `UI.md §9.4`
- [x] **M1-10 CutEditor + Cut 页组装**：片段列表增删、模式切换（精确剪切按钮先禁用占位）、输出目录选择、覆盖冲突确认、无损/重编码徽标 `UI.md §9.4`
- [x] **M1-11 TaskProgress 全局面板**：订阅 `task-status`/`task-progress`，进度条/速度/取消/失败日志展示 `UI.md §9.7`

**手工验收步骤**（口径 = 本节上方关联行的 AC；同 TESTING.md TC-010）：
1. 打开 1GB H.264 MP4 → 信息面板数据正确（时长/编码/分辨率与 ffprobe 手测一致）
2. 拖拽选区 → 入点吸附关键帧 → 极速剪切 → **秒级完成**，输出文件可播放
3. 输出画质验证：与源对应区间逐帧抽查一致（可抽 3 帧对比 md5 或肉眼）
4. 取消运行中任务 → ffmpeg 进程消失、无 `.part` 残留
5. 打开 AVI / 10bit MKV → 自动生成代理并可预览，剪切仍作用于原文件
6. 多片段一次导出 `part_001/002/003`，进度按 N 段汇总

---

## M2 合并

> **关联**：FR-330–333（检测/无损/自动统一）　·　**验收**：AC-331-1 · AC-332-1 · AC-332-2 · AC-333-1　——　执行：TESTING.md TC-001 · TC-011

- [x] **M2-1 参数一致性比对**：`commands/merge.rs` 实现九项比对（DESIGN.md §3.3 清单），比对函数独立可单测
- [x] **M2-2 检测面板 UI**：文件列表 + 摘要列（编码/分辨率/帧率）+ ✓/⚠ 面板与差异项高亮 `UI.md §9.5`
- [x] **M2-3 无损合并**：concat 列表生成（UTF-8、单引号转义、正斜杠）+ `build_merge_command` + 单测 `FFMPEG.md §6.3③`
- [x] **M2-4 拖拽排序**：列表手柄拖拽（原生 drag events，不引库）
- [x] **M2-5 自动统一路径**：逐个转中间文件（`build_normalize_command`）→ 二次 concat；目标参数选择 UI（首文件参数 / 1080p H.264）；二次确认弹窗 `FFMPEG.md §6.3④`
- [x] **M2-6 音轨/字幕布局校验**：流布局不一致时的明确报错文案 `DESIGN.md §3.3`

**验收**：AC-331-1 · AC-332-1 · AC-332-2 · AC-333-1 · TC-001 / TC-011（口径见 DESIGN.md §3；执行见 TESTING.md）

---

## M3 旋转 + 局部放大 + 精确剪切

> **关联**：FR-340–342（旋转）· FR-350–353（放大）　·　**验收**：AC-341-1 · AC-341-2 · AC-342-1 · AC-351-1 · AC-352-1 · AC-353-1　——　执行：TESTING.md TC-004 · TC-012

- [x] **M3-1 硬件编码器探测**：`ffmpeg/command.rs` 增加 encoder 探测（按序试跑 `h264_nvenc`/`h264_qsv`/`h264_amf` 极短编码，缓存结果）；回退 libx264。**spike：三类 GPU 至少验证一类实机** `DESIGN.md §3.5`
- [x] **M3-2 质量档位映射**：High/Balanced/Small → 各编码器参数（libx264 CRF 16/20/26；硬编对应 -cq/-q 值），集中在一处映射表
- [x] **M3-3 元数据旋转**：`build_rotate_remux_command`（`-display_rotation` 输入选项 + `-c copy`）+ 单测 `FFMPEG.md §6.3⑤`
- [x] **M3-4 RotateEditor**：方向按钮 + CSS transform 实时预览 + 无损徽标；重编码旋转为高级折叠项 `UI.md §9.6`
- [x] **M3-5 重编码旋转**：`transpose` 滤镜路径，复用 M3-1/M3-2 `FFMPEG.md §6.3⑥`
- [x] **M3-6 CropEditor**：预览叠加选区矩形（拖拽/缩放/比例锁定）+ 数值微调 + 偶数对齐校验 `UI.md §9.6`
- [x] **M3-7 放大命令**：crop + scale(lanczos) 链，输出尺寸默认回原分辨率 `FFMPEG.md §6.3⑦`
- [x] **M3-8 精确剪切**：输出侧 `-ss` 重编码路径，复用编码器基建；UI 解禁 M1-10 占位并加重编码提示 `FFMPEG.md §6.3②`
- [x] **M3-9 10bit/HDR 特例**：pix_fmt 为 10bit 时编码器选择策略（hevc 优先）+ VFR 重编码提示 `DESIGN.md §10`

**验收**：AC-341-1 · AC-341-2 · AC-342-1 · AC-351-1 · AC-352-1 · AC-353-1 · TC-004 / TC-012（口径见 DESIGN.md §3；执行见 TESTING.md）

---

## M4 打磨与打包

> **关联**：FR-360–362（面板/历史/取消）· NFR-012（配置与错误处理）　·　**验收**：AC-360-1 · AC-361-1 · AC-362-1　——　执行：TESTING.md TC-014 · TC-015 · TC-016

- [x] **M4-1 设置页**：输出目录、默认模式、吸附开关、代理开关/强制代理、编码器锁定、质量档位；读写 tauri-plugin-store `DESIGN.md §12`
- [x] **M4-2 历史记录**：任务历史 JSON 追加存储 + 历史页（重新定位输出文件）`DESIGN.md §12`
- [x] **M4-3 快捷键**：空格播放/暂停、←/→ ±1 秒、Shift+←/→ 逐帧（1/fps）、I/O 设入/出点、Delete 删片段——剪切页 + 工作台（成品/源剪切/片段加工三态）全覆盖；`useHotkeys` 忽略输入焦点，空格/方向键 preventDefault 防滚动 `UI.md §9.4`
- [x] **M4-4 批量处理** → 取消立项，并入工作台 2.0 的 M6-8 增强项（决策 #20，2026-09-14）
- [x] **M4-5 安装包**：NSIS 构建验证通过（`video-cut_0.1.0_x64-setup.exe`，简体中文向导；决策 #21 无 MSI）；干净 Win11 实机安装冒烟 + SmartScreen 提示记录归入用户手测 `DESIGN.md §11`
- [x] **M4-6 文档收尾**：README 重写（功能表/快速开始含 fetch-ffmpeg/结构/开发约定/许可证注意）；DESIGN.md §5.2 组件树修正为实际组件、决策 #4 版本改 9.x；PLAN/HANDOFF 状态同步。README 截图待补（见待办）
- [x] **M4-7 日志系统**（提前至第一批实施，为 M6 排查兜底）：`log` + `fern` 按天滚动落盘（`app_log_dir/`，保留 7 天，`VIDEO_CUT_LOG` 覆盖级别）；任务提交载荷、ffmpeg 命令行、退出码与失败 stderr 尾部、前端错误全量入日志；任务面板补"复制日志"与"打开日志文件夹"；替代现有 eprintln 调试输出 `DESIGN.md §12.1`
- [x] **M4-8 设置页二期**（方案 UI.md §9.9/UI.md §9.1/DESIGN.md §12，2026-09-13 定稿；2026-09-14 实施）：
  - 主题色预设单选（运行时覆写 `--color-signal`；清理全部 `accent-[#4cc38a]` 硬编码与 `::selection`）`UI.md §9.1`
  - 缓存管理：`cache_usage`/`clear_cache` 命令（app_cache_dir 的代理与缩略图）+ 占用显示 + ask 二次确认清理 `DESIGN.md §5.4`
  - 关闭窗口确认：CloseRequested + 有未完成任务时 `confirmDialog`（DESIGN.md §13 欠账，固定行为）`UI.md §9.9`
  - 重置全部设置 + 关于区（应用/FFmpeg 版本、本机处理声明、GPL 注记）`UI.md §9.9`
  - ~~导出名时间戳开关~~ 取消（决策 #19：同名才追加为固定行为，归 M7-4）

## M5 工作台（流水线组合）

> **关联**：FR-380（流水线）　·　**验收**：AC-380-1　——　执行：TESTING.md TC-003

- [x] **M5-1 后端计划与构建器**：`plan_items` 纯函数（规则 A/B，`DESIGN.md §3.8`）；`pipeline_copy_args`（剪切+元数据旋转一步）与 `pipeline_transcode_args`（精确剪切+变换+裁剪单次编码，滤镜序 翻转→旋转→裁剪→缩放）`FFMPEG.md §6.3⑨⑩`
- [x] **M5-2 后端任务**：`VideoTask::Pipeline` + `check_pipeline`（逐片段 copy/transcode 判定与提示）+ `submit_pipeline`（逐片段中间文件 → 定向参数统一 → concat，进度按时长加权，取消清理）`DESIGN.md §3.8`、`DESIGN.md §8.2`
- [x] **M5-3 前端工作台页**：文件列表（排序/缩略图）+ 展开式每片段编辑器（剪切区间、旋转组合、显示空间裁剪框选/微调/移动）+ 检测面板（无损/重编码徽标与原因）+ 导出 `UI.md §9.8`
- [x] **M5-4 入口与文档**：Home 增加工作台入口；四个独立页面保留；UI.md §9.8 页面流转补充
- [x] **M5-5 验证**：cargo test 48 通过 + e2e：双文件纯无损秒级合成；单文件裁剪+另一文件剪切的混合路径正确（方向、时长、参数一致、全文件可解码）。过程中发现并修复：concat 对 tb 不一致中间文件会错乱时间戳（转码统一 `-video_track_timescale`）、同名输出并发任务互踩临时文件（提交级令牌）

---

## M6 工作台 2.0（多片段与合成时间轴）

> **关联**：FR-380（多片段/片段池/成品连播）　·　**验收**：AC-380-1　——　执行：TESTING.md TC-003 · TC-013

> 方案定稿于 2026-09-13（DESIGN.md §3.8/UI.md §9.8 v0.3，决策记录 13–15）。**后端无必须改动**：`PipelineItem` 即片段，同源多片段 = 多条 item，`plan_items`/`check_pipeline`/`submit_pipeline` 现有语义已正确；重构集中在前端。实施顺序即分步验收：M6-1~M6-5 完成即为可用的新工作台，M6-6 补齐成品预览，风险最大的连播不阻塞主体。

- [x] **M6-0 落地页改造**：移除独立 Home 页，工作台成为启动落地页（品牌 + FFmpeg 徽标 + 右上角功能导航：剪切/合并/旋转/放大 + 历史/设置）；其余页面返回统一指向工作台；拖入视频一律落在当前页面，不再按数量跨页路由 `UI.md §9.2` `UI.md §9.3`
- [x] **M6-1 数据模型与素材卡片**：SourceFile/Clip/timeline 三层状态重构；素材卡片区（首帧缩略图、拖拽排序、点击进入剪切模式、删除联动清理片段）`DESIGN.md §3.8` `UI.md §9.8`
- [x] **M6-2 片段池**：片段卡横排（来源/区间/时长/无损·重编码徽标）、点击加工、快捷入轴、拖入时间轴 `UI.md §9.8`
- [x] **M6-3 合成时间轴**：`ClipTimeline` 组件——刻度 + 片段块（宽∝时长、最小宽度保底）、播放头/点击 seek、块拖拽排序、池↔轴跨容器拖拽（指针事件，决策 #18）`UI.md §9.8`
- [x] **M6-4 三态预览区**：成品/源剪切/片段加工复用顶部预览；源剪切 = Timeline 双柄 + 关键帧吸附 +「添加为片段」；片段加工 = 旋转/放大（复用 RotateControls 与显示空间裁剪交互，走带控制外置）`UI.md §9.8`
- [x] **M6-5 导出链路**：timeline → PipelineItem[] 映射（复用 segment 判空/crop 偶数换算）、check_pipeline 防抖检测、徽标上块、页脚检测汇总一行 `DESIGN.md §3.8`（随 M6-1~4 重写一并落地：映射/检测/徽标与页面不可分割）
- [x] **M6-6 成品虚拟连播**：播放列表派生（成品内/源内时间对）、双 video 轮换预加载、越界切下一段、seek 与播放头联动、代理沿用 `DESIGN.md §3.8` `UI.md §9.8`
- [x] **M6-7 验证**：cargo test + e2e——双素材剪 4+ 片段任意排序导出正确（纯 copy 秒级；混合路径方向/时长/全文件可解码）；连播从头到尾边界切换可用
  - 自动化部分已完成（`cargo test` 含 3 条命令级 e2e，见 FFMPEG.md §6.6）；**UI 手测部分归用户统一验收**（与 M9、工作台 2.0 全流程合并手测）
- [x] **M6-8（增强）**：**批量能力**（原 M4-4，决策 #20）——素材卡多选 →「各建全段片段」「旋转应用到片段」；时间轴块**拖出边界 = 移出成品**（拖回池手势的等价实现，useDragSort bounds/onDropOutside）；**片段起点帧缩略图**（`generate_clip_thumbnails`，缓存 key = 路径@时间，单个失败跳过）

**验收**：AC-380-1 · TC-003 / TC-013（口径见 DESIGN.md §3；执行见 TESTING.md）

## M7 反馈修复与体验（用户反馈批次 1，2026-09-14）

> **关联**：—（体验修复，无新 FR）　·　**验收**：—　——　执行：TESTING.md TC-010–TC-013

> Bug 根因已定位（[handoff-archive.md](./handoff-archive.md)「M7 反馈诊断」）。M7-1~M7-3 ✅。M7-4~M7-9 按批次规划实施：快改项 M7-4/5/6/7 随 M4-7 同批（第一批），M7-8/9 与 M4-5 合并为"打包"批次（第三批）。

- [x] **M7-1 拖拽遮罩残留**：`onDragHover` 补 drop 分支——拖放松手只发 `drop` 不发 `leave`，拖入非视频时 `onVideoDropped` 不触发，遮罩无法清除
- [x] **M7-2 局部放大无法播放**：裁剪框选层 `absolute inset-0` 盖住 VideoPlayer 控制条，拦截全部点击 → VideoPlayer 新增 `overlay` 插槽（视频之上、控制条之下），Editor 裁剪层迁入 `UI.md §9.6`
- [x] **M7-3 列表拖拽排序失效**：HTML5 DnD 被 Tauri Windows 文件拖拽通道吞掉（决策 #18）→ 新增 `hooks/useDragSort` 指针事件 hook（4px 死区防误触、拖动行半透明、目标行信号色边界线），Merge 与 Workbench 素材列表接入 `UI.md §9.5`
- [x] **M7-4 同名才追加时间戳**（固定行为，决策 #19）：Rust `file_exists` 命令 + 导出前检查（Merge/Workbench 两个用户命名调用点，剪切/编辑页为自动命名不涉及）
- [x] **M7-5 任务浮层自动关闭**：设置 `toastAutoCloseSec`（0=不关闭，默认 0）+ TaskProgress 终态定时 dismiss
- [x] **M7-6 预览倍速**：VideoPlayer 控制条加倍速按钮（0.5/1/1.5/2 循环）
- [x] **M7-7 拖入文件夹**：Rust `expand_video_inputs`（目录递归扫视频扩展名、跳过隐藏项、深度上限、排序）
- [x] **M7-8 安装包中文**：NSIS `languages: ["SimpChinese"]`；MSI 砍掉（决策 #21）
- [x] **M7-9 新图标**：`scripts/icon.svg` 矢量稿（墨底圆角方 + signal 绿切块）→ `scripts/render-icon.mjs` 零依赖渲染 1024px → `pnpm tauri icon` 全量生成（ico/icns/png，源 PNG 入库）

**验收**：—（体验修复，无 AC）· TC-010–TC-013　——　bug 部分：拖入 .txt 等非视频后遮罩消失；放大页可正常播放/拖进度/框选；合并页与工作台素材列表拖拽排序生效。

## M8 候选池晋升批次 1（B1 + B2 + B14，2026-09-14）

> **关联**：—（工程批次，无 FR）　·　**验收**：—（回归保障）　——　执行：TESTING.md TC-001–TC-004

> 按 [CANDIDATES.md](../CANDIDATES.md) 晋升规则执行：设计已在 FFMPEG.md §6.5（probe 缓存）/ FFMPEG.md §6.6（e2e）/ DESIGN.md §8.2（磁盘预检）定稿，决策 #22/#23 已过。同一文件"重复打开秒出"（B1）+ 磁盘不足提前失败（B2）+ 重构回归保险（B14）。

- [x] **M8-1 probe/关键帧缓存（B1）**：probe.rs 五个探测入口（media/facts 异步 + facts/duration 同步 + 关键帧）进程内缓存，键 = 路径+size+mtime_ns，仅缓存成功结果；单测覆盖键失效与命中
- [x] **M8-2 磁盘预检推广（B2）**：抽 `require_disk_space` 公共函数，cut 改造接入，rotate/crop/merge/pipeline/proxy 全部接入（估算规则见 DESIGN.md §8.2 表）
- [x] **M8-3 核心链路 e2e（B14）**：`src-tauri/tests/e2e.rs` 真实 sidecar 跑「极速剪切 → 精确剪切 → 合并 → pipeline 全链」，断言输出时长与全帧可解码；sidecar 缺失自动跳过

**验收**：—（工程批次，回归保障）· TC-001–TC-004（口径见 DESIGN.md §3；执行见 TESTING.md）

## M9 工作台修复冲刺（手测批次 2，2026-09-15 立项；2026-09-17 实施）

> **关联**：FR-380（成品预览/时间轴可用性）　·　**验收**：AC-380-1　——　执行：TESTING.md TC-013

> 根因诊断见 [handoff-archive.md](./handoff-archive.md)「M9/M10 反馈诊断」。7 项反馈中 4 个 bug + 1 个体验需求入本批，保活与主题入 M10。五项已实施（`pnpm build` 通过），验收归用户统一手测。

- [x] **M9-1 [P0] 成品预览修复**：ProductPreview 的 `<video src>` 一律经 `fileSrc()`（convertFileSrc 资源协议，含代理路径）——当前用裸磁盘路径 WebView 加载不了，成品完全不可播（UI.md §9.8 修复约定）
- [x] **M9-2 [P1] 切换重置**：CutModeView/EditModeView 渲染点按业务 id 加 `key`（sourceId/clipId），切换素材/片段时进度、出入点、关键帧状态全部重建
- [x] **M9-3 [P1] 时间轴布局**：块位置改逐块像素排布（容器实测宽换算），最小宽度块的下一段起点 = 前块实际右缘，消除"百分比 left + minWidth 28"重叠
- [x] **M9-4 [P1] 时间轴整块拖拽**：块本体 onPointerDown 进拖拽（复用 4px 死区，点击选中不受影响），取消 6px 独立手柄；与 M9-3 同组件同批提交
- [x] **M9-5 [P2] 片段区间内预览**：加工视图播放限制在片段区间，越过出点自动暂停（循环开关可选）（UI.md §9.8）

**验收**：AC-380-1 · TC-013（口径见 DESIGN.md §3；执行见 TESTING.md）

---

## 评审修复批次（三轮：2026-09-17 三路走读 → 2026-09-19 四路复审 → 2026-09-25 过度工程审查）

> **批次实施要点（落地内容 / 披露 / 测试载体）已于 2026-09-28 迁入 [archive/handoff-archive.md](./handoff-archive.md)**——避免与 HANDOFF 双写；本文只留任务行与验收指针。

> **三轮审查**：① **2026-09-17** 三路并行走读（前端组件 / 页面与服务层 / Rust 后端），总评"工程质量高于同规模均值，主线债务 = 跨文件复制粘贴式膨胀"，要点见 [handoff-archive.md](./handoff-archive.md)「Code Review（2026-09-17）」→ 产出 **R1/R2/R3**；② **2026-09-19** 四路并行复审 + 人工逐条复核（含契约三方比对），全文归档 [archive/code-review-2026-09-19.md](./code-review-2026-09-19.md)，按 [INDEX.md](../INDEX.md) §6 分流 → 产出 **R4 + `BUG-001`–`BUG-005` + `ADR-033` + `T-003`**；③ **2026-09-25** 全仓过度工程审查（ponytail-audit 口径：只看过度工程与复杂度，正确性/安全/性能出界；两路并行深扫＋逐条 grep 复核），全文归档 [archive/code-review-2026-09-25-overengineering.md](./code-review-2026-09-25-overengineering.md)，按 [INDEX.md](../INDEX.md) §6.2 分流 → 产出 **`T-005`/`T-006`**（无 BUG、无 ADR；节流收敛复核归 `R3-4`，空目录确认归 `T-002`）。
> **排期硬约束**：R1 必须在动 M11 之前完成（**已于 2026-09-19 完成**）；**R4 同样排在 M11-0 之前**（理由见 R4 段）；**R2 并入 M11 阶段，排在 `M11-0` 之后**（`M11-0` 已于 2026-09-24 完成）；R3 在 M12-2 前实施。

### R1 —— 动 M11 前必修（P0/P1，全是小改）

> **关联**：—（工程批次，无 FR）　·　**验收**：—　——　执行：TESTING.md TC-005（tsc/lint/cargo test）

- [x] **R1-1 [P0] VideoPlayer `seeked` 无条件杀 rAF**（`components/VideoPlayer/index.tsx`）：rAF 链改 start/stop 单链语义（ticking 守门，重复调用无副作用），`seeked` 在播放中重启、暂停时停链并补一次落点上报；`pause` 一并停链（原来暂停态 rAF 空转）。修掉播放中 seek 后时间上报永久冻结 → 播放头停住、方向键步进失效、M9-5 区间预览首次到出点即静默失效
- [x] **R1-2 [P1] 事件订阅 unlisten 竞态**（App.tsx ×3、ProductPreview、Cut、Editor、Workbench、TaskProgress）：新增 `hooks/useTauriEvent.ts`（promise resolve 前卸载则在 resolve 时补退订；subscribe 只调一次，闭包经 ref 取最新），9 处订阅全部改走它；TaskProgress 的定时器清理单独成 effect
- [x] **R1-3 [P1] pending_proxies 取消泄漏**（`commands/media.rs` + `task/manager.rs`）：任务系统新增**终态清理钩子**（`Cleanup` 类型 + `submit_with_cleanup` + `Shared::run_cleanup`，由执行器与 `cancel` 双侧兜底、幂等 take），`generate_proxy` 改用它回收去重条目（替代作业体末尾手工 remove）；新增 `is_active` 用于登记前挡掉已终结任务、读侧对残留条目自愈；补 2 条单测（排队取消也清理 + 只清一次 / 正常完成清理一次）
- [x] **R1-4 [P1] 裁剪交互双实现**（Editor vs Workbench，约 200 行 ×2 逐行同构）→ 抽 `components/CropOverlay`（`useCropSelect` 交互内核 / `CropOverlay` 整层覆盖 / `CropBox` 选区框 / `CropFields` 数值字段）+ `utils/crop.ts`（归一化↔像素换算、偶数对齐、越界钳制）；两页分别减 192 / 181 行，`CropNorm` 并入 `CropRect`，顺带修「松手丢失时监听器常驻 window」兜底（`pointercancel` + 按键松开即收工）
- [x] **R1-5 [P1] 无 ESLint**：接入 `eslint@10` + `typescript-eslint` + `eslint-plugin-react-hooks`，flat 配置 `eslint.config.js`（react-hooks `rules-of-hooks`/`exhaustive-deps` = error；`no-restricted-imports` 禁 `@tauri-apps/*`，仅 `src/services/**` 例外；typescript-eslint recommended 其余；未使用变量交回 tsc 的 noUnusedLocals）；新增 `pnpm lint` / `lint:fix`。**存量零报错**（首跑即 0 problems），反向验证过：临时文件 import `@tauri-apps/api/core` 会被正确拦下

> **R1 进展（2026-09-19）**：**R1-1 ~ R1-5 全部完成**，"动 M11 前必修"已满足。验证基线：`tsc --noEmit` 通过、`vite build` 通过、`eslint .` 0 problems、`cargo test` 62 单测 + 3 e2e 全绿。前端到 R1-4 为止累计净减约 380 行（Editor 577→385、Workbench 1766→1581），同构逻辑各自收唯一份。

### R2 —— 并入 M11 阶段实施（`M11-0` 之后）

> **关联**：—（工程批次，无 FR）　·　**验收**：—　——　执行：TESTING.md TC-005 + M11 回归

- [x] **R2-1 Workbench 拆分**（SourceCards / CutModeView / EditModeView / TimeField / useProxyPreview 各自成文件，另拆 Header / Footer / ClipPool / BatchBar / shared；`index.tsx` 1636 → 780 行，净减 856 行） → **—（工程批次）· `ProductPreview`/`TaskProgress`/`hooks` · `pages`/`utils`/`types` · TC-005**
- [x] **R2-2** 重复收敛：useProxyPreview 提升 `hooks/` 四端复用、CropOverlay 统一、TimeField 以 CutEditor 版为准、basename/resolveUniqueTarget/moveAt/QUALITY_LABELS 进 `utils/`、播放快捷键块抽 usePlaybackHotkeys；**另并入 `M11-0` 留下的两处**：①「片段最短时长 0.05s」在 `Workbench` 有两处字面量（导出映射与片段卡展示）→ 收敛为一个常量；②「片段成品时长」有两份实现（`Workbench` 的 `clipDuration` 与 `utils/undo/commands.ts` 的 `productDuration`，口径已对齐为"源未探测按 0"，纯命令层不能 import 页面回调）→ 收敛或至少共用一个纯函数 → **—（工程批次）· `services/tauri.ts` · `ProductPreview`/`TaskProgress`/`hooks` · `pages`/`utils`/`types` · TC-005**
- [x] **R2-3** `useHotkeys` 页面激活门控（M11 新快捷键前置，否则 Cut 与 Workbench 的 I/O 同时响应） → **—（工程批次，M11-8 前置）· `ProductPreview`/`TaskProgress`/`hooks` · TC-005**
- [x] **R2-4** ESLint 基线 + tsconfig `noUncheckedIndexedAccess`（可选） → **—（工程批次）· 构建配置（eslint/tsconfig）· TC-005**
- [x] **R2-5** 死代码清理：`App.css` 整文件 + main.tsx import、`TaskStatus::Probing`、4 处 `#[allow(dead_code)]`、TaskProgress 死三目、Editor CropControls `rect` prop、`fileTimestamp`/`EditorTool` 过度导出、package.json 删 `less`、tailwind 两包移 devDependencies → **—（工程批次）· 多模块 · TC-005**

### R3 —— M12-2 前实施

> **关联**：—（工程批次，无 FR）　·　**验收**：—　——　执行：TESTING.md TC-005 + TC-001~003 回归

- [x] **R3-1** probe 缓存改 LRU 逐条淘汰（原口径：现 ≥512 整体 clear，preview 高频提交会周期性清光关键帧缓存；FFMPEG.md §6.5）：四张探测缓存（media/facts/keyframe/duration）改 `LruEntry{value,stamp}` + 全局原子戳，命中刷新、达限逐出最久未用一条、覆盖已有键只刷新不逐出；cap 测试重写为 LRU 语义 + 补达限覆盖边界测试；规格（FFMPEG.md §6.5）与 AGENTS §8 坑表同批更新（2026-09-26，代码 `bad3096`） → **FR-313（缓存）· AC-313-1 · `ffmpeg/probe.rs` · TC-004**
- [x] **R3-2** 取消清理由 TaskManager 按 kind 统一管理（替代 pending_proxies 手工模式）：新增 `TaskManager::submit_internal(sink, kind, label, dedup_key, job)`——同 `(kind, dedup_key)` 活动任务复用既有 taskId、登记表 `(kind,key)→taskId` 由 TaskManager 持有、终态统一回收（含排队取消）；generate_proxy 三步手工簿记整体迁移，提交入口重构为私有 `submit_core`（行为逐语句等价） → **FR-361 · FR-362 · AC-362-1 · `task/manager.rs` · TC-004**
- [x] **R3-3** snapshot 过滤 internal 任务（否则常驻 preview 任务令关闭窗口确认失效）：`list_tasks` 两个消费方（任务面板 / 关闭守卫）均不可见；事件照常派发、`StatusPayload` 带 `internal` 标记供面板跳过建行；TaskSnapshot 不加字段 → **FR-360（面板可见性）· AC-360-1 · `task/manager.rs` · `services/tauri.ts` · TC-015**
- [x] **R3-4** 进度节流样板收敛（9 份）+ **speed 接通**：九处手写节流并进 `commands::ProgressThrottle`（200ms 门 + 收尾恒放行）；`set_progress(percent, speed)` 接通 `-progress` 的 `speed=`；ETA 调和估计（p<5% 与收尾不报）；任务面板接通速度与"剩余"。**顺带修复 `BUG-013`**：pipeline 归一化/concat 进度恒顶格、ETA 恒不报，补 `/(n+1)` 除数 → **FR-361 · AC-361-1 · `ffmpeg/progress.rs` · `services/tauri.ts` · TC-004 · TC-015**
- [x] **R3-5** `prepare_output` 提交前导抽取（4 份）：`commands/mod.rs` 新增 `PreparedOutput` + `prepare_output(final_base, token_seed)`——解析输出目录/文件名、`create_dir_all`、解析 sidecar（提交期失败不占队列）、生成提交级令牌；crop/rotate/merge/pipeline 四份重复前导各收敛为一次调用（错误文案逐字保留），merge/pipeline 传请求路径、crop/rotate 传容器校正后最终名 → **NFR-008 · `commands/*.rs` · `commands/pipeline.rs` · TC-004**
- [x] **R3-6** parking_lot 统一锁中毒策略 + `cargo fmt --check` 入流程：全仓 std `Mutex`/`Condvar` 迁 `parking_lot 0.12`——"裸 `unwrap` / `into_inner` / 静默吞"三种中毒策略并存彻底消除（作业体 panic 后锁不再永久失效）；`cargo fmt` 全仓收编 + `--check` 挂 pre-commit 并写入 AGENTS §2/§4（"输出=输入比较"一条已由 `R3-7` 提前完成） → **NFR-006 · NFR-007 · `task/manager.rs` · `task/worker.rs` · TC-004**
- [x] **R3-7 输出=输入同一性比较归一化**（2026-09-24 提前实施，原属 `R3-6` 第二条；**登记为缺陷 `BUG-011`**）：新增 `fs::same_path`（`canonicalize` 两侧；输出路径还不存在时退回"父目录 + 文件名"），五处守卫收敛为一份 `fs::reject_if_input_equals`（提交期与容器校正后复查共用）；`DESIGN` §13 补明口径 → **BUG-011 · NFR-012 · `fs.rs` · `commands/*.rs` · TC-039**

### R4 —— 第二轮审查整改（2026-09-19 立项，来源 archive/code-review-2026-09-19.md）

> **关联**：—（工程批次；其中 6 条为**缺陷修复**，登记见 [BUGS.md](../BUGS.md) `BUG-001`–`BUG-006`；`R4-8` 另收真机首跑缺陷 `BUG-007`–`BUG-009`，`R4-9` 收 `R4-4` 实施时同族复查发现的 `BUG-010`）　·　**验收**：各条以其回归 TC 为准　——　执行：TESTING.md §3.4（TC-019–TC-029）
> **排期**：**排在 M11-0 之前** —— §3.1 的作业体会被 M11 的切割/波纹删除放大（panic 一次即泄漏并发槽），§3.3 涉及的 `ClipTimeline` 正是 M11-1/2/4/6 要重写的组件：先修是顺手，M11 后修是返工。

- [x] **R4-1 [P0] 作业体 panic 隔离**（`task/worker.rs`）：新增 `run_job_isolated`——`catch_unwind(AssertUnwindSafe(..))` 包住 `job(&ctx)`，panic 收敛为 `Err("任务内部错误：<panic 内容>")` 并入日志，让既有终态处理（`record_terminal` / `run_cleanup` / `task_finished`）照常执行；补单测（模拟 panic → 任务 Failed + 清理钩子照跑 + 连续两次 panic 后并发位仍可用） → **BUG-001 · NFR-006 · `task/worker.rs` · TC-019**
  - **⚠ 边界（已裁决）**：`[profile.release]` 原按 Tauri 体积建议设了 `panic = "abort"`，会让 `catch_unwind` 在 release 下失效（panic 直接终止进程）。**2026-09-21 裁决保留 `unwind`**（见 [DECISIONS.md](../DECISIONS.md) `ADR-034`），即本条隔离在发布版同样生效。
- [x] **R4-2 [P1] 输出原子替换（6 处）**：新增 `fs::atomic_replace(part, final)`——只做一次 `std::fs::rename`（Windows 走 `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`，**目标已存在时由系统替换**、失败则两边原样保留），取代"先 `remove_file(目标)` 再 `rename`"；错误信息一律带 `.part` 完整路径；6 处命令全部改走它 + 3 单测 + 1 e2e → **BUG-002 · NFR-007 · `fs.rs` · `commands/*.rs` · TC-020**
- [x] **R4-3 [P1] 指针拖拽收尾兜底（4 处）**：新增 `utils/pointerDrag.ts::beginPointerDrag(onMove, onEnd)`——window 上收 `pointermove`/`pointerup`/`pointercancel`、`pointermove` 内判 `buttons === 0` 即收工（窗口外松手时 `pointerup` 不派发）、收尾只执行一次、返回值 `detach` 供卸载只摘监听；四处拖拽（`useDragSort` / `Timeline` 双手柄 / `ClipTimeline` 池→轴 / `CropOverlay`）全部改走它，`Timeline` 手柄补 `e.button !== 0` 起手判定 → **BUG-003 · `VideoPlayer`/`Timeline` · `ClipTimeline`/`CropOverlay` · TC-021（手工）**
- [x] **R4-4 [P1] `pxToCrop` 钳制 + 边界矩阵**（`utils/crop.ts`）：锚点 `x`/`y` 先钳到 `[0, dims − MIN_CROP_PX]`、再按剩余空间收缩宽高（恰好压界仍允许）；**锚点上界与收缩步都用 `evenFloor`（向下取偶）**——奇数尺寸下两处都不能就近取偶；矩阵（14 组期望值 + 4000 组随机扫描 = 12730 断言 0 失败）记入 TESTING TC-022、已随 `M11-0` 固化为 Vitest → **BUG-004 · AC-351-1 · `pages`/`utils`/`types` · TC-022**
- [x] **R4-5 [P2] 缩略图单张失败不中止整批**（`commands/media.rs`）：抽帧循环抽成 `generate_file_thumbs_sync`，单张失败由 `return Err` 改 `log::warn!` + `continue`（与 clip 版口径统一，整批性失败仍报错）；补命令级回归（真实 sidecar + lavfi 夹具 + 一个假 mp4——把 `continue` 换回 `return Err` 该用例立即失败） → **BUG-005 · AC-331-1 · `commands/*.rs` · TC-023**
- [x] **R4-6 [P2] 输出容器/扩展名口径统一**（依 `ADR-033`）：新增 `fs::with_container_ext`（纯校正）与 `fs::output_path_for`（校正 + **同名不静默覆盖**）；copy 类跟随源容器、重编码类固定 mp4，`merge`/`pipeline` 的容器决策与 `.part`/最终名都在**作业体内探测之后**才定；**顺带修掉两处**——扩展名校正绕过同名检查的静默覆盖、`merge`/`pipeline` 的 `add_output` 记未校正路径。回归：4 单测 + 1 e2e（matroska 源） → **ADR-033 · NFR-007 · `fs.rs` · `commands/*.rs` · TC-029**
- [x] **R4-7 [P2] 代理判定纳入容器维度**（`utils/media.ts`）：`needsProxy` 补容器维度——容器判定**不能按扩展名**（`MediaInfo.container` 是 ffprobe 的 `format_name`，即逗号分隔的候选解复用器列表），实现为**按首位解复用器比对 `NATIVE_CONTAINERS` 白名单**，判不出来一律按不可播；`DESIGN` §10 补齐 FLV/WMV 并写明"处理范围按扩展名、预览范围按解复用器名，两套命名空间不可混用"；命令级矩阵 27 断言 0 失败（`avi`/`flv`/`ts`/`wmv` 四处由"不代理"翻转为"代理"，即本缺陷），已随 `M11-0` 固化为 Vitest；`cargo test` 另锁 `container` 原样透传的跨层契约 → **BUG-006 · NFR-010 · `pages`/`utils`/`types` · TC-024**
- [x] **R4-8 真机首跑缺陷修复**（2026-09-21，来源 gui-e2e 首跑 → `BUG-007`–`BUG-009`）：**输入侧** `-ss` 改用 `fmt_seek`（+1µs、6 位小数，杜绝吸附值被三位小数舍到目标时刻之前而倒退一个关键帧；输出侧 seek 与 `-t` 仍用 `fmt_sec`）；`parse_keyframes` 只取行内首个 CSV 字段（带额外空字段的行不再被整行丢弃）；新增 `realCutStart()`（≤入点的最近关键帧，二分）+ `Timeline` 落点虚线 + 界面「实际入点」提示，片段时长按真实落点算 → **NFR-004 · `ffmpeg/command.rs` · `ffmpeg/probe.rs` · `components/Timeline` · `components/CutEditor` · TC-025–TC-027**

- [x] **R4-9 [P1] `cropToPx` 边缘对齐**（`R4-4` 实施时的同族复查发现，`BUG-010`）：宽高改由**对齐后的边缘**相减得出（`right`/`bottom` 先就近取偶、再收进 `evenFloor(dims)` 的偶数边界），`x`/`y` 也一并收进画面（原先左右/上下各自就近取偶，`x + w` 可超画面 1~2px，仅在作业体内被拒）；3 组尺寸 × 3688320 样本**越界 0** → **BUG-010 · AC-351-1 · `pages`/`utils`/`types` · TC-028**
  - **仍待做**：**提交期**预检（`check_pipeline` 目前不查裁剪越界，越界要等作业体内的 `display_crop_rect → align_rect` 才报错）——仍归 [技术任务 `T-003`](#技术任务t)，本条只保证前端不再产出越界裁剪。

> **同源但按技术债处理的项**：§4.1 校验时机、§4.4 锁回调、§4.6–4.8 前端健壮性、§5.3 的 `locked_encoder` 白名单 → [技术任务 `T-003`](#技术任务t)。
> **已排除项**（报告 §6，不重复讨论）：`VideoPlayer` 缺 `ended` 监听、`ProductPreview.switchTo` 竞态。


---

## M11 单轨时间线核心（TIMELINE.md §17，2026-09-16 立项，实施中）

> **批次实施要点（落地内容 / 披露 / 测试载体）已于 2026-09-28 迁入 [archive/handoff-archive.md](./handoff-archive.md)**——避免与 HANDOFF 双写；本文只留任务行与验收指针。

> **关联**：FR-17xx（**随 M11 首个功能批次 M11-1 发号**——M11-0 是前置重构、不产生新需求；需求本身在 TIMELINE.md §17）　·　**验收**：AC 见 TIMELINE.md §17.9 ①~⑥　——　执行：TESTING.md §3.1（`TC-040` 撤销基线）+ M11-9 埋点报告

> 定位 = "拼接驾驶舱"（决策 #26）：只做让剪切合并更顺手的七个操作，规格见 TIMELINE.md §17。M9-3/M9-4 的逐块像素排布与整块拖拽是本里程碑地基。精度公式与撤销范式参照 Clypra（同栈开源编辑器）验证过的结论（[handoff-archive.md](./handoff-archive.md)「时间线需求收敛」）；后端除 M12-2 预览变体外零改动。
>
> **实施方案已定稿（2026-09-17，[plans/M11.md](../plans/M11.md) §18，决策 #32）**：执行顺序调整为 M11-0 状态层/撤销基座先行（七操作都要经命令栈，PLAN 原列第 7 位的 M11-7 前置拆分）；几何/缩放滚动/播放头/修剪手势的实施设计见 plans/M11.md §18.2~§18.6。

- [x] **M11-0 前置重构**（plans/M11.md §18.1，无行为变化）：`utils/undo/` 命令模块（快照对 + 纯函数 builder + 钳制）+ 工作台文档状态收敛（clips+timeline → 单一 EditorDoc）+ 既有操作全部改走命令栈 + 撤销单测基线（Vitest，6 条 Clypra 清单 + 钳制域） → **FR-17xx（待发号，TIMELINE.md §17.5）· AC 见 §17.9① · `ClipTimeline`/`CropOverlay`（+新增 `utils/undo`）· TC-040**
- [x] **M11-1 精度基座**：ClipTimeline 改 PPS 世界坐标（承接 M9-3，块宽差值法 TIMELINE.md §17.3）；`utils/time.ts` 总帧数时间码；几何侧最小块宽 ≥6px 的动态 PPS 下限（**帧级 ≥1 帧钳制已在 `M11-0` 的命令层**，见 `utils/undo/commands.ts`）；帧时间埋点接入 logger（供 M11-9 用） → **FR-17xx（§17.3）· AC 见 §17.9② · `ClipTimeline`/`CropOverlay` · `pages`/`utils`/`types` · TC 待建**
- [x] **M11-2 缩放与滚动**：页面级 PPS 状态 + 钳制（2~500 px/s）；Ctrl+滚轮以鼠标为中心、+/−、\\ 适应窗口 → **FR-17xx（§17.3）· AC 见 §17.9② · `ClipTimeline`/`CropOverlay` · TC 待建**
- [x] **M11-3 播放头**：ref 直改 DOM 脱离 React 渲染路径（TIMELINE.md §17.9）；点击/拖动标尺 seek；播放头吸附片段边缘（8px/PPS 窗） → **FR-17xx（§17.9）· AC 见 §17.9② · `ClipTimeline`/`CropOverlay` · TC 待建（帧时间埋点）**
- [x] **M11-4 选择与波纹删除**：单选高亮 + Delete 波纹删除（从 timeline 移除、池保留库存，决策 #13 一致） → **FR-17xx · AC 见 §17.9④ · `ClipTimeline`/`CropOverlay` · TC 待建**
- [x] **M11-5 切割**：C/右键在播放头拆分（源内换算 TIMELINE.md §17.2），两条新片段入池入轴；播放头不在片段上时禁用 → **FR-17xx（§17.2）· AC 见 §17.9①③ · `ffmpeg/command.rs` · `ClipTimeline`/`CropOverlay` · TC-001（回归）+ 待建**
- [x] **M11-6 边缘修剪**（B10 并入，决策 #29）：6~8px 热区光标；双向波纹修剪（位置重排自然成立）+ 源边界/最短时长钳制；修剪边缘关键帧吸附联动（S 切换，决策 #30；按住 Alt 临时关吸附，TIMELINE.md §17.8）；实时入/出点 tooltip + 徽标 copy/transcode 实时变化；双击边缘修剪到播放头 → **FR-17xx · AC 见 §17.9③ · `ClipTimeline`/`CropOverlay` · TC 待建**
- [x] **M11-7 撤销接线**（B11 并入，决策 #29；**基座已在 `M11-0` 落地**——命令层 `utils/undo/`、快照对、6 条单测基线见 `TC-040`）：把 M11-4/5/6 新落地的操作（波纹删除 / 切割 / 修剪）全部接进命令栈，并接 Ctrl+Z / Ctrl+Shift+Z 与右键菜单的撤销/重做项（需 `R2-3` 的 `useHotkeys` 页面前置门控） → **FR-17xx（§17.5）· AC 见 §17.9① · `ClipTimeline`/`CropOverlay`（+`utils/undo`）· TC-040（基座）+ 端到端手工（待建）**
- [x] **M11-8 菜单与快捷键**：右键最小集（TIMELINE.md §17.4）；C/S/Delete/Ctrl+Z/Ctrl+Shift+Z/+/−/\\ + 2026-09-17 需求表新增可行项（K/L 走带、A 追加入轴、Ctrl+E 导出、I/O 修剪选中片段到播放头）接线进 useHotkeys（输入焦点忽略规则不变；冲突项维持既有裁决，见 TIMELINE.md §17.8 状态表） → **FR-17xx（§17.4）· AC 见 §17.9① · `ClipTimeline`/`CropOverlay` · `ProductPreview`/`TaskProgress`/`hooks` · TC 待建**
- [x] **M11-9 性能验收**：100 片段夹具（gen-fixtures 串联生成）；对照 TIMELINE.md §17.9 预算出埋点报告（拖拽/播放头/撤销 P50/P95） → **FR-17xx · AC 见 §17.9② · `ClipTimeline`/`CropOverlay`（+`utils/perf`）· TC 待建**

**验收**：AC 见 TIMELINE.md §17.9 ①~⑥ · TC-040（`M11-0` 撤销基线，已建）+ 其余待建（M11-9 埋点报告）（口径见 DESIGN.md §3；执行见 TESTING.md）

