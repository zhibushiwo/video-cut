# video-cut 完成态任务索引（M0–M9 + R1，47 条）

> **职责**：M0–M9 与 R1 中**未在 [INDEX.md](../INDEX.md) §5 追踪矩阵逐条展开**的已完成任务的四段关联（任务 → FR/NFR → AC → 模块 → 测试）。
> **唯一真源**：本表是 **2026-09-19 的历史补齐快照**（当时一次性建表），**完成后不再同步**——新任务的关联由 INDEX §5 矩阵的 FR 行承担；本文件只用于追溯老批次。
> **读时机**：问"M5-3 关联哪个 FR / 哪条 AC / 哪个 TC"时；追溯历史任务的验收归属时。
> **写规则**：**只读快照，不再更新**（历史结论不回溯改写）。
> **迁入说明**：本节原为 [INDEX.md](../INDEX.md) §5.1「附录 A」，2026-09-28 因文档精简迁出（INDEX 是会话开场必读，附录属查表类历史内容）。
> **关联**：[INDEX.md](../INDEX.md)（地图与 ID 规范） · [PLAN.md](../PLAN.md)（进度） · [handoff-archive.md](./handoff-archive.md)（批次实施要点）

## 附录 A：完成态任务索引（矩阵未逐条展开的已完成任务）

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
