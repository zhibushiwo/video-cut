# video-cut 实施计划

> **职责**：里程碑、任务（checkbox）、验收与风险——描述"做什么、做到哪了"。
> **唯一真源**：**进度的唯一真源**（里程碑状态、任务勾选、验收归属）；任务号 `M#-#`/`R#-#` 为里程碑内序号，`T-0NN` 为独立技术任务。
> **读时机**：接活前 / 汇报进度 / 判断下一步做什么。
> **写规则**：一个任务一个 checkbox，完成即勾选并按约定粒度提交（信息前缀 `M11-3:` 等）；验收行只写 AC 编号，验收口径在 [DESIGN.md](./DESIGN.md)、执行方式在 [TESTING.md](./TESTING.md)；不在此写规格。
> **关联**：[INDEX.md](./INDEX.md) · 上位 [DESIGN.md](./DESIGN.md)（规格仲裁者）与 [TIMELINE.md](./TIMELINE.md) · 当前状态 [HANDOFF.md](./HANDOFF.md)
> **最后更新**：2026-09-25（`R2-5` 勾选——死代码清理落地，R2 全部完成；同日 `R2-2`/`R2-3`/`R2-4` 勾选）

## 里程碑总览

| 里程碑 | 内容 | 前置 | 预估工作量 | 状态 |
| --- | --- | --- | --- | --- |
| **M0 基建** | 模块树、sidecar FFmpeg、服务层、UI 骨架 | — | 1~2 天 | ✅ 完成 |
| **M1 剪切垂直切片** | 核心链路：探测→预览→选区→无损剪切→进度 | M0 | 4~6 天 | ✅ 完成 |
| **M2 合并** | 参数检测、无损合并、自动统一 | M1 | 2~3 天 | ✅ 完成 |
| **M3 旋转 + 放大 + 精确剪切** | 全部重编码类功能 + 硬件编码器基建 | M1 | 3~5 天 | ✅ 完成 |
| **M4 打磨与打包** | 设置、历史、快捷键、安装包、日志 | M2、M3 | 2~4 天 | ✅ 完成（M4-5 实机冒烟待用户） |
| **M5 工作台** | 多文件流水线：逐段剪切/旋转/放大 → 合成成品 | M2、M3 | 2~4 天 | ✅ 完成 |
| **M6 工作台 2.0** | 素材卡/片段池/合成时间轴/成品连播预览 | M5 | 2~3 天 | ✅ 完成（M6-7 验收归用户） |
| **M7 反馈修复与体验** | 用户反馈批次：3 个 bug + 快改 + 打包项 | M0 | 0.5~1 天 | ✅ 完成 |
| **M8 候选池晋升批次 1** | B1 probe 缓存、B2 磁盘预检推广、B14 核心链路 e2e | M6 | 0.5~1 天 | ✅ 完成 |
| **M9 工作台修复冲刺** | 手测批次 2 的 4 个 bug + 片段区间预览 | M6 | 0.5~1 天 | ✅ 完成（验收归用户） |
| **M10 保活 + 深浅主题** | 工作页 keep-alive（决策 #24）+ 深浅主题三态（B17，决策 #25） | M9 | 1 天 | ⏸ **暂缓**（决策 #32） |
| **M11 单轨时间线核心** | PPS 坐标/缩放、切割、波纹删除、边缘修剪、拖拽重排、撤销栈（TIMELINE.md §17，决策 #26） | M9（不依赖 M10） | 2.5~3 周 | 🔄 **进行中**：`M11-0` 状态层/撤销基座 ✅（2026-09-24）、`M11-1` 精度基座 ✅、`M11-2` 缩放滚动 ✅、`M11-3` 播放头路径 ✅、`M11-4` 选择与波纹删除 ✅、`M11-5` 切割 ✅、`M11-6` 边缘修剪 ✅、`M11-7` 撤销接线 ✅、`M11-8` 菜单与快捷键 ✅、`M11-9` 性能验收 ✅（帧预算真机半 ⏳）（2026-09-25）；R2 五项并入本阶段 |
| **M12 预览强化** | 连播改进、渲染即预览（决策 #28）、暂停帧服务 spike（TIMELINE.md §17.6） | M11 | 1~2 周 | ⏳ 待实施 |
| **M13 打磨（可选）** | 缩略图条、标记、多选拖拽（决策 #31） | M12 | ~1 周 | ⏳ 待实施 |
| **R1 评审修复（第一轮）** | 2026-09-17 三路走读的 P0/P1 整改（rAF 单链 / 事件退订 / 清理钩子 / CropOverlay / ESLint） | M9 | 1 天 | ✅ 完成（2026-09-19） |
| **R2 重构** | Workbench 拆分、重复收敛、useHotkeys 门控、ESLint 基线、死代码清理 | M11-0 ✅ | 2~3 天 | ✅ **完成**：`R2-1` ✅（2026-09-24）· `R2-2`/`R2-3`/`R2-4`/`R2-5` ✅（2026-09-25） |
| **R3 收尾** | probe 缓存改 LRU、取消清理按 kind 统一、snapshot 过滤 internal、speed 接通、输出前导抽取、锁策略 | M11 | 1~2 天 | ✅ **全部完成**：`R3-7`（2026-09-24 提前实施）· `R3-1`/`R3-2`/`R3-3`/`R3-4`/`R3-5`/`R3-6`（2026-09-26）——M12-2 前置就绪 |
| **R4 第二轮审查整改** | 2026-09-19 四路复审的 P0/P1（`R4-1`–`R4-7`，`BUG-001`–`BUG-006`）：panic 隔离、原子替换、拖拽收尾、crop 钳制、缩略图容错、代理判定纳入容器维度；另并入真机首跑缺陷修复 `R4-8`（`BUG-007`–`BUG-009`）与 `R4-9`（`BUG-010`） | R1 | 1~2 天 | ✅ **9 条全部实施完毕**（2026-09-21 ~ 09-23，见「R4」段）；剩真机/手测半待发起 |

> 预估按单人全职工时，仅供排期参考；顺序上 M2 与 M3 可并行挑选。
> 表内按 M 编号排序（M5 先于 M4 交付，故正文顺序为 M4 → M5）。

**阶段 → 里程碑映射**（原 DESIGN.md §14 开发路线图并入此处，2026-09-19）：

| 交付阶段 | 内容 | 对应里程碑 |
| --- | --- | --- |
| 阶段 0 基建 | 模块树 / sidecar / 环境检查 / 插件接入 | M0 |
| 阶段 1 剪切垂直切片 | probe → 预览 → 选区 → 极速剪切 → 进度 | M1 |
| 阶段 2 合并 | 参数比对面板 / 无损合并 / 自动统一 / 列表排序 | M2 |
| 阶段 3 旋转 + 放大 | 元数据旋转 / Crop 框选 / 硬编回退 / 精确剪切 | M3 |
| 阶段 3.5 工作台 | 多文件流水线 + plan_items + 检测面板 | M5 |
| 阶段 4 体验增强 | 设置（含二期）、历史、快捷键、安装包、日志 | M4 |
| 阶段 5 工作台 2.0 | 素材/片段/时间轴三层模型 + 三态预览 + 导出链路 | M6 |
| 阶段 6 单轨装配时间线 | 时间线核心 + 预览强化 + 打磨（可选） | M11 / M12 / M13 |

> **批次规划（2026-09-14 整合，决策 #19/#20/#21）**：
> 第一批 = M4-7 日志系统（提前）+ M7-4/5/6/7 快改；
> 第二批 = M6 工作台 2.0（M4-4 并入 M6-8）+ M4-3 快捷键（M6-4 后接入，覆盖两套编辑面）；
> 第三批 = M7-8/M7-9 + M4-5 合并为"打包"批次、M4-8 设置二期、M4-6 文档收尾。

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

> Bug 根因已定位（[handoff-archive.md](./archive/handoff-archive.md)「M7 反馈诊断」）。M7-1~M7-3 ✅。M7-4~M7-9 按批次规划实施：快改项 M7-4/5/6/7 随 M4-7 同批（第一批），M7-8/9 与 M4-5 合并为"打包"批次（第三批）。

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

> 按 [CANDIDATES.md](./CANDIDATES.md) 晋升规则执行：设计已在 FFMPEG.md §6.5（probe 缓存）/ FFMPEG.md §6.6（e2e）/ DESIGN.md §8.2（磁盘预检）定稿，决策 #22/#23 已过。同一文件"重复打开秒出"（B1）+ 磁盘不足提前失败（B2）+ 重构回归保险（B14）。

- [x] **M8-1 probe/关键帧缓存（B1）**：probe.rs 五个探测入口（media/facts 异步 + facts/duration 同步 + 关键帧）进程内缓存，键 = 路径+size+mtime_ns，仅缓存成功结果；单测覆盖键失效与命中
- [x] **M8-2 磁盘预检推广（B2）**：抽 `require_disk_space` 公共函数，cut 改造接入，rotate/crop/merge/pipeline/proxy 全部接入（估算规则见 DESIGN.md §8.2 表）
- [x] **M8-3 核心链路 e2e（B14）**：`src-tauri/tests/e2e.rs` 真实 sidecar 跑「极速剪切 → 精确剪切 → 合并 → pipeline 全链」，断言输出时长与全帧可解码；sidecar 缺失自动跳过

**验收**：—（工程批次，回归保障）· TC-001–TC-004（口径见 DESIGN.md §3；执行见 TESTING.md）

## M9 工作台修复冲刺（手测批次 2，2026-09-15 立项；2026-09-17 实施）

> **关联**：FR-380（成品预览/时间轴可用性）　·　**验收**：AC-380-1　——　执行：TESTING.md TC-013

> 根因诊断见 [handoff-archive.md](./archive/handoff-archive.md)「M9/M10 反馈诊断」。7 项反馈中 4 个 bug + 1 个体验需求入本批，保活与主题入 M10。五项已实施（`pnpm build` 通过），验收归用户统一手测。

- [x] **M9-1 [P0] 成品预览修复**：ProductPreview 的 `<video src>` 一律经 `fileSrc()`（convertFileSrc 资源协议，含代理路径）——当前用裸磁盘路径 WebView 加载不了，成品完全不可播（UI.md §9.8 修复约定）
- [x] **M9-2 [P1] 切换重置**：CutModeView/EditModeView 渲染点按业务 id 加 `key`（sourceId/clipId），切换素材/片段时进度、出入点、关键帧状态全部重建
- [x] **M9-3 [P1] 时间轴布局**：块位置改逐块像素排布（容器实测宽换算），最小宽度块的下一段起点 = 前块实际右缘，消除"百分比 left + minWidth 28"重叠
- [x] **M9-4 [P1] 时间轴整块拖拽**：块本体 onPointerDown 进拖拽（复用 4px 死区，点击选中不受影响），取消 6px 独立手柄；与 M9-3 同组件同批提交
- [x] **M9-5 [P2] 片段区间内预览**：加工视图播放限制在片段区间，越过出点自动暂停（循环开关可选）（UI.md §9.8）

**验收**：AC-380-1 · TC-013（口径见 DESIGN.md §3；执行见 TESTING.md）

