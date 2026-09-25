# video-cut 全仓过度工程审查报告（2026-09-25）

> **职责**：2026-09-25 全仓过度工程审查（ponytail-audit 口径）的**原文快照**——只列发现、不改代码。审查边界：**只看过度工程与复杂度**（死代码 / 手写轮子 / 单实现抽象 / 重复同构 / 无人用的灵活性）；正确性、安全、性能明确出界（另行常规审查）。
> **唯一真源**：审查结论以本文为准；**整改归属**见 [PLAN.md](../PLAN.md)「技术任务」——重复收敛 → `T-005`、死代码与投机灵活性清理 → `T-006`；进度节流收敛与 speed 接通已在既有 `R3-4`（本文 §1 表 1.2 复核补充现存份数）；空目录已在 `T-002`（本文 §5 确认删除条件已满足）。
> **读时机**：实施 `T-005`/`T-006`/`R3-4` 时核对条目与证据；**下次审查前必读 §4 豁免清单**，避免对已排期半成品重复立案（本次就差点把 M11-0 撤销基座误判成死代码）。
> **写规则**：**只追加、不改写历史**（同 [code-review-2026-09-19.md](./code-review-2026-09-19.md) 规则）；行号是审查当日 `22fb695` 的快照，仓库此后继续前进。
> **关联**：[INDEX.md](../INDEX.md)（地图与 ID；§6.2 评审产物分流规则） · [PLAN.md](../PLAN.md) · 上位 [DESIGN.md](../DESIGN.md)
> 审查日期：2026-09-25 · 审查对象：`main` @ `22fb695`（工作区干净）
> 覆盖范围：全部一手代码 ≈17.7k 行（前端 `src/` ≈8.6k · Rust `src-tauri/src` ≈5.9k · `src-tauri/tests` ≈1.1k）＋依赖面（package.json / Cargo.toml / tauri.conf.json / capabilities）与配置面（eslint / tsconfig / vitest / check-docs）。
> 方法：**两路并行子代理深扫**（Rust 后端 / 前端各一）＋主对话逐条复核——所有"仅 N 处调用 / 0 引用"断言均经 grep 验证；依赖用量（shell 插件、fs4、chrono、fern、lucide-react）逐一核实到调用点。
> **总评**：整体精简——`R2-5`（2026-09-25）刚做过死代码清理、依赖面零可砍、20 个注册命令全部有消费方；真发现集中在**同一逻辑抄 N 份**。立案净估算 ≈ **-345 行源码**（另有 ≈-45 行已在 `R3-4` 范围内）＋ ≈-60~80 行投机测试用例，**-0 依赖**。

---

## 1. Rust 侧立案发现（9 项：8 → T-005/T-006，1 → 既有 R3-4）

| # | 类型 | 发现 | 收敛方向 | 归属 |
| --- | --- | --- | --- | --- |
| 1.1 | shrink | ffmpeg **10 个参数构建器**逐字重复同一段 8 元素开头（`-hide_banner`/`-nostats`/`-loglevel error`/`-progress pipe:1`/`-stats_period 0.2`）＋ `.iter().map(to_string)` 样板（grep `"-stats_period"`：生产 10 处＋测试 2 处） | `command.rs` 内加 `fn base_args() -> Vec<String>`，各构建器 `extend` 差异部分。**注意**：按 AGENTS §4 第 2 条，参数序列断言同批跑通（参数头对 10 个构建器逐字相同，断言本身应不受影响） | `T-005` |
| 1.2 | shrink | **进度节流闭包**逐字重复 **9 份**（cut.rs:213 / crop.rs:159 / rotate.rs:105 / merge.rs:278,319 / pipeline.rs:360,420,480 / media.rs:346；grep `Duration::from_millis(200)` = 9） | 收敛为一个小 `ProgressThrottle` 结构体（`update(local)`） | **既有 `R3-4`**（立项时记 7 份，本次复核现存 9 份，已回填注记） |
| 1.3 | shrink | **缩略图双胞胎函数**逐行同构：`generate_file_thumbs_sync` vs `generate_clip_thumbs_sync`（media.rs:452-480 vs 510-552）。**欠账**：前者注释自认"收敛留给 R2-2（并入 M11-0）"，但 R2-2 落地清单不含本项——查 R2-2 记录确认漏收，实施时顺带修正该注释 | 对缓存键与结果类型泛型的内部函数，两个入口各留薄壳 | `T-005` |
| 1.4 | shrink | **`file_name` 助手 6 份**同体实现（merge.rs:352 / pipeline.rs:528 / cut.rs:239 `in_name_of` / crop.rs:118 / rotate.rs:50 / media.rs:331） | `commands/mod.rs` 一份 `pub(crate) fn file_name` | `T-005` |
| 1.5 | yagni | **两层单调用封装**：`normalize_crop_rect` 纯转发 `align_rect`；`validate_crop_rect` = probe＋一行调用（crop.rs:17-36,75-87），全仓唯一生产调用者 cut.rs:66 | 提交期内联 probe＋`align_rect`；测试直调 `align_rect` | `T-006` |
| 1.6 | shrink | pipeline `n_norm` 先用 `diff_pair` 全量数一遍（387-398），主循环对每项**再算一遍** `diff_pair`（401-408） | 单遍循环收集需归一化的下标 | `T-005` |
| 1.7 | delete | **`VideoStreamInfo.bit_depth` 死字段**：probe.rs:331 解析赋值后，前端 `bitDepth` 全仓 **0 命中**（UI 从不展示） | probe.rs＋lib.rs＋前端 types 三处同删；**DESIGN §7 同提交同步**（AGENTS §3 第 17 条） | `T-006` |
| 1.8 | delete | **`MediaInfo.subtitle_count` 死字段**：probe.rs:256-282 解析、lib.rs:82 字段、types/index.ts:50 镜像，前端除类型声明外 **0 次读取** | 同上双端删＋DESIGN §7 同步 | `T-006` |
| 1.9 | shrink | `resolve_sidecar` 头上**两段互相矛盾**的文档注释（一说 `{name}-{target-triple}.exe`、一说 `{name}.exe`；command.rs:14-19；后者与实现一致） | 留第二段删第一段 | `T-005`（顺手） |

