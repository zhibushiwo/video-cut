# video-cut 实施计划

> **职责**：里程碑、任务（checkbox）、验收与风险——描述"做什么、做到哪了"。
> **唯一真源**：**进度的唯一真源**（里程碑状态、任务勾选、验收归属）；任务号 `M#-#`/`R#-#` 为里程碑内序号，`T-0NN` 为独立技术任务。
> **读时机**：接活前 / 汇报进度 / 判断下一步做什么。
> **写规则**：一个任务一个 checkbox，完成即勾选并按约定粒度提交（信息前缀 `M11-3:` 等）；验收行只写 AC 编号，验收口径在 [DESIGN.md](./DESIGN.md)、执行方式在 [TESTING.md](./TESTING.md)；不在此写规格。
> **关联**：[INDEX.md](./INDEX.md) · 上位 [DESIGN.md](./DESIGN.md)（规格仲裁者）与 [TIMELINE.md](./TIMELINE.md) · 当前状态 [HANDOFF.md](./HANDOFF.md)
> **最后更新**：2026-10-25（M22 全落地并真机验证；M0–M9/评审修复/M11 任务行迁 [archive/plan-archive.md](./archive/plan-archive.md)）——内容级明细在各任务行 ✅ 标注与 [CHANGELOG.md](./CHANGELOG.md)

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
| **M18 AI 字幕**（`CAND-030` 晋升 + `CAND-033`/`CAND-031`/`CAND-034`/`CAND-035` 晋升 M18-10/11/12/13） | whisper.cpp 本地转写 → .srt 外挂：引擎 sidecar + tiny 内置 + 模型/GPU 包按需下载（`FR-390`~`FR-393`，`ADR-039`~`ADR-041`）+ 动态模型列表（`ADR-042`）+ 字幕烧录（`FR-394`，`ADR-043`）+ 软字幕封装（`FR-395`，`ADR-044`）+ 烧录样式（`FR-396`，`ADR-045`） | M18-1 文档批（无代码前置） | 1~2 周 | ✅ **实施全部完成**（M18-1~11 全落地 2026-10-07；M18-12 封装 / M18-13 样式 2026-10-11 增补落地；AC-392-1 的 GPU 可用分支手测点 ⏳ 需 N 卡设备；用户真机验证：日文歌素材 VAD 回退生效、防覆盖命名生效） |
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

## 已归档批次(M0–M9 · 评审修复 R1–R4 · M11)

> 以下批次**全部完成**,任务行明细已于 2026-10-25 原样迁 [archive/plan-archive.md](./archive/plan-archive.md)(迁出时无未勾项);历史实施要点见 [archive/handoff-archive.md](./archive/handoff-archive.md),完成态四段关联见 [archive/completed-task-index.md](./archive/completed-task-index.md)。

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| M0 基建 | sidecar FFmpeg / 任务面板 / 历史 / 日志 / 设置 | ✅ 全勾 |
| M1 剪切垂直切片 | 极速/精确剪切 MVP | ✅ 全勾 |
| M2 合并 | 九项检测 + 无损/统一合并 | ✅ 全勾 |
| M3 旋转 + 局部放大 + 精确剪切 | 三工具 | ✅ 全勾 |
| M4 打磨与打包 | 代理预览 / 打包 | ✅ 全勾 |
| M5 工作台(流水线) | plan_items / 任务管线 | ✅ 全勾 |
| M6 工作台 2.0 | 多片段与合成时间轴 | ✅ 全勾 |
| M7 反馈修复 1 | 用户反馈批次 | ✅ 全勾 |
| M8 候选池晋升 1 | probe 缓存 / 磁盘预检 / e2e | ✅ 全勾 |
| M9 工作台修复冲刺 | 手测批次 2 | ✅ 全勾 |
| 评审修复 R1–R4 | 三轮评审产出的工程修复与 BUG-001~005 | ✅ 全勾 |
| M11 单轨时间线核心 | 命令栈/修剪/重排/撤销(TC-043 帧预算报告半待用户) | ✅ 全勾 |



## M10 保活 + 深浅主题（2026-09-15 立项；2026-09-17 起暂缓，决策 #32）

> **关联**：FR-9xx（随 M10 开工发号；需求在 UI.md §9.1/§9.2）　·　**验收**：AC 待发号　——　执行：TESTING.md TC-014

> 用户裁决优先级不高，M9 完成后直接启动 M11。本批与时间线核心零耦合，随时可独立补做；设计要点不变。

- [x] **M10-1 [P1] 页面保活**（决策 #24）：Cut/Merge/Editor/Workbench 离开隐藏不卸载，隐藏瞬间自动暂停播放；History/Settings 维持条件挂载；设置变更即时生效不重置页面（UI.md §9.2） → **FR-9xx（待发号，UI.md §9.2）· AC 待发号 · `pages`/`utils`/`types` · TC-059**　✅ **2026-10-06 落地（随 [BUGS.md](./BUGS.md) `BUG-026` 修复提前实施，M10 解冻本项）**：App 层常挂四工作页（旋转/放大两个 PageName 各一实例、互不串状态）+ 非活动页 `display:none`；`navigate` 统一 `pause()` 全部 `<video>`（React 播放态经既有 pause 事件回写）；`initialFiles` 只喂活动页（防隐藏页消费同一次拖入）；全部 window 级热键按 `active` 门控（Cut/Workbench 两页自身 + CutModeView/EditModeView/ClipTimeline 子组件；useHotkeys 的 M10-1 前置注释兑现）。真机：**TC-059 通过**——切页往返状态完整保留（视图模式与播放位置在内）、隐藏页 Delete 拦截而活动页生效、播放中切页自动暂停且返回按钮如实回「播放」、拖入只进活动页（剪切页收文件而工作台不增）、旋转/放大两实例互不串状态）
- [ ] **M10-2 [P2] 深浅主题**（B17，决策 #25）：`themeMode: dark | light | system` 设置项；`.theme-light` 变量组整体替换；跟随系统 matchMedia 监听实时切换；warn 琥珀与四个主题色浅底对比度逐一校对（UI.md §9.1） → **FR-9xx（待发号，UI.md §9.1）· AC 待发号 · `pages`/`utils`/`types` · TC-014（B17，决策 #25）**