## M10 保活 + 深浅主题（2026-09-15 立项；2026-09-17 起暂缓，决策 #32）

> **关联**：FR-9xx（随 M10 开工发号；需求在 UI.md §9.1/§9.2）　·　**验收**：AC 待发号　——　执行：TESTING.md TC-014

> 用户裁决优先级不高，M9 完成后直接启动 M11。本批与时间线核心零耦合，随时可独立补做；设计要点不变。

- [ ] **M10-1 [P1] 页面保活**（决策 #24）：Cut/Merge/Editor/Workbench 离开隐藏不卸载，隐藏瞬间自动暂停播放；History/Settings 维持条件挂载；设置变更即时生效不重置页面（UI.md §9.2） → **FR-9xx（待发号，UI.md §9.2）· AC 待发号 · `pages`/`utils`/`types` · TC-014（决策 #24）**
- [ ] **M10-2 [P2] 深浅主题**（B17，决策 #25）：`themeMode: dark | light | system` 设置项；`.theme-light` 变量组整体替换；跟随系统 matchMedia 监听实时切换；warn 琥珀与四个主题色浅底对比度逐一校对（UI.md §9.1） → **FR-9xx（待发号，UI.md §9.1）· AC 待发号 · `pages`/`utils`/`types` · TC-014（B17，决策 #25）**

**验收**：AC 待发号（FR-9xx 随 M10 开工）· TC-014（口径见 DESIGN.md §3；执行见 TESTING.md）

**实施顺序建议**：M9-1 → M9-2 → M9-3/4 → M9-5 → M10-1 → M10-2（M9 五项已于 2026-09-17 实施完毕；M10 现暂缓，恢复时按 M10-1 → M10-2 顺序做）。

## 评审修复批次（三轮：2026-09-17 三路走读 → 2026-09-19 四路复审 → 2026-09-25 过度工程审查）

> **三轮审查**：① **2026-09-17** 三路并行走读（前端组件 / 页面与服务层 / Rust 后端），总评"工程质量高于同规模均值，主线债务 = 跨文件复制粘贴式膨胀"，要点见 [handoff-archive.md](./archive/handoff-archive.md)「Code Review（2026-09-17）」→ 产出 **R1/R2/R3**；② **2026-09-19** 四路并行复审 + 人工逐条复核（含契约三方比对），全文归档 [archive/code-review-2026-09-19.md](./archive/code-review-2026-09-19.md)，按 [INDEX.md](./INDEX.md) §6 分流 → 产出 **R4 + `BUG-001`–`BUG-005` + `ADR-033` + `T-003`**；③ **2026-09-25** 全仓过度工程审查（ponytail-audit 口径：只看过度工程与复杂度，正确性/安全/性能出界；两路并行深扫＋逐条 grep 复核），全文归档 [archive/code-review-2026-09-25-overengineering.md](./archive/code-review-2026-09-25-overengineering.md)，按 [INDEX.md](./INDEX.md) §6.2 分流 → 产出 **`T-005`/`T-006`**（无 BUG、无 ADR；节流收敛复核归 `R3-4`，空目录确认归 `T-002`）。
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
  - **落地内容**（2026-09-24）：`src/pages/Workbench/` 新增 10 个文件——`shared.ts`（类型 / 常量 / 纯 helper：`SourceFile`·`PreviewMode`·`ClipEdit`·`QUALITY_LABELS`·`NAV_ITEMS`·`fieldBtn`·`freshId`·`newClipOf`·`displayedDims`·`basename`）、`useProxyPreview.ts`、`TimeField.tsx`、`SourceCards.tsx`、`CutModeView.tsx`、`EditModeView.tsx`、`Header.tsx`、`Footer.tsx`、`ClipPool.tsx`、`BatchBar.tsx`；`index.tsx` 只留编排（state / effects / handlers / derived / 组装 JSX）。**纯机械拆分、零行为变化**：四个既有组件签名逐字保留，新拆组件 props 全部由页面显式传入（不闭包捕获页面 state）。**原列的 "`CropFields` 成文件" 已过时**——Workbench 自 R1-4 起即从 `components/CropOverlay` 导入 `CropFields`，本地无此组件，故不重复做。验证：`tsc --noEmit` 通过 · `eslint .` 0 problems · `vite build` 通过 · `vitest` 19 全绿。
- [x] **R2-2** 重复收敛：useProxyPreview 提升 `hooks/` 四端复用、CropOverlay 统一、TimeField 以 CutEditor 版为准、basename/resolveUniqueTarget/moveAt/QUALITY_LABELS 进 `utils/`、播放快捷键块抽 usePlaybackHotkeys；**另并入 `M11-0` 留下的两处**：①「片段最短时长 0.05s」在 `Workbench` 有两处字面量（导出映射与片段卡展示）→ 收敛为一个常量；②「片段成品时长」有两份实现（`Workbench` 的 `clipDuration` 与 `utils/undo/commands.ts` 的 `productDuration`，口径已对齐为"源未探测按 0"，纯命令层不能 import 页面回调）→ 收敛或至少共用一个纯函数 → **—（工程批次）· `services/tauri.ts` · `ProductPreview`/`TaskProgress`/`hooks` · `pages`/`utils`/`types` · TC-005**
  - **落地内容**（2026-09-25）：`src/hooks/useProxyPreview.ts`（四端共用：Cut / Editor / 工作台两视图；新增第三参 `fallbackOnVideoError` 保住剪切/编辑器页"`proxyMode !== "off"` 即兜底"口径，默认 = `useProxy` 与工作台同门；ProductPreview 是多路径映射、形态不同不经它）；`src/components/TimeField/index.tsx`（**以 CutEditor 版为准**，删 Workbench 本地版——Workbench 侧输入框 w-28/text-xs → w-32/text-sm，为唯一批准的可见差）；`src/utils/paths.ts` 加 `basename`（收编 Cut/Editor/Merge/History 四处内联 `split(/[\\/]/)`）与 `resolveUniqueTarget`（Editor/Merge/Workbench 三处"同名才追加时间戳"共用，`exists` 注入保持 utils 无 IPC）；`src/utils/array.ts` 的 `moveAt`（Merge/Workbench 两处 splice 移动）；`src/utils/quality.ts` 的 `QUALITY_LABELS`（Editor/Settings/Workbench Footer 三份并一）；`src/hooks/usePlaybackHotkeys.ts`（空格+方向键走带块四端共用，页面专属键 I/O、Delete 留在各自 `useHotkeys`，工作台成品模式 gate 走 `enabled` 参）；M11-0 两处 = `shared.ts` 的 `MIN_SEG_DURATION_SEC` + `commands.ts` 导出 `productDurationOf`（Workbench `clipDuration`/`productEntries` 委托之，负跨度按 0 差异不可达）。**CropOverlay 统一一项判定已被 R1-4 覆盖**（Editor 整层 + EditModeView 挂舞台即 AGENTS §3-13 形态，无剩余重复、无代码）。**勘误（2026-09-25 过度工程审查）**：`media.rs` 缩略图双胞胎函数的"收敛留给 R2-2"注释实为失账——R2-2 落地清单不含本项，归 `T-005`（实施时顺带修正该注释）。**新增单测 17 条**（array 5 + paths 8 + productDurationOf 4）→ vitest **36 全绿**；`tsc`/`eslint` 0 · `vite build` 通过。
  - **披露的微观差**（收敛必然二选一的窄边缘，两轴 CR 复核后接受；Spec 轴实核布尔等价）：(a) 剪切/编辑器页 `generateProxy` **提交失败**不再卸载文件（旧=报 probeError 并卸载；新=静默、文件保留可再兜底）；(b) `useProxy` 恒 false 时同路径重载不清已解析的代理态（主线场景照旧重置）；(c) 代理生成时机从 loadFile 内 await 后移到 info 到达后的 effect——**顺带消除了快速换文件时旧代理任务串台到新文件的竞态**；(d) Workbench 时间字段提交未被钳制的输入后，文本不再立即规范化为 `HH:MM:SS.mmm`（保手输原文，下次外部变更才规范化）。**手测点**：剪切/编辑器/工作台三处空格与方向键走带、I/O 设点；代理开启时导入 AVI→自动代理→播完切换；剪切页时间字段输入非法值回滚。
- [x] **R2-3** `useHotkeys` 页面激活门控（M11 新快捷键前置，否则 Cut 与 Workbench 的 I/O 同时响应） → **—（工程批次，M11-8 前置）· `ProductPreview`/`TaskProgress`/`hooks` · TC-005**
  - **落地内容**（2026-09-25）：`useHotkeys` 加 `enabled = true` 第二参——false 时**不挂监听**（effect deps `[enabled]`，handler 仍走 ref），头注释写明契约：App 当前按页条件挂载（挂载即激活，调用点默认即可），**M10-1 keep-alive 落地后各页必须传激活态**，否则隐藏页快捷键仍响应（M10 冲突清单 ③）；`usePlaybackHotkeys` 透传 `enabled`（原 handler 内早退改为不挂监听）；Workbench 成品模式 Delete 的手动 mode gate 换成 `enabled` 参（全库唯一"挂载但不激活"的现存调用点，其余 6 个调用点逐一核对均为挂载即激活、无需接线）。**验证**：`tsc`/`eslint` 0 · vitest 36 全绿 · `vite build` 通过。**披露**：mode 经异步上下文转换（`removeSource` 确认弹窗后）时的 effect-flush 毫秒级窗口内，走带键由"响应"变"忽略"（方向保守、实际不可观测）；**M11-8 接线新键时沿用 enabled 门控、勿复制调用漏传**。门控的挂载/摘除断言需 DOM（Vitest node 环境测不了），待 M10-1 落地时连同 `useTauriEvent` 一并补 jsdom 渲染测试（作 M10-1 验收项）。
- [x] **R2-4** ESLint 基线 + tsconfig `noUncheckedIndexedAccess`（可选） → **—（工程批次）· 构建配置（eslint/tsconfig）· TC-005**
  - **落地内容**（2026-09-25）：`tsconfig.json` 开启 `noUncheckedIndexedAccess`（PLAN 标"可选"，**选择开启**——M11 时间线核心大量数组操作前装上编译期防线）→ **44 处**下标访问判空适配（13 文件；全部为类型层收窄或等价重写，防御分支在既有不变量下不可达，两轴 CR 逐处核对行为等价；`realCutStart` 的 BUG-007 落点语义零变化）。`eslint.config.js` 升 **type-aware**（`recommendedTypeChecked` + `projectService`）：显式启用 `no-floating-promises`（存量零命中）与 `no-misused-promises`（揪出 1 处：剪切页 footer 内联 `onClick={async…}` → 抽 `changeDir` + `void` 调用）、`no-unnecessary-type-assertion`（删 3 处冗余断言）；`no-unsafe-*` 等 17 条存量噪音规则显式 off（含 5 条 strict/stylistic 档预关闭声明），配置注释写明"off 之外推荐集内其余 type-aware 规则随升级隐式生效"。lint 耗时 4.1s → 9.8s（≈2.4x，pre-commit 不跑 lint、可接受）。**披露**：changeDir 与旧内联实现同样依赖 `void` 惯例、`pickDirectory` reject 时同为 unhandled rejection（等价未补洞，属既有模式）。**验证**：`tsc`/`eslint` 0 · vitest 36 全绿 · `vite build` 通过。**手测点**（防御性改动、预期无观感变化）：工作台时间轴点击 seek 与插入指示线、Cut 页"更改目录"、倍速按钮循环、成品连播跨段、素材卡缩略图。
