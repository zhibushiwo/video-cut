# video-cut 实施计划

> **职责**：里程碑、任务（checkbox）、验收与风险——描述"做什么、做到哪了"。
> **唯一真源**：**进度的唯一真源**（里程碑状态、任务勾选、验收归属）；任务号 `M#-#`/`R#-#` 为里程碑内序号，`T-0NN` 为独立技术任务。
> **读时机**：接活前 / 汇报进度 / 判断下一步做什么。
> **写规则**：一个任务一个 checkbox，完成即勾选并按约定粒度提交（信息前缀 `M11-3:` 等）；验收行只写 AC 编号，验收口径在 [DESIGN.md](./DESIGN.md)、执行方式在 [TESTING.md](./TESTING.md)；不在此写规格。
> **关联**：[INDEX.md](./INDEX.md) · 上位 [DESIGN.md](./DESIGN.md)（规格仲裁者）与 [TIMELINE.md](./TIMELINE.md) · 当前状态 [HANDOFF.md](./HANDOFF.md)
> **最后更新**：2026-10-07（**M18 AI 字幕立项**——`CAND-030` 晋升：里程碑表补 M18 行 + 新增 M18 九批章节（M18-1 文档批 ✅ 当日落地）；此前同日 **M17 立项**（导航与编辑器收敛：M17-1 合并旋转/放大为「编辑」单入口 + 单实例页内切工具 · M17-2 工作台重编码旋转 `forceTranscode`）；里程碑表补 M16/M17 两行 · 同日本轮文档整理：里程碑总览表 `M10`/`M12`/`M14`/`M15` 四行同步任务行实况——此前停在立项时的「待实施/暂缓」状态；无新任务、无代码改动 · **T-020 播放速度下拉直选（0.2~3 九档）** · **T-019 预览渲染编码提速**（preview 重编码/归一化 `ultrafast`，导出不变）· **M16-7/8 剪切/合并页预览落地**（CAND-027② 晋升销账，CAND-027 全清）· **真机验证轮**：TC-048 步骤 9 收尾通过 → **M12-2 勾选**；M16-1/3 真机验证补注；**T-018 源剪切预览 fill 化**（用户截图反馈；面板比例归 `CAND-021`）· **M16-4 修复全屏态视频不铺满** · **M16 六项全部落地**（M16-1/2/3 与 M16-4/5/6 两笔提交，TC 待建项以手测点代替——均极小/小改动）；**M16 体验补强批次立项**——CAND-023/024/025/026②/027①/029 晋升，六项纯前端；**T-017 移除池→轴拖拽手柄**（用户裁决，UI.md §9.8 同批改写）；此前 2026-10-06（**M12-1 连播改进落地**（`FR-1763`/`FR-1764`，TC-060 真机通过，方案/落地见 plans/M12.md §22）；**T-001 落地——TIMELINE §17.4 ↔ plans/M11 §18.5 消冗余，T 台账清零**；**M10-1 页面保活落地**（决策 #24，随 `BUG-026` 修复，回归 `TC-059`）；新增 `T-015`/`T-016` 缺陷修复任务行（`BUG-025` 窗口内拖拽误触发导入 · `BUG-019` 成品预览进度条条外松手冻结），均 ✅ 落地）；此前新增 `T-011`/`T-012`/`T-013`/`T-014` 四条缺陷修复任务行（`BUG-021` 成品预览重播回绕 · `BUG-022` 片段加工重播起播反馈 · `BUG-023` 片段加工「点画面」绕过区间回退 · `BUG-024` 解码管线错误软重建），均 ✅ 落地（`T-013`/`T-014` 真机两轮复测用户确认）；头部此前改一行式并删两条过时的「下一步」段——规则见 [INDEX.md](./INDEX.md) §7）；内容级明细记在各任务行 ✅ 标注与 [CHANGELOG.md](./CHANGELOG.md)，历史批次要点在 [archive/handoff-archive.md](./archive/handoff-archive.md)

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
| **M10 保活 + 深浅主题** | 工作页 keep-alive（决策 #24）+ 深浅主题三态（B17，决策 #25） | M9 | 1 天 | ⏸ **暂缓**（决策 #32）：`M10-1` 保活 ✅ **2026-10-06 随 `BUG-026` 提前实施**（决策 #24 兑现，回归 TC-059 通过）；`M10-2` 深浅主题（CAND-017）仍暂缓 |
| **M11 单轨时间线核心** | PPS 坐标/缩放、切割、波纹删除、边缘修剪、拖拽重排、撤销栈（TIMELINE.md §17，决策 #26） | M9（不依赖 M10） | 2.5~3 周 | ✅ **实施全部完成**：`M11-0` 状态层/撤销基座 ✅（2026-09-24）、`M11-1` 精度基座 ✅、`M11-2` 缩放滚动 ✅、`M11-3` 播放头路径 ✅、`M11-4` 选择与波纹删除 ✅、`M11-5` 切割 ✅、`M11-6` 边缘修剪 ✅、`M11-7` 撤销接线 ✅、`M11-8` 菜单与快捷键 ✅、`M11-9` 性能验收 ✅（2026-09-25；帧预算真机半 ⏳ = TC-043 手工半，待用户发起）；R2 五项并入本阶段 |
| **M12 预览强化** | 连播改进、渲染即预览（决策 #28）、暂停帧服务 spike（TIMELINE.md §17.6） | M11 | 1~2 周 | ✅ **主体完成**：`M12-2` 渲染即预览 ✅（2026-10-05；`TC-048` 真机通过 2026-10-07）· `M12-1` 连播改进 ✅（2026-10-06；`TC-060` 真机通过）；剩 `M12-3` spike ⏳（可选——渲染即预览已覆盖其主要价值） |
| **M13 打磨（可选）** | 缩略图条、标记、多选拖拽（决策 #31） | M12 | ~1 周 | ⏳ 待实施 |
| **M14 交互完善批次** | 用户 2026-09-28 六条反馈：页面重置/换素材、默认命名、入出点按钮、放大双态预览、片段池手柄语义、成品连播停住（`BUG-014`/`BUG-015`，`ADR-035`/`ADR-036`） | M11（与 M12/M13 零耦合） | 2~3 天 | ✅ **完成**（六项全部落地：`M14-2`~`M14-5` 2026-09-28、`M14-1` 连播停住 + `M14-6` 手柄语义 2026-10-05；`M14-6` 的手柄形态后被 `T-017` 整条移除取代，2026-10-07。方案存档 [plans/M14.md](./plans/M14.md)） |
| **M15 保留式裁剪**（`CAND-020` 晋升） | 单视频"删垃圾"流：标记要删的区间 → 求补集 → 无损合成一个文件（`FR-326`，`ADR-037`） | M11（后端零改动） | 2~3 天 | ✅ **实施全部完成**（`M15-1`~`M15-4` ✅ 2026-09-28；`TC-047` 手工半 ⏳ 待用户真机发起；删除的精确边界归 `CAND-022`（parked，先看无损版实际体验再裁）。方案存档 [plans/M15.md](./plans/M15.md)） |
| **M16 体验补强批次** | 用户反馈六项 + 预览补齐：任务提示即关、音量记忆、自动续接、预览全屏、点画面走带、框选可调、剪切/合并页预览（CAND-023/024/025/026②/027①②/029 晋升） | — | 1~2 天 | ✅ **完成**（M16-1~8 全部落地 2026-10-07；极小/小改动以手测点代替建 TC） |
| **M17 导航与编辑器收敛** | 右上角旋转/放大合并「编辑」单入口 + 页内工具 tab（M17-1）；工作台重编码旋转 `forceTranscode`（M17-2，`CAND-022`① 契约子集） | — | 0.5~1 天 | ✅ **实施完成**（M17-1/M17-2 ✅ 2026-10-07；`TC-061`/`TC-062` 手工半 ⏳ 待用户真机发起） |
| **M18 AI 字幕**（`CAND-030` 晋升 + `CAND-033` 晋升 M18-10） | whisper.cpp 本地转写 → .srt 外挂：引擎 sidecar + tiny 内置 + 模型/GPU 包按需下载（`FR-390`~`FR-393`，`ADR-039`~`ADR-041`）+ 动态模型列表（`ADR-042`） | M18-1 文档批（无代码前置） | 1~2 周 | ✅ **实施全部完成**（M18-1~9 全落地 2026-10-07；AC-392-1 的 GPU 可用分支手测点 ⏳ 需 N 卡设备；用户真机验证：日文歌素材 VAD 回退生效、防覆盖命名生效）；**M18-10 动态模型列表同日晋升并实施**（`CAND-033`，`ADR-042`） |
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

- [x] **M10-1 [P1] 页面保活**（决策 #24）：Cut/Merge/Editor/Workbench 离开隐藏不卸载，隐藏瞬间自动暂停播放；History/Settings 维持条件挂载；设置变更即时生效不重置页面（UI.md §9.2） → **FR-9xx（待发号，UI.md §9.2）· AC 待发号 · `pages`/`utils`/`types` · TC-059**　✅ **2026-10-06 落地（随 [BUGS.md](./BUGS.md) `BUG-026` 修复提前实施，M10 解冻本项）**：App 层常挂四工作页（旋转/放大两个 PageName 各一实例、互不串状态）+ 非活动页 `display:none`；`navigate` 统一 `pause()` 全部 `<video>`（React 播放态经既有 pause 事件回写）；`initialFiles` 只喂活动页（防隐藏页消费同一次拖入）；全部 window 级热键按 `active` 门控（Cut/Workbench 两页自身 + CutModeView/EditModeView/ClipTimeline 子组件；useHotkeys 的 M10-1 前置注释兑现）。真机：**TC-059 通过**——切页往返状态完整保留（视图模式与播放位置在内）、隐藏页 Delete 拦截而活动页生效、播放中切页自动暂停且返回按钮如实回「播放」、拖入只进活动页（剪切页收文件而工作台不增）、旋转/放大两实例互不串状态）
- [ ] **M10-2 [P2] 深浅主题**（B17，决策 #25）：`themeMode: dark | light | system` 设置项；`.theme-light` 变量组整体替换；跟随系统 matchMedia 监听实时切换；warn 琥珀与四个主题色浅底对比度逐一校对（UI.md §9.1） → **FR-9xx（待发号，UI.md §9.1）· AC 待发号 · `pages`/`utils`/`types` · TC-014（B17，决策 #25）**