**验收**：AC 待发号（FR-9xx 随 M10 开工）· TC-014（口径见 DESIGN.md §3；执行见 TESTING.md）

**实施顺序建议**：M9-1 → M9-2 → M9-3/4 → M9-5 → M10-1 → M10-2（M9 五项已于 2026-09-17 实施完毕；M10 曾暂缓——M10-1 已于 2026-10-06 随 `BUG-026` 修复实施，M10-2 仍暂缓）。

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
- [x] **M18-10-2 实现**：`list_whisper_models` 动态扫描 models 目录其余 `*.bin`（"自定义"徽标/体积/可删除）+ `submit_subtitle` 模型解析扩展（tiny→resource / 白名单→已知名 / 其余→models 文件名，拒绝路径穿越）+ `delete_whisper_model` 支持自定义 + `WhisperModelInfo.custom` TS 双写 + ModelPicker"自定义"徽标 + 设置 sanitize 放宽 → 验收：F16 模型放入后列表可见可选用；白名单下载/SHA256 不回归　✅ **2026-10-07 落地**（`scan_custom_models`（白名单文件名排除 + `.bin` 后缀过滤 + label=文件主名 + 排序）+ `resolve_model_path`（tiny→resource / 白名单→已知名 / 其余→models 文件名，`valid_custom_model_id` 拒绝路径穿越）+ delete 兼容自定义 id；单测 = 扫描过滤（白名单排除/非 bin/半成品/子目录不命中）+ 解析四态（tiny/白名单/自定义/穿越拒绝）；真机预验证 = 用户 models 目录中的 F16 turbo 将在重启后以"自定义"出现；cargo test 116+8 · vitest 153 · tsc/eslint/check:docs 全绿）

**验收**：AC-390-1 · AC-391-1 · AC-392-1 · AC-393-1 —— 口径见 DESIGN.md §3.9，执行见 TESTING.md（TC 随 M18-9 建）。

## M18-11 字幕烧录（`CAND-031` 晋升，2026-10-07 立项并实施）

> **关联**：`FR-394`（[DESIGN.md](./DESIGN.md) §3.9 + §4 矩阵行）· `ADR-043` · [CANDIDATES.md](./CANDIDATES.md)（`CAND-031` 去向）· **重编码 warn 路径**
> **验收**：AC-394-1

- [x] **M18-11-1 文档晋升批**：`ADR-043`（subtitles 滤镜 + CWD 裸文件名 + 音频 copy + warn 语义）+ DESIGN §3.9 FR-394 + AC-394-1 + §4 矩阵行 + CANDIDATES `CAND-031` → M18-11 + PLAN 本节 → `pnpm check:docs` 全绿
- [x] **M18-11-2 实现**：`command.rs` `subtitles_filter_value`（转义）+ `subtitle_burn_args`（重编码 + 音频 copy，红线 1）+ 参数/转义单测 + `VideoTask::SubtitleBurn`（TS 双写）+ `submit_subtitle_burn`（prepare_output/原子替换，CWD=字幕目录）+ 字幕页烧录区（warn 明示 + 手选 .srt）+ e2e 烧录用例 → 验收：AC-394-1　✅ **2026-10-07 落地**（`subtitles_filter_value` 转义单测（\/:' 五例）+ `subtitle_burn_args` 全序列断言；`worker::run_ffmpeg_in` 可选 CWD（run_ffmpeg 委托零改动）；烧录区 = warn 边框明示重编码有损 + 字幕默认跟随最近识别产物/可手选 .srt + 输出 `<源名>_subbed.mp4` 防覆盖；e2e `subtitle_burn_chain` 真跑（CWD=字幕目录 + 中文空格文件名 + 可解码/时长断言）；cargo test 116+9 · vitest 153 · tsc/eslint/check:docs 全绿）

## M18-12 软字幕无损封装（`CAND-034` 晋升，2026-10-11 立项并实施）

> **关联**：`FR-395`（[DESIGN.md](./DESIGN.md) §3.9 + §4 矩阵行）· `ADR-044` · [CANDIDATES.md](./CANDIDATES.md)（`CAND-034` 去向）· **signal 无损路径**（与 M18-11 warn 烧录互补）
> **背景**：VideoCaptioner 对比调研后立项——识别产物此前只有「烧录（重编码）」一条出口，缺"零重编码、播放器可开关"的软字幕形态；红线上**显式偏离红线 2 的 `-map 0`**（替换字幕轨语义，`ADR-044`①）