- [x] **R2-5** 死代码清理：`App.css` 整文件 + main.tsx import、`TaskStatus::Probing`、4 处 `#[allow(dead_code)]`、TaskProgress 死三目、Editor CropControls `rect` prop、`fileTimestamp`/`EditorTool` 过度导出、package.json 删 `less`、tailwind 两包移 devDependencies → **—（工程批次）· 多模块 · TC-005**
  - **落地内容**（2026-09-25）：删 `App.css` + main.tsx import；删 `TaskStatus::Probing`（lib.rs 枚举值 + manager.rs 两处 busy-match 分支 + 前端 types `"probing"` + services/tauri.ts 关闭守卫比较）——Spec 轴三层证据确认无兼容风险（git 全史从未构造过该值、history.json 只落终态、旧数据即便含它也只是整文件解析降级为空列表）；删 5 处 `#[allow(dead_code)]` 属性（walkthrough 记 4 处、现 5 处；grep 证实 TauriEmitter/add_output/submit/cancel/normalize_args 全部有真实调用者，cargo 0 warning 佐证）；修 TaskProgress percent 死三目；`fileTimestamp`/`EditorTool` 去 export（均模块内使用）；package.json 删 `less`（零引用）、`@tailwindcss/vite` + `tailwindcss` 移 devDependencies（均为构建期消费，无运行时 import）。types 四字段加"暂未消费"注释（displayDeg/subtitleCount/videoTimeBase = 后端发送前端未用；etaSeconds = 后端 payload 恒发 null、值归 R3-4）。**走空的两项**（清单过时，代码已不存在）：Editor CropControls（R1-4 被 CropFields 取代）、drawingRef。**规格同步**：DESIGN §7 枚举图 + §8.1 注、UI.md §9.9 关闭确认措辞随 Probing 删除同批更新（CR 两轴抓到的 P1，已修）。**披露**：`pnpm-lock.yaml` 未随 package.json 更新——**需在正常终端跑一次 `pnpm install` 重新生成 lockfile 后一并入库**（新环境 `--frozen-lockfile` 会失败）；`.zcodeignore`（工具产物）已从本批暂存区摘出、去留待用户定。**验证**：tsc/eslint 0 · vitest 36 · `vite build` · cargo test 81+5 全绿（0 warning）· check-docs 五绿。

### R3 —— M12-2 前实施

> **关联**：—（工程批次，无 FR）　·　**验收**：—　——　执行：TESTING.md TC-005 + TC-001~003 回归