**验收**：AC 待发号（FR-9xx 随 M10 开工）· TC-014（口径见 DESIGN.md §3；执行见 TESTING.md）

**实施顺序建议**：M9-1 → M9-2 → M9-3/4 → M9-5 → M10-1 → M10-2（M9 五项已于 2026-09-17 实施完毕；M10 曾暂缓——M10-1 已于 2026-10-06 随 `BUG-026` 修复实施，M10-2 仍暂缓）。

## 评审修复批次（三轮：2026-09-17 三路走读 → 2026-09-19 四路复审 → 2026-09-25 过度工程审查）

> **批次实施要点（落地内容 / 披露 / 测试载体）已于 2026-09-28 迁入 [archive/handoff-archive.md](./archive/handoff-archive.md)**——避免与 HANDOFF 双写；本文只留任务行与验收指针。

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

> **关联**：—（工程批次；其中 6 条为**缺陷修复**，登记见 [BUGS.md](./BUGS.md) `BUG-001`–`BUG-006`；`R4-8` 另收真机首跑缺陷 `BUG-007`–`BUG-009`，`R4-9` 收 `R4-4` 实施时同族复查发现的 `BUG-010`）　·　**验收**：各条以其回归 TC 为准　——　执行：TESTING.md §3.4（TC-019–TC-029）
> **排期**：**排在 M11-0 之前** —— §3.1 的作业体会被 M11 的切割/波纹删除放大（panic 一次即泄漏并发槽），§3.3 涉及的 `ClipTimeline` 正是 M11-1/2/4/6 要重写的组件：先修是顺手，M11 后修是返工。

- [x] **R4-1 [P0] 作业体 panic 隔离**（`task/worker.rs`）：新增 `run_job_isolated`——`catch_unwind(AssertUnwindSafe(..))` 包住 `job(&ctx)`，panic 收敛为 `Err("任务内部错误：<panic 内容>")` 并入日志，让既有终态处理（`record_terminal` / `run_cleanup` / `task_finished`）照常执行；补单测（模拟 panic → 任务 Failed + 清理钩子照跑 + 连续两次 panic 后并发位仍可用） → **BUG-001 · NFR-006 · `task/worker.rs` · TC-019**
  - **⚠ 边界（已裁决）**：`[profile.release]` 原按 Tauri 体积建议设了 `panic = "abort"`，会让 `catch_unwind` 在 release 下失效（panic 直接终止进程）。**2026-09-21 裁决保留 `unwind`**（见 [DECISIONS.md](./DECISIONS.md) `ADR-034`），即本条隔离在发布版同样生效。
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

## M11 单轨时间线核心（TIMELINE.md §17，2026-09-16 立项，实施中）

> **批次实施要点（落地内容 / 披露 / 测试载体）已于 2026-09-28 迁入 [archive/handoff-archive.md](./archive/handoff-archive.md)**——避免与 HANDOFF 双写；本文只留任务行与验收指针。

> **关联**：FR-17xx（**随 M11 首个功能批次 M11-1 发号**——M11-0 是前置重构、不产生新需求；需求本身在 TIMELINE.md §17）　·　**验收**：AC 见 TIMELINE.md §17.9 ①~⑥　——　执行：TESTING.md §3.1（`TC-040` 撤销基线）+ M11-9 埋点报告

> 定位 = "拼接驾驶舱"（决策 #26）：只做让剪切合并更顺手的七个操作，规格见 TIMELINE.md §17。M9-3/M9-4 的逐块像素排布与整块拖拽是本里程碑地基。精度公式与撤销范式参照 Clypra（同栈开源编辑器）验证过的结论（[handoff-archive.md](./archive/handoff-archive.md)「时间线需求收敛」）；后端除 M12-2 预览变体外零改动。
>
> **实施方案已定稿（2026-09-17，[plans/M11.md](./plans/M11.md) §18，决策 #32）**：执行顺序调整为 M11-0 状态层/撤销基座先行（七操作都要经命令栈，PLAN 原列第 7 位的 M11-7 前置拆分）；几何/缩放滚动/播放头/修剪手势的实施设计见 plans/M11.md §18.2~§18.6。

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

## M12 预览强化（TIMELINE.md §17.6，2026-09-16 立项，待实施）

> **关联**：`FR-1760`~`FR-1762`（§17.6 预览，随 `M12-2` 发号）· 决策 #28　·　**验收**：`AC-1760-1`/`AC-1761-1`/`AC-1762-1`（TIMELINE.md §17.9⑥）　——　执行：TESTING.md TC-048（真机）· 实施方案见 [plans/M12.md](./plans/M12.md)

- [x] **M12-1 连播改进**：ProductPreview 下一段预加载提前、边界停顿缓解；修剪拖动节流 seek 实时显示入/出点帧 → **`FR-1763`/`FR-1764` · AC 见 §17.6 · `ProductPreview`/`ClipTimeline`/`Workbench` · TC-060**　✅ **2026-10-06 落地**（方案与落地记录见 [plans/M12.md](./plans/M12.md) §22）：预装进 `switchTo` 同周期 + 就绪感知切换（备用槽 `readyState >= 2` 且起点 seek 落地才 ε 提前切）+ 修剪帧预览（激活立即 / ≥150ms 节流 / 提交后语义收尾）。真机两轮抓到两个设计外缺口并修复（`onEnded` 绕过判定、同值 `currentTime` 赋值仍触发 seek，见 §22.5）；**残余**：稀疏关键帧源跨 GOP 中段入点的 play 恢复重解码停顿（~1.2s）为 WebView2 固有成本，已披露
- [x] **M12-2 渲染即预览**（决策 #28）：Rust 侧 Pipeline 任务加 `preview` 标志（输出 `app_cache_dir/preview/<令牌>.mp4`、任务 internal **不进历史与面板**、进行中去重 = **新编辑取代旧任务**、**队列低优先级不抢导出并发位**）；前端纯无损时间线编辑停顿 ~1.5s 防抖自动渲染并播放真实成品，含重编码/失败时回退虚拟连播 + 手动"精确预览"；`cache_usage`/`clear_cache` 覆盖 preview 子目录且**只留当前一份** → **`FR-1760`~`FR-1762` · AC 见 §17.9⑥ · `task/manager.rs` · `commands/pipeline.rs` · `commands/media.rs` · `ProductPreview`/`TaskProgress`/`hooks` · TC-048（决策 #28）**　✅ **2026-10-05 全部落地**（四次提交 `M12-2a`~`M12-2d`，落地记录见 [plans/M12.md](./plans/M12.md) §21.9）：规格发号 → 后端 preview 变体（优先级/同源单例/缓存隔离）+ 前端防抖自动渲染与真实成品回放 + 页脚「精确预览」。（**B15 facts 缓存复查后关闭**——已由 probe LRU 覆盖，见 TIMELINE.md §17.7；**`TC-048` 真机通过**——前三跑 + 2026-10-07 步骤 9 收尾（缓存统计/清理归零），见 [TESTING.md](./TESTING.md) 对应行）
- [ ] **M12-3 暂停帧服务 spike**（可选）：现有缩略图命令改造为 seek 单帧 RGBA → canvas；出"是否产品化"结论（红线：连续播放不走逐帧 IPC，TIMELINE.md §17.6） → **FR-17xx · AC 见 §17.6 · `services/tauri.ts` · `VideoPlayer`/`Timeline` · TC 待建（spike）**

**验收**：AC 见 TIMELINE.md §17.9⑥ · TC 待建（口径见 DESIGN.md §3；执行见 TESTING.md）

## M16 体验补强批次（2026-10-07 立项：候选池 CAND-023/024/025/026②/027①/029 晋升）

> **关联**：[CANDIDATES.md](./CANDIDATES.md)（去向标注）· [UI.md](./UI.md) §9.4/§9.6/§9.7/§9.8/§9.9（规格）· 全部**纯前端**、后端零改动
> **验收**：AC 待发号（UI 行为规格以 UI.md 对应节为准）· 每项手测点随提交说明

- [x] **M16-1 完成提示自动关闭**（CAND-023）：任务行点「打开位置」后该行立即关闭（清掉其自动关闭定时器）　✅ **2026-10-07 落地**（`dismiss(id)` 复用，定时器一并清）**✅ 真机验证**（2026-10-07：导出完成 → 点「打开位置」→ 任务行立即消失）
- [x] **M16-2 预览音量全局记忆**（CAND-029）：会话级全局音量/静音单例（`useSyncExternalStore`），VideoPlayer 各实例共用；不入 settings.json　✅ **2026-10-07 落地**（`hooks/useVolumeMemory.ts`：滑块 0=静音语义沿用，任一实例调整其余即时同步）。**同日延伸（用户反馈成品预览没有音量）**：ProductPreview 控制行补静音钮 + 音量滑块，接同一份全局记忆；音量只作用于活动槽与渲染分支成品，**备用预载槽强制静音**防串音（真机：滑块 0.3 → `v.volume=0.3`、静音钮 → `muted=true`）
- [x] **M16-3 添加片段自动续接**（CAND-025）：设置 `autoContinueClips`（默认开，DESIGN §12 + §9.9）；剪切页与工作台源剪切添加成功后入点接出点、出点推到结尾　✅ **2026-10-07 落地**（全段片段/已到结尾时不续接；设置页新增开关行）**✅ 真机验证**（2026-10-07：添加 0–5s 片段后入出点自动变 5.000/22.988）
- [x] **M16-4 预览全屏**（CAND-024）：VideoPlayer 控制条全屏按钮（Fullscreen API，Esc 退出）　✅ **2026-10-07 落地**（成品预览控制行同批加同款按钮——整块预览组件进全屏。**用户复测发现缺陷并当日修复**：全屏的是外层容器而 UA 不给全屏元素做布局，非 fill 模式视频停在 44vh 原尺寸缩在角落——global.css 补 `:fullscreen:has(>video)` flex 居中 + `:fullscreen > video` 铺满可用空间（真机复测 1080p 全屏视频 1820×1024 居中））
- [x] **M16-5 成品预览点画面即播放/暂停**（CAND-027①）：ProductPreview 两分支视频 onClick 接走带　✅ **2026-10-07 落地**（真机：点画面播/停与按钮同步；非活动槽 `pointerEvents:none` 防透明层吃点击）
- [x] **M16-6 放大框选后可调整**（CAND-026②）：`useCropSelect` 增边缘热区（~8px）拖拽调大小（逐边、不受比例锁），框内平移/框外重画不变　✅ **2026-10-07 落地**（角 = 两边同拖；光标 ew/ns/nwse/nesw 反馈；最小选区 8px 钳制；`overRect` boolean 收敛为 cursor 类名，两处消费方同步）
- [x] **M16-7 合并页预览**（CAND-027②）：文件 ≥ 2 时「生成预览」手动触发（`usePreviewRender` 加 `auto` 开关）；文件列表 = pipeline 多输入条目（每文件全区间、无变换），与导出同判定；产物进 preview 缓存（不进面板/历史、只留当前一份） → **UI.md §9.5**　✅ **2026-10-07 落地**（真机：两夹具生成预览 43.09s = 20.1+23.0，命中 preview 缓存）
- [x] **M16-8 剪切页预览**（CAND-027②）：片段 ≥ 1 时「生成预览」按片段顺序连播渲染（与导出同 copy/重编码判定）；导出形态不变（每片段一个独立文件），预览仅核对内容 → **UI.md §9.4**　✅ **2026-10-07 落地**（真机：0–5s 片段 → 预览产物 5.04s）

