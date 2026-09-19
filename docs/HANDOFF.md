# 开发状态交接（HANDOFF）

> **职责**：会话上下文压缩后的**状态快照**——现在在哪、下一步做什么、未决问题。
> **唯一真源**：**"当前状态与下一步"**以本文为准；进度细节以 [PLAN.md](./PLAN.md) 为准（里程碑表仅在状态变化时同步）；长期红线以 [../AGENTS.md](../AGENTS.md) 为准。
> **读时机**：会话开场第一条；接续他人工作时。
> **写规则**：只写当前状态与**近期相关**的坑；已定型的长期约定移入 AGENTS.md（本文只留指针）；历史批次要点进 [handoff-archive.md](./archive/handoff-archive.md)，本文不堆积。
> **关联**：[../README.md](../README.md)（项目简介/技术栈/命令） · [INDEX.md](./INDEX.md)（地图与 ID） · [PLAN.md](./PLAN.md)（进度真源） · [../AGENTS.md](../AGENTS.md)（红线与完事标准）
> **最后更新**：2026-09-19
> **项目速览**（原独立小节，2026-09-19 去重为指针）：简介 / 功能 / 技术栈 / 环境要求 / 构建命令 → [../README.md](../README.md)｜命令 / 红线 / 完事标准 → [../AGENTS.md](../AGENTS.md)｜文档分工与 ID 规范 → [INDEX.md](./INDEX.md) §1–§2。

## 当前状态（2026-09-19）

> **状态真源是 [PLAN.md](./PLAN.md)**（里程碑总览的状态列）；本表是**快照**，只在状态变化时同步；M0–M9 各批次的提交号与实施要点见 [handoff-archive.md](./archive/handoff-archive.md)。**代码侧现状核对**：`useTauriEvent` / `utils/crop.ts` / `CropOverlay` 已就位；任务系统带终态清理钩子；`pnpm lint` 可用（存量 0 problems）；`src/utils/` 无 `undo/`、`Workbench/index.tsx` 仍 1581 行单文件、无 Vitest 配置、`App.css` 与 `less` 依赖仍在——即 R2 与 M11 均未动工。

| 里程碑 | 状态 |
| --- | --- |
| M0–M9 基建 → 工作台 → 修复冲刺 | ✅ 已交付（M4-5 实机冒烟、M6-7/M7/M9 待用户统一手测） |
| M10 保活 + 深浅主题 | ⏸ 暂缓（决策 #32） |
| R1 评审修复五项 | ✅ 2026-09-19（`23c3623` `eea9422` `70a991e` + R1-4/R1-5） |
| R2 重构 · R3 收尾 | ⏳ 未开工（R2 并入 M11-0；R3 在 M12-2 前） |
| **R4 第二轮审查整改**（6 条，修 `BUG-001`~`005`） | 🔜 **下一步**（PLAN R4-1~R4-6） |
| M11 单轨时间线核心 → M12 预览强化 → M13 打磨 | ⏳ R4 之后（M11-0~M11-9 未开工） |

## 下一步（按序）

**R4（审查整改）→ M11-0（状态层/撤销基座，吸收 R2）→ M11-1~M11-9 → R3 → M12-2 → M12-1/3 → M13**；M10 与时间线核心零耦合，视反馈随时插入。

- **待用户统一手测**：M4-5 NSIS 干净环境冒烟 · M7-1/2/3 · 工作台 2.0 全流程 · 快捷键 · M4-8 · **M9 五项**（连播可 seek / 切换无残留 / 多短片段不压盖且整块可拖 / 加工视图播完出点即停）
- **遗留小项**：规则 B 下"有片段裁剪 + 其他片段非恒等旋转"时后者也转码；硬编路径未在真 GPU 验证；旋转覆盖源 flip 元数据；代理关闭时不支持格式仅提示条；日志跨天不切文件；README 截图待补
- **硬门槛与独立任务**：发布前 asset scope 收窄 + CSP（`CAND-015`）· `T-001` 消除 TIMELINE.md §17.4 ↔ plans/M11.md §18.5 重复 · `T-002` 清理空组件目录 · `T-003` 审查发现的一致性收敛