- [x] **M18-12-1 文档晋升批**：`ADR-044`（copy 封装 + 显式映射偏离记录 + 容器按扩展名判定）+ DESIGN §3.9 `FR-395`/`AC-395-1` + §4 矩阵行 + UI.md §9.11 两个导出区 + CANDIDATES `CAND-034` → M18-12 + PLAN 本节 → `pnpm check:docs` 全绿　✅ **2026-10-11 落地**（§3.9 需求/验收/决策三行同步扩 FR-395/AC-395-1/ADR-044；§4 矩阵新增「字幕封装」行；UI.md §9.11 同批补记 M18-11 漏写的烧录区规格；`CAND-032` 补注 LLM 云翻译路线关闭）
- [x] **M18-12-2 实现**：`command.rs` `subtitle_mux_args`（copy + 按容器判定字幕编码，红线 1 全序列断言两形态）+ `VideoTask::SubtitleMux`（TS 双写）+ `submit_subtitle_mux`（prepare_output/原子替换/output_path_for 兜底）+ 字幕页封装区（signal 明示 mov_text 兼容性 + 与烧录区共用 .srt 选择）+ e2e 封装链（mp4 与 mkv 源、字幕流断言）→ 验收：AC-395-1　✅ **2026-10-11 落地**（`subtitle_mux_container`/`subtitle_mux_args` + 三条单测（容器判定 + mp4/mov_text 与 mkv/srt 全序列）；`utils/paths.ts` `subtitleMuxExt` 前端预判（无扩展名与后端同口径走 mkv）+ 2 条 Vitest；e2e `subtitle_mux_chain` 真跑（mp4→mov_text / mkv→subrip、可解码/时长断言；坑：mkv 容器时长取各流最大值，字幕轨末端会污染时长断言——测试 srt 末端收进视频时长内）；顺手清掉 M18-11 存量的两处编译警告（烧录函数未用 `total_sec` + 测试模块未用 `Read` 导入）；cargo test 121+10 · vitest 155 · tsc/eslint/fmt 全绿）

## M18-13 字幕烧录样式（`CAND-035` 晋升，2026-10-11 立项并实施）

> **关联**：`FR-396`（[DESIGN.md](./DESIGN.md) §3.9）· `ADR-045` · [CANDIDATES.md](./CANDIDATES.md)（`CAND-035` 去向）· **M18-11 烧录区的样式增强**
> **背景**：VideoCaptioner 调研同源诉求——libass 默认样式在高清视频上字号偏小，烧录首要诉求是"看得清"；颜色/字体不做（`ADR-045`①，值得做另立候选）

- [x] **M18-13-1 文档晋升批**：`ADR-045`（force_style 三项数字参数 + 结构化传参 + clamp + 留空即旧行为）+ DESIGN §3.9 `FR-396`/`AC-396-1` + UI.md §9.11 样式行 + CANDIDATES `CAND-035` → M18-13 + PLAN 本节 → `pnpm check:docs` 全绿　✅ **2026-10-11 落地**（§3.9 需求/验收/决策三行同步扩 FR-396/AC-396-1/ADR-045）
- [x] **M18-13-2 实现**：`command.rs` `subtitles_force_style`（纯函数拼装 + clamp，单测）+ `subtitle_burn_args` 扩 `style` 参数（None = 序列不变，断言锁定）+ `VideoTask::SubtitleBurn` 加 `style`（serde default，TS 双写）+ 烧录区三个数字输入 + e2e 兼容 → 验收：AC-396-1　✅ **2026-10-11 落地**（`subtitles_force_style` 拼装/clamp 两例 + 全留空返回 None 断言；原全序列断言补 None 参数锁定旧行为不变 + 新增 force_style 追加形态断言；`SubtitleStyle`（lib.rs serde camelCase，`Option<u32>`×3）→ TS `SubtitleBurnStyle` 可选字段双写；烧录区样式行 = 字号/描边/底部边距三个数字输入 + 恢复默认，留空即默认；cargo test 123+10 · vitest 155 · tsc/eslint/fmt 全绿）

## M18-14 字幕页信息架构调整（2026-10-11 用户提出并实施）

> **关联**：`FR-391`/`FR-393` 修订 + `AC-393-2`（[DESIGN.md](./DESIGN.md) §3.9）· [UI.md](./UI.md) §9.9/§9.11 · [CANDIDATES.md](./CANDIDATES.md)（`CAND-036` 批量识别登记，优先级一般放最后）
> **用户三点**：① 选片即预览 + 视频信息（时长/大小等）+ 按模型预估识别耗时；② 批量识别优先级一般放最后（→ `CAND-036`）；③ 模型下载管理迁设置页，字幕页只留选择

- [x] **M18-14-1 文档批**：DESIGN §3.9 FR-391/FR-393 修订 + AC-393-2 + UI.md §9.9「AI 字幕」区/§9.11 收敛 + CAND-036 登记 + PLAN 本节 → `pnpm check:docs` 全绿　✅ **2026-10-11 落地**
- [x] **M18-14-2 实现**：`utils/subtitleEstimate.ts`（系数表纯函数 + Vitest）+ SrtPreview `srtPath` 可选化（选片即预览，识别后同槽叠字幕）+ 字幕页信息卡（probe_media）+ 模型动态下拉（管理迁出）+ 设置页「AI 字幕」区（ModelPicker/BackendBadge/打开模型文件夹迁入，替换静态模型下拉）→ 验收：AC-393-2　✅ **2026-10-11 落地**（估算 = 视频时长 × 模型系数（CPU spike 实测口径 tiny 0.15/small 0.40/turbo 1.85，自定义按 small；formatEstimate 三态展示）+ 6 条 Vitest（floor 修正：30s 是「不到 1 分钟」不是「约 1 分钟」）；SrtPreview 可选 srtPath（null = 纯预览，卸载字幕读入、不清播放器）；字幕页 = 预览 + 信息卡（时长/大小/分辨率/帧率/编码/容器/码率/音轨数 + 估算行）+ 模型/语言双下拉（未下载档标注「设置页可下载」，开始识别按钮对未就绪模型禁用 + title 提示）；设置页「AI 字幕」区 = ModelPicker + BackendBadge + 打开模型文件夹 + 下载进度事件订阅（原静态三档下拉删除，后端行文案同步）；vitest 161 · tsc/eslint/fmt 全绿（无 Rust 改动））

## M19 预览与导出体验（2026-10-11 用户六点反馈立项并实施）