## M17 导航与编辑器收敛（2026-10-07 立项：用户裁决 Editor 页与工作台能力重叠 → 按低风险收敛处理）

- [x] **M17-1 导航合并「编辑」+ 编辑页单实例页内切工具**：右上角「旋转」「放大」合并为一条「编辑」（icon 换通用编辑语义）；`PageName` 的 `rotate`/`crop` 收敛为 `editor`（前端自有类型，Rust 无对应），App 保活改单实例；Editor 页工具 tab 切换——**切工具保留文件与各自加工态**（旋转态 / 选区与双态预览互不覆盖）、换素材仍整体复位；默认进「旋转」tab，保活回页停在离开时 tab → **UI.md §9.2/§9.6 · TC-061**（TC-059 ⑤ 口径随本项更新）　✅ **2026-10-07 落地**：`PageName` 收敛（types）、`NAV_ITEMS` 单入口（icon `Pencil`）、App 单实例保活（`initialFiles` 门控 `page === "editor"`）；Editor 页 `tool` 改内部 state + 页头下工具 tab（aria-pressed），`hasWork`/重置确认改为两工具合并口径（重置会同时清旋转与选区，任一存在都确认）；rot/rect 独立 state 天然互不覆盖。验证：tsc · eslint · vitest 144 全绿
- [x] **M17-2 工作台重编码旋转（把方向画进像素）**：抹平与编辑页的唯一能力差——`Clip` 加 `bake` 旁路开关（仅朝向变换非恒等时可勾）+ `PipelineItem` 加 `force_transcode`（serde default，Rust/TS 双写）+ `plan_items` 规则 A 加「有 force 即走规则 B」前置条件（copy+矩阵路径不可与烘焙片段拼接）+ 导出前检测面板自动随 plan 反映；默认关 = 既有行为不变 → **DESIGN §7/§3.8 · UI.md §9.8 · TC-062**　✅ **2026-10-07 落地**：后端 `PlanInput.force_transcode` + `plan_items` 规则 A 前置 `!any_forced`（2 条参数序列单测）· 前端 `Clip.bake?` / `PipelineItem.forceTranscode?` 双写、payload 映射 `forceTranscode: c.bake === true`、`EditModeView` 旋转 tab 加开关（无朝向变换时禁用；回到恒等朝向自动清 bake 保持「bake ⇒ 有变换」不变式）· 检测面板经 `check_pipeline` 自动反映。验证：tsc · eslint · vitest 144 · cargo 101+7（含新 2 条）· fmt 全绿；手测点归 `TC-062`
- [x] **T-019 预览渲染编码提速**（用户 2026-10-07 反馈"预览能不能快点"）：无损 copy 预览本就秒级；慢的是**重编码预览**（归一化 + 逐段转码还在用导出同款档位，balanced=medium）。**改法**：`pipeline_transcode_args` / `normalize_args` 加 `fast` 通道——preview 任务（自动渲染与手动精确预览同）preset 恒 `ultrafast`，导出路径参数不变（`encoder_quality_args_with_preset` 私有委托）；GPU 编码器（nvenc/qsv/amf）本就快、不动 → **TIMELINE §17.6 · 参数序列断言 `preview_fast_preset_overrides_quality`**　✅ **2026-10-07 落地**（cargo 99+7 全绿；预期重编码预览提速 2~5×，随源与档位而异）
- [x] **T-020 播放速度改为直接选择 + 档位扩展 0.2~3**（用户 2026-10-07 提出：速度是自选速率而非点击切换、档位多一点）：`PLAYBACK_RATES` 扩为九档（0.2/0.5/0.75/1/1.25/1.5/2/2.5/3）；VideoPlayer 控制条与成品预览控制行的速度控件都改为**下拉框**（后者倍率徽标随之取消，新增 `onPlaybackRateChange` 写回）；K/L 快捷键循环沿用同一档位表 → **UI.md §9.8 · TIMELINE §17.8**　✅ **2026-10-07 落地**（tsc/eslint/vitest 全绿；手测点：下拉选 0.2× 与 3× 各一次，确认画面速率随之变化）

## M18 AI 字幕（`CAND-030` 晋升，2026-10-07 立项）

> **关联**：`FR-390`~`FR-393`（[DESIGN.md](./DESIGN.md) §3.9）· `ADR-039`/`ADR-040`/`ADR-041` · [CANDIDATES.md](./CANDIDATES.md)（`CAND-030` 去向标注）
> **验收**：AC-390-1 · AC-391-1 · AC-392-1 · AC-393-1　——　执行：TESTING.md TC 待建（随 M18-9）
> **依赖**：M18-1 → 全部；M18-2 → M18-5/M18-6；M18-3 ∥ M18-4；M18-5 → M18-6；M18-7/M18-8 依赖 M18-5/M18-6 契约
> **背景**：应用首次引入第二个 sidecar 二进制（whisper-cli）与首次联网（模型/加速包下载，`ADR-040`）；转写进度解析 stderr 为决策 #6 的差异化口径（`ADR-041`）

