# video-cut 文档索引与 ID 规范

> **职责**：全项目文档的唯一地图——每份文档管什么、什么时候读、ID 怎么编、需求到测试怎么追。
> **唯一真源**：文档**分工与 ID 规则**以本文为准（各文档的"职责/真源范围"权威表述在其自身首部元数据头，本表为摘要）；规格内容仍在各专题文档。
> **读时机**：新会话第一个读它；提问"这事定过没有 / 该改哪个文件 / 这个编号是什么"时先查这里。
> **写规则**：新增或调整文档分工、新增 ID 命名空间、改动矩阵时改本文；规格类内容一律改对应专题文档，不写在这里。
> **关联**：[../AGENTS.md](../AGENTS.md)（agent 作业规程） · 上位 [DESIGN.md](./DESIGN.md)（规格仲裁者） · 进度 [PLAN.md](./PLAN.md)
> **最后更新**：2026-09-25（同步 `R2-3`（useHotkeys 激活门控 ✅）；同日 `R2-2`（重复收敛 ✅）；此前 2026-09-24：同步 `R2-1`（Workbench 拆分 ✅）与 `M11-0`（✅ 实施，`TC-040` + FR-17xx 行转"进行中"）、`R3-7`；此前 2026-09-23：同步 R4 段实施完毕 `R4-1`–`R4-9` 与回归 `TC-019`–`TC-029`）

---

## 1. 改什么，读什么

| 你要做的事 | 先读 | 再读 |
| --- | --- | --- |
| 新增/修改 FFmpeg 参数、排查时长/时间戳/画质 | [FFMPEG.md](./FFMPEG.md) | [DESIGN.md](./DESIGN.md) §5.3 |
| 改工作台、时间线（M11–M13） | [TIMELINE.md](./TIMELINE.md) §17（行为） | [plans/M11.md](./plans/M11.md)（实施）、[UI.md](./UI.md) §9.8 |
| 改页面布局/交互/主题 | [UI.md](./UI.md) | 决策 #16/#25（主题令牌与深浅主题） |
| 改任务系统、并发、取消、事件 | [DESIGN.md](./DESIGN.md) §8 | [FFMPEG.md](./FFMPEG.md) §6.4 |
| 问"这事定过没有 / 为什么这么做" | [DECISIONS.md](./DECISIONS.md) | — |
| 想知道"下一步做什么 / 做到哪了" | [PLAN.md](./PLAN.md) | [HANDOFF.md](./HANDOFF.md)（当前状态） |
| 想加新功能（还没立项） | [CANDIDATES.md](./CANDIDATES.md) | [DECISIONS.md](./DECISIONS.md)（晋升规则） |
| 跑测试 / 确认验收口径 | [TESTING.md](./TESTING.md) | [DESIGN.md](./DESIGN.md) §3 各节末（AC） |
| 真机跑关键功能 / 复现"界面说的和产物不一致" | [gui-e2e/README.md](./gui-e2e/README.md) | [TESTING.md](./TESTING.md) §3.5（TC 清单） |
| 追溯某个历史批次怎么实现的 | [handoff-archive.md](./archive/handoff-archive.md) | — |
| 让 agent 上手改代码 | [../AGENTS.md](../AGENTS.md) | 本文 |

**冲突仲裁顺序**：规格 → `DESIGN.md`；进度 → `PLAN.md`；分工与 ID → 本文；历史事实 → `handoff-archive.md`（不回溯改写）。

## 2. 文档清单（摘要；权威自述见各文档首部）