> **关联**：[UI.md](./UI.md) §9.9/§9.11/§9.12 · DESIGN §3.10（`FR-397`）· [BUGS.md](./BUGS.md) `BUG-027` · [CANDIDATES.md](./CANDIDATES.md)（`CAND-037`）
> **用户六点**：① 设置 tab 化 + AI 字幕独立 tab；② 全屏预览不铺满（`BUG-027`）；③ 控制栏 B 站样式；④ 预览实时局部放大（potplayer 式，`FR-397`）；⑤ 导出可到其他文件夹（字幕页先做，`CAND-037` 推广）；⑥ 字幕页底部导出区整合

- [x] **M19-1 文档批**：BUGS `BUG-027` + DESIGN §3.10 `FR-397`/`AC-397-1` + UI.md §9.12 新节/§9.9 tab 化/§9.11 导出区整合 + CAND-037 登记 + PLAN 本节 → `pnpm check:docs` 全绿　✅ **2026-10-11 落地**
- [x] **M19-2 BUG-027 修复**：global.css 全屏态视频 `width:100% + max-height + object-fit:contain`　✅ **2026-10-11 落地**（`width:auto` → 恒满宽 + 高度按比例自适应 + 显式 contain 防变形；fill 模式全屏视觉不变）
- [x] **M19-3 字幕页导出区整合**：单卡双模式（Segmented 无损封装/烧录）+ 共用字幕文件/输出目录行 + 烧录模式样式行 + 「输出到」目录选择（默认输出规则，可临时改，会话内记忆）　✅ **2026-10-11 落地**（边框/按钮颜色随模式 signal/warn；「选择文件夹…」+「恢复默认目录」，覆盖时标注「本次临时」；submitMux/submitBurn 走覆盖目录；样式行仅烧录模式可见）
- [x] **M19-4 设置页 tab 化**：顶部「通用 / AI 字幕」tab，AI 字幕区+语言+后端迁入　✅ **2026-10-11 落地**（tab 会话内记忆不持久化；AI 字幕 section 去掉 border-y 由 divide-y 接管）
- [x] **M19-5 控制栏 B 站样式**：细进度条置顶 hover 展开 + 播放按钮 + 合并时间码 + 倍速文字菜单 + 音量 hover 滑条 + 全屏（全页面播放器同源）　✅ **2026-10-11 落地**（组件内新增 playing 态驱动播放/暂停按钮——与 onPlayStateChange 同源回写；倍速非 1x 时按钮亮 signal 并显示 Nx；音量滑条绝对定位展开不挤布局）
- [x] **M19-6 FR-397 预览框选放大**：VideoPlayer `allowZoom` + Ctrl 拖拽框选 → transform 放大 + 拖拽平移钳制 + Esc/双击/按钮还原（字幕页启用）　✅ **2026-10-11 落地**（几何抽 `utils/videoZoom.ts` 纯函数 + 6 条 Vitest——**推导修正**：可视窗口只需留在内容 [0,1] 内（o ∈ [0, 1−1/s]），首版"必须覆盖所选区间"的约束在 cover 倍率下会塌缩成单点、平移失效；cover 倍率 = 1/max(rw,rh)，transform = `scale(s) translate(-o%)` origin 0 0；交互 = Ctrl+拖拽框选（beginPointerDrag 红线 20）/ 放大态拖拽平移（4px 阈值）/ Esc（全屏时先让 UA 退全屏）/ 双击 / 控制栏还原按钮；光标提示 crosshair/move；拖拽过的 click 不触发播放切换；`allowZoom` 默认关，SrtPreview 启用——编辑页 videoStyle transform 互斥不受影响；vitest 167 · tsc/eslint 全绿，无 Rust 改动）

## M20 应用内自动更新（`CAND-038` 晋升，2026-10-11 立项并实施）

> **关联**：`FR-398`/`AC-398-1`（[DESIGN.md](./DESIGN.md) §3.11）· `ADR-046`（联网边界随 `ADR-040` 修订）· [UI.md](./UI.md) §9.9 · [CANDIDATES.md](./CANDIDATES.md)（`CAND-038` 去向）
> **用户三裁决**：方案 A（官方更新器）/ 启动静默检查（开关默认开可关）/ 手动「检查更新」按钮；端点 = GitHub Pages `latest.json`，更新包 minisign 签名校验

- [x] **M20-1 文档批**：`ADR-046` + DESIGN §3.11 `FR-398`/`AC-398-1` + UI.md §9.9 + CANDIDATES `CAND-038` → M20 + PLAN 本节 → `pnpm check:docs` 全绿　✅ **2026-10-11 落地**
- [x] **M20-2 实现**：密钥对 + `tauri.conf.json`（createUpdaterArtifacts + pubkey + endpoints）+ Rust 双插件接入 + 设置项 `updateCheckOnStart`（TS 双写/sanitize）+ services 封装（check/downloadAndInstall/relaunch）+ 设置页关于区三态 UI + 启动静默检查 + release.yml（签名 env + .sig 上传 + latest.json 生成推 gh-pages）→ 验收：AC-398-1（真机冒烟待下次发版）　✅ **2026-10-11 落地**（密钥对 `tauri signer generate`（无密码）落 `.tauri/`（已 gitignore）——**私钥待用户手动加 GitHub Secrets `TAURI_SIGNING_PRIVATE_KEY` + 本地异地备份**；端点 `https://zhibushiwo.github.io/video-cut/latest.json`；capabilities 加 updater:default/process:allow-restart；前端 services/tauri.ts 动态 import 插件 API（红线 10 例外区）+ `services/updateState.ts` 极简外部 store（useSyncExternalStore：App 启动静默检查与设置页消费同源，静默失败回 idle 无声、手动检查保留 error）；设置页 = 「启动时检查更新」开关行（通用 tab）+ 关于区「检查更新」按钮三态（checking/下载更新 v%+进度/重启安装）+ 已是最新提示；release.yml = 构建步加 TAURI_SIGNING_PRIVATE_KEY env + .sig 随 Release 上传 + node 生成 latest.json（notes 去 pwsh BOM）→ gh-pages 孤儿分支整支重推（内容仅 latest.json，确定性高于增量）；**待用户一次性配置**：GitHub Secrets 私钥 + 仓库 Settings→Pages 启用 gh-pages；cargo 123+10 · vitest 167 · tsc/eslint/fmt 全绿）