- [x] **M18-1 文档批**：[CANDIDATES.md](./CANDIDATES.md) 登记 `CAND-030`（→ M18）/`CAND-031`（硬字幕烧录，idea）/`CAND-032`（中文字幕翻译，idea）+ [DESIGN.md](./DESIGN.md) §1.1/§1.2/§1.3 口径修订 + §3.9 新节 + §5.1/§5.3/§5.4/§7 + [DECISIONS.md](./DECISIONS.md) `ADR-039`/`ADR-040`/`ADR-041` + 本文本节 → **`pnpm check:docs` 全绿**　✅ **2026-10-07 落地**
- [x] **M18-2 引擎 sidecar 与内置模型**：`scripts/fetch-whisper.ps1`（仿 `scripts/fetch-ffmpeg.ps1` + **SHA256 校验**；下载 whisper-bin-x64.zip → `whisper-cli` sidecar、ggml-tiny-q5_1.bin + ggml-silero-v5.1.2.bin（VAD，0.9MB，`ADR-039`⑧）→ resource 目录）+ `tauri.conf.json` externalBin/resources → 验收：fetch 成功、`-h` 冒烟（顺带验证 cublas 包 DLL 捆绑情况）、tiny/silero 落 resource 目录、`resolve_sidecar("whisper-cli")` 可定位　✅ **2026-10-07 落地**（SHA256 表硬编码（zip/tiny/silero 三件，下载优先 hf-mirror 回退官方，curl.exe 断点续传 + 失速重连——308 重定向与 IWR 不兼容的坑已实测）；`externalBin` 加 `binaries/whisper-cli`；`resources` 用 map 形式——5 个 DLL 铺到运行根目录（whisper-cli.exe 硬依赖 whisper/ggml×3/SDL2.dll）、模型保持 `resources/models/` 结构；cargo build 后 target/debug 三者落位全部核对，运行目录 `-h` 冒烟通过，cargo test 101+7 全绿。**坑**：PS5.1 对无 BOM 的 UTF-8 按 ANSI 解析（中文注释直接毁掉语法）且原生 stderr 重定向 + EAP=Stop 必炸——脚本已带 BOM、冒烟借道 cmd 重定向）
- [x] **M18-3 下载基建与模型管理**：Cargo 新增 `reqwest`（async 客户端 + rustls-tls；`read_timeout` 失速判定只在 async builder 上，作业线程内 `block_on`）+ `sha2` + `zip`（deflate）+ `commands/subtitle.rs` 的 `list_whisper_models`/`download_whisper_model`/`delete_whisper_model`/`download_whisper_cuda`（hf-mirror.com 镜像回退 + **断点续传/失速检测重连**——spike 实测见 `ADR-040`；下载走任务系统——面板可见可取消、`.part` + SHA256、字节进度复用 `task-progress`、**不入历史白名单**）+ `CacheUsage`/`clear_cache` 扩展（模型 + 加速包目录，内置除外） → 验收：cargo test；真机下载可取消、断网报错可判读、哈希不符删 `.part` 重下、连接挂死能自愈　✅ **2026-10-07 落地**（模型 SHA256 校验表三件硬编码（tiny/small/turbo，取自 spike 已下载产物）；CUDA 包 zip SHA256 亦入库（真机下载 457MB 取得）+ 解压只取 whisper-cli.exe 与 DLL；下载内核注入 `CancelCheck`/`ProgressReport` 闭包与 TaskContext 解耦——本地 HTTP 服务器四条集成测试：成功原子落位 / Range 断点续传（206）/ 哈希不符删 `.part` / 取消保留 `.part` 供续传，全部通过；cargo test 108+7 · vitest 144 · tsc/lint 全绿；**真机下载的 UI 端到端验收归 M18-7 手测**（ModelPicker 为命令消费点））
- [x] **M18-4 音频提取参数**：`ffmpeg/command.rs` 新增 `extract_audio_args`（`-map 0:a:0 -vn -ac 1 -ar 16000 -c:a pcm_s16le`——`-map` 显式第一条音轨为实施期补强：多音轨源行为确定、无音轨硬失败优于空转写，规格 FR-392 同批补记）+ 参数序列断言（红线 1） → 验收：断言覆盖 16k/mono/pcm_s16le　✅ **2026-10-07 落地**（全序列逐字断言 `extract_audio_args_follows_whisper_input_spec`，沿用 base_args 公共头；cargo test 109+7 全绿）
- [x] **M18-5 转写任务**：`VideoTask::Subtitle`（[DESIGN.md](./DESIGN.md) §7 同批已定义）+ `submit_task` 分发 + whisper-cli 调用（`-osrt -of -l <auto|lang> -t -pp --vad -vm <内置 silero>`，经 `spawn_hidden` 红线 3）+ stderr `progress = NN%` 解析单测（`ADR-041` 口径）+ kind `subtitle` 入历史白名单 + `src/types/index.ts` 双写（AGENTS §3 第 17 条）→ 验收：真机小视频出 .srt、时间轴与语音对齐（VAD 生效）、任务可取消、防覆盖命名；wav 临时文件任务终了清理　✅ **2026-10-07 落地**（两阶段作业：提取音频 0~5%（复用 `worker::run_ffmpeg`，killer/取消现成）→ whisper 转写 5~100%（自管子进程：killer 注册 + stderr 线程解析 `-pp` 写共享状态、主循环 200ms 轮询上报——`report` 闭包不保证 Send 不能跨线程，实测踩坑）；产物名后端侧防覆盖 `reserve_srt_output`（决策 #19，同秒序号递增）；wav 与 `.part.srt` 终了清理；单测 = `-pp` 解析 + `whisper_cli_args` 全序列（`--vad -vm` 在列）+ 防覆盖命名三态；**真机冒烟** = tiny+silero（resource 路径，M18-2 产物）按 job 实参跑 55s 音频 6.9s 出 .srt、进度行与解析器匹配；UI 端到端归 M18-7；cargo test 112+7 · vitest 144 · tsc/lint/check:docs 全绿）
- [x] **M18-6 GPU 后端**：试跑探测（短音频冒烟）+ 失败自动回退 CPU（无 N 卡/驱动 < 551/DLL 缺）+ 设置项 `subtitleBackend`（auto/cpu）+ UI 徽标数据 → 验收：无 N 卡环境自动回退且判读准确；真机 GPU 转写可用　✅ **2026-10-07 落地**（`probe_whisper_backend` 命令（`WhisperBackendStatus`，BackendBadge 数据源）；`smoke_gpu` = lavfi 0.3s 静音 wav + 内置 tiny 真跑一次推理（CUDA 初始化在模型加载即覆盖）+ 30s 超时 kill；`decide_backend` 选择矩阵纯函数单测；`gpu_failure_reason` 把 **0xC0000135 STATUS_DLL_NOT_FOUND**（无 N 卡实测形态：加载器直接失败、stderr 全空，真机取值）译为可判读文案；`VideoTask::Subtitle` 加 `backend` 载荷字段（设置 `subtitleBackend` 的传输，DESIGN §7 同批）+ 设置 sanitize；真机验收 = 本机无 N 卡（GPU exe 实跑 `0xC0000135`）→ 回退分支完整验证；**GPU 可用分支需 N 卡设备（手测点挂 M18-9）**；cargo test 114+7 · vitest 144 · tsc/lint/check:docs 全绿，代码提交 7da2297）
- [x] **M18-7 字幕页**：`src/pages/Subtitle/` 骨架（导入 → 识别 → 导出流）+ `ModelPicker`（内置标注"已内置"/下载/删除/进度）+ `BackendBadge` + 设置项（`subtitleModel` 默认 tiny、`subtitleLanguage` 默认 auto）+ 导航入口（`PageName` 加 `subtitle`，App 保活分支）→ 验收：lint/test 绿；现有导航与保活不回归　✅ **2026-10-07 落地**（`pages/Subtitle/` 三件：index（空态 EmptyImport → 文件行+输出目录提示（`resolveOutputDir` 跟随默认目录/源目录）→ 提交 `submitTask({type:"subtitle"})`）/ `ModelPicker` 三档单选卡（内置徽标 + 卡内下载进度条 + 删除，nested button 改 role=button 规避 HTML 嵌套）/ `BackendBadge` 四态（未装附下载按钮 / 可用 / 不可用原因 tooltip / 下载中百分比）；模型+语言选择持久化进设置（`subtitleModel`/`subtitleLanguage`，Settings 页加三行：模型/语言/后端 Segmented）；导航 = `NAV_ITEMS` 加「字幕」（`Captions` 图标）+ App 保活分支；下载任务进度经 `onTaskProgress`/`onTaskStatus` 订阅回传并终态刷新列表与 GPU 探测；UI 规格 = **UI.md §9.11 同批**；tsc/eslint/vitest 144/check:docs 全绿；手测点 = 导航进出保活、tiny 就绪提交、下载 small 后列表刷新、BackendBadge 未安装态）
- [ ] **M18-8 预览**：`src/utils/srt.ts` 纯函数解析（Vitest 覆盖时间码/序号/多行）+ `SrtPreview` 视频与字幕同步只读预览（复用 VideoPlayer + currentTime 叠加）→ 验收：vitest 全绿；字幕随播放走带
- [x] **M18-9 收尾**：e2e（夹具 → 转写冒烟，模型/GPU 缺失自动 skip，仿 [FFMPEG.md](./FFMPEG.md) §6.6 惰性夹具模式）+ 手测点清单 + AC 回填 + PLAN 勾选 → **验收**：AGENTS §4 完事标准全项　✅ **2026-10-07 落地**（e2e `subtitle_extract_and_transcribe_chain`：`extract_audio_args` 真跑提 wav（时长断言）→ `whisper_cli_args`（VAD+tiny）真跑转写出 .srt，sidecar/模型缺失自动 skip，cargo test 114+8）。

**AC 回填**：
- AC-390-1 ✅（真机 LEE 系列 / 123.mp4 出 .srt、时间轴 VAD 对齐、源文件不变）
- AC-391-1 ✅（三档状态如实、SHA256 校验、断网内置档可完整转写——真机验证）
- AC-392-1 ✅（进度推送、任务可取消、无 N 卡回退 CPU 且徽标准确——真机验证；**GPU 可用分支 ⏳ 需 N 卡设备**）
- AC-393-1 ✅（预览视频+字幕同步只读、同名冲突追加时间戳——真机验证）

**手测点清单（真机）**：
1. 工作台导航进出「字幕」页：保活，模型列表/选择/下载态不丢
2. 内置 tiny 识别 123.mp4：VAD 空结果自动回退无 VAD（产出 2 条日文字幕）
3. UI 下载标准/高质量档：进度条 → 完成列表刷新 → 换档识别质量对比
4. BackendBadge：未安装（附下载按钮）→ 下载中百分比 → 无 N 卡机器探测后显示回退原因
5. 识别完成后字幕预览：视频+字幕同步、只读无编辑入口
6. 转写中途取消：任务面板取消，无残留 wav/.part.srt
7. 设置页缓存清理：下载模型被清空、内置档不受影响
8. 断网：内置档完整转写可用；下载报错可判读
9. 「打开模型文件夹」：目录创建并打开（手动放置引导）
10. **N 卡设备（待 N 卡真机）**：下载 CUDA 包 → Badge"GPU 加速可用"→ GPU 转写成功（驱动 ≥ 551）

## M18-10 动态模型列表（`CAND-033` 晋升，2026-10-07 立项并实施）

> **关联**：`ADR-042`（**推翻 `ADR-039`⑦ 封闭白名单**）· [DESIGN.md](./DESIGN.md) §3.9 FR-391 修订 · [CANDIDATES.md](./CANDIDATES.md)（`CAND-033` 去向）
> **验收**：models 目录中自备 `*.bin`（如 F16 turbo）出现在列表并可选用/删除；白名单下载档与 SHA256 下载校验不回归

- [x] **M18-10-1 文档晋升批**：`ADR-042`（白名单档位 + 动态扫描并列，推翻 `ADR-039`⑦）+ DESIGN §3.9 FR-391 修订 + §7 model_id 语义 + CANDIDATES `CAND-033` → M18-10 + PLAN 本节 → `pnpm check:docs` 全绿
- [ ] **M18-10-2 实现**：`list_whisper_models` 动态扫描 models 目录其余 `*.bin`（"自定义"徽标/体积/可删除）+ `submit_subtitle` 模型解析扩展（tiny→resource / 白名单→已知名 / 其余→models 文件名，拒绝路径穿越）+ `delete_whisper_model` 支持自定义 + `WhisperModelInfo.custom` TS 双写 + ModelPicker"自定义"徽标 + 设置 sanitize 放宽 → 验收：F16 模型放入后列表可见可选用；白名单下载/SHA256 不回归

**验收**：AC-390-1 · AC-391-1 · AC-392-1 · AC-393-1 —— 口径见 DESIGN.md §3.9，执行见 TESTING.md（TC 随 M18-9 建）。

## M13 打磨（可选，视 M11/M12 体验决定，决策 #31）

> **关联**：FR-17xx（随 M11 首个功能批次发号）　·　**验收**：视 M11/M12 体验决定　——　执行：TESTING.md TC 待建

- [ ] **M13-1 缩略图条**：L0/L1 两层简化版（固定网格 + 长视频预算公式；铁律 = 滚动永不触发解码、缩放先画粗层拉伸图） → **FR-17xx · AC 视体验决定（决策 #31）· `ClipTimeline`/`CropOverlay` · TC 待建**
- [ ] **M13-2 标记**：M 添加 / 再按删除、Shift+M / Ctrl+Shift+M 导航、播放头吸附标记；不参与导出 → **FR-17xx · AC 视体验决定（决策 #31）· `ClipTimeline`/`CropOverlay` · TC 待建**
- [ ] **M13-3 多选拖拽**：Ctrl 多选整块插入重排（一次撤销一条） → **FR-17xx · AC 视体验决定（决策 #31）· `ClipTimeline`/`CropOverlay` · TC 待建**