| 文档 | 唯一真源范围 | 读时机 |
| --- | --- | --- |
| [DESIGN.md](./DESIGN.md) | 项目定位/原则/功能需求(FR)/无损承诺(NFR)/架构/数据模型/任务系统/格式/打包/配置/错误处理 | 任何改动前的上位规格 |
| [FFMPEG.md](./FFMPEG.md) | 二进制管理、参数强制约定、命令模板、进度协议、probe 缓存、e2e 夹具 | 动 `src-tauri/src/ffmpeg/`、排查导出问题 |
| [UI.md](./UI.md) | 页面流转与各页布局/交互规格 | 改前端页面与交互 |
| [TIMELINE.md](./TIMELINE.md) | 时间线**行为规格**（§17） | 动 M11–M13 任何一项前 |
| [plans/M11.md](./plans/M11.md) | M11 **实施级方案**（原 §18，迁出前编号） | M11 动工期间 |
| [DECISIONS.md](./DECISIONS.md) | 历史决策（ADR）与其理由、状态 | 动手前确认"定过没有" |
| [CANDIDATES.md](./CANDIDATES.md) | 未排期候选池（CAND）与"不做"清单 | 提新需求、排下一批时 |
| [PLAN.md](./PLAN.md) | 里程碑、任务、验收与**进度** | 接活/汇报进度 |
| [TESTING.md](./TESTING.md) | 测试用例（TC）、夹具、验收执行方式；**回归测试**小节关联 BUG | 跑测试、写验收结论 |
| [gui-e2e/README.md](./gui-e2e/README.md) | **真机 GUI 自动化用例的实施细节**：启动与驱动方式、每条用例的步骤/断言/证据（TC 号与一句话覆盖在 TESTING.md §3.5） | 真机跑关键功能、查"界面承诺 vs 产物实测"的判定口径 |
| [BUGS.md](./BUGS.md) | **活跃缺陷**（BUG）的状态、违反规格、修复任务与回归 TC | 收到 bug 反馈、判断"缺陷还是需求变更" |
| [HANDOFF.md](./HANDOFF.md) | 会话状态快照（现在在哪/下一步/近期坑） | 会话开场 |
| [handoff-archive.md](./archive/handoff-archive.md) | 已交付批次的历史实施要点 | 追溯历史实现细节 |
| [incident-2026-09-19-lost-commits.md](./archive/incident-2026-09-19-lost-commits.md) | 2026-09-19 仓库损坏事故存证与原 24 条提交清单 | 追溯该日历史重建、核对旧提交时 |
| [code-review-2026-09-19.md](./archive/code-review-2026-09-19.md) | 2026-09-19 四路并行复审全文（`BUG-001`–`BUG-005` / `ADR-033` / `R4` / `T-003` 的来源） | 追溯审查发现与整改依据 |
| [CHANGELOG.md](./CHANGELOG.md) | 用户可见变更 | 发版前 |
| [../README.md](../README.md) | 对外介绍、安装使用 | 给外部读者 |
| [../AGENTS.md](../AGENTS.md) | agent 作业规程（命令、红线、完事标准） | agent 每次开工前 |
| [INDEX.md](./INDEX.md)（本文） | 文档地图 · ID 规范与别名表 · 追踪矩阵 · 命名空间细则 · 维护规则 | 找"该读哪份 / 某编号是什么"时 |

## 3. ID 规范

### 3.1 命名空间总览

| 命名空间 | 格式 | 起始 | 含义 | 真源位置 |
| --- | --- | --- | --- | --- |
| 章节 | `§N` / `文件名 §N` | — | 拆分前的章节号（**故意不重排**） | 各自文档 |
| 里程碑 | `M0–M13`、`R1–R4` | — | 交付批次 | PLAN |
| 任务（里程碑内） | `M#-#` / `R#-#` | — | 里程碑号 + 批次内序号 | PLAN |
| 独立技术任务 | `T-0NN` | `T-001` | 跨里程碑的技术/工程任务（重构、清理、去冗余） | PLAN「技术任务」节 |
| 决策 | `#N`（历史）/ `ADR-0NN`（新） | `ADR-033` | `ADR-033 ≡ 决策 #33`，**同号不另起序列** | DECISIONS |
| 候选 | `B#`（历史）/ `CAND-0NN` | `CAND-020` | `CAND-001…019 = 原 B1…B19`（表内双号） | CANDIDATES |
| 功能需求 | `FR-3XY` / `FR-9XY` / `FR-17XY` | 3xx / 9xx / 17xx | 首段 = 需求所在文档的节号：DESIGN.md §3 → `FR-3XY`（X=节号，Y=该节内序号，`Y=0` 为组级）· UI.md §9 → `FR-9XY` · TIMELINE.md §17 → `FR-17XY` | DESIGN.md §3（P0）；UI/TIMELINE（随对应里程碑开工发号） |
| 非功能需求 | `NFR-0NN` | `NFR-001` | 性能承诺、无损承诺、格式矩阵、并发与错误处理 | DESIGN.md §2 · §4 · §8 · §10 · §13 |
| 验收 | `AC-<FR号>-<序>` | 随 FR | 天然关联 FR，不需要独立映射表；**交付/工程类验收**（打包、日志、缓存）由 TC 或 NFR 承载，不强行挂 FR | DESIGN §3 各节末 |
| 测试用例 | `TC-0NN` | `TC-001` | `001–005` = 自动化（cargo e2e / 单测 / 静态检查 / 前端单测）；`010–018` = 手工验收组；`019–029` = 缺陷回归组；**`030+` = 后续扩展段**（顺序续号、不按载体区分：`030–038` 为 §3.5 真机 GUI 用例，`039` 起为后续新增如 `TC-039` 同一性比较、`TC-040` 撤销基线） | TESTING（号与一句话覆盖）· gui-e2e（实施细节） |
| 缺陷 | `BUG-0NN` | `BUG-001` | 活跃缺陷（**规格未变**而实现与 FR/AC 不符）；判定与状态机见 §6；**号不复用** | **BUGS.md** |
| 评审（review） | **不发号** | — | 评审是**触发源**、不是实体；结论按 §6 分流到 BUG / FR / ADR / T / 未决段 | 本文 §6 |
| 变更 | `[Unreleased]` / `[x.y.z]` | — | 用户可见变更 | CHANGELOG |