## M20-3 发版实机反馈修复（2026-10-11，用户 0.2.0 实测三问题）

> **关联**：[BUGS.md](./BUGS.md) `BUG-028`/`BUG-029` · [UI.md](./UI.md) §9.9（日志入口）· `FR-398`
> **背景**：0.2.0 真机安装后三点反馈——① 打开设置弹 nvccuda.dll 系统错误框；② 检查更新报 missing field 'url'；③ 需要日志入口排查报错

- [x] **M20-3 修复**：① `SetErrorMode(SEM_FAILCRITICALERRORS)` 启动时全局设置（`BUG-028`——错误模式被子进程继承，加载器错误改退出码，探测判读照常）；② 更新端点双通道容错（Pages 失败回退 Release 资产直链，CI 把 latest.json 上传为 Release 资产；本地用插件真实反序列化器验证两版 JSON 均合法，判定为网络污染，`BUG-029`）；③ **日志功能**——设置页「关于」区加「打开日志文件夹」按钮 + 检查更新/GPU 探测/模型列表失败写入日志文件（warn/error 级，`append_frontend_log` 既有通道）　✅ **2026-10-11 落地**（cargo 123+10+2 · vitest 167 · tsc/eslint/fmt 全绿；手测点：①打开设置不再弹系统框（本机有 CUDA 包）②检查更新重试（网络恢复或走回退端点）③「打开日志文件夹」打开且日志含更新检查失败记录。**只在 dev 提交，未发版**——下个版本随发版生效）

## M20-4 更新检查通道修订（2026-10-11 立项，`FR-398` 修订）

> **关联**：[DESIGN.md](./DESIGN.md) §3.11 修订段 · [DECISIONS.md](./DECISIONS.md) `ADR-046` 修订注 · [BUGS.md](./BUGS.md) `BUG-029`
> **背景**：0.2.0 实机验证发现双端点不足——用户本地最新代码仍稳定复现 `missing field 'url'`，github.io 与 Release 资产域名在其网络下均被污染（`ADR-046` 修订注）

- [x] **M20-4 实现**：检查阶段自研直连 `api.github.com`（`repos/{owner}/{repo}/releases/latest` 解析 `tag_name` 比版本号；**原始响应体写入日志**——污染可诊断）；确认有新版后以 `releases/download/v{tag}/latest.json` 为动态端点交官方更新器下载/安装（签名不变）；设置页失败态引导看日志 → 验收：污染网络下检查可成功或可诊断　✅ **2026-10-11 落地**（新增 `commands/update.rs`：`check_update`（reqwest 直连 GitHub API、semver 比较、非 200/非法 JSON/缺 tag_name 三种失败均把响应体截断写日志并给可判读错误）+ `install_update`（`UpdaterBuilder::endpoints` 动态注入 Release 直链 latest.json + `download_and_install`，进度经 `update-progress` 事件 5% 节流；安装器拉起后应用自动退出，UI 一键「下载并安装」）；前端 services 换命令通道（移除 JS 插件直查）、updateState 订阅进度事件；`cargo add semver/url`（均为既有传递依赖）；cargo 123+10+2 · vitest 167 · tsc/eslint/fmt 全绿；手测点：①本机跑 dev「检查更新」——污染时错误可判读且日志含原始响应体 ②网络正常时发现新版 → 下载进度 → 安装器拉起）

## M21 工作台布局与播放器打磨（2026-10-11 用户八点反馈立项）

> **关联**：[UI.md](./UI.md) §9.8/§9.9/§9.11/§9.12 修订 · §9.1（`CAND-021` 落地）· [RELEASE.md](./RELEASE.md)（成文，随 M21-1）
> **用户八点**：① 预览视频变形超出 + 音量/倍速重叠；② 素材/片段池双列 50/50 + 时间轴缩高 + 预览放大/动态化；③ 合并报错（历史损坏文件 + 原始 ffprobe banner 倾倒）；④ 设置加「关于」tab、日志降调；⑤ 检查更新本地仍报错（→ M20-4）；⑥ 框选放大推广；⑦ 字幕页导出文案精简；⑧ 发包流程文档 + 发版规则