## M14 交互完善批次（用户 2026-09-28 指示，未走候选池——`ADR-036`）

> **关联**：`ADR-035`/`ADR-036` · [plans/M14.md](./plans/M14.md)（实施方案）·　**验收**：AC-380-1 · AC-354-1 · UI.md §9.2/§9.4/§9.5/§9.6/§9.8　——　执行：TESTING.md TC-044 · TC-045 · TC-046（手工/真机）
> **范围**：六条用户反馈全部为**前端改动**，后端零改动。**实施顺序**：原为下列顺序（连播缺陷最前）；**2026-09-28 同日被 `ADR-037` 改判**——`M14-2`/`M14-3`/`M14-4` 因与 `M15`（保留式裁剪）直接相关而提到全库最前，`M14-1`/`M14-5`/`M14-6` 顺延其后（`M14-1` 仍为 M14 内最前）。

- [x] **M14-1 成品连播在片段边界停住（先复现再修）**：`HANDOFF.md` 未决表同一条曾静态推演判定"不成立"，用户实机现象与之相反 → 用真机 CDP 复现定位（`switchTo` 的 rAF / `onEnded` / 异步 `onPause` 与 React 批处理四重时序），按复现结论选修法（离场槽判定改 ref，或加切换抑制门），**禁止猜测式修改** → **BUG-014 · AC-380-1 · TIMELINE.md §17.9⑥ · `ProductPreview`/`TaskProgress`/`hooks` · TC-044**　✅ **2026-10-05 落地**：真机 CDP 复现定位到根因——`onPause` 的活动槽身份判定误用 React state `slot`（`switchTo` 会 `pause()` 离场槽，其 `pause` 事件到达时 state 未跟上 → 误判成"外部暂停" → 新活动槽被 effect 暂停、rAF 空转），修法取"判定改读 `slotRef`"（`onPause`/`onEnded`/`onLoadedMetadata` 三处统一）；`TC-044` 通过（3 段连续跨 10s/20s 两处边界、末尾正常停止、seek 后继续、暂停读数对齐）。根因与证据见 [BUGS.md](./BUGS.md) `BUG-014`，步骤见 [gui-e2e/cases-workbench-task.md](./gui-e2e/cases-workbench-task.md) `TC-044`
- [x] **M14-2 页面重置 / 换素材（四页统一）**：剪切/编辑页头常驻「打开其他视频」（复用既有 `loadFile`）+「重置」；合并页「清空列表」；工作台「清空工程」（**必须同批清撤销栈**，`FR-1737`/plans/M11.md §18.9）；有未导出产物才二次确认（工作台始终确认）；**重置后停在本页空态**（用户裁决） → **—（体验缺口）· UI.md §9.2 · `pages`/`utils`/`types` · TC-046**（2026-09-28 落地：重置 = **卸载文件回空态**（用户当日裁决，UI.md §9.2 的措辞同批修正）；四页动作与确认规则见 [plans/M14.md](./plans/M14.md) §19.2 落地记录）
- [x] **M14-3 合并 / 工作台默认输出名**：默认名 = `<首个素材名>_merged` / `_workbench` + 按 `ADR-033` 预判的扩展名（copy 跟随源容器、重编码 mp4）；用户手改过即停止联动（`nameDirty`）；重名沿用决策 #19 只加时间戳。顺带收口 HANDOFF 未决项「界面显示的输出名 vs 实际落盘名」的合并/工作台半 → **—（体验缺口）· DESIGN.md §8.3 · UI.md §9.5/§9.8 · `pages`/`utils`/`types` · TC-046**（2026-09-28 落地：命名收敛进 `utils/paths.ts::defaultOutputName`，合并/工作台/编辑器三处同源 + 6 条 Vitest；披露与边界见 [plans/M14.md](./plans/M14.md) §19.3 落地记录）
- [x] **M14-4 剪切页「开始/结束 = 当前帧」**：与工作台源剪切视图对齐（那里早有这两个按钮）；按钮与 `I`/`O` 快捷键**共用同一条钳制回调**，不复制表达式 → **—（与工作台对齐）· UI.md §9.4 · `pages`/`utils`/`types` · TC-046**（2026-09-28 落地：`commitStart`/`commitEnd` 被按钮、`I`/`O`、两个数字输入四处共用）
- [x] **M14-5 放大预览双态 + 成品预览套用裁剪变换**：新增 `cropPreviewBox` 纯函数（裁切窗口 + 缩放平移，与 `crop → scale` 逐像素等价）配 Vitest；三个消费点（放大页 / 加工视图 / 成品预览）；编辑侧双态切换不重置选区；成品预览不再叠选区框 → **FR-354 · AC-354-1 · BUG-015 · `ClipTimeline`/`CropOverlay` · `ProductPreview`/`TaskProgress`/`hooks` · `pages`/`utils`/`types` · TC-045 · TC-046**（2026-09-28 落地：纯函数落为 `utils/crop.ts::cropPreviewTransform`——**transform 形态**而非 left/top/width/height，理由见 [plans/M14.md](./plans/M14.md) §19.5 落地记录；+5 条 Vitest（含 500 组映射不变量）；同批给 `VideoPlayer` 加 `videoStyle`、`CropFields` 加 `disabled`；**`BUG-015` → `fixed`**，真机半待 `TC-045`）
- [x] **M14-6 片段池手柄语义修正（不排序）**：图标与提示文案改成"拖入时间轴"语义（消除"像排序手柄"的误导）；`UI.md` §9.8 与 `components/ClipPool` 头注释同批写明"池不排序"（**重申决策 #13，不翻案**） → **—（误导修正）· UI.md §9.8 · `ClipTimeline`/`CropOverlay` · `pages`/`utils`/`types` · TC-046**　✅ **2026-10-05 落地**：`pages/Workbench/ClipPool.tsx` 手柄图标 `GripVertical` → `ArrowRight`、`title` 保持"拖入时间轴"，池标题提示收敛为「池内不排序（顺序只在时间轴上表达）；拖卡片到时间轴即可加入」，文件头注释与 `UI.md` §9.8 同口径写明"池不排序"。（`SourceCards` 的 `GripVertical` 是**真·拖动排序**手柄、`title="拖动排序"`，语义正确，不在本项范围）

**验收**：AC-380-1（连播）· AC-354-1（双态预览）· TC-044/TC-045（真机回归）· TC-046（手工）——口径见 DESIGN.md §3 · UI.md §9，执行见 TESTING.md。

## M15 保留式裁剪（`CAND-020` 晋升，2026-09-28 立项，**最高优先级**）

> **关联**：`FR-326` · `ADR-037` · [plans/M15.md](./plans/M15.md)（实施方案）·　**验收**：AC-326-1　——　执行：TESTING.md TC-047（自动半 + 手工半）
> **优先级**：**本批与它的直接相关项排在全库最前**（2026-09-28 用户裁决，`ADR-037`）——相关项 = `M14-2`（重置/换素材，剪切流的重来路径）· `M14-3`（默认命名，同族输出命名口径）· `M14-4`（入/出点=当前帧，标记边界的最常用操作）。**后端零改动**（走 `pipeline` 规则 A 的全程 copy）。

- [x] **M15-1 派生链纯函数**：`utils/removal.ts`（归一化删除区间 → 对 `[0,时长]` 求补集 → **吸收**低于 `MIN_SEG_DURATION_SEC` 的碎片保留段 → 保留段起点**向上对齐关键帧** → **不动点迭代到稳定**）+ `utils/time.ts` 的 `nextKeyframeAtOrAfter`（与 `realCutStart` 同族、方向相反，注释互相指认）；配 `utils/removal.test.ts`（含关键帧稀疏下的迭代用例 + 三态门禁） → **FR-326 · AC-326-1 · `pages`/`utils`/`types` · TC-047（自动半）**（2026-09-28 落地：派生链 + `nextKeyframeAtOrAfter` + 22 条 Vitest；实现裁决见 [plans/M15.md](./plans/M15.md) §20.2）
- [x] **M15-2 剪切页「删除」模式**：工具栏「提取片段 / 删除片段」分段控件（默认提取，现行为不变；删除模式隐藏"极速/精确"）；「标记为删除」+ 删除列表（标记范围 / **实际删除范围** / 延伸量 / ✕ / 点击 seek）+ 保留段汇总（段数 + 总时长）+ `Timeline` 新增可选 `marks` 只读色带 + 实际延伸虚线；门禁三态（未标记 / 关键帧未就绪 / 全删光）禁用导出并给原因 → **FR-326 · AC-326-1 · UI.md §9.4 · `components/Timeline` · `pages`/`utils`/`types` · TC-047（手工半）**（2026-09-28 落地：模式/标记/列表/色带/门禁 + 导出接线最小子集；落地记录与拆分调整见 [plans/M15.md](./plans/M15.md) §20.3/§20.4）
- [x] **M15-3 导出接线**：`keeps` → `PipelineItem[]`（同源、无变换）→ `checkPipeline` 拿"✓ 全程无损"徽标 → `submitTask({type:"pipeline"})`；成品名 `<源文件名>_trimmed.<扩展名>`（扩展名按 `ADR-033` 跟随源容器）+ `resolveUniqueTarget` 防覆盖（决策 #19）；进度/取消/任务面板沿用 → **FR-326 · AC-326-1 · `services/tauri.ts` · `pages`/`utils`/`types` · TC-047（手工半）**（2026-09-28 落地：映射/提交/防覆盖随 `M15-2`、本任务补 `checkPipeline` 徽标与 payload 共用；扩展名按"前端不复制容器表"裁决，见 [plans/M15.md](./plans/M15.md) §20.4）
- [x] **M15-4 验证与回归**：`TC-047` 两半跑通（成品时长 == Σ 保留段、`-c copy` 无重编码、删除区间**零残留**、成品结尾不被啃短）+ 现有**提取式**剪切流全回归（多段/`I`/`O`/吸附/极速·精确两模式的参数与命名）；手测点逐条列入提交说明 → **FR-326 · AC-326-1 · TC-047 · TC-010 回归**（2026-09-28 落地：自动半扩到产物侧 e2e `removal_keeps_copy_chain`（零残留首帧比对）；**`TC-047` 手工半 ⏳ 待用户真机发起**，手测点与回归清单见 [plans/M15.md](./plans/M15.md) §20.5）

