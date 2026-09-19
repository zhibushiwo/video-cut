# 缺陷登记（BUGS）

> **职责**：**活跃缺陷的唯一真源** —— 记录"规格未变、但实现不符"的偏差及其修复与回归状态。
> **唯一真源**：缺陷的编号、状态与关联关系以本文为准；缺陷的**规格依据**仍在 [DESIGN.md](./DESIGN.md)（FR/AC），修复任务的进度仍在 [PLAN.md](./PLAN.md)。
> **读时机**：收到 bug 反馈、判断"这是缺陷还是需求变更"时；修复前（查是否已登记、是否重复）；写回归测试与发版说明前。
> **写规则**：只追加新行、不删行；状态单向流转（见下）；号**不复用**（`wontfix`/`duplicate` 也占号）；已 `verified` 的条目按批迁入 `docs/archive/bugs.md` 后从本表移除。
> **来源**：[archive/code-review-2026-09-19.md](./archive/code-review-2026-09-19.md)（评审报告，只追加）
> **关联**：[INDEX.md](./INDEX.md)（ID 规范 §3 · 细则 §6） · [DESIGN.md](./DESIGN.md)（FR/AC） · [PLAN.md](./PLAN.md)（修复任务） · [TESTING.md](./TESTING.md)（回归 TC） · [CHANGELOG.md](./CHANGELOG.md)（Fixed 段）
> **最后更新**：2026-09-19（建立；首次登记 `BUG-001`–`BUG-005`，来源 [code-review-2026-09-19.md](./archive/code-review-2026-09-19.md)）

---

## 1. 判定：缺陷 还是 需求变更？

| 判据 | 结论 | 落点 |
| --- | --- | --- |
| **规格没变**，实现与 FR/AC 不符 | **BUG** | 本文 + `BUG-0NN` |
| **规格要变**（现有 FR/AC 本身要改） | **不是 bug，是需求变更** | [DESIGN.md](./DESIGN.md) 的 FR/AC + `PLAN.md` 任务（必要时先走 ADR） |
| 规格未覆盖的新行为 | 需求新增 | 先补 FR，再排任务 |

> 一句话：**"实现没做到说好的" = bug；"说的要变" = FR。**

## 2. 状态机

```
open ──> confirmed ──> fixing ──> fixed ──> verified
  │           │            │          │
  └───────────┴────────────┴──────────┴──> wontfix / duplicate
```

| 状态 | 含义 | 谁改 |
| --- | --- | --- |
| `open` | 已登记，未核实 | 任何人 |
| `confirmed` | 已核实为真缺陷（复现方式明确） | 核实者 |
| `fixing` | 已排入 PLAN 并在修 | 修复者 |
| `fixed` | 代码已修，**回归 TC 未跑通** | 修复者 |
| `verified` | 回归 TC 通过，可迁归档 | 验证者 |
| `wontfix` | 确认不修（记录理由） | 决策者 |
| `duplicate` | 与既有条目重复（指向主条目号） | 登记人 |

## 3. 登记表

| BUG | 标题 | 状态 | 违反规格 | 修复任务 | 回归 TC | 发现日期 | 关闭日期 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | 任务作业体 `job(&ctx)` 无 `catch_unwind` → 任务永停 Running 且并发槽泄漏（连续两次 panic 冻结整个队列） | confirmed | NFR-006（并发控制 · DESIGN.md §8） | R4-1 | TC-019 | 2026-09-19 | |
| BUG-002 | 输出"先删目标再 rename"且吞掉删除错误 → 旧文件可能已丢、新产物只留在 `.part`，错误信息不含中间文件路径（6 处） | confirmed | NFR-007（半成品保护 · DESIGN.md §8） | R4-2 | TC-020 | 2026-09-19 | |
| BUG-003 | 指针拖拽在窗口外松手无兜底 → 监听器常驻 window、拖拽态卡死、后续无关点击触发意外重排（3 处） | confirmed | UI.md §9.5 / §9.8（拖拽排序与时间轴） | R4-3 | TC-021 | 2026-09-19 | |
| BUG-004 | `pxToCrop` 不钳制 x/y → 归一化选区越界（与函数自身契约"过小或越界返回 null"不符） | confirmed | AC-351-1（框选与数值微调） | R4-4 | TC-022 | 2026-09-19 | |
| BUG-005 | `generate_thumbnails_sync` 单张失败 `return Err` 中止整批 → 合并页整组缩略图不显示（同族 clip 版为 `continue`） | confirmed | AC-331-1（九项参数检测面板） | R4-5 | TC-023 | 2026-09-19 | |

> **列填写口径**
> - **违反规格**：写被违反的 `FR-xxx` / `AC-xxx`（规格没变才登记为 BUG）；无对应 FR 的工程类问题写 `—（工程）`
> - **修复任务**：`T-0NN` 或 `M#-#` / `R#-#`，可写多个（**一个 BUG 可拆多个 T**）
> - **回归 TC**：`TC-0NN`，指向 [TESTING.md](./TESTING.md)「回归测试」小节；修完必须先有 TC 才能标 `verified`
> - **发现 / 关闭日期**：`YYYY-MM-DD`；未关闭留空

## 4. 与其他文档的关系（单一方向，不双写）

| 环节 | 动作 | 真源 |
| --- | --- | --- |
| 判定为缺陷 | 本文新建 `BUG-0NN` 行 | **本文** |
| 排期修复 | 在 [PLAN.md](./PLAN.md) 建任务，回填到"修复任务"列 | PLAN |
| 写回归测试 | 在 [TESTING.md](./TESTING.md)「回归测试」小节建 `TC-0NN`，标注 `关联 BUG-0NN` | TESTING |
| 修复完成 | 本文状态 → `fixed`；发版说明写进 [CHANGELOG.md](./CHANGELOG.md) 的 **Fixed** 段 | CHANGELOG |
| 验证通过 | 本文状态 → `verified`，填写关闭日期 | **本文** |
| 归档 | 批量迁入 `docs/archive/bugs.md`，从本表移除（号保留不回填） | archive |

**拆解关系**（允许交错，不要求一一对应）：

- 一个 BUG **可以**拆成多个修复任务（`T-001` + `T-002`）
- 一个修复任务 **可以**同时修多个 BUG（`BUG-003` / `BUG-004`）
- 一个 BUG 的回归 **至少**对应一个 TC；同族问题可共用一个 TC

## 5. 归档条件

一条 BUG 满足**全部**条件后即可迁入 `docs/archive/bugs.md`（该文件按需创建）：

1. 状态为 `verified`，或已 `wontfix` / `duplicate` 并写明理由；
2. 对应回归 TC 已在 TESTING 中存在（`wontfix` 免）；
3. CHANGELOG 的 Fixed 段已记录（`wontfix` / `duplicate` 免）。
