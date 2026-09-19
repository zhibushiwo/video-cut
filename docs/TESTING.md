# video-cut 测试与验收

> **职责**：测试用例（TC）清单、夹具、执行方式与验收结论的记录口径。
> **唯一真源**：**测试怎么跑、用什么夹具、当前 TC 覆盖哪些验收**以本文为准；**验收口径本身**（AC）在 [DESIGN.md](./DESIGN.md) §3 各节末，本文只引用 AC 号，不抄正文。
> **读时机**：写/改测试前；跑一次完整验证前；需要给出"这条验收过了吗"的结论时。
> **写规则**：新增测试或验收组时追加 TC 行并写明 `引用 AC`（缺陷驱动的写在 §3.4，标注 `关联 BUG-0NN`）；TC 号不复用；只记**验收/回归级**用例——单元测试留在代码里（`cargo test` 即执行记录），不抄进本文。
> **关联**：[INDEX.md](./INDEX.md)（ID 与地图） · 上位 [DESIGN.md](./DESIGN.md) · 进度 [PLAN.md](./PLAN.md) · 缺陷 [BUGS.md](./BUGS.md) · 夹具规范 [FFMPEG.md](./FFMPEG.md) §6.6
> **最后更新**：2026-09-19（新增 §3.4 回归测试：TC-019–TC-023 关联 BUG-001–005）

---

## 1. 怎么跑

| 目的 | 命令 | 说明 |
| --- | --- | --- |
| 类型检查 | `node_modules/.bin/tsc --noEmit`（或 `pnpm build`） | 前端类型与未使用变量（`noUnusedLocals`/`noUnusedParameters`） |
| 静态检查 | `pnpm lint`（`eslint .`） | react-hooks 依赖、`@tauri-apps/*` 只允许 `services/` 内导入 |
| 后端全量 | `cd src-tauri && cargo test` | **62 个单测 + 3 条 e2e**；e2e 需要 sidecar，缺失时自动跳过 |
| 端到端应用 | `pnpm tauri dev` | 手测与 UI 验收 |
| 文档一致性 | `pnpm check:docs`（`node scripts/check-docs.mjs`） | 五项：markdown 链接可达 · `§` 引用归属 · ID 交叉定义 · skip 区间合规 · 反引号路径可达（`src/`·`src-tauri/`·`scripts/`·`docs/`；`docs/archive/**` 豁免）；改动 `docs/**`、`README.md`、`AGENTS.md` 后必跑 |

> 受限环境（沙箱/无软链权限）：`node_modules` 可能装不出软链，改用
> `pnpm install --force --config.node-linker=hoisted`，并用 `node <包>/bin/<入口>.js` 直调工具（详见 [../AGENTS.md](../AGENTS.md) §7）。

## 2. 夹具（固定素材，避免"拿手头随便一个视频测"）

| 夹具 | 来源 | 用途 |
| --- | --- | --- |
| `video/merge_test_a.mp4` / `merge_test_b.mp4` | `scripts/gen-fixtures.ps1` 生成，参数一致 | 无损合并、copy 链路、e2e |
| `video/极乐净土 1080p ultra.mp4` | 手工放入（约 1GB） | 性能基线（极速剪切 ≤10s、关键帧扫描） |
| 100 片段串联夹具 | `gen-fixtures.ps1`（M11-9 建立） | 时间线性能验收（拖拽/播放头/撤销 P50/P95） |
| 手机竖拍视频（带 rotation metadata） | 手工 | 元数据旋转无损路径 |
| 4K HEVC 文件 | 手工 | 合并不一致检测、代理预览 |

> `video/` 与 `scripts/fixtures/` 不入库（`.gitignore`）。

## 3. 测试用例（TC）

### 3.1 自动化（现有）

| TC | 形式 | 覆盖 | 引用 AC |
| --- | --- | --- | --- |
| TC-001 | cargo e2e `fast_cut_and_merge_chain` | 极速剪切 → 精确剪切 → 合并全链，断言时长与全帧可解码 | AC-321-1 · AC-332-1 |
| TC-002 | cargo e2e `precise_cut_is_accurate_and_decodable` | 精确剪切入点精度与可解码 | AC-322-1 |
| TC-003 | cargo e2e `pipeline_full_chain` | 工作台 pipeline 全链（含 timescale 归一化） | AC-380-1（组级） |
| TC-004 | `cargo test` 单元测试（62 条，代码内） | 命令构建器参数序列、probe 缓存、进度解析、任务状态机与清理钩子 | NFR-001（无损优先）· NFR-006–009（并发/半成品/预检/节流） |
| TC-005 | `tsc --noEmit` + `pnpm lint` | 类型与前端约束 | NFR-012（配置与错误处理） |

> 新增命令/参数改动时：**先补 `ffmpeg/command.rs` 的参数序列断言**，再靠 TC-001~003 兜回归（DESIGN 决策 #23）。

### 3.2 手工验收（必须人跑）