**验收**：AC-326-1 · TC-047 —— 口径见 DESIGN.md §3.2（含"删除起点精确、终点向上对齐关键帧"的边界口径），执行见 TESTING.md。

## 技术任务（T）

> **批次实施要点（落地内容 / 披露 / 测试载体）已于 2026-09-28 迁入 [archive/handoff-archive.md](./archive/handoff-archive.md)**——避免与 HANDOFF 双写；本文只留任务行与验收指针。

> 与里程碑无关的独立工程任务：不产生新需求（无 FR），做完即勾选；编号 `T-001` 起（见 [INDEX.md](./INDEX.md) §3.1）。

- [x] **T-001 消除 TIMELINE.md §17.4 ↔ plans/M11.md §18.5 的重复描述**：B2 迁移按"只搬不删"，两处对七操作的描述仍重叠；消冗余时只保留 `plans/M11.md` §18.5 的"接线方式"，行为规格留在 TIMELINE.md §17.4。**执行时逐条列出拟删条目交用户审阅后再删** → **—（文档）· 不涉代码 · TC-005**　✅ **2026-10-06 落地（拟删清单 7 项经用户逐条审阅批准）**：§18.5 收敛为纯接线——删「选择」的"点空白取消"与过时 React.memo 残留（M11-9 注记③已裁决不立项）、「波纹删除」行为变更句、状态机①共享边界消歧复述、状态机④ S 键复述、状态机⑥双击边缘（⑦重排为⑥，注记引用仅涉②⑤不受影响）、时间码理由句、右键菜单条目清单；均改指针指向 TIMELINE.md §17.4/§17.3，实施注记三条不动。核对 §18.5 无独有行为规格需回搬，纯删
- [x] **T-017 移除片段池「拖入时间轴」手柄与整条池→轴拖拽链路**（用户 2026-10-07 裁决：「+」加轴已够用，箭头没啥用；**取代 M14-6 的手柄形态**——池不排序的决策 #13 不受影响）：规格先行（UI.md §9.8 ③ 同批改写），`ClipPool` 删手柄、提示改「用「+」加入时间轴」；`Workbench` 删 `extDrag` state 与 `insertToTimeline`；`ClipTimeline` 删 `externalDrag`/`onInsert`/`onExternalDragEnd` props、跨容器拖拽 effect、`extIndex` 插入指示线、`indexAtX`/`insideViewport`（全链死代码，T-006 同口径）；撤销栈层 `buildInsert` 保留（A 键追加与块重排仍在用）→ **UI.md §9.8 · TC-046⑤（同批改写）**　✅ **2026-10-07 落地**（tsc/eslint/vitest 全绿；真机核对：手柄消失、提示更新、「+」既有逻辑不变）
- [x] **T-018 源剪切视图预览过小 + 播放控制条溢出**（用户 2026-10-07 截图反馈）：`CutModeView` 的 VideoPlayer 原钉在 `max-h-[20vh]` 非 fill 模式——视频元素横跨整个舞台宽（画面靠 object-fit 居中缩），控制条跟着元素走、右缘顶出视口（截图中 1× 被切）。**改法**：改 `fill` 模式——视频吃满预览区剩余高度、控制条全宽贴底。预览区本身的高度分配（窗口短时被选区轴/常驻时间轴/池挤小）属面板比例问题 = `CAND-021`，不在本项范围 → **UI.md §9.8（fill 化不改行为规格）**　✅ **2026-10-07 落地**（真机：控制条右缘 1214 < 视口 1280 不再溢出；视频吃满预览区）。**同日延伸（用户红框需求）**：源剪切工作面（预览+选区轴+入出点行）整体可全屏——「添加为片段」旁加全屏按钮，真机验证 800px 窗口下全屏视频 1264×634；常态布局的高度分配仍归 `CAND-021`
- [x] **T-002 清理空组件目录**：src/components/ 下 2026-09-13 遗留的三个空目录 CropEditor / RotateEditor / MergeEditor（git 不跟踪空目录，故不含路径引用——删除后 check-docs 的路径可达检查会失败）。先确认 R2-1 拆分是否复用这三个名字（复用则保留），再决定删除；**执行需用户放开"不碰代码"约束**（2026-09-25 过度工程审查已确认 R2-1 未复用这三个名字，删除条件满足，见归档 §5） → **—（工程·目录清理）· TC-005**　✅ **2026-10-06 落地**（用户当日放开约束；`rmdir` 三个空目录，无代码改动）
- [x] **T-003 审查发现的一致性/健壮性收敛**（来源 [archive/code-review-2026-09-19.md](./archive/code-review-2026-09-19.md) §4.1/§4.4/§4.6–4.8/§5.3）：pipeline 裁剪越界预检提前到提交期（与 CropZoom 口径一致）；`record_terminal` 回调移出 `on_terminal` 临界区（当前 `if let` 临时量持锁至块尾，存在自死锁窗口）；`useTauriEvent` 与 Workbench `onError` 的 `generateProxy` 补 `.catch`；缩略图 effect 依赖 `[files]` 收敛为稳定 key（消除重复 IPC）；`locked_encoder` 增加白名单校验 → **NFR-006 · NFR-007 · `task/manager.rs` · `commands/*.rs` · `services/tauri.ts` · `ProductPreview`/`TaskProgress`/`hooks` · TC-004**　✅ **2026-10-06 落地**：① `record_terminal` 改 take→锁外调用→放回（回调期间被 `set_on_terminal` 覆盖则不回写），补锁外执行回归测试（回调内再触 `set_on_terminal`，通道超时把死锁挂起转成确定失败）；② `submit_pipeline` 改 `async`（调用方 `submit_task` 本就是 async，与 CropZoom 的 `.await` 模式一致），提交期按同一套 facts+plan 重算 `display_crop_rect` 校验裁剪越界（探测走 LRU 缓存）；③ `useTauriEvent` 订阅与 `useProxyPreview::onError` 的 `generateProxy` 补 `.catch`（ProductPreview 侧已有）；④ 缩略图稳定 key 已随 `T-005` 的 `useThumbnails` 落实；⑤ **`locked_encoder` 白名单经核实已实现**（`effective_encoder` 按 `LOCKABLE_ENCODERS` 校验、四处调用方全走它、含非法值回退单测），不重复立案。
- [x] **T-004 把 R4 攒下的命令级矩阵转成 Vitest 用例**：`TC-022`（`pxToCrop`）、`TC-028`（`cropToPx`）、`TC-024`（`needsProxy` 容器维度）三组矩阵此前用 `node --experimental-strip-types` 跑一次性脚本，**载体已在 `M11-0` 就位**（`pnpm test`）——按 [TESTING.md](./TESTING.md) §3.4 表后注里记的**同域同种子**重跑并固化为 `src/utils/*.test.ts`（含为 `utils/media.ts` 的 `wantsProxy`/`containerPlayable` 补导出或用例入口）。**注意**：`TC-028` 的随机域是 3 组尺寸 × 3688320 组，直接固化会让 `pnpm test` 跑几十秒 → 固化时缩到能覆盖边界的最小样本并把缩减写进用例注释 → **—（测试载体）· `utils/crop.ts` · `utils/media.ts` · TC-022 · TC-024 · TC-028**
- [x] **T-005 重复收敛·第三轮过度工程审查**（来源 [archive/code-review-2026-09-25-overengineering.md](./archive/code-review-2026-09-25-overengineering.md) §1/§2 标 shrink 项，证据与行号见归档）：**Rust**——ffmpeg 10 个构建器的 8 元素参数头收敛 `base_args()`（AGENTS §4 第 2 条：参数序列断言同批跑通）· `file_name` 6 份并一进 `commands/mod.rs` · 缩略图双胞胎函数合并（**顺带修 `media.rs`"收敛留给 R2-2"失账注释——查 R2-2 落地清单实未含本项**）· pipeline `n_norm` 双遍 `diff_pair` 改单遍 · `resolve_sidecar` 矛盾注释留一 · `pipeline::temp_token` 上收 `commands/mod.rs`（R3-5 后 mod.rs 反向引用子模块，实施时一并上收消掉）；**前端**——`PageHeader`（6 份页头，Cut 页内就有两份）· `EmptyImport`（4 份空态）· `useConsumeInitialFiles`（4 份 ref-sentinel）· `useThumbnails`（2 份同构 effect，与 `T-003` 缩略图条目配合）· `submitWithUniqueTarget`（2 份防覆盖链）· 旋转/翻转显示变换进 `shared.ts`（2 份）· `frameStepOf`（3 份＋undo 层第四处）· `EditorTool`/`EditorTab` 重复 union 合一 → **—（工程批次）· `ffmpeg/command.rs` · `commands/*.rs` · `pages`/`components`/`utils` · TC-005**（估算 ≈-265 行）　✅ **2026-10-06 落地**——落点与偏差：`base_args()` 收敛 10 构建器（**顺带把 `normalize_args` 的弱断言测试补强为精确序列**——改造中丢 `-i` 的回归单测没抓到、靠 e2e 抓到，暴露断言缺口）；`file_name` 实际为 3 份具名（merge/pipeline/cut）+ 3 处内联链（rotate/crop/media，审查后漂移），统一收敛进 `commands/mod.rs`；缩略图内核 `generate_thumbs_sync`（缓存键不变，两入口薄壳）；`temp_token` 连同 `TEMP_SEQ` 上收 mod.rs；前端新组件 `components/PageHeader`（6 页头）、`components/EmptyImport`（4 空态）、hooks `useConsumeInitialFiles` / `useThumbnails`（**依赖按内容 key 判定 = 顺带落实 `T-003` 的"缩略图 effect 稳定 key"子项**）、`services/tauri.ts::submitToUniqueTarget`；显示变换收进 `RotateControls::displayedStageStyle`（放 `pages/Workbench/shared.ts` 会让组件反向依赖页面模块）；`frameStepOf` + `DEFAULT_FPS` 上提 `utils/time.ts`（undo 层改为引用）；`EditorTool`/`EditorTab` 已在 `T-006` 合一为 `types::EditorToolTab`，本条不重复。
- [x] **T-006 死代码与投机灵活性清理·第三轮过度工程审查**（来源同上 §1/§2 标 delete/yagni 项）：**Rust**——`normalize_crop_rect`/`validate_crop_rect` 两层单调用封装内联（测试直调 `align_rect`）· `subtitle_count`/`bit_depth` 双端死字段（probe 解析→lib.rs→types 全链 0 消费；**DESIGN §7 同提交同步**，AGENTS §3 第 17 条）；**前端**——撤销 JSON 序列化通路 `toJSON`/`commandFromJSON`/`CommandJSON` 删除（全仓 0 生产引用、PLAN/DESIGN 无会话恢复排期；round-trip 用例随删 ≈-60 行；**同步 `plans/M11.md` §18.1 的"序列化留口"描述与单测基线 ②，避免文档与实现矛盾**）· 撤销栈 `limit`/`depth` 旋钮删参取常量 · Editor 死 `playerRef` · `RotateState`/`CropRect` 再导出 shim ×2 · `appendFrontendLog` level 收窄为仅 `"error"`；**豁免不立案**（撤销读回侧 / speed 链 / `submit_with_cleanup`，理由见归档 §4） → **—（工程批次）· `commands/crop.rs` · `ffmpeg/probe.rs` · `lib.rs`+DESIGN §7 · `utils/undo` · `types`/`services` · `plans/M11.md` · TC-005**（估算 ≈-80 行＋测试 ≈-70）　✅ **2026-10-06 落地**——**四处偏差**（归档证据基于 09-25 快照，代码其后前进）：`subtitle_count` **保留**（`merge.rs` 音轨/字幕布局校验在生产消费，非死字段，审查只查了前端）；Editor `playerRef` **保留**（现已解引用——页面卸载 `pause()`）；`appendFrontendLog` 收窄为 `"error"|"debug"` 两值（M11-9 性能埋点在用 debug）；`depth` getter **保留**（单测消费，只删 `limit` 参数并重写溢出用例为 `UNDO_LIMIT` 循环）。已删：`bit_depth` 全链（probe→lib.rs→DESIGN §7，HANDOFF 未决行同步）、撤销 JSON 通路（同步 TIMELINE §17.5 + plans/M11.md §18.1，基线 6 条改 5 条）、`limit` 旋钮、两个再导出 shim（`EditorTool`/`EditorTab` 合一为 `types::EditorToolTab`）。
- [x] **T-007 片段加工视图的时间刻度改为片段区间**（缺陷修复，[BUGS.md](./BUGS.md) `BUG-016`，用户 2026-10-05 反馈）：`pages/Workbench/EditModeView.tsx` 的进度条刻度/时间读数/键盘走带由**整源**改为**片段区间**（`toRel`/`toSrc` 与源内时间互转并钳在区间内；`seg = null` 退化为整源），顺带消掉"拖到区间外被弹回入点"。**不动**剪切页源剪切视图与编辑页——那两处的选区语义本来就在整源上 → **UI.md §9.8（同批把"刻度也以区间为准"写明）· TC-049**　✅ **2026-10-05 落地**
- [x] **T-008 片段加工：播完出点后无法重播 + 进度条到不了终点**（缺陷修复，[BUGS.md](./BUGS.md) `BUG-017`，用户 2026-10-05 反馈）：① 起播回退改为 `pendingPlayRef`——`seek(入点)` 后**不立刻** `play()`，等 `onTime` 报出已落回入点附近再起播（期间不参与越界判定）；seek 迟迟不落地时标志保持、`playing` 仍 false，用户再点一次走直通分支自愈，不会卡死。② 进度条 `step=0.05` → `step="any"`（区间长度通常不是 0.05 的整数倍，吸附导致拇指到不了最右端） → **UI.md §9.8 · TC-050**　✅ **2026-10-05 落地**（真机复测：②已好；①的残留部分经真机定位为另一根因 → `T-009`）
- [x] **T-009 播放态与 `<video>` 脱钩（换源/重载后按钮永久「暂停」且无法重播）**（缺陷修复，[BUGS.md](./BUGS.md) `BUG-018`，`T-008` 复测残留）：`components/VideoPlayer/index.tsx` 补 `loadstart` 监听——媒体**重新加载**会把 `paused` 置回 true 却不触发 `pause` 事件（规范如此），只靠 `onPause` 回写会让 `playing` 永远停在 true；此处补 `stop()` + `onPlayStateChange(false)`。`pages/Workbench/EditModeView.tsx` 去掉**乐观 `setPlaying`**（`play()` 没起来就先翻按钮），播放态改为**只由 `<video>` 事件回写**（单一真源）。真机触发路径：`useProxyPreview` 在代理任务完成时切 `src`（`useProxyPreview.ts:50`） → **UI.md §9.8 · TC-051**　✅ **2026-10-05 落地**（真机自测：重载后按钮回「播放」、点击即重新播放；用户序列复跑无回归）