## 2. 前端侧立案发现（10 项：8 → T-005，2 → T-006）

| # | 类型 | 发现 | 收敛方向 | 归属 |
| --- | --- | --- | --- | --- |
| 2.1 | shrink | **六份逐行相同页头**（h-14 高 header＋返回按钮＋标题；Cut **页内就有两份**：201-211, 235-248；Merge:166 / Editor:326 / History:126 / Settings:143） | 抽 `<PageHeader title onBack right>` | `T-005` |
| 2.2 | shrink | **四份空状态**"打开/添加视频"虚线大按钮同构 JSX（Cut:213 / Editor:158 / Merge:183 / Workbench:586，`h-64 border-dashed border-hairline group` 全同） | 抽 `<EmptyImport onOpen hint>` | `T-005` |
| 2.3 | shrink | **`initialFiles` 消费惯用手写 4 份**（consumedRef 哨兵＋effect；Cut:92 / Editor:85 / Merge:44 / Workbench:173） | 抽 `useConsumeInitialFiles(initialFiles, fn)` | `T-005` |
| 2.4 | shrink | **防覆盖导出链路两份**（trim 尾斜杠＋resolveUniqueTarget＋submitTask/try/catch/finally；Merge:128-148 vs Workbench:450-471，`outputDir.replace(/[\\/]+$/, "")` 两处同文） | 抽 `submitWithUniqueTarget()` | `T-005` |
| 2.5 | shrink | **首帧缩略图加载 effect 两份**逐行同构（Merge:86-104 vs Workbench:186-204，仅变量名不同） | 抽 `useThumbnails(paths)`；与 `T-003` 的"缩略图 effect 稳定 key 消重复 IPC"条目配合实施 | `T-005` |
| 2.6 | shrink | **旋转/翻转显示变换两份**逐字符同构（宽高交换＋`rotate/scaleX/scaleY` 串；EditModeView:78-87 vs ProductPreview:268-276） | Workbench `shared.ts` 就近扩展 `displayedDims` 一族 | `T-005` |
| 2.7 | shrink | **帧步长表达式 `fps>0 ? 1/fps : 1/30` 三份**＋undo 层 `DEFAULT_FPS` 第四处（Cut:117 / CutModeView:60 / EditModeView:66 / undo/commands.ts:22,69） | `utils/time.ts` 加 `frameStepOf(fps)` | `T-005` |
| 2.8 | delete | **撤销 JSON 序列化通路**：`toJSON()`/`commandFromJSON`/`CommandJSON`（undo/commands.ts:39,47-49 / types.ts:29-33,42）——全仓除测试 **0 引用**，PLAN/DESIGN **无"会话恢复"排期**，纯投机灵活性；round-trip 用例仅自证 | 删实现＋对应用例（≈-60 行测试）；未来若立项会话恢复，按届时规格重写 | `T-006` |
| 2.9 | yagni | **撤销栈 `limit`/`depth` 旋钮**：生产调用（Workbench index.tsx:150）从不传 `limit`；`depth` 无读方（store.ts:42,104,110 / types.ts:60） | 删参取常量 `UNDO_LIMIT` | `T-006` |
| 2.10 | delete | **零碎四件**：Editor 死 `playerRef`（Editor:53,216，传入后从未解引用、该页不 seek）；`RotateState`/`CropRect` 再导出 shim ×2（RotateControls:5 / crop.ts:12，注释自认"保持既有 import 不变"，同类符号已有 types 正源）；`EditorTool` 与 `EditorTab` 重复 union（Editor:20 vs shared.ts:9，逐字相同）；`appendFrontendLog` 4 值 level union 仅 `"error"` 被用（tauri.ts:177-181） | 各自直删 / 统一走 types / 合一 / 收窄 | `T-006` |