| TC | 验收对象 | 场景与步骤 | 引用 AC |
| --- | --- | --- | --- |
| TC-010 | 剪切页全流程 | 拖入夹具 → 双手柄选区 + 数字输入双向同步 → 吸附开关 → 极速/精确两种模式各导一次，核对文件名与画质 | AC-324-1 · AC-325-1 · AC-323-1 |
| TC-011 | 合并页 | 三文件一致 → 秒级合并（时长=三者之和）；混入 4K HEVC → ⚠ 面板 → 自动统一后输出可播 | AC-331-1 · AC-333-1 |
| TC-012 | 编辑页（旋转/放大） | 竖拍视频元数据旋转（秒级、大小基本不变）→ 重编码旋转 → 框选 1/4 放大回原分辨率 | AC-341-1 · AC-342-1 · AC-351-1 |
| TC-013 | 工作台 2.0 全流程 | 双素材剪 4+ 片段（含同源多段、一段旋转一段放大）→ 任意排序 → 导出 → 成品连播 + seek | AC-380-1（组级） |
| TC-014 | 设置页（M4-8 五项） | 主题色、缓存统计与清理、关闭确认、重置、关于 | AC 待发号（UI.md §9.9） |
| TC-015 | 历史记录与任务面板 | 任务终态落历史、只读展示、清空；全局面板进度/速度/取消/复制日志 | AC-360-1 · AC-362-1 |
| TC-016 | 打包冒烟（M4-5） | **干净 Win11** 装 NSIS 包：中文向导、图标、SmartScreen 提示、首启探测 FFmpeg | NFR-011（打包与分发，DESIGN.md §11） |
| TC-017 | 快捷键 | 剪切页与工作台各模式：空格、←/→、Shift+←/→、I/O | AC 待发号（UI.md §9.4） |
| TC-018 | 代理预览 | 不支持格式（AVI / 无 HEVC 扩展）自动走代理 + 提示条；关闭代理时仅提示不阻塞 | AC-371-1 · AC-372-1 |

### 3.3 手工验收操作经验（UI 自动化踩坑，复用）

- WebView2 的 a11y 树要等一会儿才出内容，操作前先 sleep/重试
- 文件对话框：行元素的 AXPress 是"打开"而非"选中"；多选用文件名输入框 `set_value` 后点打开
- 受控输入框：坐标点击 + `ctrl+a` + 键入 + Enter 提交
- 底部任务通知浮层会遮挡导出按钮，操作前先关掉

### 3.4 回归测试（缺陷驱动）

> 缺陷修复的**强制配套**：`BUG-0NN` 标 `fixed` 前必须先有对应 TC，标 `verified` 必须该 TC 跑通（见 [BUGS.md](./BUGS.md) §2/§4）。
> 号段自 `TC-019` 起独立顺排，**不再区分自动化/手工**（性质写在"验证方式"列）。

| TC | 关联 BUG | 验证什么 | 验证方式 | 状态 |
| --- | --- | --- | --- | --- |
| TC-019 | BUG-001 | 作业体 panic 后：任务进 Failed、并发槽归还，连续两次 panic 不冻结队列 | `cargo test` 单测 | 待建（R4-1） |
| TC-020 | BUG-002 | 输出替换原子性：目标被占用时旧文件不丢、错误信息含 `.part` 完整路径 | `cargo test` 单测 + e2e | 待建（R4-2） |
| TC-021 | BUG-003 | 三处指针拖拽：窗口外松手后监听器不残留、无拖拽态卡死、无意外重排 | 手工（合并页列表 / 剪切页 Timeline / 工作台 ClipTimeline） | 待建（R4-3） |
| TC-022 | BUG-004 | `pxToCrop` 边界：x 在界内 / 恰好压界 / 远超界，w 最小 / 恰好 / 超界 | 手工（数值微调）；M11-0 引入 Vitest 后转自动化 | 待建（R4-4） |
| TC-023 | BUG-005 | 合并页选 N 个文件、其中一个无法抽帧 → 其余缩略图仍显示 | 手工 | 待建（R4-5） |
| TC-024 | BUG-006 | 容器不被 WebView2 支持（如 `.flv` / `.wmv`，编码为 H.264/AAC）的素材导入 → `needsProxy` 为真、生成代理并正常预览 | `cargo test`/Vitest 单测（判定）+ 手工（实际预览） | 待建（R4-7） |

## 4. 验收结论记录口径

1. 每条 AC 的状态只有三种：`✅ 通过`（附 TC 号与日期）/ `❌ 未过`（附现象）/ `⏳ 待手测`。
2. **AC 状态的真源是 [DESIGN.md](./DESIGN.md) 对应行的标记**；PLAN 里程碑验收行只列该批次覆盖的 AC 号。
3. 历史批次（M0–M9）的验收结论以 [PLAN.md](./PLAN.md) 与 [handoff-archive.md](./archive/handoff-archive.md) 当时记录为准，不再回溯改写。
4. 目前悬空项（截至 2026-09-19）：M4-5 打包冒烟、M6-7 UI 手测、M9 五项、M7-1/2/3、工作台 2.0 全流程 —— 均归入 TC-010~TC-018，**结论待用户手测**。