### 3.2 别名映射表

> 用途：任何编号出现时，先在这里定位它属于哪一代、和现行编号什么关系。**别名只在本文维护一处**，正文不双写。
> 判断规则：**旧编号只出现在历史文本**（`§N`、`M#-#`、`#N`、`B#`），**现行编号只用于新条目**（`FR-`/`NFR-`/`AC-`/`TC-`/`T-`/`ADR-`/`CAND-`/`BUG-`）。

| 命名空间 | 旧/既有编号 | 现行编号 | 别名关系 | 原文是否改写 | 出现位置 |
| --- | --- | --- | --- | --- | --- |
| 章节引用 | `§N`、`文件名 §N` | 同左（继续作为锚点使用） | 1:1，不迁移 | 否 | 全库 315 处；章节号**故意不重排**（DESIGN 编号不连续属预期） |
| 里程碑 | `M0–M13`、`R1–R4` | 同左 | 1:1 | 否 | PLAN 总览 + 各里程碑节 |
| 里程碑内任务 | `M#-#`、`R#-#` | 同左（= `T` 的里程碑分支） | 等价：`T` 命名空间包含"里程碑任务"与"独立技术任务"两支 | 否（已进 27 条 commit 信息） | PLAN 109 行 + 全库引用 |
| 独立技术任务 | —（本次新增） | `T-0NN`（`T-001` 起） | 新增；与 `M#-#` 并列不交叉 | — | PLAN「技术任务」节 |
| 决策 | `#1–#32` | `ADR-033` 起（新条目） | **同号别名**：`ADR-033 ≡ 决策 #33`，不另起序列 | 否（历史行保留 `#N`） | DECISIONS |
| 候选 | `B1–B19` | `CAND-001`–`CAND-019`（同号）+ `CAND-020` 起（新条目） | **同号别名 + 双号并存**：`CAND-001 ≡ 原 B1` | 表内双写；正文 102 处旧引用**不改** | CANDIDATES 表 |
| 功能需求 | —（本次新增） | `FR-3XY`（X=节号，Y=该节内序号）/ `FR-9XY` / `FR-17XY` | 新增；首段数字 = 需求所在文档的节号 | — | DESIGN §3（P0）；UI/TIMELINE 随里程碑开工发号 |
| 非功能需求 | —（本次新增） | `NFR-001`–`NFR-012` | 新增；顺排，跨节不绑号 | — | DESIGN.md §2 · §4 · §8 · §10 · §11 · §12–13 |
| 验收 | —（新增，替代原散文验收句） | `AC-<FR号>-<序>` | 新增；**天然关联 FR**，无需映射表 | 原散文验收句仍在 PLAN（作为状态描述），口径已归 AC | DESIGN §3 各节末 |
| 测试用例 | —（本次新增） | `TC-001`–`TC-005`（自动化）、`TC-010`–`TC-018`（手工） | 新增；号段区分自动化/手工 | — | TESTING |
| 缺陷 | —（本次新增） | `BUG-0NN`（`BUG-001` 起） | 新增；号**不复用**（`wontfix` / `duplicate` 也占号） | — | BUGS.md |
| 变更 | —（本次新增） | `[Unreleased]` / `[x.y.z]` | 新增 | — | CHANGELOG |

**覆盖项自检**：`§N` ✓ · `M#-#`/`R#-#` ✓ · `#N` ✓ · `B#` ✓ · `T-` ✓ · `ADR-` ✓ · `CAND-` ✓ · `FR-` ✓ · `NFR-` ✓ · `AC-` ✓ · `TC-` ✓ · `BUG` ✓ —— 共 **12** 个**编号命名空间**；另声明 `评审（review）` **不发号**（触发源，分流见 §6）。

### 3.3 书写与引用规则

