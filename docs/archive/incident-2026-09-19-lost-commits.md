# 事故记录：2026-09-19 git 仓库损坏与提交历史重建

> **职责**：存证 2026-09-19 本地 git 仓库损坏事故的经过、损坏实测、抢救结论与**原 24 条提交清单**（SHA/时间/信息）。
> **唯一真源**：本事故的原始事实以本文为准；当时的完整 reflog 快照另存于本地 `.workbuddy/incident-20260919/`（不入库）。
> **读时机**：追溯"为什么 2026-09-19 前后的提交历史被重建"时；日后需要核对某个被丢失提交的内容时。
> **写规则**：**只追加、不改写历史**（与 [handoff-archive.md](./handoff-archive.md) 同规则）；后续若有同类事故，另开新文件。
> **关联**：[INDEX.md](../INDEX.md) · 上位 [HANDOFF.md](../HANDOFF.md) · 规格 [DESIGN.md](../DESIGN.md) · 历史批次 [handoff-archive.md](./handoff-archive.md)
> **最后更新**：2026-09-19（事故当日建立）

---

## 1. 事故经过

| 时间 | 事件 |
| --- | --- |
| 15:44 | 应要求准备把 24 个未推送提交**合并**为 4 条，第一步执行保护性动作：`git tag -f backup/pre-squash-20260919 f3593c5` + `git stash push -- .gitignore` |
| 15:46 | 该命令返回 **SIGTERM / exit 1，无任何输出** |
| 15:46 起 | 所有 git 命令报 `fatal: not a git repository (or any of the parent directories): .git` |
| 15:50–16:20 | 诊断、抢救证据、排查副本（见 §3） |
| 16:20 | 从远端 `fetch` 回 `52602d9` 及之前的全部历史，按工作区状态重建提交 |

**原因判断**：受限环境（沙箱/EDR）对 **`.git` 引用写入类操作**的干预。此前 20 余次 `git add`/`commit`（追加写对象 + 更新 ref）均正常；`tag -f`（写 `refs/tags/`）与 `stash`（写 `refs/stash` + 新对象）属引用创建/历史改写，触发策略后进程被杀，并伴随 `refs/` 与 pack 数据文件被移除。

## 2. 损坏实测

| 项 | 实测 |
| --- | --- |
| `.git/refs/` | **整个目录不存在**（`packed-refs` 只剩注释行）→ git 判定"不是仓库"的直接原因 |
| `.git/objects/pack/` | 只剩 `multi-pack-index` + `pack-828d3d79….idx`（24KB），**`.pack` 数据文件消失** |
| `.git` 总大小 | **0.13 MB**（正常应数十 MB）；loose objects 仅 5 个 |
| `.git/logs/`（reflog） | **完好** —— 24 条提交的 SHA/message/时间戳全部保留（本次重建的依据） |
| 工作区文件 | **完好** —— 源码、文档、配置与 `f3593c5` 时完全一致 |

## 3. 抢救与副本排查（4 个方向，均无对象数据）

| # | 方向 | 结果 |
| --- | --- | --- |
| 1 | Windows 回收站 `C:\$Recycle.Bin` | ❌ 仅旧构建产物（`.lib`/`.rlib`/`.exe`/`.pdb`） |
| 2 | 卷影副本 VSS（`vssadmin list shadows`） | ❌ 无管理员权限（且需事先启用） |
| 3 | WorkBuddy 沙箱 `modify_backup`（本会话 25 066 个被改文件备份） | ❌ **不含 `.git` 内容**（沙箱排除该目录） |
| 4 | 旧库残留对象 | ❌ pack 数据文件确实不在，只剩 5 个 loose 对象 |

**结论**：24 条未推送提交的**对象数据本地已无副本**；**工作区内容零损失**，据此重建。`52602d9` 及之前的旧历史由远端恢复。

## 4. 原 24 条提交清单（存证）

> 丢失的提交（按时间升序）。SHA 为原始值，对象已不可寻；表内信息取自事故前的 reflog。
> 覆盖 2026-09-16 22:44 ~ 2026-09-19 15:32，即 M9 工作台修复冲刺 → R1 评审修复五项 → 文档体系规范化三轮。