- [x] **M21-1 文档批**：本节 + M20-4 节 + UI.md 修订 + DESIGN/ADR-046 修订注 + CANDIDATES `CAND-021` → M21-2 + **docs/RELEASE.md 成文** + AGENTS §5.1（发版铁律 + RELEASE.md 指针）→ `pnpm check:docs` 全绿　✅ **2026-10-11 落地**（check-docs 前四项绿；第 5 项 101/122——RELEASE.md 引用的 `.github/workflows/release.yml` 反引号路径可达性属存量类问题，随实文件存在而通过）
- [x] **M21-2 播放器修正**：fill 模式显式 `object-fit: contain`（变形根因）+ 音量滑条改竖向向上展开（横向压住倍速按钮）　✅ **2026-10-11 落地**（代码随 d16b291 入库——提交顺序瑕疵，内容独立可辨；`writing-mode:vertical-lr + direction:rtl` 竖向 range，向上弹出）
- [x] **M21-3 工作台布局**：素材/片段池 50/50 双列（各自滚动）+ 时间轴高度下调 + 预览默认高上调一档 + `hooks/usePanelHeight.ts` 底边拖拽调高（`CAND-021` 落地，`beginPointerDrag`、clamp 240px~70vh、双击复位、localStorage）　✅ **2026-10-11 落地**（`hooks/usePanelHeight.ts` 新建：px 状态 + resize 重 clamp + localStorage 按页键 + 卸载摘拖拽监听；工作台预览 38vh→面板高度（默认 46vh）+ 底边热区手柄（拖拽/双击复位）；双列 = 素材（左，含批量条）/ 片段池（右）各 `flex-1` + 内容区 `max-h-30vh` 滚动；ClipTimeline 高度 64→52；既有拖拽链路未动）
- [x] **M21-4 ffprobe 错误消息清洗**：剥 banner 行（version/configuration/built with），保留关键错误 + 人话前缀「文件损坏或不完整（可能是历史未完成的半成品）」　✅ **2026-10-11 落地**（`probe.rs::clean_ffprobe_error` + 三处失败点接线 + 2 条单测（实机 banner 样例/全 banner 兜底）；上游 map_err 加文件名的展示形态不变；cargo 125+10+2）
- [x] **M21-5 设置三 tab**：通用 / AI 字幕 / 关于（版本/FFmpeg 版本/检查更新/GPL 迁入）；「打开日志文件夹」移「通用」页尾静态区低调链接　✅ **2026-10-11 落地**（tab 三态；关于区整块迁「关于」tab；日志入口 = 页尾说明行内嵌「日志文件夹」下划线链接，不占版面）
- [x] **M21-6 框选放大推广 + 导出文案精简**：`allowZoom` 启用查看型预览（ProductPreview/剪切/合并；片段加工页除外）+ 字幕页导出卡文案一行化　✅ **2026-10-11 落地**（zoom 交互抽 `hooks/useVideoZoom.tsx`——VideoPlayer 重构为消费 hook（行为不变），裸 `<video>` 页面接入：ProductPreview 双槽 + 渲染分支（onClick 首行 suppressClick + object-contain 顺带修正）、合并页渲染预览（相对容器 + overlay）、剪切页 VideoPlayer allowZoom；字幕页导出两段说明压一行 + mov_text 兼容性提示收进 title）
- [ ] **M21-7 验证收尾**：全量 §4 完事标准 + 手测点清单（不发版——发版须用户明确要求，见 RELEASE.md §0）　⏳ 手测点汇总：①预览竖屏/横屏素材均比例正确不再变形；音量滑条向上弹出不再压倍速 ②工作台双列 50/50 各自滚动、拖卡片入轴正常；时间轴变矮；预览底边拖拽调高/双击复位/重启记忆 ③合并页损坏文件报错变人话 ④设置三 tab、日志链接在通用页尾 ⑤检查更新（M20-4 新通道）：污染时错误可判读 + 日志含原始响应体 ⑥框选放大在成品预览/剪切页/合并页可用，片段加工页无此功能 ⑦字幕页导出卡文案精简后信息仍完整（title 有兼容性提示）

## M21-8 弹性骨架与预览面板反馈修复（2026-10-11 用户实测三问题）

> **关联**：[UI.md](./UI.md) §9.8（弹性骨架）/§9.12（controlsInline/图标对齐）· `CAND-021` 延伸
> **背景**：M21-3 落地后实测——① 页面底部大量空白（页脚没贴底）；② 源剪切时间轴高度没跟着缩、预览还想再大；③ 预览拖高后视频被悬浮控制条遮挡；④ 控制栏右侧倍速/音量/全屏图标垂直错位

- [x] **M21-8 修复**：① **弹性骨架**——根因 = App 保活包裹 div 无高度，页面 `h-full` 解析失败；五个保活包裹 div 加 `h-full overflow-hidden`，页脚恒贴视口底（全页面同口径）；② 源剪切 Timeline 轨道 80px→64px（与成品时间轴 52 同批降档；Cut 页同组件跟随）+ 预览默认高 46vh→52vh；③ **控制条占位模式**——VideoPlayer 新增 `controlsInline`（控制条从悬浮改文档流，视频区 flex-1 不被遮挡），工作台源剪切/片段加工预览启用（全屏仍悬浮）；④ 控制栏右侧控件统一盒子（倍速文字套 h-4 flex 盒，消除基线错位）　✅ **2026-10-11 落地**（tsc/eslint/vitest 167/fmt 全绿；手测点：①页面底部无空白、页脚贴底 ②源剪切时间轴变矮 ③预览默认更高、拖高后画面完整不被操作栏盖 ④倍速/音量/全屏垂直对齐）

## M22 用户反馈实施批（2026-10-24 用户指示开工；范围 = 2026-10-24 登记的 CAND-039~045 与 BUG-030/031）

> **关联**：[CANDIDATES.md](./CANDIDATES.md) `CAND-039`~`CAND-045` · [BUGS.md](./BUGS.md) `BUG-030`/`BUG-031`　·　规格随各任务首批提交补（FR/AC 与 ADR）
> **顺序**：小缺陷先（立刻见效）→ 功能按用户提出次序 → 契约变更最大的纯音频转字幕最后；`BUG-031` 需真机复现取数，**挂起不进本批**（等用户配合跑日志）。
> **真机验证（2026-10-24，用户委托 agent 经 CDP 真机执行，工具与明细见 [gui-test/README.md](../scripts/gui-test/README.md)）**：七项断言全部通过——BUG-030 放大 1.54× 严格裁剪；时间轴 44px + 2s 片段填充率 0.39（自适应生效）；剪切合并产物 4.09s（copy 吸附语义）；分组合并产物 10.02s + 撞名时间戳；mp3 字幕页转写出 srt + 信息卡"纯音频"；烧录样式默认 42 持久化 + 字幕页预填。CAND-043 的对话框起始目录无法程序化枚举，未单独断言（defaultPath 与其余用例共用同一填充链路）。