1. **旧格式永不改写**：`#N`、`B#`、`M#-#` 仅出现在历史文本与既有引用中；新条目一律用新格式。别名映射只在本文 §3.1 维护一处，**正文不双写**。
2. **跨文档引用**：同文档写 `§N`，跨文档写 `文件名 §N`（沿用 2026-09-19 拆分的约定）。
3. **废弃**：条目标删除线并指向接替号（`~~FR-322~~ → FR-322′` 之类），**号不复用**。
4. **ID 变更需走决策**：命名空间或格式调整先在 DECISIONS 立 ADR，再改本文。
5. **缺陷与需求的判定线（BUG vs FR）**：**规格没变**、实现与既有 FR/AC 不符 → 登记 `BUG-0NN`（真源 [BUGS.md](./BUGS.md)）；**规格要变**（要改现有 FR/AC 本身）→ 走需求变更，**不是 bug**。
6. **缺陷的关联链（单向，不双写）**：`BUG → 违反的 FR/AC` · `BUG → 修复任务（T-0NN / M#-#）` · `BUG → 回归 TC` · `修复完成 → CHANGELOG 的 Fixed 段`。一个 BUG 可拆多个修复任务，一个修复任务可修多个 BUG；**至少一个回归 TC 通过才能标 `verified`**。
7. **评审（review）产物不发独立号**：代码评审结论按性质分流到 `BUG` / `FR` / `ADR` / `T` / HANDOFF 未决段 / 当场改，**不设 `CR-`、`RV-` 等命名空间**；分流表与 commit 标注约定见 §6。

> **2026-09-19 已定**（原三处待确认项，用户裁决）：
> 1. 旧编号一律不改名，**新条目用新格式**（`T-`/`ADR-`/`CAND-`/`FR-`…）；里程碑内任务保留 `M#-#`/`R#-#`，`T-` 专给跨里程碑的独立技术任务。
> 2. 候选池旧号 `B#` 与新号 `CAND-0NN` **双号并存**（`CAND-001 = 原 B1`），旧引用不重写。
> 3. **AC 定义在 DESIGN.md**；TESTING.md 放 TC 并引用 AC；**PLAN 验收行只写 AC 编号**（+ 执行指针）。

## 4. 模块地图

| 路径 | 职责 |
| --- | --- |
| `src-tauri/src/ffmpeg/command.rs` | FFmpeg 参数**唯一**拼装处（所有参数变更只改这里 + 单测） |
| `src-tauri/src/ffmpeg/probe.rs` | ffprobe 封装、媒体信息解析、关键帧扫描、进程内缓存 |
| `src-tauri/src/ffmpeg/progress.rs` | `-progress pipe:1` 输出解析 |
| `src-tauri/src/task/manager.rs` | 任务队列、状态机、并发上限、终态清理钩子 |
| `src-tauri/src/task/worker.rs` | 子进程执行、取消/kill、`.part`→rename |
| `src-tauri/src/commands/{media,cut,merge,rotate,crop}.rs` | 单文件类命令入口（校验 + 提交任务） |
| `src-tauri/src/commands/pipeline.rs` | 工作台流水线：`plan_items` / `check_pipeline` / 临时令牌 |
| `src-tauri/src/commands/history.rs` + `history.rs` + `logger.rs` | 历史记录落盘、日志与前端日志转发 |
| `src-tauri/tests/e2e.rs` | 命令级 e2e（真实 sidecar 跑核心链路） |
| `src/services/tauri.ts` | 前端**唯一** IPC 入口（invoke 封装 + 事件订阅） |
| `src/components/VideoPlayer` + `Timeline` | 播放器封装与源内时间轴（区间双手柄、关键帧刻度） |
| `src/components/ClipTimeline` + `CropOverlay` + `RotateControls` + `CutEditor` | 合成时间轴、框选交互、变换控件 |
| `src/components/{ProductPreview,TaskProgress}` + `src/hooks` | 成品虚拟连播、全局任务面板、前端 hooks 基建 |
| `src/pages/*` + `src/utils` + `src/types` | 页面与前端工具/类型 |

## 5. 追踪矩阵（FR → 规格 → 模块 → 任务 → 验收/测试 → 状态）