## 未决问题（评审 / 反馈）——待定性

> **硬规则**：会话结束前，每条未决意见**必须转正**（`BUG` / `T` / `ADR` / `FR`）**或显式保留并写原因**；分流规则见 [INDEX.md](./INDEX.md) §6.2（评审产物的归属）。暂存于此的意见须标「待定性」+ 来源/现象/影响面/为何定不了，**不允许无声消失**。

| 项 | 来源 | 现象 / 疑点 | 影响面 | 待定性原因 | 复查点 |
| --- | --- | --- | --- | --- | --- |
| 实机行为未验证 | 评审 §6.2 | `ProductPreview.switchTo` 段边界可能误报 `onPlayingChange(false)` 致连播停住（静态推演判定**不成立**） | 成品连播体验 | 需实机复现；静态审查证不了 | M11-2 / M12-1 实跑连播观察；复现则按"`segIdxRef` 替代 `slot` 比较"处理 |
| 打包与安装未审 | 评审 §8 | `tauri.conf.json` / NSIS / capability 收窄 / CSP 未纳入审查 | **发布前硬门槛** | 属发布面而非功能面；已在 `CAND-015` 立项 | 发布前统一处理（CSP + asset scope 收窄 + 干净环境冒烟） |
| 依赖安全未扫 | 评审 §8 | `pnpm-lock.yaml` / `Cargo.lock` 未做已知漏洞扫描 | 供应链安全 | 需联网工具（本环境代理受限） | 发版前在可联网环境跑一次审计 |
| 性能未 profiling | 评审 §8 | 只有静态开销判断（缩略图冗余请求已转 `T-003`），无实测数据 | 大素材/多片段体验 | 缺 profiling 工具链与夹具 | M11-9（100 片段埋点）时一并取数 |
| e2e 断言强度未评估 | 评审 §8 · §5.3 | `tests/e2e.rs` 断言强度未逐条评估；覆盖缺口：rotate、crop_zoom、merge 非兼容转码分支、proxy 去重 | 回归保障强度 | 需先补齐 R4 回归 TC 才有对照基线 | R4 完成后（TC-019–TC-024 就位）逐条评估并补缺口 |
| 位深是否单独展示 | 自查（docs 复查） | DESIGN §3.1 原写面板显示"位深"，实现只有 `pixFmt`（如 `yuv420p10le`，位深含在串里）；Rust `bit_depth` 已提供、前端 TS 未消费 | 信息面板呈现 | 属产品取舍（单列字段 vs 由像素格式表达），不影响功能 | 提"信息面板增强"需求时一并定；若单列则补 TS 字段 + 面板一行 |

## 关键事实（M11 阶段；长期红线与坑速查见 AGENTS.md §3/§8）

- **Rust 类型契约集中在 `src-tauri/src/lib.rs`**（serde `rename_all = "camelCase"`；枚举 snake_case，数字前不加下划线）：`PipelineItem { input, segment?, rotateDeg, hflip, vflip, crop?, outWidth?, outHeight? }`；除 Merge 外四类任务均带 `encoder: Option<String>`。加字段需同提交更新 `lib.rs` + `src/types` + DESIGN §7。
- **sidecar 运行时命名是裸 `ffmpeg.exe` / `ffprobe.exe`**；`resolve_sidecar` 已对齐插件行为，测试二进制需上溯 deps 目录。
- **任务系统**：并发 2、kill 取消、`.part`→rename；事件 `task-status` / `task-progress`（payload camelCase）；`submit_pipeline` 有 debug 日志打印收到的载荷（e2e 排查时看日志文件或 tauri dev 控制台）。