| # | 原 SHA | 时间 | 提交信息 |
| --- | --- | --- | --- |
| 1 | `8cf00d0` | 09-16 22:44 | docs: 时间线需求收敛为单轨装配驾驶舱并立项 M11–M13（DESIGN §17 / 决策 #26–#31，B10/B11 并入 M11） |
| 2 | `341f02c` | 09-17 20:13 | M9-1: 成品预览 src 走 fileSrc 资源协议转换（P0；含离场槽暂停与暂停事件回写） |
| 3 | `9c1b15d` | 09-17 20:13 | M9-3/4: 时间轴逐块像素排布（消除 minWidth 重叠）+ 整块拖拽排序（取消独立手柄） |
| 4 | `36c4846` | 09-17 20:13 | M9-2/5: 编辑视图按业务 id 加 key 重挂载 + 片段区间内预览（越过出点暂停，可循环） |
| 5 | `a691b46` | 09-17 20:16 | docs: M9 收尾 + M11 实施方案定稿（DESIGN §18 / 决策 #32 M10 暂缓；PLAN 勾选 M9 与 M11-0 前置项） |
| 6 | `884df85` | 09-17 20:25 | docs: 快捷键需求表并入 §17.8（6 组新增可行进 M11-8/M11-6，6 项冲突维持既有裁决）+ 右键菜单三类需求稿筛入 §17.4（B18/B19 入候选池） |
| 7 | `23c3623` | 09-19 11:53 | R1-1: VideoPlayer rAF 链改 start/stop 单链语义（播放中 seek 后重启上报，修时间上报永久冻结 → 播放头停住/方向键步进失效/M9-5 区间预览到出点静默失效） |
| 8 | `eea9422` | 09-19 11:53 | R1-2: 新增 useTauriEvent 统一事件订阅退订（resolve 前卸载也退订），替换 9 处 listen 竞态写法 |
| 9 | `70a991e` | 09-19 11:53 | R1-3: 任务终态清理钩子（submit_with_cleanup/run_cleanup/is_active，排队中取消也回收）+ generate_proxy 去重条目自愈，补 2 条单测 |
| 10 | `67c9ded` | 09-19 11:53 | chore: .gitignore 忽略 .workbuddy 工作目录 |
| 11 | `36662a3` | 09-19 11:53 | docs: DESIGN 拆为 8 份专题文档集（DESIGN/FFMPEG/UI/TIMELINE/DECISIONS/PLAN/HANDOFF/归档）+ 事实订正 + 真源唯一化 + R1-1/2/3 进展 |
| 12 | `698bc77` | 09-19 11:53 | docs: HANDOFF 补提交号（文档拆分 36662a3；R1-1/R1-2/R1-3 23c3623 eea9422 70a991e） |
| 13 | `51c730d` | 09-19 12:55 | R1-4: 裁剪框选收敛为 components/CropOverlay + utils/crop（Editor/Workbench 各减约 190 行；工作台 handlers 挂在旋转舞台避免遮挡视频点击；顺带修松手丢失时监听器常驻 window） |
| 14 | `ab7c110` | 09-19 12:56 | R1-5: 接入 ESLint（flat 配置：react-hooks 依赖与 IPC 入口限制为 error，services/ 例外）+ pnpm lint 脚本 |
| 15 | `f80dd0e` | 09-19 12:56 | docs: R1 全部完成（PLAN 勾选 R1-4/R1-5 + 进展；HANDOFF 状态/下一步改指 M11-0 与关键事实补充） |
| 16 | `af7df66` | 09-19 13:37 | docs: B1 文档规范化第一批（新增 INDEX/TESTING/CHANGELOG 与 AGENTS.md；8 份文档补 6 字段元数据头；文档地图与 ID 规范收敛到 INDEX；README 去重与修 §11 引用） |
| 17 | `7aee978` | 09-19 14:33 | docs: B2 文档规范化第二批（候选池迁出 CANDIDATES.md、M11 方案迁出 plans/M11.md，旧位置留指针；跨文件引用改写；搬迁逐字一致 + 266 处引用校验通过） |
| 18 | `6bb628e` | 09-19 14:36 | docs: B3 文档规范化第三批（DESIGN 发 FR-28/NFR-12/AC-25 号；PLAN 里程碑关联行与验收行改 AC 编号 + 技术任务节 T-001/T-002；INDEX 追踪矩阵填实；CANDIDATES 双号 CAND-001–019） |
| 19 | `b7d0fec` | 09-19 14:47 | docs: handoff-archive 迁入 docs/archive/（git mv 保留历史 + 20 处链接改写：docs 层 13、文件内 6、README 1；引用校验 315/315、155 个链接全通） |
| 20 | `acafaf8` | 09-19 15:04 | docs: C1+C2（INDEX 补别名映射表 13 项覆盖；CANDIDATES 每条补状态列 idea/evaluating/accepted/parked/rejected + 取值图例） |
| 21 | `55d8b5d` | 09-19 15:04 | docs: 修正 INDEX 别名表 NFR 行的文件前缀（引用校验 4 处告警归零） |
| 22 | `9a524b5` | 09-19 15:28 | docs: C3（PLAN 31 条未开工任务补 FR/AC/MOD/TC 四段关联；INDEX 新增附录 A 完成态任务索引 47 条；统一校验 155 链接 + 337 §引用 + ID 交叉 0 问题） |
| 23 | `29ceb5d` | 09-19 15:28 | docs: C4（README 补「文档体系最后更新」一行；CHANGELOG 的 [Unreleased] 段 B1 时已就位，无需改动） |
| 24 | `f3593c5` | 09-19 15:32 | docs: JOB 定义落盘——运行时数据模型实体（Job 实例），不作产品范式命名空间、不发编号（DESIGN §8.2 登记实体三态 + taskId/kind 口径；INDEX §6 重写、§3.1/§3.2/覆盖自检同步） |

**重建后**：上述内容按 2 条提交重新落盘（代码 / 文档），提交信息中注明本次重建。

## 5. 教训与硬约束

1. **受限环境禁止重写 git 历史**：`tag -f` / `stash` / `rebase` / `reset --hard` / `read-tree` / `filter-branch` / `gc` 一律**不进沙箱执行**，合并或压缩提交交由用户在自己的终端完成。
2. agent 可安全执行的 git 操作：`status` / `diff` / `log` / `show` / `add` / `commit` / `mv`。
3. **任何涉及 `.git` 的批量操作前，先 `cp -r .git` 留底**（成本极低；本次事故若事先照做，可原地复原）。
4. 未推送的本地提交**没有任何异地副本**——重要节点应尽早 `push`（远端是唯一可靠的第二副本）。