> P0（M0–M9 已交付范围）已全部落行；M10/M11 的 FR 随对应里程碑**首个产生需求的批次**发号后补行（M11-0 是前置重构、不产生 FR，故 FR-17xx 随 M11-1 发号；发号范围见 §3.1）。
> `—（工程批次）` 行表示该批次不产生新需求，验收靠回归测试（TC-005 = tsc/lint/cargo test）。
> 矩阵只列每行的**代表任务**；其余已完成任务的逐条关联见 [附录 A](#51-附录-a完成态任务索引矩阵未逐条展开的已完成任务)。

| FR / NFR | 规格 | 模块 / 文件 | 任务 | 验收 / 测试 | 状态 |
| --- | --- | --- | --- | --- | --- |
| **FR-310** 导入与信息展示 | DESIGN.md §3.1 | `services/tauri.ts` · `VideoPlayer`/`Timeline` | M1-1（夹具）· M1-2 · M1-3 | AC-311-1 · AC-312-1 · AC-313-1 · TC-010 · TC-004 | ✅ |
| **FR-320** 剪切 | DESIGN.md §3.2 · FFMPEG.md §6.3① | `ffmpeg/command.rs` · `ffmpeg/probe.rs` · `VideoPlayer`/`Timeline` | M1-4 · M1-5 · M1-6 · M8-2 ·（M11-5 待） | AC-321-1/2 · AC-322-1 · AC-323-1 · AC-324-1 · AC-325-1 · TC-001 · TC-002 · TC-010 | ✅ |
| **FR-330** 合并 | DESIGN.md §3.3 · FFMPEG.md §6.3② | `ffmpeg/command.rs` · `commands/*.rs` | M2-1 … M2-6 | AC-331-1 · AC-332-1/2 · AC-333-1 · TC-001 · TC-011 | ✅ |
| **FR-340** 旋转 | DESIGN.md §3.4 · FFMPEG.md §6.3③ | `ffmpeg/command.rs` · `commands/*.rs` | M3-1 · M3-2 | AC-341-1/2 · AC-342-1 · TC-012 | ✅ |
| **FR-350** 局部放大 | DESIGN.md §3.5 | `ffmpeg/command.rs` · `commands/*.rs` · `ClipTimeline`/`CropOverlay` | M3-3 · M3-4 · M3-5 · R1-4 | AC-351-1 · AC-352-1 · AC-353-1 · TC-012 · TC-004 | ✅ |
| **FR-360** 任务队列与面板 | DESIGN.md §3.6 / §8 | `task/manager.rs` · `task/worker.rs` · `ProductPreview`/`TaskProgress`/`hooks` | M0-5 · M1-5 · M4-2 · M4-7 ·（R3-4 speed 待） | AC-360-1 · AC-361-1 · AC-362-1 · TC-015 · TC-004 | 🚧 部分（speed/ETA 待 R3-4） |
| **FR-370** 代理预览 | DESIGN.md §3.7 | `ffmpeg/probe.rs` · `commands/*.rs` | M1-8 · R1-3 | AC-371-1 · AC-372-1 · TC-018 | ✅ |
| **FR-380** 工作台流水线 | DESIGN.md §3.8 | `commands/pipeline.rs` · `ClipTimeline`/`CropOverlay` · `ProductPreview`/`TaskProgress`/`hooks` | M5-1 … M5-7 · M6-1 … M6-8 · M9-1 … M9-5 | AC-380-1 · TC-003 · TC-013 | ✅（原子 FR-381+ 随 M11） |
| **NFR-001**–**005** 设计原则 | DESIGN.md §2 | 全局 | 贯穿 M1–M9 | TC-001 – TC-005（回归） | ✅ |
| **NFR-006**–**009** 任务系统承诺 | DESIGN.md §8 | `task/manager.rs` · `task/worker.rs` | M0-5 · M1-5 · M8-2 ·（M11-0 清理钩子） | TC-004 | ✅ |
| **NFR-010** 格式支持范围 | DESIGN.md §10 | `ffmpeg/probe.rs` | M0-4 · M1-2 | TC-001 · TC-018 | ✅ |
| **NFR-011** 打包与分发 | DESIGN.md §11 | tauri.conf / NSIS 脚本 | M4-5 | TC-016 | ⏳ 待用户手测（干净 Win11） |
| **NFR-012** 配置与错误处理 | DESIGN.md §12 · §13 | `history.rs`/`logger.rs` | M4-1 · M4-7 · M4-8 | TC-014 · TC-004 | ✅ |
| **FR-9xx** 保活 / 深浅主题（待发号） | UI.md §9.1 · §9.2 · 决策 #24/#25 | `pages`/`utils`/`types` | M10-1 · M10-2 | TC-014（AC 随 M10 发号） | ⏸ 暂缓（决策 #32） |
| **FR-17xx** 单轨时间线（待发号） | TIMELINE.md §17 | `ClipTimeline`/`CropOverlay` · `ProductPreview`/`TaskProgress`/`hooks` | M11-0 ✅ … M11-9 · M12 · M13 | TIMELINE.md §17.9 ①~⑥ · **TC-040**（撤销基线，`M11-0`）· 其余 TC 待建 | 🔄 进行中（`M11-0` 已实施） |
| —（工程批次，无 FR） | PLAN「评审修复批次」「技术任务」· M7 | 多模块 | R1-1 … R1-5 ✅ · R2-1 ✅ · R2-2 ✅ · R2-3 ✅ · R2-4 · R2-5 · R3-1 … R3-7（`R3-7` ✅ 提前实施）· **R4-1 … R4-9 ✅**（缺陷修复，见 [BUGS.md](./BUGS.md)；其中 `R4-8`/`R4-9` 收真机首跑与同族复查缺陷）· T-001 … T-004 | TC-005 · TC-001 – TC-004（回归）· **TC-019 – TC-029**（R4 配套回归）· TC-039/TC-040 | R1 ✅ / R4 ✅（9 条已实施，手工/真机半待跑）/ R3 🔜 部分（`R3-7` 已实施）/ R2 🔄 部分（`R2-1`–`R2-3` 已实施）/ T 待 |


### 5.1 附录 A：完成态任务索引（矩阵未逐条展开的已完成任务）

> 用途：矩阵按 **FR 行**组织，只列每行的代表任务；本表按 **任务** 组织，补齐其余已完成任务的四段关联。
> 范围：M0–M9 与 R1 中未出现在上方矩阵「任务」列的 **47 条**已完成任务。纯工程/体验批次标 `—（工程批次）`，靠回归测试保障。
> 与本表的同步：新任务完成时**不进本表**（由上方矩阵的 FR 行承担）；本表只作为历史补齐的固定快照。

| 任务 | 关联 FR / NFR | AC | 模块 / 文件 | 测试 |
| --- | --- | --- | --- | --- |
| M0-1 | —（基建） | — | `ProductPreview`/`TaskProgress`/`hooks` · `pages`/`utils`/`types` | TC-005 |
| M0-2 | NFR-011 | — | 构建脚本（fetch-ffmpeg） | TC-016 |
| M0-3 | NFR-011 | — | `history.rs`/`logger.rs` | TC-016 |
| M0-6 | FR-9xx（待发号，UI.md §9.1） | 待发号 | `pages`/`utils`/`types` | TC-014 |
| M0-7 | —（基建） | — | `services/tauri.ts` | TC-005 |
| M0-8 | FR-360 · NFR-006 | AC-360-1 | `task/manager.rs` · `task/worker.rs` | TC-004 |
| M1-7 | FR-320 | AC-321-1 | `VideoPlayer`/`Timeline` | TC-010 |
| M1-9 | FR-324 · FR-325 | AC-324-1 · AC-325-1 | `VideoPlayer`/`Timeline` | TC-010 |
| M1-10 | FR-320 | AC-321-1 | `VideoPlayer`/`Timeline` · `pages`/`utils`/`types` | TC-010 |
| M1-11 | FR-360 | AC-360-1 | `ProductPreview`/`TaskProgress`/`hooks` | TC-015 |
| M2-2 | FR-331 | AC-331-1 | `pages`/`utils`/`types` | TC-011 |
| M2-3 | FR-332 | AC-332-1 · AC-332-2 | `ffmpeg/command.rs` | TC-001 |
| M2-4 | FR-331 | AC-331-1 | `ProductPreview`/`TaskProgress`/`hooks` | TC-011 |
| M2-5 | FR-333 | AC-333-1 | `ffmpeg/command.rs` | TC-001 |
| M3-6 | FR-351 | AC-351-1 | `ClipTimeline`/`CropOverlay` | TC-012 |
| M3-7 | FR-351 | AC-351-1 | `ffmpeg/command.rs` · `commands/*.rs` | TC-004 |
| M3-8 | FR-322 | AC-322-1 | `ffmpeg/command.rs` | TC-002 |
| M3-9 | NFR-010 | — | `ffmpeg/command.rs` · `ffmpeg/probe.rs` | TC-001 |
| M4-3 | FR-320 | AC-321-1 | `ProductPreview`/`TaskProgress`/`hooks` | TC-017 |
| M4-4 | —（已取消立项 → M6-8，决策 #20） | — | — | — |
| M4-6 | —（工程·文档） | — | — | TC-005 |
| M5-2 | FR-380 | AC-380-1 | `task/manager.rs` · `commands/pipeline.rs` | TC-003 |
| M5-3 | FR-380 | AC-380-1 | `ClipTimeline`/`CropOverlay` | TC-013 |
| M5-4 | FR-380 | AC-380-1 | `pages`/`utils`/`types` | TC-013 |
| M5-5 | FR-380 | AC-380-1 | `tests/e2e.rs` | TC-003 |
| M6-0 | FR-380 | AC-380-1 | `pages`/`utils`/`types` | TC-013 |
| M6-2 | FR-380 | AC-380-1 | `ClipTimeline`/`CropOverlay` | TC-013 |
| M6-3 | FR-380 | AC-380-1 | `ClipTimeline`/`CropOverlay` | TC-013 |
| M6-4 | FR-380 | AC-380-1 | `ProductPreview`/`TaskProgress`/`hooks` | TC-013 |
| M6-5 | FR-380 | AC-380-1 | `commands/pipeline.rs` | TC-003 |
| M6-6 | FR-380 | AC-380-1 | `ProductPreview`/`TaskProgress`/`hooks` | TC-013 |
| M6-7 | FR-380 | AC-380-1 | `tests/e2e.rs` | TC-013 |
| M7-1 | —（体验修复） | — | `services/tauri.ts` | TC-010 |
| M7-2 | —（体验修复） | — | `VideoPlayer`/`Timeline` · `ClipTimeline`/`CropOverlay` | TC-012 |
| M7-3 | —（体验修复） | — | `ProductPreview`/`TaskProgress`/`hooks` | TC-011 |
| M7-4 | FR-323 | AC-323-1 | `commands/*.rs` | TC-010 |
| M7-5 | FR-360 | AC-360-1 | `ProductPreview`/`TaskProgress`/`hooks` | TC-015 |
| M7-6 | —（体验修复，UI.md §9.4） | — | `VideoPlayer`/`Timeline` | TC-010 |
| M7-7 | FR-311 | AC-311-1 | `commands/*.rs` · `services/tauri.ts` | TC-010 |
| M7-8 | NFR-011 | — | NSIS 脚本 | TC-016 |
| M7-9 | NFR-011 | — | `scripts/`（icon.svg + render-icon.mjs） | TC-016 |
| M8-1 | FR-313 | AC-313-1 | `ffmpeg/probe.rs` | TC-004 |
| M8-3 | NFR-006 | — | `tests/e2e.rs` | TC-001 |
| M9-2 | FR-380 | AC-380-1 | `ClipTimeline`/`CropOverlay` | TC-013 |
| M9-3 | FR-380（M11-1 承接升级） | AC-380-1 | `ClipTimeline`/`CropOverlay` | TC-013 |
| M9-4 | FR-380（M11-6 承接升级） | AC-380-1 | `ClipTimeline`/`CropOverlay` | TC-013 |
| R1-2 | —（工程修复） | — | `services/tauri.ts` | TC-005 |

> 合计 47 条。

## 6. 命名空间细则

### 6.1 缺陷（BUG）——活跃缺陷登记

真源 = [BUGS.md](./BUGS.md)（本文只声明规则，不复制条目）。

**判定（唯一分界线）**：

| 判据 | 结论 | 落点 |
| --- | --- | --- |
| **规格没变**，实现与 FR/AC 不符 | **BUG** | [BUGS.md](./BUGS.md)，`BUG-0NN` |
| **规格要变**（现有 FR/AC 本身要改） | 需求变更，**不是 bug** | [DESIGN.md](./DESIGN.md) 的 FR/AC + PLAN 任务（必要时过 ADR） |

**状态机**：`open → confirmed → fixing → fixed → verified`；另有终止态 `wontfix` / `duplicate`。状态单向流转，不跳级（`fixed` 表示“代码已修、回归未跑通”）。

**关联链**（单向，不双写）：

| 关系 | 落到哪 |
| --- | --- |
| BUG 违反的规格 | [DESIGN.md](./DESIGN.md) 的 `FR-xxx` / `AC-xxx`（规格未变才登记为 BUG） |
| BUG 的修复任务 | [PLAN.md](./PLAN.md) 的 `T-0NN` / `M#-#`（可多对多） |
| BUG 的回归验证 | [TESTING.md](./TESTING.md)「回归测试」小节的 `TC-0NN`（标注 `关联 BUG-0NN`） |
| 修复完成的用户可见说明 | [CHANGELOG.md](./CHANGELOG.md) 的 **Fixed** 段 |

**归档**：`verified` 后迁入 `docs/archive/bugs.md`（**按需创建**，只追加、不改写），并从 BUGS.md 主表移除；**号保留、不回填、不复用**。详见 BUGS.md §5。

### 6.2 评审（review）产物的归属——不发独立命名空间

> **裁决（2026-09-19）**：代码评审 / 走读是**触发源**，不是实体，**不设 `CR-` / `RV-` 等独立编号**。评审结论一律按下表**分流**到既有命名空间，避免为"来源"再造一套 ID。

| 评审结论的性质 | 分流到 | 落点 |
| --- | --- | --- |
| **违反规格**（规格没变、实现不符） | **`BUG-0NN`** | [BUGS.md](./BUGS.md) |
| **规格本身有问题**（现有 FR/AC 要改） | **FR**（新增或修订） | [DESIGN.md](./DESIGN.md) §3；必要时走 ADR |
| **设计 / 决策问题**（架构、取舍、约定） | **`ADR-0NN`** 或 DESIGN 正文 | [DECISIONS.md](./DECISIONS.md) · DESIGN |
| **技术债 / 重构 / 清理** | **`T-0NN`**，或挂到里程碑 `M#-#` | [PLAN.md](./PLAN.md) |
| **未定性 / 待观察**（证据不足、需实机验证） | 暂存 HANDOFF「未决问题」段，标注**「待定性」** | [HANDOFF.md](./HANDOFF.md) |
| **风格 / 命名 / 格式** | **不留号**，当场改 | 直接改代码或文档 |

**追溯方式**：评审产出的修复**不单独建号**，"来自评审"这一事实由 **commit message 承担**，约定写法：

```
fix: BUG-005 播放头在暂停态不更新（review）
M11-3: 播放头改 ref 直改 DOM（review 2026-09-19）
```

**升级口子**：若评审成为常规流程、HANDOFF 的未决段长期清不干净，再建 `docs/REVIEW.md` + `RV-0NN` 命名空间；届时**另开 `T-` 任务**、先在 §3.1 登记，不临时起号。

## 7. 维护规则

| 什么时候 | 改哪个文件 | 注意 |
| --- | --- | --- |
| 完成任务 / 状态变化 | `PLAN.md`（只动 checkbox 与状态列） | 一个 checkbox 一次提交 |
| 新增决策 | `DECISIONS.md`（只追加，标状态） | 新条目用 `ADR-0NN` |
| 新增/晋升候选 | `CANDIDATES.md` | 晋升需先在 DESIGN 补设计 |
| 新需求 / 验收口径 | `DESIGN.md`（FR/NFR/AC 就地） | AC 一行一条 |
| 测试方法 / 夹具变化 | `TESTING.md` | 引用 AC，不抄 AC 正文；缺陷的回归用例进「回归测试」小节并标 `关联 BUG-0NN` |
| 新增真机 GUI 自动化用例 | 先在 `TESTING.md` §3.5 登记 TC 号与一句话覆盖，再到 `gui-e2e/` 补步骤与断言 | `gui-e2e/` 是实施细节的真源，号必须在 TESTING 里存在（脚本按 TESTING 认 TC 定义） |
| 发现 / 更新缺陷 | `BUGS.md`（追加行、改状态列） | 号不复用；**规格要变走 FR 而不是 BUG** |
| 评审 / 走读结论 | 按 §6 分流，**不建独立号** | 未定性的进 HANDOFF 未决段并标「待定性」 |
| 实现级方案（如 M11） | `plans/<批次>.md` | 行为规格仍在规格文档 |
| 会话状态 | `HANDOFF.md` | 只放当前状态与近期坑；长期红线进 AGENTS.md |
| 已交付批次要点 | `handoff-archive.md` | 只追加，不改写历史 |
| 文档分工 / ID 规则 | **本文** | 走 ADR |

> **改完 `docs/**`、`README.md` 或 `AGENTS.md` 后必跑**：`pnpm check:docs`（= `node scripts/check-docs.mjs`），五项全绿才算完事（链接可达 / `§` 引用归属 / ID 交叉定义 / skip 区间合规 / 反引号路径可达）。克隆后跑 `pnpm hooks:install` 装钩子（`core.hooksPath=.githooks`），提交时会自动跑。
> 历史引文（如归档里照录的旧提交信息）用 `<!-- check-docs:skip -->` … `<!-- check-docs:endskip -->` 圈起，豁免引用检查；**不要**为迁就检查去改写历史原文。区间内必须紧邻一行写明**豁免原因**，且该文件须登记在下表——两条都由脚本校验。

### 7.1 `check-docs` skip 登记表

> 每新增一处 skip 区间就在此登记（脚本校验**文件级**：未登记直接报错；行号仅供人工定位，会随编辑漂移）。
> 区间内除引用检查外的项目（markdown 链接）**仍然校验**。

| 文件 | 行号区间（参考） | 豁免原因 |
| --- | --- | --- |
| `docs/archive/incident-2026-09-19-lost-commits.md` | §4 提交清单表（约 50–79 行） | 归档照录的**历史引文**：原 24 条提交信息含拆分前编号（`DESIGN §17` / `§18`，现属 TIMELINE.md §17 / plans/M11.md）与当时写法；归档「只追加不改写」，故按原文保留 |