- [x] **T-010 「起播回退」门解除条件鸡生蛋 → 重播永久僵死**（缺陷修复，[BUGS.md](./BUGS.md) `BUG-020`，`T-008`/`T-009` 修复后用户仍复现）：`T-008` 引入的 `pendingPlayRef` 把解除条件写成"等 `onTime` 报出位置已落回入点附近"，但 `onTime` 主要由 **rAF** 驱动、而 rAF 只在 `play` 之后才启动——这里等的正是"还没播"的阶段（鸡生蛋）；解除只能寄望 `seeked` 的那一次手动上报，一旦丢失标志**永久挂着**，第二下点播放走直通分支时元素仍在 `seeking` 且 `preload="metadata"` 无可播数据 → `play()` 既不发 `play` 事件也不推进帧。改法：`VideoPlayer` 新增 `onSeeked`（`seeked` DOM 事件，与轮询无关）作为解除信号，并删掉"±0.3s 落点容差"这种靠猜的判定 → **UI.md §9.8 · TC-052**　✅ **2026-10-05 落地**（真机：修复前 6 轮压力第 1 轮必现 `btn=播放 t=7.00 paused=true`，修复后标准 3/3 + 换源变体 3/3 全过）
- [x] **T-011 成品预览（回退虚拟连播）播到末尾后重播不动**（缺陷修复，[BUGS.md](./BUGS.md) `BUG-021`，用户 2026-10-06 反馈"只有从中间剪的片段不能重播、全段可以"）：越界判定 `currentTime ≥ 段出点 − 0.03` 一条判定同时管"切下一段"与"到末尾停"，而"停"只 `pause()`、不改 `currentTime` → 元素停在 ε 区间内，再按播放 `play()` 后**第一帧**又被同一条判定按停（真机探针 `play()`→7ms→`pause()`，中段与全段都死；渲染即预览分支是单文件 `<video>`、末尾 `ended` 后由浏览器回绕，故用户看到"全段可以"）。改法：新增纯函数 `utils/productPlayback.ts::shouldRewindOnPlay`（末段且 `ended` 或已停在/越过出点）——单段成品同槽回绕到区间起点、多段成品 `seekInternal(0)` 跨槽回成品起点，再起播（与渲染分支同口径）；tick 的硬编码 `0.03` 收敛为同源常量 `OUT_POINT_EPS` → **DESIGN.md §3.8 · UI.md §9.8 · TC-053**（+8 条 Vitest：`src/utils/productPlayback.test.ts`）　✅ **2026-10-06 落地**（真机：中段/全段/两段成品三条路径重播全部真正起播，段间接力与末尾停止无回归）
- [x] **T-012 片段加工重播：起播当场发出（反馈），连点不得把重播点没**（缺陷修复，[BUGS.md](./BUGS.md) `BUG-022`，`T-010` 之后用户实机仍报"点播放无法重播"）：回退 seek 在长 GOP 1080p60 源上要 **1.6~2s**，而"等 `seeked` 再 `play()`"让这整段窗口里按钮仍是「播放」、画面不动（真机采样 8 个点 1.6s 全无变化）；用户必然连点，而每次连点都打断上一次未落地的 `play()`（用户日志同窗口 6 条 `AbortError`）→ 现场即"无法重新播放"。改法：`EditModeView.togglePlay` 的起播回退把 seek 与 `play()` **当场一起发出**（门保留、仍由 `seeked` 解除，只挡回退期间旧位置的越界判定）；`handleSeeked` 不再补 `play()`（回退窗口内用户按的暂停不得被抢回）；`VideoPlayer.play()` 吞掉竞态 `AbortError`（消除日志噪音，真故障仍走 `error` → `onError`） → **UI.md §9.8 · TC-054**　✅ **2026-10-06 落地**（真机：点击后首个 200ms 采样点即 `btn=暂停`，seek 落地自动续播到出点；连点 6 次后单击仍正常重播；循环 4.8s 周期无回归）
- [x] **T-013 片段加工「点画面」这条播放入口绕过区间回退 → 播完怎么点都重播不了**（缺陷修复，[BUGS.md](./BUGS.md) `BUG-023`，用户 2026-10-06 澄清"不是成品预览，是直接选择片段重播不行"）：片段加工有两条播放入口，「播放」按钮走 `EditModeView.togglePlay`（含"停在出点先 `seek` 回入点"），而**点画面**走 `VideoPlayer` 内建默认 `onClick`（`if (v.paused) play() else pause()`）——**完全绕过区间逻辑**：停在出点时点画面只 `play()`，位置仍在出点之外，`handleTime` 的越界判定下一帧就 `pause()` + `seek(seg.end)`，每次只起播一帧（真机探针：`play()` → **11ms** → `pause()`，2s 后仍停在出点）；`seg = null` 的全段片段不参与越界判定，所以只有"从中间剪出的片段"必现。**改法**：`VideoPlayer` 新增 `onVideoClick`（覆盖画面点击语义）并由 `EditModeView` 传 `togglePlay`——两条入口收敛为同一条走带；顺带把"自然到底不回写播放态"补上（`ended` 监听：`stop()` + `report()` + `onPlayStateChange(false)`；规范里到底只置 `ended`、`paused` 仍为 false，不补这条按钮会停在「暂停」、重播要点两次），默认点击也把 `ended` 当"可起播" → **UI.md §9.8 · TC-055**　✅ **2026-10-06 落地**（真机：点画面 400ms 采样即 `t=4.303 paused=false btn=暂停`、4s 时正在播；`ended` 回写与默认点击对剪切页/编辑页/源剪切视图无回归）
- [x] **T-014 解码管线错误（PIPELINE_ERROR_DECODE）→ 元素报废，重播永久失效**（缺陷修复，[BUGS.md](./BUGS.md) `BUG-024`）：`T-011`/`T-012`/`T-013` 后 `appendFrontendLog` 埋点日志显示前端走带逻辑全部按设计工作（门上锁/解除、越界判定、回退分支走向均正确），真凶在 WebView2 解码层——回退 seek 要从关键帧重解码整个 GOP，解到非关键帧包时 `PIPELINE_ERROR_DECODE`（code=3）；error 后元素进入**永久故障态**（`play()` promise 永久 pending、`ev play` 照发但画面纹丝不动），不 `load()` 重建就再也播不了。同会话初始起播与完整播放均正常 → **非必现**，依赖源/GOP/解码器状态，故前三轮真机测试未覆盖。**改法**：`VideoPlayer` 对 code=3 **软重建**（记位置与播放意图 → `v.load()` → 内部 `loadedmetadata` 后 seek 回原位、原在播放则续播；不转发 `onError` 防误切代理；连续 3 次失败转交上层、真正出帧清零计数）。**用户复测发现第一版缺陷**：续播判定用了 `!v.paused`，而错误路径把 `paused` 属性抢先置 true、`pause` 事件晚于 `error` 派发 → 重建后永远不续播（重播要点两下：第一下只回原点；循环到出点回卷后停在入点）→ 改为跟踪**播放意图**（`play` 置 true / `pause`/`loadstart`/`ended` 置 false），error 时刻 `!v.paused || 意图` 两种事件序都覆盖 → **TESTING §3.4 · TC-056**　✅ **2026-10-06 落地**（真机两轮，用户确认：一键重播成立、循环连续回卷；第一版 `!v.paused` 续播判定被复测推翻，详见上文）
- [x] **T-015 工作台内拖拽素材/片段被误当成"外部文件拖入"**（缺陷修复，[BUGS.md](./BUGS.md) `BUG-025`）：素材卡（SourceCards）/ 片段池（ClipPool）/ 合并列表（Merge）的缩略图是**裸 `<img>`**——无 `draggable={false}`、无 `dragstart` 拦截，排序手柄上的 `preventDefault` 只护住手柄本身；用户按在**缩略图**上拖动（想排序/拖入轴但没按中手柄）→ WebView2 发起浏览器原生图片拖拽 → Tauri 以 `dragDropEnabled: true`（默认值）接管 WebView2 拖放通道，页面内发起的原生拖拽同样命中 wry 的 IDropTarget → `onDragDropEvent` 照常收到 enter/over，而 `onDragHover` 对内容不做区分 → 弹出与外部拖视频一模一样的全屏导入遮罩（用户症状）；缩略图是 png/jpg，`expand_video_inputs` 扩展名过滤会拦下 drop，故多数情况停在"遮罩误亮"，不排除上抛路径落在视频文件上时误导入。**改法**：三处缩略图 `<img>` 加 `draggable={false}`（SourceCards / ClipPool / Merge/index）。真机原生拖拽无法用 CDP 合成事件自动化复现，按静态根因链定位 + 手测验证 → **TESTING §3.5 · TC-057**　✅ **2026-10-06 落地**
- [x] **T-016 成品预览进度条"条外松手"后冻结不动**（缺陷修复，[BUGS.md](./BUGS.md) `BUG-019`，用户 2026-10-05 报告"没有多次复现"）：真机 CDP **确定性复现**——进度条 `draggingRef` 只在 input 元素自身监听 `pointerup`/`pointercancel`，原生 range 不做指针捕获，条外松手时 `pointerup` 不派发给 input → 拖动态永久挂起 → rAF 直写分支被永久跳过（视频照走、条冻死；实测条停 6.80 视频走到 10.66）。**改法**：收尾统一走 `beginPointerDrag`（红线 20，window 级 pointerup/pointercancel/窗口外兜底）；同批把静态排查出的同族脱钩一并加固——`safePlay` 吞 AbortError、槽位/成品 video 补 `loadstart` 播放态回写（活动槽以 `pendingSeek` 为门防误杀 `switchTo` 换装）、follow effect 起播前把 `< srcStart` 归位段起点、`[preview]` error 埋点取证 → **TESTING §3.5 · TC-058**　✅ **2026-10-06 落地**（真机：修复后条外松手 bar≈t 同步推进；**TC-058 四项全过**（回退分支同场景 + 换源变体））