- [x] **M22-1 框选放大溢出修复（`BUG-030`）**：ProductPreview 渲染即预览分支的成品 `<video>` 包一层 `h-full w-full overflow-hidden`（双槽分支 :587 自带、此前漏了）+ 合并页「生成预览」包裹层加 `overflow-hidden rounded-md`（缩放态裁剪按容器圆角）→ **BUG-030 · FR-397 · `ProductPreview`/`Merge` · 手测**　✅ **2026-10-24 落地**（tsc/eslint/vitest/fmt 全绿；手测点：①工作台渲染预览 Ctrl+拖拽放大画面不再溢出容器、平移不再盖住素材区与页脚 ②Esc/双击还原正常 ③合并页生成预览后框选放大同样被裁住 ④未放大时画面显示与之前一致）
- [x] **M22-2 换素材起始目录（`CAND-043`）**：`pickVideo`/`pickVideos` 加可选起始目录（Tauri `open` 的 `defaultPath`），已有素材时传当前视频所在目录——剪切/编辑/字幕传当前文件目录，合并/工作台传最近添加素材目录；首次打开（无素材）保持系统默认 → **CAND-043 · UI.md §9.2 · `services/tauri.ts` + 五页调用点 · `paths.test.ts` 4 条 · 手测**　✅ **2026-10-24 落地**（tsc/eslint/vitest 171/cargo fmt/cargo test 全绿；手测点：①剪切页改过输出目录后「打开其他视频」从当前视频目录打开 ②编辑/字幕同口径 ③合并/工作台追加素材从最近素材目录 ④无素材首开回系统默认）
- [x] **M22-3 时间轴高度再降档（`CAND-040`）**：工作台 `ClipTimeline` 固定高 52→44px → **CAND-040 · `ClipTimeline/index.tsx:545` · 手测**　✅ **2026-10-24 落地**（源剪切 Timeline 维持 64px 不跟随——它显示整源、用户反馈的是成品时间轴；tsc/eslint/vitest 171/cargo fmt/cargo test 全绿；手测点：①时间轴变矮 ②修剪手柄边缘热区仍可命中 ③池→轴拖投放正常 ④刻度文字不挤 ⑤空态文案单行完整 ⑥块选中/拖拽视觉清晰）
- [x] **M22-4 时间轴自适应占比（`CAND-045`）**：`autoFitPps` = `clamp(min(FIT_PPS_MAX, 视口宽×FIT_FILL_RATIO/总时长), 动态下限)`（常量 0.7 / 240）；自动路径接线、`\` 适应窗口保持 `fitPps` 铺满、手动缩放仍可用 `PPS_MAX=500`；未手动缩放时总时长变化仍自动重适应 → **CAND-045 · TIMELINE.md §17 缩放行 · `geometry.ts` + 4 条单测 · 手测**　✅ **2026-10-24 落地**（tsc/eslint/vitest 175/cargo fmt/cargo test 全绿；手测点：①单条短片段不再铺满全宽(约视口七成、且 ≤240px/s) ②追加长片段后自动重适应缩小 ③手动 +/− 仍可放大到极限(≤500) ④`\` 仍铺满 ⑤修剪中拖动不重拟合）
- [x] **M22-5 剪切合并输出·规格批（`CAND-039`）**：新 ADR（复用 pipeline + `precise` 语义边界 + 命名 `_merged`）+ DESIGN §3.2 新 FR（327 段编号空闲）+ §7 `PipelineItem` 类型行　✅ **2026-10-24 落地**（`ADR-047` + `FR-327`/AC-327-1~3 + §7 `precise` 字段行；CAND-039 → accepted）
- [x] **M22-6 剪切合并输出·后端（`CAND-039`）**：`lib.rs` `PipelineItem` 加 `precise`（serde default）+ `pipeline.rs` `PlanInput`/`plan_items` 分支（precise 阻断规则 A、规则 B 内无条件转码）+ `check_pipeline` reasons + 单测　✅ **2026-10-24 落地**（types 双写同提交（红线 17）；3 条新测试：`precise_without_transform_transcodes`/`precise_blocks_rule_a`/`precise_with_rotation_bakes`；cargo 128+10 e2e+2 全绿，`force_transcode_without_transform_keeps_copy` 语义不变）
- [x] **M22-7 剪切合并输出·前端（`CAND-039`）**：提取模式「合并输出」checkbox + 合并提交链路（极速 items / 精确 `precise: true`）+ types 双写 + `defaultOutputName(input,"merged",…)` 命名 + 预览文案条件化　✅ **2026-10-24 落地**（`mergedItems` useMemo 映射 + `startMergedCut` 走 `submitTask type:pipeline` + `resolveUniqueTarget`；页脚按钮文案「剪切并合并」；checkbox 样式对齐「入点吸附关键帧」；tsc/eslint/vitest 175/cargo fmt/cargo test 全绿；手测点：①极速勾选合并 → 单个 `<源名>_merged.<源容器>` 无损、片段顺序正确 ②精确勾选合并 → 单 mp4、入出点帧级 ③不勾选 → 原逐片段行为不变 ④单片段合并可用 ⑤撞名加时间戳 ⑥预览说明随勾选切换）
- [x] **M22-8 合并分组无损合并·规格批（`CAND-041`）**：新 ADR（分组口径同源 + 两两相容依据 + 跳过与命名）+ DESIGN §3.3 新 FR（334 段编号空闲）+ §7 `MergeComparison.groups`　✅ **2026-10-24 落地**（`ADR-048` + `FR-334`/AC-334-1~3 + §7 命令表行补 groups；CAND-041 → accepted）
- [x] **M22-9 合并分组无损合并·后端（`CAND-041`）**：`merge.rs` 纯函数 `group_merge_facts`（复用 `diff_pair`、组内两两相容）+ `MergeComparison.groups` 字段 + 单测　✅ **2026-10-24 落地**（types 双写同提交（红线 17）；4 条新测试：不相容拆组/全一致单组/三不相容各自成组/组内列表序；cargo 132+10 e2e+2 全绿）
- [x] **M22-10 合并分组无损合并·前端（`CAND-041`）**：检测面板分组展示 + 「分组无损合并」按钮逐组提交 + types 双写　✅ **2026-10-24 落地**（`mergeableGroups` 仅取 ≥2 文件组；检测面板列各组文件名与单文件组提示；`startGroupedMerge` 逐组 `submitToUniqueTarget` + `defaultOutputName(组首,"merged",true)`；提交后"已跳过 N 个参数独特的文件"提示（groupMsg，非错误通道）；tsc/eslint/vitest 175/cargo fmt/cargo test 全绿；手测点：①不一致列表出现分组与按钮 ②提交后 N 个合并任务各自无损 ③单文件组跳过有提示 ④组首派生命名、撞名加时间戳 ⑤全一致时按钮不出现 ⑥「自动统一后合并」不受影响）
- [x] **M22-11 字幕样式默认设置（`CAND-044`）**：烧录样式默认值进 `AppSettings`（settings.json），字幕页默认带入、临时改动不回写；颜色/字体是否随批另行裁决 → **CAND-044 · FR-399 · `types`+`services/settings` 双处 + 设置页「AI 字幕」区 + 字幕页初始值 · 手测**　✅ **2026-10-24 落地**（颜色/字体未做——`ADR-045` 口径维持，值得做另立候选；tsc/eslint/vitest 175/cargo fmt/cargo test 全绿；手测点：①设置页 AI 字幕 tab 填默认 → 字幕页烧录区三项预填 ②页内改动不回写设置、重进页回设置默认 ③留空 = libass 默认不变 ④超界输入自动收敛 ⑤重置全部设置清空默认样式）
- [x] **M22-12 纯音频转字幕·契约与实施（`CAND-042`，FR-400；原计划的契约/实施两批合并为一个提交——契约守卫与功能面同一有机改动）**：`MediaInfo.video` → `Option<VideoStreamInfo>`（Rust/TS 双写 + DESIGN §7/§10）；探测容忍无视频流（零流仍拒绝，1 条新测试 + 旧测试修订）；`diff_pair` 视频段 Option 化（纯音频互拼可判一致、与视频互拼判不一致）；`needsProxy` 纯音频 = false；cut/rotate/crop 纯音频显式拒绝（DESIGN §13 既有规格行）；信息卡纯音频形态；字幕页选择器收音频档。　✅ **2026-10-24 落地**（tsc/eslint/vitest/cargo fmt/cargo test 133+10 e2e+2 全绿；手测点：①mp3 导入字幕页转写出 .srt ②信息卡显示"纯音频" ③mp3 拖入/选择其他页被拒或不可达 ④不生成代理 ⑤视频各页行为不变）

## M23 GIF 导出 + 临时导出目录推广（2026-10-25 用户指示开工；`CAND-009`/`CAND-037` 晋升，`ADR-049`）

> **关联**：DESIGN §3.2 `FR-401`（GIF）· §12 `FR-402`（目录推广）· [CANDIDATES.md](./CANDIDATES.md) `CAND-009`/`CAND-037`

- [ ] **M23-1 规格批**：`ADR-049` + DESIGN §3.2 `FR-401`/AC-401-1~2 + §7 `VideoTask::Gif` + §8.3 `_gif` 命名 + §12 `FR-402`
- [ ] **M23-2 GIF 后端**：`lib.rs` `VideoTask::Gif` + types 双写（红线 17）+ `command.rs` `gif_args`（参数序列断言，红线 1）+ `cut.rs` `submit_gif`（probe 算 scale 长边≤480 偶数、区间校验、磁盘预检、`_gif.gif` 命名防覆盖）
- [ ] **M23-3 GIF 前端**：剪切页页脚「导出 GIF」（作用于当前选区；title 明示无音轨与 >15s 体积提示；与「合并输出」互不影响）
- [ ] **M23-4 临时导出目录推广（FR-402）**：合并页 + 工作台 Footer + 编辑页接字幕页 M19-3 交互（临时目录 + "（本次临时）" + 恢复默认；不持久化）
- [ ] **M23-5 真机验证收尾**：GIF 端到端（产物帧率/尺寸/时长断言）+ 目录推广各页走查 + §4 完事标准

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

**下一步（2026-10-11 更新）**：M18-12 软字幕封装（2026-10-11 当日立项实施）；此前：**M18 AI 字幕实施全部完成**（M18-1~9 全落地；剩真机手测点清单见 M18-9，其中 GPU 可用分支需 N 卡设备）→ M12-3（可选 spike）→ M13（打磨）。`TC-047`/`TC-061`/`TC-062` 等真机半 ⏳ 待用户发起。**M18 AI 字幕实施全部完成**（M18-1~9 全落地；剩真机手测点清单见 M18-9，其中 GPU 可用分支需 N 卡设备）→ M12-3（可选 spike）→ M13（打磨）→ `CAND-033`（动态模型列表，用户明确要做）。`TC-047`/`TC-061`/`TC-062` 等真机半 ⏳ 待用户发起。

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