- [x] **R3-1** probe 缓存改 LRU 逐条淘汰（原口径：现 ≥512 整体 clear，preview 高频提交会周期性清光关键帧缓存；FFMPEG.md §6.5）：四张探测缓存（media/facts/keyframe/duration）改 `LruEntry{value,stamp}` + 全局原子戳，命中刷新、达限逐出最久未用一条、覆盖已有键只刷新不逐出；cap 测试重写为 LRU 语义 + 补达限覆盖边界测试；规格（FFMPEG.md §6.5）与 AGENTS §8 坑表同批更新（2026-09-26，代码 `bad3096`） → **FR-313（缓存）· AC-313-1 · `ffmpeg/probe.rs` · TC-004**
- [x] **R3-2** 取消清理由 TaskManager 按 kind 统一管理（替代 pending_proxies 手工模式）：新增 `TaskManager::submit_internal(sink, kind, label, dedup_key, job)` —— 同 `(kind, dedup_key)` 活动任务复用既有 taskId，登记表 `(kind,key)→taskId` 由 TaskManager 持有、`run_cleanup` 终态统一回收（完成/失败/取消含排队取消全路径）；generate_proxy 三步手工簿记（自建 HashMap + cleanup 钩子 + is_active 自愈）整体迁移，删无调用方的 `TaskManager::is_active`；提交入口重构为私有 submit_core（旧路径行为逐语句等价），顺带消除旧"submit 后再登记"两步竞态（2026-09-26，代码 `4a8c6d4`） → **FR-361 · FR-362 · AC-362-1 · `task/manager.rs` · TC-004**
- [x] **R3-3** snapshot 过滤 internal 任务（否则常驻 preview 任务令关闭窗口确认失效）：snapshot() 过滤 internal（list_tasks 两个消费方——任务面板补元数据、关闭守卫——均不可见）；`StatusPayload` 加 `internal` 标记、**事件照常派发**（useProxyPreview 完成事件链路不受影响），TaskProgress 凭标记跳过建行；TaskSnapshot 不加字段（CR 抓到死字段，snapshot 先过滤再构造恒 false）；TaskManager::is_active / 关闭守卫 / 历史落盘白名单均不改即正确（2026-09-26，代码 `4a8c6d4`） → **FR-360（面板可见性）· AC-360-1 · `task/manager.rs` · `services/tauri.ts` · TC-015**
- [x] **R3-4** 进度节流样板收敛（立项时记 7 份；2026-09-25 过度工程审查复核现为 **9** 份）+ **speed 接通**（原 speed 恒 None，前端速度列空壳）：九处节流样板收敛为 `commands::ProgressThrottle`（200ms 门 + 收尾恒放行）；`set_progress(percent, speed)` 接通 speed（`-progress` 的 `speed=`，两位小数）；ETA 调和估计 `estimate_eta`（剩余≈已耗×(1−p)/p，p<5%/收尾不报）；任务面板接通速度与"剩余"显示、终态清空。**顺带登记并修复 `BUG-013`**：pipeline 归一化/concat 阶段进度公式自 M5 起为绝对值恒被 clamp 顶格 100%、ETA 恒不报，补 `/(n+1)` 除数（2026-09-26，代码 `9275363`） → **FR-361 · AC-361-1 · `ffmpeg/progress.rs` · `services/tauri.ts` · TC-004 · TC-015**
- [x] **R3-5** `prepare_output` 提交前导抽取（4 份；`finalize_output` 消除"先删后改名"半已由 `R4-2` 做掉）：`commands/mod.rs` 新增 `PreparedOutput` + `prepare_output(final_base, token_seed)`——解析输出目录/文件名、create_dir_all、解析 ffmpeg/ffprobe sidecar（提交期失败不占队列）、生成提交级令牌；crop/rotate/merge/pipeline 四份重复前导各收敛为一次调用 + 解构（错误文案逐字保留）；merge/pipeline 传请求路径（容器作业体内才定，ADR-033 自洽）、crop/rotate 传容器校正后最终名（2026-09-26，代码 `3c27ad4`） → **NFR-008（输出前导/磁盘预检）· `commands/*.rs` · `commands/pipeline.rs` · TC-004**
- [x] **R3-6** parking_lot 统一锁中毒策略；`cargo fmt --check` 纳入流程（"输出=输入比较改 canonicalize"一条**已提前由 `R3-7` 完成**）：引入 `parking_lot 0.12`（tauri 传递依赖、零新增构建开销），全仓 std `Mutex`/`Condvar` 迁移——manager 32 处 `lock().unwrap()`、history `into_inner`、probe `lock().ok()?` 静默吞、lib/worker unwrap，「裸 unwrap / into_inner / 静默吞」三种中毒策略并存彻底消除（不中毒 ⇒ 作业体 panic 后锁不再永久失效，R4-1 隔离更稳）；`cargo fmt` 全仓收编（格式化文件经 rustfmt 重放比对确认零逻辑夹带），`--check` 挂进 pre-commit（cargo 缺失降级跳过）并入 AGENTS §2/§4 完事标准（2026-09-26，代码 `3c27ad4`） → **NFR-006 · NFR-007 · `task/manager.rs` · `task/worker.rs` · TC-004**
- [x] **R3-7 输出=输入同一性比较归一化**（2026-09-24 提前实施，原属 `R3-6` 第二条；**登记为缺陷 `BUG-011`**）：新增 `fs::same_path(a, b)` —— `std::fs::canonicalize` 两侧（消大小写、`.`/`..`、末尾点/空格），输出路径**还不存在**时退回"父目录 canonicalize + 文件名"，父目录也解析不了才退回原始比较；Windows 下比较不区分大小写（仅 ASCII 折叠）。**五处守卫收敛为一份**：`fs::reject_if_input_equals` 同时服务"提交期（请求路径）"与"容器校正后复查"，四处命令改为调用它、删掉各自的重复注释与文案。**实测澄清**（避免把猜测写进文档）：`/` 与 `\` 混用、`./` 前缀在 Rust `Path` 里**本来就相等**（按组件比较），真正会被逐字符比较放行的是**大小写 / 末尾点空格 / `..` 绕行**；`movie.mp4.` 实测写入确实改到 `movie.mp4`。**定性**：守卫的意图（"不得覆盖源文件"）在改动前的代码注释里就写明，只是比较方式漏了——**按 `BUGS.md` §1 记 BUG**（数据丢失级影响，不按技术债降级），规格侧在 `DESIGN` §13 补明口径（该节即 NFR-012 的载体） → **BUG-011 · NFR-012 · `fs.rs` · `commands/*.rs` · TC-039**

### R4 —— 第二轮审查整改（2026-09-19 立项，来源 archive/code-review-2026-09-19.md）

> **关联**：—（工程批次；其中 6 条为**缺陷修复**，登记见 [BUGS.md](./BUGS.md) `BUG-001`–`BUG-006`；`R4-8` 另收真机首跑缺陷 `BUG-007`–`BUG-009`，`R4-9` 收 `R4-4` 实施时同族复查发现的 `BUG-010`）　·　**验收**：各条以其回归 TC 为准　——　执行：TESTING.md §3.4（TC-019–TC-029）
> **排期**：**排在 M11-0 之前** —— §3.1 的作业体会被 M11 的切割/波纹删除放大（panic 一次即泄漏并发槽），§3.3 涉及的 `ClipTimeline` 正是 M11-1/2/4/6 要重写的组件：先修是顺手，M11 后修是返工。

- [x] **R4-1 [P0] 作业体 panic 隔离**（`task/worker.rs`）：新增 `run_job_isolated`——`catch_unwind(AssertUnwindSafe(..))` 包住 `job(&ctx)`，panic 收敛为 `Err("任务内部错误：<panic 内容>")` 并入日志，让既有终态处理（`record_terminal` / `run_cleanup` / `task_finished`）照常执行；补单测（模拟 panic → 任务 Failed + 清理钩子照跑 + 连续两次 panic 后并发位仍可用） → **BUG-001 · NFR-006 · `task/worker.rs` · TC-019**
  - **⚠ 边界（已裁决）**：`[profile.release]` 原按 Tauri 体积建议设了 `panic = "abort"`，会让 `catch_unwind` 在 release 下失效（panic 直接终止进程）。**2026-09-21 裁决保留 `unwind`**（见 [DECISIONS.md](./DECISIONS.md) `ADR-034`），即本条隔离在发布版同样生效。
- [x] **R4-2 [P1] 输出原子替换（6 处）**：新增 `src-tauri/src/fs.rs` 的 `atomic_replace(part, final)`——只做一次 `std::fs::rename`（Windows 走 `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`、Unix 走 `rename(2)`，目标已存在时**由系统替换**，失败则两边都原样保留），取代"先 `remove_file(目标)` 再 `rename`"；错误信息一律带 `.part` 完整路径。6 处全部改走它：`cut.rs` `crop.rs` `media.rs` `merge.rs` `pipeline.rs` `rotate.rs`（含 R3-5 遗漏的 cut / media 两处，也去掉了吞掉删除错误的 `let _ =`）；补 3 条单测（替换已有文件 / 目标不存在 / 目标不可替换时旧文件与 `.part` 双保且错误含路径）+ 1 条 e2e（真实产物替换已有目标、不留 `.part`） → **BUG-002 · NFR-007 · `fs.rs` · `commands/*.rs` · TC-020**
- [x] **R4-3 [P1] 指针拖拽收尾兜底（4 处）**：新增 `src/utils/pointerDrag.ts` 的 `beginPointerDrag(onMove, onEnd)`——window 上收 `pointermove`/`pointerup`/`pointercancel`，`pointermove` 内判 `buttons === 0` 即收工（窗口外松手时 `pointerup` 不派发），收尾只执行一次，返回值 `detach` 供组件卸载只摘监听；四处拖拽全部改走它：`hooks/useDragSort`（合并页列表 / 工作台素材卡 / 时间轴块）· `components/Timeline` 双手柄 · `components/ClipTimeline` 池→轴 · `components/CropOverlay`（原参考实现，就地收敛）；顺带给 `Timeline` 手柄补 `e.button !== 0` 起手判定 → **BUG-003 · `VideoPlayer`/`Timeline` · `ClipTimeline`/`CropOverlay` · `ProductPreview`/`TaskProgress`/`hooks` · TC-021（手工）**
- [x] **R4-4 [P1] `pxToCrop` 钳制 + 边界矩阵**（`utils/crop.ts`）：**锚点 `x`/`y` 先钳到 `[0, dims - MIN_CROP_PX]`**，再按锚点到右/下边界的剩余空间收缩 `w`/`h`；`x + w == dims.w` 恰好压界仍允许（只有严格 `>` 才收缩）。**锚点上界与收缩步都用新加的 `evenFloor`（向下取偶）**——奇数尺寸下两处都不能就近取偶：`dims.w=101` 时上界就近取偶会给到 `86`（本该 `84`，`86+16=102` 已放不下），收缩步就近取偶会把剩余空间 `17` 给成 `18`（`84+18=102 > 101`）。边界矩阵用**一次性命令级脚本**（`node --experimental-strip-types` 直跑 TS，脚本不入库）验证：14 组期望值 + 4000 组随机扫描 = 12730 断言 0 失败，**同一矩阵在修复前实现上越界 993/1554**；矩阵已按含期望值的形式记入 [TESTING.md](./TESTING.md) TC-022 供 M11-0 落 Vitest。**验收口径**：代码修复 + 矩阵记录；**自动化单测随 M11-0 的 Vitest 交付**（TESTING TC-022 原就注明），TC-022 的真机手工半仍待发起 → **BUG-004 · AC-351-1 · `pages`/`utils`/`types` · TC-022**
- [x] **R4-5 [P2] 缩略图单张失败不中止整批**（`commands/media.rs`）：抽帧循环抽成 `generate_file_thumbs_sync(cache_dir, ffmpeg, inputs)`（app 路径与 sidecar 解析留在 `generate_thumbnails_sync`），单张失败（抽帧非零退出 / 产物没落盘）由 `return Err("生成缩略图失败：…")` 改为 `log::warn!` + `continue`，与同族 `generate_clip_thumbs_sync` 口径统一（那边顺手补上同样的 warn——两个函数现在结构逐行同构，收敛留给 `R2-2`/M11-0）；**整批性失败仍报错**（ffmpeg 起不来），**整批都失败**时返回空列表（前端只见占位图，已登记 HANDOFF 未决问题表）。补**命令级回归**（真实 sidecar + lavfi 自建夹具，含一个"名为 mp4 实则不是视频"的坏文件）：断言整批不失败、坏文件被跳过、其余两张返回且缩略图真的落盘——**把 `continue` 换回 `return Err` 该用例立即失败**（灵敏度已验证）；sidecar 缺失时打印 skip 通过 → **BUG-005 · AC-331-1 · `commands/*.rs` · TC-023**
- [x] **R4-6 [P2] 输出容器/扩展名口径统一**（依 `ADR-033`）：新增 `fs::with_container_ext`（纯校正）与 `fs::output_path_for`（校正 + **同名不静默覆盖**）。逐命令定容器：`cut` 极速=源容器/精确=mp4；`crop` 固定 mp4；`rotate` 元数据=源容器/转码=mp4（三者类别由用户选的模式决定，提交期即可定）；`merge` / `pipeline` 的类别**取决于探测结果**，故容器决策与 `.part`/最终名都在**作业体内探测之后**才定（`DESIGN` §8.1/§8.2 要求探测与检查按运行时的文件状态做）；`pipeline` 还要等**归一化判定**——`plans` 全 copy 但中间件参数不一致触发归一化时，归一化本身就是一次重编码（`ADR-033` ②），容器仍按 mp4，故其命名决策放在归一化之后；`DESIGN` §8.3 的容器口径行与 `ADR-033` 状态列（① 的 copy 类含"全 copy 的工作台拼接"）已同步。`.part` 与成品共用同一扩展名（ADR-033 ④）。**顺带修掉两处**：① 前端只按它算出的名字做"同名才追加时间戳"检查，而扩展名校正发生在后端——校正后可能撞上既有文件，故 `output_path_for` 只在"因校正而改名且新名已存在"时补时间戳（决策 #19 不被绕过）；② `merge`/`pipeline` 的 `ctx.add_output` 原先记的是**未校正**的请求路径，校正改名后会往任务面板/历史里写一个不存在的产物路径，现改记实际落盘路径。回归：单测 4 条（命名校正 / 源扩展名回退 / 同名兜底 / 校正后撞输入文件报错）+ e2e（matroska 源：copy 产物仍是 matroska、重编码产物校正为 mp4） → **ADR-033 · NFR-007 · `fs.rs` · `commands/*.rs` · TC-029**
- [x] **R4-7 [P2] 代理判定纳入容器维度**（`utils/media.ts`）：`needsProxy` 补上容器维度（`DESIGN` §10 的判定规格本就是"容器 / 视频编码 / 像素格式 / 音频编码 **任一**不支持"）。容器判定**不能按扩展名**：`MediaInfo.container` 是 ffprobe 的 `format_name`，即**逗号分隔的候选解复用器列表**且只看文件内容不以名字为准（实测 mp4/mov/m4v → `mov,mp4,m4a,3gp,3g2,mj2`；mkv/webm → `matroska,webm`；avi → `avi`；flv → `flv`；ts → `mpegts`；wmv → `asf`；把 asf 内容改名成 `.mp4` 探测出来仍是 `asf`），故实现为**按首位解复用器比对白名单** `NATIVE_CONTAINERS`（ISO-BMFF/QuickTime 家族 + Matroska 家族）——首位即 ffprobe 选中的那个（实测九种容器的首位依次是 `mov`/`mov`/`mov`/`matroska`/`matroska`/`avi`/`flv`/`mpegts`/`asf`），**判不出来一律按不可播**（宁可多生成一次代理，也不让用户面对黑屏）。**口径对齐**：`DESIGN` §10 的处理范围补齐 FLV / WMV（原文列 7 项、`VIDEO_EXTENSIONS` 是 9 项），并在该节写明"处理范围按扩展名、预览范围按解复用器名，两套命名空间不可混用，前者是后者的容器超集"；`VIDEO_EXTENSIONS` 九种容器现各有明确结论。命令级矩阵（一次性脚本）**27 条断言 0 失败**：九种容器逐一断言（`avi`/`flv`/`ts`/`wmv` 四处由"不代理"翻转为"代理"，即本缺陷）、其余三维回归（h265 / 10bit / ac3 / 多音轨 / 无音轨 / vp9+opus / vorbis）、容器串健壮性（大小写、空格、空串、`unknown`、跨族列表按首位判）、`wantsProxy` 三态；`cargo test` 另锁一条**跨层契约**——`container` 必须原样保留 `format_name`（不得"友好化"成展示名），否则前端白名单会静默失效。**验收口径**：代码修复 + 矩阵记录；**自动化单测随 M11-0 的 Vitest 交付**，真机预览半复用 `TC-018`（其示例 AVI 正是"容器不可播而编码可播"的典型）待发起 → **BUG-006 · NFR-010 · `pages`/`utils`/`types` · TC-024**
- [x] **R4-8 真机首跑缺陷修复**（2026-09-21，来源 [gui-e2e/README.md](./gui-e2e/README.md) 首跑 → `BUG-007`–`BUG-009`）：**输入侧** `-ss` 改用 `fmt_seek`（+1µs、6 位小数），杜绝吸附值被三位小数舍到目标时刻之前而倒退一个关键帧（**输出侧** seek 与 `-t` 仍用 `fmt_sec`）；`parse_keyframes` 只取行内首个 CSV 字段，带额外空字段的行不再被整行解析静默丢弃；新增 `realCutStart()`（≤入点的最近关键帧，二分）+ `Timeline` 落点虚线 + 界面「实际入点」提示，片段时长按真实落点算。**`BUG-008` 的真机复跑（`TC-030`）待用户发起** → **NFR-004（DESIGN.md §2）· `ffmpeg/command.rs` · `ffmpeg/probe.rs` · `components/Timeline` · `components/CutEditor` · `pages`/`utils` · TC-025–TC-027**

- [x] **R4-9 [P1] `cropToPx` 边缘对齐**（`R4-4` 实施时的同族复查发现，`BUG-010`）：`cropToPx`（归一化→像素，**拖拽框选**走这条路）原先对左右/上下边缘**各自**就近取偶，叠加后 `x + w` 可超画面 1~2px（1920 宽下贴右边界 `x=6, w=1916 → 1922`；奇数尺寸整幅 `101×57 → h=58 > 57`），而越界只在**作业体内**的 `align_rect` 被拒。修法：宽高改由**对齐后的边缘**相减得出（`right`/`bottom` 先就近取偶、再收进画面可用的偶数边界 `evenFloor(dims)`），`x`/`y` 也一并收进画面（奇数尺寸下 `nx=1` 的就近取偶会给到 `dims + 1`）。命令级扫描：3 组尺寸 × 3688320 样本**越界 0**（修复前 1920×1080 为 792、1280×720 为 0、101×57 为 19000/1844160）；退化输入（单击 → `nw=0`）在奇数尺寸下也落在画面内（`x=100 ≤ 101`，修复前 `102`）→ **BUG-010 · AC-351-1 · `pages`/`utils`/`types` · TC-028**
  - **仍待做**：**提交期**预检（`check_pipeline` 目前不查裁剪越界，越界要等作业体内的 `display_crop_rect → align_rect` 才报错）——仍归 [技术任务 `T-003`](#技术任务t)，本条只保证前端不再产出越界裁剪。

> **同源但按技术债处理的项**：§4.1 校验时机、§4.4 锁回调、§4.6–4.8 前端健壮性、§5.3 的 `locked_encoder` 白名单 → [技术任务 `T-003`](#技术任务t)。
> **已排除项**（报告 §6，不重复讨论）：`VideoPlayer` 缺 `ended` 监听、`ProductPreview.switchTo` 竞态。

## M11 单轨时间线核心（TIMELINE.md §17，2026-09-16 立项，实施中）

> **关联**：FR-17xx（**随 M11 首个功能批次 M11-1 发号**——M11-0 是前置重构、不产生新需求；需求本身在 TIMELINE.md §17）　·　**验收**：AC 见 TIMELINE.md §17.9 ①~⑥　——　执行：TESTING.md §3.1（`TC-040` 撤销基线）+ M11-9 埋点报告

> 定位 = "拼接驾驶舱"（决策 #26）：只做让剪切合并更顺手的七个操作，规格见 TIMELINE.md §17。M9-3/M9-4 的逐块像素排布与整块拖拽是本里程碑地基。精度公式与撤销范式参照 Clypra（同栈开源编辑器）验证过的结论（[handoff-archive.md](./archive/handoff-archive.md)「时间线需求收敛」）；后端除 M12-2 预览变体外零改动。
>
> **实施方案已定稿（2026-09-17，[plans/M11.md](./plans/M11.md) §18，决策 #32）**：执行顺序调整为 M11-0 状态层/撤销基座先行（七操作都要经命令栈，PLAN 原列第 7 位的 M11-7 前置拆分）；几何/缩放滚动/播放头/修剪手势的实施设计见 plans/M11.md §18.2~§18.6。

- [x] **M11-0 前置重构**（plans/M11.md §18.1，无行为变化）：`utils/undo/` 命令模块（快照对 + 纯函数 builder + 钳制）+ 工作台文档状态收敛（clips+timeline → 单一 EditorDoc）+ 既有操作全部改走命令栈 + 撤销单测基线（Vitest，6 条 Clypra 清单 + 钳制域） → **FR-17xx（待发号，TIMELINE.md §17.5）· AC 见 §17.9① · `ClipTimeline`/`CropOverlay`（+新增 `utils/undo`）· TC-040**
  - **落地内容**（2026-09-24）：`utils/undo/{types,commands,store}.ts` —— 命令 = 冻结快照对（`before`/`after`，结构共享）；9 个 builder（剪出片段 / 追加入轴 / 插入 / 重排 / 移出时间轴 / 移除并删除 / 切割 / 修剪 / 批量合成）；`null` 语义 = no-op/取消/非法落点不入栈；`createUndoStack(limit=100)` 纯核心 + `useUndoStack` React 适配（`applyRaw` 供旁路状态）；id 在**构建时**分配并冻进 `after`（重做复现同一 id）。工作台 `clips`+`timeline` 收敛为单一 `EditorDoc`，**六处**结构操作（剪出 / 批量剪出 / 追加入轴 / 拖入插入 / 重排 / 删除片段）改走 `execute`——其中"删除片段"**保持 M11-0 之前的旧语义（片段同时出池）**，§17.4 的波纹删除（只出轴、池保留）按 §18.5 归 M11-4 落地；加工编辑与素材删除走 `applyRaw`（旁路状态）。
  - **测试载体**：`vitest` 5.0.1 已就位（`pnpm test` = `vitest run`；`vitest.config.ts` 与 `vite.config.ts` 分开，node 环境）；基线 **19 条用例**（6 条 Clypra 清单 + 钳制域 + 栈规则），见 `src/utils/undo/commands.test.ts`。**临时对照**（跑完即删，故不留文件）证明无行为变化：把"改动前的逐字实现"与命令层放在同一序列上跑 **3000 步随机手势（含 467 次 no-op）→ 文档逐步 deep-equal**，且每个 no-op 都对应"旧实现同样没改文档"。
  - **本次不接线**：Ctrl+Z / Ctrl+Shift+Z 的按键接线与右键菜单里的撤销项归 **M11-7**（§18.8）；`buildSplit`/`buildTrim`/`buildRemoveFromTimeline` 已实现并有单测，UI 接线分别归 M11-5 / M11-6 / M11-4。
- [x] **M11-1 精度基座**：ClipTimeline 改 PPS 世界坐标（承接 M9-3，块宽差值法 TIMELINE.md §17.3）；`utils/time.ts` 总帧数时间码；几何侧最小块宽 ≥6px 的动态 PPS 下限（**帧级 ≥1 帧钳制已在 `M11-0` 的命令层**，见 `utils/undo/commands.ts`）；帧时间埋点接入 logger（供 M11-9 用） → **FR-17xx（§17.3）· AC 见 §17.9② · `ClipTimeline`/`CropOverlay` · `pages`/`utils`/`types` · TC 待建**
  - **落地内容**（2026-09-25）：新增 `ClipTimeline/geometry.ts`（块宽**差值法**、`clampPps` 硬区间 [2,500] + 动态下限 `6/最短片段`、`fitPps` 适应窗口、`tickStep` ≥目标间距语义——剪切页 `pickTickStep` 是 ≤16 格语义不可混用，plans/M11.md §18.2 公式已更正；随机扫描锁相邻块无缝，CR 复核换朴素法会爆 487 处违例）；ClipTimeline 删 M9-3 容器比例排布（trackW/MIN_BLOCK_W=28），块/刻度/播放头/seek 全走 geometry，pps 为组件内派生值（`M11-2` 提页面级并接缩放）；`time.ts::formatTimecode` 总帧数时间码（先取总帧再分解，59.99s 帧字段不再溢出，刻度标签随之变 `HH:MM:SS:FF`）；`utils/perf.ts` 埋点（5s 窗口 P50/P95/max/drops>1.5×预算：drag=rAF 帧间隔挂 `useDragSort` 新 `onDragActive`、undo=span 包 `execute`；playing 归 `M11-3`），M11-9 取数就绪；**FR-1730~1735 随批发号**进 TIMELINE §17.3 行尾。**披露**：块最小宽 28→6px、比例铺满→适应窗口（±1px）、刻度标签变帧时间码——§17.3/§18.2 背书；动态下限撑出视口暂被 overflow-hidden 裁剪（最短片段占比 <6/视口宽才触发，M11-2 接滚动）。两轴 CR 均 PASS，采纳 7 条 P2（硬上限软区间裁决、≥6px 数学下界 5px 披露、seekAt 收口 total 等）。单测 53→76（geometry 11/perf 7/time 5）。**手测点**：多片段混排块无缝、空白 seek（右端死区=末尾）、刻度时间码、时间轴四类拖拽与 Merge 列表/素材卡拖拽回归、极短片段动态下限。**已提交**（代码 `13e584f` + 本次 `docs:` 回填）。
- [x] **M11-2 缩放与滚动**：页面级 PPS 状态 + 钳制（2~500 px/s）；Ctrl+滚轮以鼠标为中心、+/−、\\ 适应窗口 → **FR-17xx（§17.3）· AC 见 §17.9② · `ClipTimeline`/`CropOverlay` · TC 待建**
  - **落地内容**（2026-09-25）：`overflow-x-auto` + 世界坐标层随内容滚动（播放头/块/刻度无补偿计算，§18.3）；滚轮原生**非 passive** 监听（React 挂 root 的 onWheel 是 passive，preventDefault 无效）——无 Ctrl = deltaY/deltaX 转 scrollLeft，Ctrl+滚轮 = 鼠标锚点缩放（`exp(−deltaY×0.0015)`），scroll 补偿走 `useLayoutEffect([pps])` 同帧无跳动；+/− 键视口中心锚（`KEY_ZOOM_FACTOR=1.2` 实现自定）、\ 适应窗口；pps 为 Workbench 页面级 state（初始 `PPS_MIN`），手动缩放前自动跟随适应窗口（M11-1 行为延续）、首次手动操作交还控制权。plans/M11.md §18.3 补六条实施注记。**CR 两轴**：Standards PASS；Spec 先 FAIL 后 PASS——真 P0 = 接滚动后 `seekAt` 忘加 `scrollLeft`（滚动态点击 seek 系统性偏移；教训：迁移类批次里"逐字节未改动"的代码也会因环境前提变化失效，接滚动的批次必须重查全部 clientX→世界坐标换算）；P1 = 连发滚轮同帧缩放基准取上一档旧 scrollLeft 致锚点漂移（修 = `base = pendingScroll ?? el.scrollLeft`）；另 5 条 P2 全修。验证：tsc/eslint 0 · vitest 76 · build · check-docs 五绿。**手测点**：Ctrl+滚轮锚点缩放（指针下时刻不动）、滚轮横滚、+/−/\ 键、放大滚动后点击 seek 落点、素材增删自动适应、拖拽重排回归。**已提交**（代码 `25ea1be` + 本次 `docs:` 回填）。
- [x] **M11-3 播放头**：ref 直改 DOM 脱离 React 渲染路径（TIMELINE.md §17.9）；点击/拖动标尺 seek；播放头吸附片段边缘（8px/PPS 窗） → **FR-17xx（§17.9）· AC 见 §17.9② · `ClipTimeline`/`CropOverlay` · TC 待建（帧时间埋点）**
  - **落地内容**（2026-09-25）：Workbench 持权威 `playheadRef`/`playheadElRef`/`timelineScrollRef`/`ppsRef`；ProductPreview rAF tick **四连直写**（播放头 ref + 时间轴 transform + 进度条 `.value` + 跟随滚动 0.9/0.1 缘触发）——播放路径 **0 个 setState**（§17.9② 口径）；React playhead 降频为离散镜像（seek / 段切换 `switchTo` / 暂停 = playing 沿 + video onPause / 结束 / 复位五个同步点，`onPlayheadDiscrete` 事件内直写 transform 防 state 同值 bail-out 漏写）；进度条非受控（defaultValue + tick 每帧直写 + `draggingRef` 门控防拖动回弹 + `[playhead]` effect 离散同步）；ClipTimeline 播放头 span 改 transform 定位（React 渲染不再定位）、注册双 ref；标尺 seek 加片段边缘吸附（`geometry.snapToEdge` 纯函数 3 用例，8px/pps 窗，按住 Alt 旁路 = §17.8 的 M11-3 半，修剪侧归 M11-6）；`usePlaybackHotkeys` 加 `getCurrentTime`（离散镜像下 ←/→ 取实时位置；三个旧调用方不传行为不变）；切回成品模式 `productSeek(playheadRef.current)` 防丢播放位置。**CR 两轴均 FAIL 后修至双 PASS**：Spec 2×P0（进度条每帧直写整条缺失；pause/段切换未进离散汇致读数冻结与模式切换丢位置）、Standards 2×P1（同族 + getCurrentTime 裁决必要）——**教训：降频镜像的离散同步点必须逐路径枚举规格列的每一项，漏一项就是用户可见回退**。plans/M11.md §18.4 补九条实施注记。**披露**：标尺"拖动 seek"（scrub）自 M9 起未实现（只有点击），注记⑨归后续批次补。单测 76→79。**手测点**：播放中进度条走带与读数跳准、暂停后读数对齐、拖动进度条不回弹、Alt+点击跳过吸附、播放中切模式再切回位置保持、缩放+播放的跟随滚动、DevTools commit 计数 0/帧。**已提交**（代码 `4a50970` + 本次 `docs:` 回填）。
- [x] **M11-4 选择与波纹删除**：单选高亮 + Delete 波纹删除（从 timeline 移除、池保留库存，决策 #13 一致） → **FR-17xx · AC 见 §17.9④ · `ClipTimeline`/`CropOverlay` · TC 待建**
  - **落地内容**（2026-09-25，**首个行为变更批次**）：波纹删除（块 ✕ / 拖出边界 / Delete）统一 `buildRemoveFromTimeline`——只出轴、池保留、可撤销；池卡 ✕ = `deleteFromPool` = `applyRaw` 真删不经栈（clips + timeline 双清联动，直接依据 §18.5 正文；可撤销版 = M11-8 右键「移除并删除池片段」复合命令）；`selectedClipId` 改独立 UI state（修复 R2-2 CR"成品模式 Delete 恒空"遗留项）——块点击 = 选中 + 进加工（过渡形态，M11-8 菜单后裁）、点空白 = seek + 取消、离开时间轴同步清选；Delete enabled = 有选中（全模式，时间轴常驻可见）；`reorderTimeline` 补 `setCheck(null)`（存量漏网：旧 check.items 按下标映射，重排后错位 500ms）；React.memo 推迟 M11-9（注记④：M11-3 已消灭逐帧重渲染，memo 需先稳定 useDragSort 引用）。**两轴 CR 均 PASS**，采纳：**TIMELINE §17.5「唯一例外」措辞被本批推翻**（池卡真删是第二个绕栈路径，§18.5 早有明文背书）——例外句扩为"两类不可逆联动清理"；**撤销栈快照复活风险**（池真删/素材删除后栈内快照仍引用被删实体，M11-7 接线后 Ctrl+Z 整切片换回）登记进 §18.9 风险表。undo 层零改动。**手测点**：块 ✕ / 拖出 / Delete 后池卡保留（行为变更核心）、池卡 ✕ 后轴上片段连带消失、加工视图 Delete 可用、点空白取消选中、波纹删除后接缝连续。**已提交**（代码 `daaa201` + 本次 `docs:` 回填）。
- [x] **M11-5 切割**：C/右键在播放头拆分（源内换算 TIMELINE.md §17.2），两条新片段入池入轴；播放头不在片段上时禁用 → **FR-17xx（§17.2）· AC 见 §17.9①③ · `ffmpeg/command.rs` · `ClipTimeline`/`CropOverlay` · TC-001（回归）+ 待建**
  - **落地内容**（2026-09-25）：`splitAtPlayhead`（playheadRef 权威值 → timeline 前缀和命中——命中求和与 `buildSplit` 内部 offset 求和**同式同源**（同 `productDurationOf` 同序累加），浮点逐位一致 → 成品时间直交 builder，源内换算/≥1 帧校验/no-op 全在 builder（M11-0 既有））+ C 键 useHotkeys（product 模式且有片段；**修饰键守卫** `!ctrl/meta/alt` 防 Ctrl+C 误触）。页面零新增校验、undo 层零改动、缩略图按新 key 自动重取；右键菜单入口归 M11-8（届时命中检测抽 geometry 勿复制）。**两轴 CR PASS**；采纳 P1 = **`BUG-012` 登记（open，归 M11-6 随修剪同域裁决）**：切割短半段 [1帧, 0.05s) 绕过导出映射阈值（`MIN_SEG_DURATION_SEC` 判空段 → segment:null = 整段保留）→ 用户要碎片段却导出整段源——FR-1735（≥1 帧）与 M6-8 空段口径的**规格内部冲突**，接线后首次用户可达；P2 = TIMELINE 更新日志归属修正（§17.5 例外句实落 M11-4）。验证：tsc/eslint 0 · vitest 79 · build · check-docs 五绿（Rust 未动未重跑 cargo）。**手测点**：播放头在片段中段按 C 一拆为二（池+轴各 +1）、贴近边缘 <1 帧按 C 无反应、播放中按 C 切在所见位置、切点非关键帧时两段徽标变 warn（重编码）、Ctrl+C 不触发切割。**已提交**（代码 `97c2dc6` + 本次 `docs:` 回填）。
- [x] **M11-6 边缘修剪**（B10 并入，决策 #29）：6~8px 热区光标；双向波纹修剪（位置重排自然成立）+ 源边界/最短时长钳制；修剪边缘关键帧吸附联动（S 切换，决策 #30；按住 Alt 临时关吸附，TIMELINE.md §17.8）；实时入/出点 tooltip + 徽标 copy/transcode 实时变化；双击边缘修剪到播放头 → **FR-17xx · AC 见 §17.9③ · `ClipTimeline`/`CropOverlay` · TC 待建**
  - **落地内容**（2026-09-25）：`geometry.findTrimEdge`（热区全局最近 ≤8px；相邻块共享边界 px 逐位相等，**按指针侧归属**消歧——压线左=左块出边、右侧含压线=右块入边，2n 条边全可达）+ `snapToKeyframe`（8px/pps，keyframes 未加载静默降级）；ClipTimeline 手势：beginPointerDrag ≥4px 激活（死区与 useDragSort 同参）、`computeTrim` **预览/提交共用**（看到即所得）、松手入栈一条、Esc/pointercancel（按 `last.type` 识别）丢弃、激活后吞 click（防每修一次切进加工视图）、修剪拖动挂 §18.6 drag 埋点、悬停光标只在块纵向范围（标尺区保 seek 语义）；**入边拖动几何披露**——块左缘被前缀和钉死（几何不可移动），指针位移映射源入点增量，反馈=块宽收缩+tooltip；出边界跟手且不钳 contentWidth（末块可向右延伸到源尾）；tooltip = 入/出总帧数时间码 + 新时长 + 徽标实时；S 键与设置项同源 write-through（App 新透传 `updateSettings`，修饰键不触发）+ Alt 旁路 + 关键帧按源懒加载（失败记空数组防重试）；预览融合 ref+300ms 尾随防抖 → payload → check_pipeline（预览期不叠加防抖）；auto-fit 拖动中跳过（防 pps 逐 move 重拟合）；双击边缘 = 修剪到播放头（`locateProduct` 自 splitAtPlayhead 抽出共用）。**`BUG-012` 裁决随本批落地**：命令层下限 `minSegSec = max(1帧, 0.05s)`，前端 `exportSegmentOf` 与**后端 `commands::valid_segment_span`（cut/pipeline 共用）**边界一致（1µs 容差）。**双轴 CR 一轮 FAIL 后修至 Standards 复审 PASS**（Spec 复审代理因基础设施故障未跑完，其 P0/P1 三项已逐一代码核实）：P0 = 后端 `> start+0.05` 严格校验未随裁决对齐（恰 0.05s 段**整单导出硬失败**，比旧行为更糟）；P1 = pointercancel 的 last 是取消事件非 null（误提交）、末块出边被 contentWidth 钳死（无法向右延伸）、auto-fit 拖动中重拟合（整页逐 move 重渲染）+ 激活后 click 泄漏。**教训：阈值对齐类裁决要把同一谓词的全链消费方 grep 干净（前端映射只是其一，后端提交期校验是另一）。**单测 79→87；cargo 81→82（8 条 sidecar e2e 本机常态 skip）。plans/M11.md §18.5 补 M11-6 注记①~⑬（含入边几何/清理项）。**手测点**：块边缘 8px 内 ew-resize、拖出边跟手+波纹、拖入边块宽收缩+tooltip、徽标实时、S 切换（设置页同步）、Alt 旁路、双击修剪到播放头、Esc 丢弃不入栈、修剪松手不切加工视图、末块向右拉伸、被修块恒 ≥0.05s。**已提交**（代码 `fd1481c` + 本次 `docs:` 回填）。
- [x] **M11-7 撤销接线**（B11 并入，决策 #29；**基座已在 `M11-0` 落地**——命令层 `utils/undo/`、快照对、6 条单测基线见 `TC-040`）：把 M11-4/5/6 新落地的操作（波纹删除 / 切割 / 修剪）全部接进命令栈，并接 Ctrl+Z / Ctrl+Shift+Z 与右键菜单的撤销/重做项（需 `R2-3` 的 `useHotkeys` 页面前置门控） → **FR-17xx（§17.5）· AC 见 §17.9① · `ClipTimeline`/`CropOverlay`（+`utils/undo`）· TC-040（基座）+ 端到端手工（待建）**
  - **落地内容**（2026-09-25）：undo/redo handler（按键调用同包 §18.6 undo 场景埋点；右键菜单的撤销/重做项**移交 M11-8、复用同一对 handler**——`undoLabel`/`redoLabel` 已备菜单文案）+ useHotkeys 接线：**全模式可用**（时间轴常驻可见，与 Delete 同口径）、栈空自然 no-op、输入焦点忽略内建（输入框内 Ctrl+Z = 原生文本撤销）、`e.code === "KeyZ"` 判定（布局无关，非拉丁键盘可用）+ 排除 Alt。**§18.9 复活清洗裁决（`FR-1737`）**：快照对携带全量 clips，携带片段的外部删除毒化全部历史 → 真删了片段的外部删除发生时**整体清栈**（`useUndoStack.clear` 接入 `deleteFromPool`/`removeSource`）；无片段素材的删除不清栈（files 不在文档快照，无复活可能，清了误杀合法历史）；`applyRaw` docstring 写明"删 clips 必须配 clear()"防新路径复发；不做 undo 前逐命令校验（毒化必然全栈性，清栈等价且更简单）。**快照语义披露（§17.5）**：撤销/重做恢复全量文档含彼时加工状态，栈顶命令之后的 rot/crop/lockRatio 旁路编辑会被随后的撤销一并回退（旁路不入栈的推论，单测锁定；不做旁路字段合并——会破坏 TC-040 逐字节一致契约）。加工视图死引用兜底 effect（撤销/真删后 mode 引用的片段消失 → 退回成品模式）；no-op 不清检测缓存（入栈返回值判定，同族六处——修掉"页脚永远停在正在检测"的隐患）。**双轴 CR**：Spec 一轮 FAIL（1×P1 + 5×P2）修至复审 PASS；Standards PASS（5×P2 全采纳）。**文档事故披露**：M11-6 批次注记编辑误删 plans/M11.md 的 M11-5 注记（随 `fd1481c` 入库），本批逐字恢复（对 `97c2dc6` 基准核实一致）。单测 87→89（clear 双向清空 / 旁路编辑快照回退）。**手测点**：Ctrl+Z 撤销切割/修剪/波纹删除、Ctrl+Shift+Z 重做复现同一片段 id（缩略图不重取）、栈空按 Ctrl+Z 页脚不变、池卡 ✕ 后撤销失效、删无片段素材后撤销历史保留、输入框内 Ctrl+Z 走文本撤销、撤销掉正在编辑的片段时预览区退回成品模式、撤销后页脚徽标 500ms 内刷新。**已提交**（代码 `4446899` + 本次 `docs:` 回填）。
- [x] **M11-8 菜单与快捷键**：右键最小集（TIMELINE.md §17.4）；C/S/Delete/Ctrl+Z/Ctrl+Shift+Z/+/−/\\ + 2026-09-17 需求表新增可行项（K/L 走带、A 追加入轴、Ctrl+E 导出、I/O 修剪选中片段到播放头）接线进 useHotkeys（输入焦点忽略规则不变；冲突项维持既有裁决，见 TIMELINE.md §17.8 状态表） → **FR-17xx（§17.4）· AC 见 §17.9① · `ClipTimeline`/`CropOverlay` · `ProductPreview`/`TaskProgress`/`hooks` · TC 待建**
  - **落地内容**（2026-09-25）：右键菜单（`FR-1738`）——自研 `components/ContextMenu`（createPortal + fixed + 视口内钳制每渲染重测 + Escape/外部 pointerdown 捕获段/再按右键三路关闭，无依赖）；片段菜单六条目（切割按播放头命中禁用 / 波纹删除 / 移除并删除池片段确认后走命令栈**可撤销**——兑现 §17.5 可撤销删除入口 / 加工 / 撤销·重做带操作名与空栈禁用）+ 空白菜单三条目（适应窗口经 `zoomFitRef` 句柄桥接）；空白 pointerdown 加 button 门禁（右键不误 seek）、修剪手势中不开菜单（块+视口双侧）。快捷键补全（`FR-1739`）——K 暂停（保留倍率）/ L 连按按 M7-6 档位循环（`PLAYBACK_RATES` 自 VideoPlayer 导出单一来源；倍率经 ProductPreview 新 prop 落双槽 video，新媒体加载重置 → onLoadedMetadata 补挂；非 1× 徽标）/ A 追加（选中优先·最新未入轴·已在轴 no-op）/ Ctrl+E（`exportDisabled` 自 JSX 提升共用）/ I-O 修剪选中片段到播放头（复用双击边缘实现）；C/S 键改 `e.code`（兑现 M11-7 注记⑧）。`blockAtTime` 抽 geometry 配 3 用例（M11-5"勿复制"承诺兑现）。**块点击裁决（M11-4 遗留）**：选中+进加工保留为长期行为，池卡 onOpen 不置选中维持。**双轴 CR**：一轮 FAIL（文档类 P1×3——TESTING.md TC-041/042 行熔断[历史锚点事故 M11-6 起即存在]、INDEX.md 追踪行漏更 + 代码侧 P2×10）→ 全修后双轴复审 PASS；披露：e.code 物理键位取舍（Dvorak）、菜单打开期间快捷键仍活跃（注记⑨）、全局右键不做 suppress（注记⑩）、a11y 记后续（注记⑪）。单测 89→92。**手测点**：块右键六条目、切割项命中禁用、移除并删除确认+可撤销、撤销/重做带操作名、空白右键+适应窗口、右键不误 seek、Esc 关菜单、K/L 加速徽标、A 追加三态、Ctrl+E、I/O 修剪、Esc 关菜单。**已提交**（代码 `298b433` + 本次 `docs:` 回填）。
- [x] **M11-9 性能验收**：100 片段夹具（gen-fixtures 串联生成）；对照 TIMELINE.md §17.9 预算出埋点报告（拖拽/播放头/撤销 P50/P95） → **FR-17xx · AC 见 §17.9② · `ClipTimeline`/`CropOverlay`（+`utils/perf`）· TC 待建**
  - **落地内容**（2026-09-25，**经用户裁决不做真机自动化取数**）：playing 场景埋点接线（ProductPreview rAF effect 起播开窗/停播冲刷——§18.6 三场景全部就位）；**撤销预算计量**（纯函数层 Vitest 临时脚本跑完即删）：100 片段重排 execute p50=0.003ms/max=0.289ms、undo max=0.126ms、redo max=0.011ms——**比 16ms 预算低两个数量级，命令层不是瓶颈**；composite×100 max=1.955ms、split/trim ≤1.3ms 亦有一个数量级余量；不落永久单测（计时断言 flaky），数字记录 TC-043 自动化半；**React.memo 裁决（M11-4 遗留）：不立项**（M11-3 已灭逐帧重渲染；复核条件 = 真机半 drag P95 超预算）；**三项权衡收口**（手势内 Ctrl+Z / 菜单快捷键活跃维持披露接受、全局右键维持不做）；**帧预算真机半固化为 [gui-e2e/cases-m11-perf.md](./gui-e2e/cases-m11-perf.md)**（TC-043 手工半 ⏳ 待用户发起，100 夹具生成命令 + 场景判定线已写入）。**CR**：合并双轴一轮（Spec PASS / Standards FAIL 1P1+5P2——TC-043 熔行第三次复发[python 表格锚点吞换行，教训入长期记忆 §2]）全修后复审确认六项全成立。单测 92（不变，计量为临时脚本）。**手测点**：真机半按 gui-e2e/cases-m11-perf.md 执行（[perf] 日志行判定 P95 ≤ 16.7ms）。**已提交**（代码 `116b46a` + 本次 `docs:` 回填）。

**验收**：AC 见 TIMELINE.md §17.9 ①~⑥ · TC-040（`M11-0` 撤销基线，已建）+ 其余待建（M11-9 埋点报告）（口径见 DESIGN.md §3；执行见 TESTING.md）

## M12 预览强化（TIMELINE.md §17.6，2026-09-16 立项，待实施）

> **关联**：FR-17xx（随 M11 首个功能批次发号）· 决策 #28　·　**验收**：AC 见 TIMELINE.md §17.6/§17.9⑥　——　执行：TESTING.md TC 待建

- [ ] **M12-1 连播改进**：ProductPreview 下一段预加载提前、边界停顿缓解；修剪拖动节流 seek 实时显示入/出点帧 → **FR-17xx · AC 见 §17.6 · `ProductPreview`/`TaskProgress`/`hooks` · TC 待建**
- [ ] **M12-2 渲染即预览**（决策 #28）：Rust 侧 Pipeline 任务加 `preview` 标志（输出 `app_cache_dir/preview/<令牌>.mp4`、TaskHandle internal 不进历史、进行中去重 = 新编辑取消旧任务）；前端纯无损时间线编辑停顿 ~1.5s 防抖自动渲染并播放真实成品，含重编码时回退虚拟连播 + 手动"精确预览"；`cache_usage`/`clear_cache` 覆盖 preview 子目录；check_pipeline facts 缓存（B15 项顺手做） → **FR-17xx · AC 见 §17.9⑥ · `commands/pipeline.rs` · `ProductPreview`/`TaskProgress`/`hooks` · TC 待建（决策 #28）**
- [ ] **M12-3 暂停帧服务 spike**（可选）：现有缩略图命令改造为 seek 单帧 RGBA → canvas；出"是否产品化"结论（红线：连续播放不走逐帧 IPC，TIMELINE.md §17.6） → **FR-17xx · AC 见 §17.6 · `services/tauri.ts` · `VideoPlayer`/`Timeline` · TC 待建（spike）**

**验收**：AC 见 TIMELINE.md §17.9⑥ · TC 待建（口径见 DESIGN.md §3；执行见 TESTING.md）

## M13 打磨（可选，视 M11/M12 体验决定，决策 #31）

> **关联**：FR-17xx（随 M11 首个功能批次发号）　·　**验收**：视 M11/M12 体验决定　——　执行：TESTING.md TC 待建

- [ ] **M13-1 缩略图条**：L0/L1 两层简化版（固定网格 + 长视频预算公式；铁律 = 滚动永不触发解码、缩放先画粗层拉伸图） → **FR-17xx · AC 视体验决定（决策 #31）· `ClipTimeline`/`CropOverlay` · TC 待建**
- [ ] **M13-2 标记**：M 添加 / 再按删除、Shift+M / Ctrl+Shift+M 导航、播放头吸附标记；不参与导出 → **FR-17xx · AC 视体验决定（决策 #31）· `ClipTimeline`/`CropOverlay` · TC 待建**
- [ ] **M13-3 多选拖拽**：Ctrl 多选整块插入重排（一次撤销一条） → **FR-17xx · AC 视体验决定（决策 #31）· `ClipTimeline`/`CropOverlay` · TC 待建**

## 技术任务（T）

> 与里程碑无关的独立工程任务：不产生新需求（无 FR），做完即勾选；编号 `T-001` 起（见 [INDEX.md](./INDEX.md) §3.1）。

- [ ] **T-001 消除 TIMELINE.md §17.4 ↔ plans/M11.md §18.5 的重复描述**：B2 迁移按"只搬不删"，两处对七操作的描述仍重叠；消冗余时只保留 `plans/M11.md` §18.5 的"接线方式"，行为规格留在 TIMELINE.md §17.4。**执行时逐条列出拟删条目交用户审阅后再删** → **—（文档）· 不涉代码 · TC-005**
- [ ] **T-002 清理空组件目录**：`src/components/{CropEditor,RotateEditor,MergeEditor}` 是 2026-09-13 遗留空目录（git 不跟踪）。先确认 R2-1 拆分是否复用这三个名字（复用则保留），再决定删除；**执行需用户放开"不碰代码"约束**（2026-09-25 过度工程审查已确认 R2-1 未复用这三个名字，删除条件满足，见归档 §5） → **—（工程·目录清理）· TC-005**
- [ ] **T-003 审查发现的一致性/健壮性收敛**（来源 [archive/code-review-2026-09-19.md](./archive/code-review-2026-09-19.md) §4.1/§4.4/§4.6–4.8/§5.3）：pipeline 裁剪越界预检提前到提交期（与 CropZoom 口径一致）；`record_terminal` 回调移出 `on_terminal` 临界区（当前 `if let` 临时量持锁至块尾，存在自死锁窗口）；`useTauriEvent` 与 Workbench `onError` 的 `generateProxy` 补 `.catch`；缩略图 effect 依赖 `[files]` 收敛为稳定 key（消除重复 IPC）；`locked_encoder` 增加白名单校验 → **NFR-006 · NFR-007 · `task/manager.rs` · `commands/*.rs` · `services/tauri.ts` · `ProductPreview`/`TaskProgress`/`hooks` · TC-004**
- [x] **T-004 把 R4 攒下的命令级矩阵转成 Vitest 用例**：`TC-022`（`pxToCrop`）、`TC-028`（`cropToPx`）、`TC-024`（`needsProxy` 容器维度）三组矩阵此前用 `node --experimental-strip-types` 跑一次性脚本，**载体已在 `M11-0` 就位**（`pnpm test`）——按 [TESTING.md](./TESTING.md) §3.4 表后注里记的**同域同种子**重跑并固化为 `src/utils/*.test.ts`（含为 `utils/media.ts` 的 `wantsProxy`/`containerPlayable` 补导出或用例入口）。**注意**：`TC-028` 的随机域是 3 组尺寸 × 3688320 组，直接固化会让 `pnpm test` 跑几十秒 → 固化时缩到能覆盖边界的最小样本并把缩减写进用例注释 → **—（测试载体）· `utils/crop.ts` · `utils/media.ts` · TC-022 · TC-024 · TC-028**
  - **落地内容**（2026-09-25）：`src/utils/crop.test.ts`（TC-022 静态边界一比一转写 + 4000 组随机不变量扫描；TC-028 三条复现值 + 3 组尺寸 × 2000 组交互选区扫描——样本量自 3688320/组缩减、域与种子 20260923 不变，缩减与第三尺寸组取 16×16 均披露在用例注释与 TESTING §3.4 注）+ `src/utils/media.test.ts`（TC-024 27 断言一比一：A 九容器 9 / B 其余三维 7 / C 容器串 7 / D wantsProxy 三态 4）；`utils/media.ts` 的 `containerPlayable` 补导出作用例入口（注释写明「仅为测试入口」）。**PRNG 披露**：原一次性脚本算法未随矩阵入库、无法逐位复现——静态值照记录转写、扫描同域同种子、用例内固定 mulberry32。**顺带**：TESTING 的 TC-040 计数 19→23（`R2-2` 并入 `productDurationOf` 时漏改）。单测 36→53；两轴 CR 均 PASS（采纳 4 条 P2：交互选区措辞改「整数对采样近似——生产路径 CropOverlay 产连续浮点」、cropToPx 扫描补灵敏度守卫等）。**手测**：无 UI 改动无新增；TC-022/024/028 真机半维持待跑。**已提交**（代码 `0f47b58` + 本次 `docs:` 回填）。
- [ ] **T-005 重复收敛·第三轮过度工程审查**（来源 [archive/code-review-2026-09-25-overengineering.md](./archive/code-review-2026-09-25-overengineering.md) §1/§2 标 shrink 项，证据与行号见归档）：**Rust**——ffmpeg 10 个构建器的 8 元素参数头收敛 `base_args()`（AGENTS §4 第 2 条：参数序列断言同批跑通）· `file_name` 6 份并一进 `commands/mod.rs` · 缩略图双胞胎函数合并（**顺带修 `media.rs`"收敛留给 R2-2"失账注释——查 R2-2 落地清单实未含本项**）· pipeline `n_norm` 双遍 `diff_pair` 改单遍 · `resolve_sidecar` 矛盾注释留一 · `pipeline::temp_token` 上收 `commands/mod.rs`（R3-5 后 mod.rs 反向引用子模块，实施时一并上收消掉）；**前端**——`PageHeader`（6 份页头，Cut 页内就有两份）· `EmptyImport`（4 份空态）· `useConsumeInitialFiles`（4 份 ref-sentinel）· `useThumbnails`（2 份同构 effect，与 `T-003` 缩略图条目配合）· `submitWithUniqueTarget`（2 份防覆盖链）· 旋转/翻转显示变换进 `shared.ts`（2 份）· `frameStepOf`（3 份＋undo 层第四处）· `EditorTool`/`EditorTab` 重复 union 合一 → **—（工程批次）· `ffmpeg/command.rs` · `commands/*.rs` · `pages`/`components`/`utils` · TC-005**（估算 ≈-265 行）
- [ ] **T-006 死代码与投机灵活性清理·第三轮过度工程审查**（来源同上 §1/§2 标 delete/yagni 项）：**Rust**——`normalize_crop_rect`/`validate_crop_rect` 两层单调用封装内联（测试直调 `align_rect`）· `subtitle_count`/`bit_depth` 双端死字段（probe 解析→lib.rs→types 全链 0 消费；**DESIGN §7 同提交同步**，AGENTS §3 第 17 条）；**前端**——撤销 JSON 序列化通路 `toJSON`/`commandFromJSON`/`CommandJSON` 删除（全仓 0 生产引用、PLAN/DESIGN 无会话恢复排期；round-trip 用例随删 ≈-60 行；**同步 `plans/M11.md` §18.1 的"序列化留口"描述与单测基线 ②，避免文档与实现矛盾**）· 撤销栈 `limit`/`depth` 旋钮删参取常量 · Editor 死 `playerRef` · `RotateState`/`CropRect` 再导出 shim ×2 · `appendFrontendLog` level 收窄为仅 `"error"`；**豁免不立案**（撤销读回侧 / speed 链 / `submit_with_cleanup`，理由见归档 §4） → **—（工程批次）· `commands/crop.rs` · `ffmpeg/probe.rs` · `lib.rs`+DESIGN §7 · `utils/undo` · `types`/`services` · `plans/M11.md` · TC-005**（估算 ≈-80 行＋测试 ≈-70）

## 候选池（未排期）


> **候选池的唯一真源是 [CANDIDATES.md](./CANDIDATES.md)**（原 DECISIONS.md §16，含每条说明与量级），此处只保留编号与去向，不复制说明。
> **候选不是承诺**：晋升为里程碑前需先在 [DESIGN.md](./DESIGN.md) 补充完整设计并过决策记录。
> 已晋升：B1/B2/B14 → M8（已完成）· B17 → M10-2（设计中）· B10/B11 → M11。
> 未排期编号：**A 高性价比** B3/B4/B5/B6 · **B 值得做** B7/B8/B9/B12/B13/B18/B19 · **C 工程质量** B15/B16。
> 建议优先级：功能面 B6 音频提取 + B12 任务通知（时间线落地后重排）；工程面 B15（**asset scope 收窄 + CSP 是发布前硬门槛**）。
> 明确不做：i18n、多轨编辑器、时间线音频轨编辑/空隙模型/调色/命令面板等（见 [CANDIDATES.md](./CANDIDATES.md)「不做」节）。

**建议下一步（2026-09-24 更新）**：R1 与 **R4 段 9 条全部实施完毕**（`R4-1` panic 隔离 · `R4-2` 输出原子替换 · `R4-3` 指针拖拽收尾兜底 · `R4-4` `pxToCrop` 锚点钳制 · `R4-5` 缩略图批处理容错 · `R4-6` 输出容器/扩展名口径 · `R4-7` 代理判定纳入容器维度 · `R4-8` 真机首跑缺陷 `BUG-007`–`BUG-009` · `R4-9` `cropToPx` 边缘对齐），另 `R3-7` 也已提前实施；缺陷状态：`BUG-001`/`BUG-002`/`BUG-007`/`BUG-009` 为 `verified`，`BUG-003`/`BUG-004`/`BUG-005`/`BUG-006`/`BUG-008`/`BUG-010`/`BUG-011` 为 `fixed`——**各条的回归 TC 都卡在"手工/真机"那一半**（`TC-021`/`TC-022`/`TC-023`/`TC-024`/`TC-028` 的手工半、`TC-030` 的复跑），均**待用户显式发起**；`fixed` → `verified` 只差这一步。

**M11 已开工**：`M11-0`（状态层/撤销基座，含 Vitest 载体与 `TC-040`）✅ → `M11-1`（精度基座）✅ → `M11-2`（缩放滚动）✅ → `M11-3`（播放头路径）✅ → `M11-4`（选择与波纹删除）✅ → `M11-5`（切割）✅ → `M11-6`（边缘修剪）✅ → `M11-7`（撤销接线）✅ → `M11-8`（菜单与快捷键）✅ → `M11-9`（性能验收）✅ → **下一步 R3 → M12-2 → M12-1/3 → M13**（R2 五项全部完成）；M10 视反馈随时插入（与时间线零耦合）。M9 已于 2026-09-17 落地，M6-7/M9/M4-5 的 UI 手测部分待用户统一验收。

## 测试与质量约定

1. **命令构建器全单测**：`ffmpeg/command.rs` 每个构建函数配参数序列断言，ffmpeg 行为回归靠它兜底
2. **夹具驱动**：所有手工验收基于 M1-1 的固定夹具，避免"拿手头随便一个视频测"导致结论不可复现
3. **提交粒度**：一个 checkbox 一次提交，信息格式 `M1-4: cut command builder + tests`
4. **性能基线**：1GB 文件极速剪切 ≤ 10s（SSD）、合并 ≤ 15s、元数据旋转 ≤ 5s；超出即回查（多为误入重编码路径）
5. **进度推送节流 200ms**，避免事件风暴拖慢前端

## 风险登记

| 风险 | 影响 | 缓解 | 验证时机 | 状态 |
| --- | --- | --- | --- | --- |
| sidecar 打包后路径解析失败 | 全项目阻塞 | M0-3 spike 提前跑通 dev+build 双模式 | M0 | ✅ 已验证（dev+build 双模式均通过） |
| WebView2 解码能力探测不准 | 代理机制失效 | canPlayType + error 事件双探测 + 夹具实测 | M1-8 | ✅ 已验证 |
| 长视频关键帧扫描过慢 | 剪切页体验 | 异步任务 + 进程内缓存（原 `-read_intervals` 懒加载未启用） | M1-3 / M8-1 | ✅ 已缓解（B1 缓存落地） |
| 硬件编码器探测误判 | 放大/精确剪切失败或回退 | 试跑验证 + 失败回退 libx264 + 结果缓存 | M3-1 | ✅ 已验证（本机 nvenc/qsv/amf 全不可用，回退链生效） |
| HEVC 系统扩展缺失 | HEVC 预览不可用 | 探测失败自动代理，不阻塞处理 | M1-8 | ✅ 已验证 |
| concat 列表特殊字符路径 | 合并失败 | 生成器单测覆盖中文/空格/单引号用例 | M2-3 | ✅ 已验证 |
| concat 时间戳错乱（tb 不一致） | 成品 seek/播放损坏 | 所有重编码统一 `-video_track_timescale` 对齐首片段 | M5-5 | ✅ 已修复 + e2e 覆盖 |
| 时间线 100 片段 60fps 不达标（M11 验收） | 时间线卡顿 | 播放头 ref 直改 DOM + 块 memo + 帧时间埋点先行（M11-1 即接入）；瓶颈按"解码→归一→合成→传输→呈现"顺序排查，不先猜 React | M11-9 | ✅ 已实施（`M11-9`：命令层计量达标；帧预算真机半 ⏳ 待用户发起，TC-043） |
| 撤销栈覆盖不全产生脏状态 | 时间线数据不一致 | 全部操作走命令栈统一入口，禁止绕过栈直改 timeline state；builder no-op 返回 null；6 条单测基线 | M11-7 | ✅ 已实施（`M11-7`：no-op 不入栈有单测、外部删除清栈 `FR-1737`） |
| 修剪热区与整块拖拽的 pointerdown 冲突 | 误触发修剪/选中 | 全局最近边缘 ≤8px 优先命中修剪；共享 4px 死区 | M11-6 | ✅ 已实施（2026-09-25，方案见 [plans/M11.md](./plans/M11.md) §18.9） |
| 自动渲染预览与手动导出抢并发/磁盘 | 导出变慢 | preview 任务最低优先级排队；输出走缓存目录并纳入清理；进行中去重（新编辑取消旧任务） | M12-2 | ⏳ 待实施 |