## 候选池（未排期）

> **候选池的唯一真源是 [CANDIDATES.md](./CANDIDATES.md)**（原 DECISIONS.md §16，含每条说明与量级），此处只保留编号与去向，不复制说明。
> **候选不是承诺**：晋升为里程碑前需先在 [DESIGN.md](./DESIGN.md) 补充完整设计并过决策记录。
> 已晋升：B1/B2/B14 → M8（已完成）· B17 → M10-2（设计中）· B10/B11 → M11 · **CAND-020 → M15**（2026-09-28 晋升，改判为最高优先级，`ADR-037`）· **CAND-030 → M18**（2026-10-07 晋升，`ADR-039`~`ADR-041`）· **CAND-033 → M18-10**（2026-10-07 晋升，`ADR-042`）。
> 未排期编号：**A 高性价比** B3/B4/B5/B6 · **B 值得做** B7/B8/B9/B12/B13/B18/B19 · **C 工程质量** B15/B16。
> 新编号（`CAND-020` 起，说明见 [CANDIDATES.md](./CANDIDATES.md)）：`CAND-021` 模块拖拽调整大小（`idea`）· `CAND-022` 删除的精确边界（`parked` —— `M15` 只做无损后遗留的"帧级精确删除"缺口，待 `M15` 体验反馈再定）· `CAND-031` 硬字幕烧录（`idea`，用户裁决优先级最低，前置 = `CAND-030`）· `CAND-032` 中文字幕翻译（`idea`，whisper 原生只译英）· `CAND-033` 动态模型列表（用户明确要做，M18 主线完成后排期——晋升需推翻 `ADR-039`⑦）。
> 建议优先级：功能面 B6 音频提取 + B12 任务通知（时间线落地后重排）；工程面 B15（**asset scope 收窄 + CSP 是发布前硬门槛**）。
> 明确不做：i18n、多轨编辑器、时间线音频轨编辑/空隙模型/调色/命令面板等（见 [CANDIDATES.md](./CANDIDATES.md)「不做」节）。

**下一步（2026-10-07 更新）**：**M18 AI 字幕实施全部完成**（M18-1~9 全落地；剩真机手测点清单见 M18-9，其中 GPU 可用分支需 N 卡设备）→ M12-3（可选 spike）→ M13（打磨）→ `CAND-033`（动态模型列表，用户明确要做）。`TC-047`/`TC-061`/`TC-062` 等真机半 ⏳ 待用户发起。

> 历史：**M15（保留式裁剪）→ M14-2（页面重置/换素材）→ M14-3（默认命名）→ M14-4（入/出点=当前帧）→ M14-1 ✅（连播停住 `BUG-014`，2026-10-05 修）→ M14-5 ✅（放大双态预览 `BUG-015`，2026-09-28）→ M14-6 ✅（池卡手柄语义，2026-10-05）→ **M14 六项全部落地** → M12-2 → M12-1/3 → M13**。前四项 = `M15` 与它的**直接相关项**（剪切流的重来路径 / 同族输出命名 / 标记边界的最常用操作），2026-09-28 用户裁决提到全库最前（`ADR-037`）；`M14` 其余三项按其原定内部顺序顺延（`M14-1` 的 `BUG-014` 修复**仍在 M14 内最前**）。M15/M14 与 M12/M13 零耦合、**后端零改动**；M12-2 的前置 R3 已就绪。M10 视反馈随时插入（与时间线零耦合）。

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
| 自动渲染预览与手动导出抢并发/磁盘 | 导出变慢 | preview 任务最低优先级排队（**队列调度优先挑选普通任务、不抢占**）；输出走缓存目录并纳入清理（**只留当前一份**）；进行中去重（**新编辑取代旧任务**，同源单例） | M12-2 | 🔄 实施中（2026-10-05，方案见 [plans/M12.md](./plans/M12.md) §21.1/§21.3） |
| 成品连播在片段边界停住（`BUG-014`） | 预览不可用（用户只能逐个片段看） | **先复现定位再改**——静态推演已错一次（`switchTo` 四重时序），禁猜；修后回归 `M11-3` 五个离散同步点 | M14-1 | ✅ 已修（2026-10-05）：真机 CDP 复现定位 → `onPause` 判定改读 `slotRef`；`M11-3` 五个同步点（seek / 段切换 / 暂停 / 结束 / 复位）复测通过 |
| 双态预览被误读成"预览即成品" | 用户拿预览当导出结果 | 预览区保留"近似预览…导出以 FFmpeg 实际输出为准"提示；**M12-2 落地后由真实成品文件取代**（`M14-5` 已收口"预览即裁切构图"） | M14-5 / M12-2 | 🔄 `M14-5` ✅ 2026-09-28；`M12-2` 实施中 |
| 工作台「清空工程」误触丢失编排 | 丢工作成果 | 始终二次确认；**同批清撤销栈**（否则 Ctrl+Z 复活已删片段，比丢失更危险） | M14-2 | ⏳ 待实施 |
| 无损删除的边界会被关键帧"吃掉"一截（`M15`） | 每个删除区间多删最多 1 个 GOP | UI 逐条明示**实际删除范围与延伸量**（NFR-004 口径）；关键帧索引未就绪时**禁用导出**；帧级精确归 `CAND-022` | M15-2 | ⏳ 待实施 |
| `M15` 派生链漏掉"吸附后产生新碎片" | 下发被后端拒绝的段（`valid_segment_span`）→ 整单失败 | 派生链做**不动点迭代**（吸附 → 并回删除区间 → 重算），配关键帧稀疏的专项用例 | M15-1 | ⏳ 待实施 |
