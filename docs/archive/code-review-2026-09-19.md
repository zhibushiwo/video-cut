# video-cut 全量代码审查报告

> **职责**：2026-09-19 全量代码审查（四路并行复审）的**原文快照**——只记录发现、不修改代码。
> **唯一真源**：该次审查的原始结论以本文为准；审查产出的**整改归属**见 [BUGS.md](../BUGS.md)（`BUG-001`–`BUG-005`）· [DECISIONS.md](../DECISIONS.md)（`ADR-033`）· [PLAN.md](../PLAN.md)（R4 批次 / `T-003`）。
> **读时机**：追溯某条 BUG / 任务 / 决策的评审依据时；复读审查结论时。
> **写规则**：**只追加、不改写历史**（与 [handoff-archive.md](./handoff-archive.md) 同规则）；文中状态是**审查当日 `f80dd0e`** 的快照，仓库此后继续前进。
> **关联**：[INDEX.md](../INDEX.md)（地图与 ID） · [BUGS.md](../BUGS.md) · [PLAN.md](../PLAN.md) · 上位 [DESIGN.md](../DESIGN.md)
> **最后更新**：2026-09-19（入库；本头部为归档时补写，正文一字未改）
> 审查日期：2026-09-19 · 审查对象：`main` @ `f80dd0e`（53 提交，工作区干净）
> 覆盖范围：全部一手代码 ~11.6k 行 —— 前端 6 320 行（30 文件）/ Rust 5 311 行（21 个 `.rs`，含 `tests/e2e.rs`）
> 审查重心：**架构与可维护性 · 正确性与并发 · 跨层契约一致性**
> 上位文档：[DESIGN.md](../DESIGN.md)（规格仲裁者）· [DECISIONS.md](../DECISIONS.md)（决策）· [PLAN.md](../PLAN.md)（整改排期）
>
> **本报告不修改任何代码**，仅登记发现。整改项需在 [PLAN.md](../PLAN.md) 立项后实施。
> **位置**：已归档为本文（`docs/archive/`，2026-09-19 入库）—— 属**只追加的历史快照**，见 [handoff-archive.md](./handoff-archive.md) 同类规则。
> **整改归属（按 [INDEX.md](../INDEX.md) §6 分流）**：违反规格 → [BUGS.md](../BUGS.md) `BUG-001`–`BUG-005`；设计口径 → [DECISIONS.md](../DECISIONS.md) `ADR-033`；技术债 → [PLAN.md](../PLAN.md) `T-003`；评审修复任务 → PLAN `R4-1`–`R4-6`；未定性项 → [HANDOFF.md](../HANDOFF.md)「未决问题」段。
> **阅读顺序建议**：先看 [§9 审查后变化](#9-审查后变化)，确认哪些发现已在后续提交中修复。

---

## 0. 方法与可信度

| 层次 | 手段 | 结论 |
| --- | --- | --- |
| 机器层 | `tsc --noEmit` · `eslint .` · `cargo clippy --all-targets` | 全绿（详见 §1） |
| 跨层契约 | 枚举 Rust `#[tauri::command]` / `generate_handler!` / 前端 `invoke` 三方比对 | 完全一致，无漂移（详见 §2） |
| 深审 | 四路并行独立审查（Rust 核心 / Rust 命令层 / 前端页面 / 前端基础）+ 人工逐条复核 | 发现 4 项重要、9 项次要、若干建议 |

**每条发现均经过人工按行号复核**。凡未能证实的、或复核后判定为误报的，单独列在 §6「已核实并排除」，避免日后重复讨论。

---

## 1. 机器层基线（无问题）

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| `eslint .` | 0 problems（`react-hooks` 两条 error 级规则、`no-restricted-imports` 均通过） |
| `cargo clippy --all-targets` | 0 error；7 条 warning，全部风格级：`too_many_arguments`×3、`ptr_arg`、`doc_lazy_continuation`×2、`trim_split_whitespace`、`useless_format` |

> 结论：**类型、lint、clippy 三条机器防线干净**，本报告剩余问题均属机器查不出的类别。
> `too_many_arguments` 的 3 处（`commands/rotate.rs:17` 10 个参数、`ffmpeg/command.rs:487` 10 个、`commands/crop.rs:40` 8 个）是 Data Clumps 信号，见 §5.2。

---

## 2. 跨层契约核对（全绿）

### 2.1 命令三方对齐

`#[tauri::command]` 定义 **20 个** ↔ `lib.rs` 的 `generate_handler!` 注册 **20 个** ↔ `src/services/tauri.ts` 的 `invoke` 调用 **20 个**，**集合完全一致，无"定义了未注册"或"注册了不存在"的漂移**。

| # | 命令 | # | 命令 | # | 命令 | # | 命令 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `check_environment` | 6 | `cancel_task` | 11 | `expand_video_inputs` | 16 | `check_merge` |
| 2 | `list_tasks` | 7 | `generate_thumbnails` | 12 | `file_exists` | 17 | `check_pipeline` |
| 3 | `clear_finished_tasks` | 8 | `generate_clip_thumbnails` | 13 | `open_log_dir` | 18 | `submit_task` |
| 4 | `probe_media` | 9 | `append_frontend_log` | 14 | `list_history` | 19 | `cache_usage` |
| 5 | `list_keyframes` | 10 | `generate_proxy` | 15 | `clear_history` | 20 | `clear_cache` |

### 2.2 事件与参数命名

- 事件名：前端监听 `task-status` / `task-progress`（`services/tauri.ts:103,109`）↔ Rust 仅 emit 这两个（`task/manager.rs:58,61`）。**一致**。
- 参数命名：蛇形→驼峰映射（`task_id→taskId`、`time_sec→timeSec` 等）逐项核对，未发现"前端传 camelCase、后端写 snake_case"导致的静默失效风险。
- 页面层合规：6 个页面**均只经 `services/tauri.ts`** 调 IPC，无直接 `import @tauri-apps/*`；事件订阅**全部走** `useTauriEvent`，无遗留手写 `listen().then()`。

> 结论：**跨层契约这一轴无问题**。这是本次审查最让人放心的一条 —— 该轴此前无任何机器化保障，纯靠人工纪律维持，实测没有走样。

---

## 3. 重要（4 项）

### 3.1 Rust 任务 panic 无隔离 → 任务永久停在 Running + 并发槽泄漏

**位置**：`src-tauri/src/task/worker.rs:125`

**问题**：作业体 `job(&ctx)` 无 `catch_unwind` 保护。

```rust
let result = job(&ctx);          // ← 无 unwind 保护
```

**依据**：`run()` 的终态处理（`record_terminal`、`run_cleanup`、`task_finished`）全在 `job` 返回**之后**（`worker.rs:143,152,153`）。作业体一旦 panic，线程直接 unwind，这三步全部跳过。

**后果**（两个后果叠加，比单项严重）：
1. 任务状态永远停在 `Running`，UI 显示一个永不结束的任务；
2. `task_finished()` 未调用 → 全局并发上限 2 的槽位**永久泄漏**。**连续两次 panic 即让整个任务队列彻底冻结**（后续任务永远 Pending）。

**修法**：用 `std::panic::catch_unwind(AssertUnwindSafe(|| job(&ctx)))` 包裹，panic 时把 `result` 视为 `Err("任务内部错误")`，让既有的终态处理照常执行。`Job` 是 `FnOnce`，需先取出再 move 进闭包。

**备注**：`info!` 中的取消与失败路径均已正常处理，此为该文件唯一未受保护的路径。

---

### 3.2 「先删目标再改名」且删除错误被吞 → 可能既丢旧文件又无新产出（6 处重复）

**位置**（同一模式重复 6 次）：

| 文件:行 | 代码 |
| --- | --- |
| `commands/cut.rs:222` | `let _ = std::fs::remove_file(&item.final_path);` |
| `commands/crop.rs:167` | `let _ = std::fs::remove_file(&out);` |
| `commands/media.rs:310` | `let _ = std::fs::remove_file(&job_output);` |
| `commands/merge.rs:315` | `let _ = std::fs::remove_file(&out);` |
| `commands/pipeline.rs:473` | `let _ = std::fs::remove_file(&out);` |
| `commands/rotate.rs:110` | `let _ = std::fs::remove_file(&out);` |

**问题**：六处一律「先无条件删掉目标位置的文件，再把 `.part` 改名过去」，且**删除的返回值被 `let _ =` 丢弃**。若紧随其后的 `rename` 失败（Windows 上目标被占用、杀软扫描窗口期、权限不足），结果是：

- 目标位置的**既有文件已被删除**；
- 新产物只留在带 token 的中间文件里（如 `xxx.part.<token>.mp4`）；
- 错误文案只报「重命名输出失败」，**不告诉用户中间文件在哪**。

即用户可能同时失去旧文件、又看不到新文件，而中间产物在磁盘上无人知晓。

**修法**（择一，建议第 1 种）：
1. 改为「改名成带 token 的临时名 → 原子替换」：`rename(final, final.bak)` → `rename(part, final)` → `remove_file(final.bak)`；失败时回滚 `.bak`。
2. 保留现有顺序，但：`remove_file` 的错误不再吞掉（目标被占用时直接报"输出文件被占用，请关闭后重试"），且 `rename` 失败的错误信息中带上 `.part` 的完整路径。

**备注**：同时这个模式值得抽成 `fs::atomic_replace(part, final)` 一个函数，一并消掉 6 处重复（见 §5.1）。

---

### 3.3 拖拽在窗口外松手 → 监听器常驻 + 拖拽态卡死 + 后续无关点击触发意外重排

**位置**：

| 文件:行 | 现状 |
| --- | --- |
| `src/hooks/useDragSort.ts:67-89` | `pointerup` + `pointercancel`，**无 `buttons===0` 兜底** |
| `src/components/Timeline/index.tsx:122-123` | 仅 `pointermove` + `pointerup`，**连 `pointercancel` 都没有** |
| `src/components/ClipTimeline/index.tsx:189-190` | 仅 `pointermove` + `pointerup`，**连 `pointercancel` 都没有** |
| `src/components/CropOverlay/index.tsx:84-86` | ✅ 已修（`guarded` 内判 `buttons===0` + 注册 `pointercancel`） |

**问题**：`useDragSort.beginDrag`（`:45-50`）**没有调用 `setPointerCapture`**，所以指针在应用窗口之外松开时，`pointerup` 与 `pointercancel` 都不会派发，`finish()` 永不执行。

**依据**：同一个坑在 R1-4 修 `CropOverlay` 时已踩过一次 —— 当日结论正是「指针在窗口外释放时 pointerup 不派发，否则监听器常驻 window、选区随鼠标乱跑」。`CropOverlay` 已有正确兜底，可作参照实现；其余三处漏改。

**后果**：
1. `pointermove` 常驻 `window`，列表随鼠标移动持续高亮跟随（无按键也生效）；
2. `dragIndex` 不复位 → 该行永久半透明（`opacity-40`），界面看起来"卡住"；
3. 之后任意一次无关点击的 `pointerup` 会调用 `finish()`，以**当时的** `overRef.current` 执行 `onReorder` → **一次无关点击造成列表意外重排**。

**修法**：对齐 `CropOverlay` 的写法 —— 在 `move` 中加 `if (ev.buttons === 0) { finish(); return; }`，并给 `Timeline` / `ClipTimeline` 补上 `pointercancel` 监听。建议同时抽一个共享的指针拖拽收尾工具，避免第三、第四处继续漏。

---

### 3.4 `pxToCrop` 不钳制 x/y → 归一化选区越界

**位置**：`src/utils/crop.ts:49-57`

**问题**：越界收缩只调整宽高，**`x`/`y` 从头到尾没有被钳制**。

```ts
const x = evenPixel(input.x || 0);          // ← 无上界钳制
let w = evenPixel(input.w || 0);
if (w < MIN_CROP_PX || h < MIN_CROP_PX) return null;
if (x + w > dims.w) w = dims.w - evenPixel(Math.min(x, dims.w - MIN_CROP_PX));
```

**依据**：取 `dims.w = 200`、`input.x = 190`、`input.w = 150` → `w` 被收缩为 `200 - evenPixel(min(190,184)) = 16`，而 `x` 仍为 190 → `x + w = 206 > 200`，`nx + nw = 1.03 > 1`。`x` 越大偏离越多（`x=300` 时 `nx` 直接到 1.5）。

**触发路径**：裁剪的**像素数值微调输入框**（`CropFields`）。函数注释声明「过小或越界不可救时返回 null（调用方忽略本次提交）」，但此处返回的是**非 null 的越界结果**，与契约不符。

**后果**：与 §4.1 叠加后，用户看到的是「填入合法数值 → 提交 → 任务跑到一半才失败」。若单独看，则越界矩形可能被下发到下游校验。

**修法**：
```ts
x = Math.min(x, Math.max(0, dims.w - MIN_CROP_PX));
y = Math.min(y, Math.max(0, dims.h - MIN_CROP_PX));
if (x + w > dims.w) w = evenPixel(dims.w - x);
if (y + h > dims.h) h = evenPixel(dims.h - y);
```
并给 `pxToCrop` 补一组边界单测（`x` 在界内/恰好压界/远超界，`w` 最小/恰好/超界）。

---

## 4. 次要（9 项）

### 4.1 工作台裁剪越界只在作业体内校验，与 CropZoom 口径不一致

`src-tauri/src/commands/pipeline.rs:328-335` 对每个 `item.crop` 调 `display_crop_rect(...)?`，**校验发生在作业体内部** —— 非法选区要等前序片段全部跑完才报错。而 CropZoom 路径在提交期就 `validate_crop_rect` 提前校验（`commands/cut.rs:65-68`）。

**修法**：在 `submit` 阶段对 `items` 的 crop 做一次边界预检，让两类任务在「非法选区」上的失败时机一致。

### 4.2 `generate_thumbnails_sync` 单张失败即整批返回 Err，与同族函数行为不一致

`commands/media.rs:391-393` 用 `return Err(...)` 中止整批；而同族的 `generate_clip_thumbnails` 在 `commands/media.rs:467-468` 用 `continue` 跳过单张。

**后果**：合并页选中 N 个文件时，只要有一个无法抽帧，**整组缩略图全部不显示**。
**修法**：改为 `continue` 跳过，与 clip 版本统一。

### 4.3 调度线程 `spawn().expect()`：失败即冻结整个队列

`src-tauri/src/task/manager.rs:442-446`

```rust
std::thread::Builder::new()
    .name(format!("task-{id}"))
    .spawn(move || crate::task::worker::run(s2, handle, sink, job))
    .expect("启动任务线程失败");        // ← panic 杀死调度线程
```

线程创建失败（系统资源耗尽）时调度线程 panic 退出 → 之后所有 `submit` 的 `notify_all` 无等待者，任务**永远 Pending**；且 `inner.running += 1`（`:434`）已执行，槽位同样泄漏，该 id 的 cleanup 也不会执行。

**修法**：`if let Err(e) = ...spawn(...) { log::error!(...); inner.running -= 1; /* 置该任务 Failed 并跑 cleanup */ }`，不要 `expect`。
**备注**：此项**已在 [PLAN.md](../PLAN.md) 的 B15「调度线程 panic 加固」立项**，本报告仅确认其现状与后果。

### 4.4 `record_terminal` 持 `on_terminal` 锁调用回调

`src-tauri/src/task/manager.rs:238-240`

```rust
if let Some(cb) = self.on_terminal.lock().unwrap().as_ref() {
    cb(handle);          // ← guard 存活到 if-let 块结束，回调在持锁期间执行
}
```

`if let` 的临时量存活至块尾，故回调在持 `on_terminal` 锁期间执行。**若回调反向触碰 `on_terminal` 会自死锁**（`Mutex` 不可重入）。

**现状**：本次未找到反向触碰的调用路径，故仅列为潜在窗口。
**修法**：先取值再解锁（`let cb = self.on_terminal.lock().unwrap().take()` 风格或先 clone `Arc` 后 drop guard），把回调移出临界区。

### 4.5 半成品容器与最终扩展名的口径不统一

| 位置 | `.part` 命名 |
| --- | --- |
| `commands/cut.rs:146-152` | `{stem}_part_{i:03}.{token}.part.{ext}` —— **`ext` 取自源文件扩展名**（`:118-122`） |
| `commands/crop.rs:127` | `{out_name}.part.{token}.mp4` —— **硬编码 mp4** |
| `commands/merge.rs:190` | 同上（硬编码 mp4） |
| `commands/pipeline.rs:265` | 同上（硬编码 mp4） |
| `commands/rotate.rs:56` | 同上（硬编码 mp4） |

**注**：`.part.mp4` 是**有意为之** —— `cut.rs:145` 有注释「半成品保留真实扩展名（xxx.part.mp4），否则 ffmpeg 无法推断封装格式」。真正的问题是**最终输出名**（用户输入或源扩展名）可能与这个容器不符：最终名若是 `xxx.mkv` / `xxx.mov`，产物会出现扩展名与实际封装不一致。反过来 cut.rs 走源扩展名，遇到 `.webm`/`.ts` 之类源做精确剪切（重编码）时，又可能让 ffmpeg 推断出非预期的容器。

**修法**：统一口径 —— 或全链路强制 mp4（提交期改写/校验扩展名），或全链路跟随源扩展名并明确容器映射表；两条路都可，但**不应一半一半**。

### 4.6 `useTauriEvent` 的 `.then` 无 `.catch`

`src/hooks/useTauriEvent.ts:25-28`

```ts
void ref.current().then((f) => { if (alive) unlisten = f; else f(); });
```

`subscribe` reject 时成为未捕获 rejection（reject 时本就无监听器，无需退订，仅需消警）。
**修法**：链式补 `.catch(() => {})`。
**备注**：该 hook 的退订语义经逐条推演**正确** —— StrictMode 双挂载 → cleanup1 置 `alive=false`、subscribe1 resolve 时走 `else f()` 补退订；resolve 前卸载 → 同路径；resolve 后卸载 → cleanup 调 `f()`。三条路径均干净（详见 §6.3）。

### 4.7 缩略图 effect 依赖 `[files]` 导致重复 IPC

`src/pages/Workbench/index.tsx:310-328`：每次 probe 完成都会生成新的 `files` 数组，effect 随之重跑并再次调 `generateThumbnails`。`setThumbs` 是累加所以结果正确，但**请求冗余**（N 个素材 ≈ N 次全量请求）。
**修法**：按"尚未有缩略图的输入集合"作为依赖（如用 `inputs.join("\u0000")` 派生一个稳定 key），或把缩略图补全收敛到添加素材的那一处。

### 4.8 `Workbench` 的 `generateProxy` 调用无 `.catch`

`src/pages/Workbench/index.tsx:204-211`：`onError` 内 `void generateProxy(...).then(...)` 缺 `.catch`，拒绝时成为未捕获 rejection。

### 4.9 文档与代码漂移（3 处）

| # | 位置 | 问题 | 现状 |
| --- | --- | --- | --- |
| a | `docs/DESIGN.md` §5.2 | 列出 `MergeEditor/`、`RotateEditor/`、`CropEditor/` 三个组件，实际 `src/components/` 下这三个目录**均为空且未被 git 跟踪**（`ls -A` 与 `git ls-files` 均为空）。即文档描述的是**空目录**。 | **仍未修**（`af7df66` 后复核） |
| b | `docs/DESIGN.md` §5.2 | 缺 R1-2 新增的 `hooks/useTauriEvent.ts` 与 R1-4 新增的 `utils/crop.ts`（该节列出的 hooks 只有 `useDragSort`/`useHotkeys`，utils 只有 media/paths/time）。 | **仍未修**（`af7df66` 后复核） |
| c | `README.md` 末尾 | 「## 许可证」**重复出现两遍**（103-106 行与 108-111 行），且第二处的引用是坏的双前缀：`` `docs/DESIGN.md` DESIGN.md §11 `` —— 文档重组时的替换残留。 | ✅ **已修**（`af7df66`：README 去重与修 §11 引用） |

**修法**：a 需先裁决三个空目录的命运（删除 or 补齐实现）；b 直接订正。**建议一并确立一条规则：改代码动到目录结构时，谁负责同步 DESIGN §5.2** —— 否则这类漂移会持续复发。该规则现已具备落点：`AGENTS.md` 已建立（见 §9），建议在其 §3「流程」补一条。
**备注**：空目录清理即早先记录的待确认项 Q10。

### 4.10 决策 #24（keep-alive）标「生效」但实现未落地

**位置**：`src/App.tsx:77-115`

**现状**：页面全部用条件挂载（`{page === "cut" && settingsReady && <CutPage/>}`），**离开即卸载、状态全丢**。而决策 #24 的状态列是「生效」，其理由写的是「用户明示期望保留」。

**定性**：这不是代码缺陷而是**状态标注歧义** —— keep-alive 的实施已立项为 M10-1，且被决策 #32 明确**暂缓**，代码与"暂缓"一致。但「决策生效」与「实现未做」并存，容易让人（包括本次审查的一路 sub-agent）误报为功能缺陷。

**修法**：在 [DECISIONS.md](../DECISIONS.md) 第 24 行状态列注明「设计生效，实现见 M10-1（决策 #32 暂缓）」。**不建议**为此改动代码 —— 优先级由 PLAN 决定。

---

## 5. 架构与可维护性

### 5.1 `Workbench/index.tsx` 1 581 行：承担 7 件不相干的事（重要）

`src/pages/Workbench/index.tsx:216-1581` 的 `WorkbenchPage` 同时负责：

| # | 职责 | 代表内容 |
| --- | --- | --- |
| 1 | 顶层布局与导航 | header / footer / EnvChip |
| 2 | 素材层 | `addFiles` / `removeSource` / `reorderSources` / 多选批量 / `SourceCards` |
| 3 | 片段层 | `addClip` / `updateClip` / `reorderTimeline` / `insertToTimeline` |
| 4 | 导出链路 | payload 构造 / `checkPipeline` 防抖 / `startExport` / 输出命名 |
| 5 | 成品连播编排 | `playhead` / `playing` / `seekReq` / 快捷键 / mode 切换 |
| 6 | 两个预览子视图 | `CutModeView` / `EditModeView`（各 ~150 行，**各自又写了一遍** VideoPlayer + Timeline + TimeField + 快捷键） |
| 7 | 代理预览 | `useProxyPreview` |

**建议拆分边界**（按变更理由聚类，而非按行数切）：

| 产出 | 收拢内容 |
| --- | --- |
| `useSources` | 素材增删、缩略图补全、批量选择 |
| `useClips` | 片段派生、编排、池↔轴移动 |
| `useExportPipeline` | payload 构造、`checkPipeline` 防抖、提交、输出命名 |
| `useProductPlayback` | 播放头编排、连播、模式下快捷键 |
| `CutModeView` / `EditModeView` / `SourceCards` | 拆为独立组件文件（第 6 项重复最重） |
| `useProxyPreview` | 上提到 `src/hooks/`，供 Cut / Editor 共用（见 5.2） |

拆完后 5 项跨页面重复自然消失。

### 5.2 跨页面重复（4 组）

| 重复形状 | 出现位置 | 建议归口 |
| --- | --- | --- |
| `useProxyPreview`（任务订阅 + 原文件播放失败兜底） | `Cut:56-63,264-277`、`Editor:66-73,242-255`、`Workbench:195-211` | `src/hooks/useProxyPreview.ts` |
| `loadFile`（probeMedia + wantsProxy + generateProxy + listKeyframes） | `Cut:65-104`、`Editor:75-97` | `src/hooks/useMediaLoader.ts` |
| 输出命名（`${dir}\\name` + `fileExists` + `withFileTimestamp`） | `Workbench:563-585`、`Merge:131-152`、`Editor:115-167` | `src/utils/paths.ts::resolveOutputTarget` |
| `QUALITY_LABELS`、带返回的 `PageHeader`、`consumedInitialRef`、`settingsRef` 模式 | 4 个页面各自一份 | `src/components/` 与 `src/hooks/` |

### 5.3 其它（建议）

| 位置 | 建议 |
| --- | --- |
| `ffmpeg/command.rs` 9 个 builder | 重复同一前缀 `-hide_banner -nostats -loglevel error -progress pipe:1 -stats_period 0.2` 与 `-y`/输出尾部 → 抽 `common_prefix()` + 统一尾部拼接 |
| `ffmpeg/command.rs:487`、`commands/rotate.rs:17`、`commands/crop.rs:40` | 参数 8–10 个（clippy `too_many_arguments`）→ 抽参数结构体，减少顺序错位风险 |
| `ffmpeg/probe.rs:66` | 缓存满时 `m.clear()` 全清（非 LRU）→ 改为按序淘汰单条，避免抖动 |
| `commands/{cut,rotate,crop}.rs` | `locked_encoder` 由设置直接透传进 FFmpeg 参数，未做白名单校验 → 设置写入非法编码器名时只能靠 ffmpeg 非零退出来发现，定位困难 |
| `src/pages/Cut/index.tsx:159` | `Backspace` 作删除片段快捷键，非输入框聚焦时易误删 → 建议只保留 `Delete` |
| `ffmpeg/command.rs:268-291` | `thumbnail_args` 的 `-ss` 置于 `-i` 前且带 `-vf`（即重编码）。对缩略图这是**刻意的性能取舍**（输入侧 seek 快）；仅在**精确模式**片段的「起点帧」缩略图上会落到入点之前最近的关键帧（≤1 个 GOP）。若 M6-8 要求严格精确，需改输出侧 seek 并接受解码开销 —— **属产品口径问题，非缺陷** |
| `src-tauri/tests/e2e.rs` | 已覆盖「极速剪切→concat」「精确剪切」「pipeline(copy+重编码+normalize)」。**漏覆盖**：rotate（无损/重编码）、crop_zoom、merge 非兼容转码分支、generate_proxy 去重 |

---

## 6. 已核实并排除（避免重复讨论）

以下两条由并行审查提出，经人工核实后**判定不成立**，记录在此以免日后重复排查。

### 6.1 ❌ `VideoPlayer` 缺 `ended` 监听 → rAF 在播放末尾空转

**提出理由**：`src/components/VideoPlayer/index.tsx:127-129` 只监听 `play`/`pause`/`seeked`，而 Chromium 播到末尾只发 `ended` 不发 `pause`，故 rAF 链不会被 `stop()`，在末尾每帧空转。

**排除依据**：该前提不成立。`pause` 事件**在媒体到达末尾时同样会触发**（W3Schools `onpause` 条目明示："The onpause event also occurs when an audio/video has reached the end"；SitePoint 的 HTML5 媒体事件综述亦以 `ended` + 手动 `pause()` 修法印证了末尾的 `paused`/`pause` 语义）。本项目的运行宿主是 WebView2（Chromium），因此末尾会正常派发 `pause` → `onPause`（`:115-119`）调用 `stop()`，rAF 链正常停止。

**残余价值**：加 `ended` 监听可作为显式兜底（提高可读性、覆盖 `pause` 不派发的老浏览器），但**不是缺陷修复**。

### 6.2 ❌ `ProductPreview.switchTo` 的 `onPlayingChange(false)` 竞态

**提出理由**：`switchTo` 暂停离场槽会触发其 `onPause`，而此刻 `slot` state 仍是旧值，`name === slot` 为真 → 误报 `onPlayingChange(false)` → 连播在段边界停住（`ProductPreview/index.tsx:144,281-283`）。

**排除依据**：React 的合成事件在**派发时读取当前 props**，而非注册时的闭包快照。`pause` 事件按规范是排队的 task，而 React 的状态更新在本轮事件处理结束时就已 flush；因此派发时 `slot` 已是新值，`name === slot` 判为**假**，不会误报。

**置信度**：中高（未实机复现）。若日后实测在段边界观察到停住，再回到此条按"是否用 `segIdxRef` 替代 `slot` 比较"处理。

### 6.3 ✅ 已推演确认为正确的路径

| 项 | 结论 |
| --- | --- |
| `useTauriEvent` 退订 | StrictMode 双挂载 / resolve 前卸载 / resolve 后卸载 **三条路径均干净**（详见 §4.6） |
| `pending_proxies` 回收 | `submit_with_cleanup` 覆盖完成/失败/运行中取消/排队中取消全部终态；残留条目靠 `is_active` 自愈，**无泄漏窗口** |
| cleanup 钩子幂等 | cancel 排队路径、运行路径、worker 末尾路径**均经 `cleanup.take()`**，各终态恰好一次，无重复无遗漏 |
| 锁顺序与唤醒 | `inner` 与 `handle.status`/`on_terminal` 为独立 `Mutex`，未发现死锁序；`Condvar` 循环重检，无丢失唤醒 |
| 子进程生命周期 | 取消时 `kill` + `wait` 由 worker 兜底，未发现僵尸进程或句柄泄漏 |
| FFmpeg 参数注入 | 参数均以独立 argv 传入（非 shell 拼接），空格 / 中文 / `&` / `%` / 引号安全；concat 的单引号转义正确；`-map 0`、`-ss` 位置、音频 copy 规则在各 builder 均符合决策 #5/#7/#8 |
| `history.rs` 持久化 | 全局 `WRITE_LOCK` 串行化读改写；`write_all` 走 `.tmp` + `rename` 原子写；`load` 对损坏文件 `unwrap_or_default` 容忍。并发与损坏处理**均正确** |
| 乐观更新回滚 | 前端**无乐观 UI**，故无回滚问题；6 个页面的 IPC 失败均有用户可见提示 |

---

## 7. 整改建议（分批）

> 排期需在 [PLAN.md](../PLAN.md) 立项，本节仅给分组建议。按"风险 × 修复成本"排序。

| 批次 | 内容 | 条目 | 理由 |
| --- | --- | --- | --- |
| **C1** | Rust 任务 panic 隔离 | §3.1 | 唯一能冻结整个任务队列的缺陷，改动局限在 `worker.rs` 一处 |
| **C2** | 原子替换输出文件（含抽公共函数） | §3.2 | 6 处同构，一次抽函数即可全消；涉及数据丢失 |
| **C3** | 指针拖拽收尾兜底 | §3.3 | 3 处同构，可照抄 `CropOverlay` 的既有实现；用户可直接感知 |
| **C4** | `pxToCrop` 钳制 + 补单测 | §3.4 | 纯函数、小改动、有明确期望值 |
| **C5** | 校验时机与同族函数口径统一 | §4.1、§4.2 | 一致性修复，避免"跑到一半才失败" |
| **C6** | 文档订正 | §4.9a/b、§4.10 | 零代码风险；c 已由 `af7df66` 修掉；建议同时确立"改目录结构需同步 DESIGN §5.2"的规则（落点见 §9.2） |
| **C7** | `Workbench` 拆分 + 跨页重复归口 | §5.1、§5.2 | 体量最大，建议在 M11 时间线动工**之前**做，否则 M11 会继续往 1 581 行里加 |
| **C8** | 其余建议项 | §5.3、§4.6–4.8 | 可择机并入相邻批次 |

**优先建议**：C1–C4 是本报告中"后果明确 + 修复局部"的四组，适合作为下一个批次整体处理；C7 与 M11 有直接工期关系，需早做决策。

---

## 8. 未覆盖范围

- **实机行为**：本报告为静态审查，未实机运行应用。§6.2 标注为中高置信度即因如此。
- **打包与安装**：`src-tauri/tauri.conf.json`、NSIS 配置、capability 收窄、CSP（此项已在 B15 立项）未纳入。
- **FFmpeg 产物正确性**：未做像素级/时长级校验，`tests/e2e.rs` 的断言强度未逐条评估。
- **依赖安全**：`pnpm-lock.yaml` / `Cargo.lock` 的漏洞扫描未做。
- **性能**：未做 profiling；仅指出 `Workbench` 缩略图冗余请求（§4.7）这类静态可见的开销。

---

## 9. 审查后变化

> 本报告审查对象是 `f80dd0e`。审查完成后仓库又前进了 1 个提交（`af7df66`），下表记录该提交对本报告结论的影响。**未列出的发现均未受影响，仍然有效。**

### 9.1 影响对照

| 报告条目 | `af7df66` 的影响 |
| --- | --- |
| §4.9c README 双许可证 + 坏引用 | ✅ **已修复**（提交说明含"README 去重与修 §11 引用"）。复核实测：`## 许可证` 现仅出现 1 次。 |
| §4.9a DESIGN §5.2 列出三个空目录 | ❌ **未修**。复核实测：三个目录仍为空，§5.2 第 223-225 行仍照旧列出。 |
| §4.9b DESIGN §5.2 缺 `useTauriEvent`/`crop.ts` | ❌ **未修**。复核实测：§5.2 中检索不到这两个文件名。 |
| 全部代码类发现（§3.1–§3.4、§4.1–§4.8、§5） | **未受影响** —— `af7df66` 是纯文档提交，未触及 `src/` 与 `src-tauri/src/`。 |
| §8「打包与安装」项（capability / CSP） | 仍在 B15 未实施。 |

### 9.2 附带发现：`AGENTS.md` 的悬空引用

`af7df66` 新增了根目录 [`AGENTS.md`](../../AGENTS.md)，质量不错（命令、沙箱注意事项、红线、完事标准、提交约定齐备），**但 `§6.3` 引用了 `docs/CANDIDATES.md`**：

```markdown
3. 查 [docs/CANDIDATES.md](../CANDIDATES.md) → 若属未立项新功能，先走晋升流程
```

而 `docs/` 下**不存在** `CANDIDATES.md`（现为 11 份：INDEX / DESIGN / FFMPEG / UI / TIMELINE / DECISIONS / PLAN / TESTING / CHANGELOG / HANDOFF / handoff-archive）。候选池目前仍在 `docs/DECISIONS.md` §16。推测是 B1 批次先建了 `AGENTS.md`，而候选池拆出（原计划 B2）尚未执行。

**影响**：`AGENTS.md` 是 agent 每次开工首读的文件，此链接会直接把 agent 引向不存在的目标。
**修法**（择一）：① 拆出 `docs/CANDIDATES.md`（即原 B2 批次）；② 暂时把该行指回 [`docs/DECISIONS.md`](../DECISIONS.md) §16，待 B2 再改。

### 9.3 建议增补 `AGENTS.md` 的两条红线

本轮审查暴露的两类问题，当前 `AGENTS.md` 未覆盖，建议补入 §3：

| 建议新增 | 源自 | 理由 |
| --- | --- | --- |
| 输出文件替换必须用原子替换，**不得"先删目标再 rename"**，且不得吞掉删除错误 | §3.2（6 处重复） | 现有写法在多处复制，只有写成红线才能阻止第 7 处出现 |
| 指针拖拽收尾必须处理"窗口外松手"（`buttons === 0` 兜底 + `pointercancel`） | §3.3（3 处漏改） | R1-4 已修过一处但未推广，说明"修一处"不足以约束全仓库 |