## 3. 整改归属汇总

| 任务 | 内容 | 估算 |
| --- | --- | --- |
| `T-005`（新立项） | §1 表 1.1/1.3/1.4/1.6/1.9＋§2 表 2.1~2.7 | ≈-265 行 |
| `T-006`（新立项） | §1 表 1.5/1.7/1.8＋§2 表 2.8~2.10（表 2.8 含 ≈-60 行测试） | ≈-80 行＋测试 ≈-70 |
| 既有 `R3-4` | §1 表 1.2 节流 ×9（原记 7 份） | ≈-45 行（已在其范围内） |
| 既有 `T-002` | 空目录（见 §5 末条） | 0 行 |

## 4. 豁免清单（发现但显式保留——下次审查勿重复立案）

1. **撤销读回侧与三个未接线 builder**（≈-250 行源码＋≈-220 行测试）：`undo()/redo()/clear()/canUndo/canRedo/undoLabel/redoLabel`＋bump 重渲染＋各命令 `invert`/`before` 快照；`buildSplit`/`buildTrim`/`buildRemoveFromTimeline` 全仓 0 生产调用（Workbench index.tsx:299 仅有规划注释）。**已排期**：按键接线归 `M11-7`、UI 接线归 `M11-5`/`M11-6`/`M11-4`（PLAN `M11-0` 落地内容明确"本次不接线"），"基座先行"是决策 #32 定案——按 AGENTS §3 第 16 条不重复决定。**除非 M11 砍范围，否则不是过度工程**。
2. **`ProgressPayload.speed`/`eta_seconds` 全链路恒空**（manager.rs:48-49,133-134 恒写 `None`；9 个进度闭包丢弃第二参；前端 `etaSeconds` 镜像恒 null）：`R3-4`「speed 接通」已排期（M12-2 前）。接线即活，前端 `etaSeconds` 随之保留。
3. **`Cleanup`/`submit_with_cleanup` 机制**（manager.rs 的 `Cleanup` 类型 / `TaskEntry.cleanup` / `run_cleanup` / cancel 与 worker 两侧兜底＋2 个专项测试）：唯一生产调用方 media.rs:379（generate_proxy 簿记回收），功能上与 media.rs:313-323 的 `is_active` 自愈部分重叠，收益 ≈-40 行。但它是 **AGENTS §3 第 8 条固化的红线模式**，删除需走新 ADR（"已定过的事不重复决定"）。收益小于治理成本，**保留**。
4. **类型镜像未读字段 `displayDeg`/`videoTimeBase`**：AGENTS §3 第 17 条 Rust↔TS 双写契约纪律的一部分（契约镜像属自觉决策），保留。
5. **撤销纯核心 / React 适配两层**（`UndoCore`＋`createUndoStack`＋getter 接口，唯一 React 消费方 `useUndoStack`）：Vitest node 环境无 DOM，纯函数层是可测性前提；`M11-7` 接线后读回侧也有了消费方。保留。

## 5. 已核实、无问题（避免重复排查）

- **依赖零可砍**：`tauri-plugin-shell` 有真用（`ShellExt` 解析 sidecar 路径，probe.rs:74 / command.rs:51）；`fs4` 仅用 `available_space`（std 无磁盘余量 API）；`chrono`/`fern` 只服务 logger 与时间戳文件名；`lucide-react` 图标在用；tauri.conf.json / capabilities 无死配置（`core:window:allow-destroy` 有 services/tauri.ts:224 消费）。
- lib.rs 注册的 20 个 Tauri 命令全部有前端消费（含不经 `services/tauri.ts` 直 invoke 的 `expand_video_inputs`，tauri.ts:117 有封装）。
- `EventSink` trait 单实现：测试无法构造 `AppHandle`，`CollectSink` 是唯一可测路径，必要。
- `fnv1a` 手写哈希：缓存文件名需跨进程/跨版本稳定，std `DefaultHasher` 不保证跨版本稳定，合理。
- `services/tauri.ts` 全部导出、5 个 hooks、`VideoPlayer` 全部 props 均有 ≥2 处消费方；未发现手写 clamp/深拷贝/日期格式化类 stdlib 违例（`formatTime`/`realCutStart` 无内置对应；前端无 path 库，`basename` 自写合理）。
- **空目录** `src/components/{CropEditor,MergeEditor,RotateEditor}`：与既有 `T-002` 重复，不另立案；本次确认 R2-1 拆分未复用这三个名字（新组件落在 `pages/Workbench/` 与既有 `components/`），T-002 的删除条件已满足。

## 6. 净估算

立案（`T-005`＋`T-006`）：≈ **-345 行源码**＋≈ **-60~80 行投机测试**；`R3-4` 范围内另有 ≈-45 行（节流 ×9）。依赖 **-0**。
