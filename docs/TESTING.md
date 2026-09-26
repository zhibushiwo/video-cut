# video-cut 测试与验收

> **职责**：测试用例（TC）清单、夹具、执行方式与验收结论的记录口径。
> **唯一真源**：**测试怎么跑、用什么夹具、当前 TC 覆盖哪些验收**以本文为准；**验收口径本身**（AC）在 [DESIGN.md](./DESIGN.md) §3 各节末，本文只引用 AC 号，不抄正文。
> **读时机**：写/改测试前；跑一次完整验证前；需要给出"这条验收过了吗"的结论时。
> **写规则**：新增测试或验收组时追加 TC 行并写明 `引用 AC`（缺陷驱动的写在 §3.4，标注 `关联 BUG-0NN`）；TC 号不复用；只记**验收/回归级**用例——单元测试留在代码里（`cargo test` 即执行记录），不抄进本文。
> **关联**：[INDEX.md](./INDEX.md)（ID 与地图） · 上位 [DESIGN.md](./DESIGN.md) · 进度 [PLAN.md](./PLAN.md) · 缺陷 [BUGS.md](./BUGS.md) · 夹具规范 [FFMPEG.md](./FFMPEG.md) §6.6
> **最后更新**：2026-09-25（`M11-9`：新增 `TC-043`（撤销预算计量自动半已测 + 帧预算真机半 ⏳）；此前同日：`M11-8` 新增 `TC-042`、修复 TC-041/042 熔行；此前同日：`M11-7` 计数 25→27、`M11-6` 新增 `TC-041`、`T-004` 固化 TC-022/024/028 矩阵；此前 2026-09-24：`M11-0` 新增 `TC-040` 撤销基线）

---

## 1. 怎么跑

| 目的 | 命令 | 说明 |
| --- | --- | --- |
| 类型检查 | `node_modules/.bin/tsc --noEmit`（或 `pnpm build`） | 前端类型与未使用变量（`noUnusedLocals`/`noUnusedParameters`） |
| 静态检查 | `pnpm lint`（`eslint .`） | react-hooks 依赖、`@tauri-apps/*` 只允许 `services/` 内导入 |
| 前端单测 | `pnpm test`（`vitest run`） | 命令层与工具层的**纯函数**单测（用例在 `src/**/*.test.ts`：`undo/commands` · `utils/array` · `utils/paths` · `utils/crop`（TC-022/028 矩阵） · `utils/media`（TC-024 矩阵））；受限环境用 `node node_modules/vitest/vitest.mjs run`；配置在 `vitest.config.ts`（node 环境，不含 DOM） |
| 后端全量 | `cd src-tauri && cargo test` | **81 个单测 + 5 条 e2e**（Windows 计数：含 2 条 `#[cfg(windows)]` 同一性用例）；需要 sidecar 的用例（e2e 与 `commands::media` 的缩略图回归）在 sidecar 缺失时打印 skip 并通过 |
| 真实素材冒烟（可选，默认不跑） | `cd src-tauri && cargo test --test real_media_smoke -- --ignored --nocapture --test-threads=1` | `tests/real_media_smoke.rs` 8 条用例全部 `#[ignore]`（默认只编译）；按 `command.rs` 真实参数构建器打真实素材，约 3.5 分钟，缺 `video/` 素材自动跳过 |
| 端到端应用 | `pnpm tauri dev` | 手测与 UI 验收 |
| 真机 GUI 自动化 | 见 [gui-e2e/README.md](./gui-e2e/README.md) §2（沙箱关闭 + CDP 调试端口 + 驱动脚本） | 关键功能的端到端回归，断言"界面显示值 == 产物实测值"；用例见 §3.5 |

| 文档一致性 | `pnpm check:docs`（`node scripts/check-docs.mjs`） | 五项：markdown 链接可达 · `§` 引用归属 · ID 交叉定义 · skip 区间合规 · 反引号路径可达（`src/`·`src-tauri/`·`scripts/`·`docs/`；`docs/archive/**` 豁免）；改动 `docs/**`、`README.md`、`AGENTS.md` 后必跑 |

> 受限环境（沙箱/无软链权限）：`node_modules` 可能装不出软链，改用
> `pnpm install --force --config.node-linker=hoisted`，并用 `node <包>/bin/<入口>.js` 直调工具（详见 [../AGENTS.md](../AGENTS.md) §7）。

## 2. 夹具（固定素材，避免"拿手头随便一个视频测"）

| 夹具 | 来源 | 用途 |
| --- | --- | --- |
| `video/merge_test_a.mp4` / `merge_test_b.mp4` | `scripts/gen-fixtures.ps1` 生成，参数一致 | 无损合并、copy 链路、e2e |
| `video/极乐净土 1080p ultra.mp4` | 手工放入（约 1GB） | 性能基线（极速剪切 ≤10s、关键帧扫描） |
| 100 片段串联夹具 | 生成命令见 [gui-e2e/cases-m11-perf.md](./gui-e2e/cases-m11-perf.md) §1（M11-9，testsrc 100×1s） | 时间线性能验收（拖拽/播放头/撤销 P50/P95） |
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
| TC-004 | `cargo test` 单元测试（87 条，代码内） | 命令构建器参数序列、probe 缓存（LRU 淘汰）、进度解析、任务状态机与清理钩子、内部任务去重登记、输出原子替换、输出容器/扩展名命名、**输出路径同一性比较（归一化）**、缩略图批处理容错 | NFR-001（无损优先）· NFR-006–009（并发/半成品/预检/节流） |
| TC-005 | `tsc --noEmit` + `pnpm lint` | 类型与前端约束 | NFR-012（配置与错误处理） |
| TC-040 | `pnpm test`（Vitest）`src/utils/undo/commands.test.ts`（**27 条用例 = 撤销语义 6 + 钳制域 9 + 栈规则 6 + `productDurationOf` 4（`R2-2` 并入）+ `minSegSec`/`exportSegmentOf` 2（`M11-6`）**） | 撤销基线（TIMELINE.md §17.5 六条：undo/redo 逐字节一致、序列化 round-trip、no-op 不入栈、取消不入栈、撤销顺序、重做复现同一 id）+ 钳制域（trim 源边界 / 最短时长钳制（`M11-6` 起 = `max(1帧, 0.05s)`）/ split 边缘判非法 / split 源内换算带前缀时长 / 波纹删除池保留 / fps 缺省 / 源未探测判非法 / 池「+」只追加不重排 / insert 兜底钳制）+ 栈规则（批量合成一条、新命令清空重做链、上限丢最旧、空输入/全 no-op 的 buildComposite 判 null、**clear 双向清空（`FR-1737` 外部删除清洗原语，`M11-7`）**、**旁路编辑被撤销回退到快照时刻（快照语义披露，`M11-7`）**） | AC 待发号（TIMELINE.md §17.9 ①） |
| TC-041 | `pnpm test`（Vitest）`src/utils/undo/commands.test.ts`（`BUG-012` 组）+ `src/components/ClipTimeline/geometry.test.ts`（修剪几何组）+ `cargo test`（`commands/mod.rs::valid_segment_span` 边界组） | **BUG-012 回归**：`minSegSec = max(1帧, 0.05s)`（普通/高帧率 0.05、低帧率 1 帧、fps 未知降级）；短半段切割 [1帧, 0.05s) 判 no-op（两侧）；trim 钳到下限；`exportSegmentOf` 边界（恰好 0.05s 保留为段、1µs 容差内保留、真空段吞掉）；后端 `valid_segment_span` 恰 0.05s 可提交、1ulp 容差、真空段/负起点/NaN 拒绝。**修剪几何**：`findTrimEdge`（全局最近 ≤8px、共享边界按指针侧归属、恰 8px 含边界、首块入边/末块出边可达、热区外不命中）、`snapToKeyframe`（阈值内吸附、未加载/为空静默降级、并列取后扫描者） | FR-1735（修订版）· TIMELINE.md §17.9③⑤ |
| TC-042 | `pnpm test`（Vitest）`src/components/ClipTimeline/geometry.test.ts`（blockAtTime 组）+ 手工（右键菜单与快捷键全链） | **自动化**：`blockAtTime` 前缀和命中（块中段 / 恰压右缘归下一块与 buildSplit 判定一致 / 总尾之外 null / 负时间第一块 / 空轴 null / 零宽块跳过）。**手工**：片段右键条目（切割按播放头命中禁用 / 波纹删除 / 移除并删除池片段确认后可撤销 / 加工 / 撤销·重做带操作名与空栈禁用）、空白菜单（撤销/重做/适应窗口）、K 暂停 / L 连按加速（0.5/1/1.5/2 循环 + 链断回 1× + 徽标）、A 追加（选中优先 / 最新未入轴）、Ctrl+E 导出、I/O 修剪选中片段（播放头不在片段内 no-op）、非拉丁布局下 C/S/Z 可用 | FR-1738/1739 · TIMELINE.md §17.9① |
| TC-043 | 自动化半 = `node`（Vitest 临时计量跑完即删，纯函数层直跑）· 手工半 = 真机埋点报告（步骤见 [gui-e2e/cases-m11-perf.md](./gui-e2e/cases-m11-perf.md)） | **自动化半（已测 2026-09-25）**：100 片段文档命令层计量——重排 execute p50=0.003ms/max=0.289ms、undo max=0.126ms、redo max=0.011ms、批量建 composite×100 max=1.955ms、split/trim max ≤1.3ms——**核心 undo/redo 低于 16ms 预算两个数量级，composite/split/trim 亦有一个数量级余量**（React 渲染半不计入命令层计量；不落永久单测——计时断言会随环境波动 flaky）。**手工半（⏳ 待用户发起）**：drag/playing/seek 帧时间埋点报告（P95 ≤ 16.7ms、drops、播放头 commit 计数 0/帧），判定与操作步骤见 gui-e2e 用例 | TIMELINE.md §17.9①② · FR-1730（组级） |
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
| TC-018 | 代理预览 | 不支持格式（AVI / 无 HEVC 扩展）自动走代理 + 提示条；关闭代理时仅提示不阻塞。**`BUG-006` 的回归**：素材取"容器不可播而编码可播"的组合（H.264 + yuv420p + AAC 装进 `.avi` / `.flv` / `.ts` / `.wmv`）——修复前这类素材不生成代理、预览黑屏 | AC-371-1 · AC-372-1 |

### 3.3 真机 GUI 自动化的操作经验（复用；详细运行手册见 [gui-e2e/README.md](./gui-e2e/README.md) §2）

> 2026-09-19 起改为**走 WebView2 的 CDP**，不再依赖 a11y 树（后者慢且脆）。

- **启动**：`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222 --remote-allow-origins=*"` 启动应用，用 `/json/list` 确认拿到 `title=video-cut` 的 page target。**必须关掉执行沙箱**，否则该端口起来就会被关掉。
- **看得见**：Tauri/WebView2 的客户区在桌面截图（GDI/gdigrab）里只会是纯黑或纯白——**只有 `Page.captureScreenshot` 能截到真实界面**。判断"页面到底渲染没有"别靠截图，读 DOM（`eval`）或用服务端请求日志。
- **点得动**：按 CSS 选择器点击比坐标稳；但**指针拖拽**（Timeline 双手柄、时间轴块）必须用带中间 `pointermove` 的拖拽（步数 ≥12），否则指针事件序列不完整、React 收不到拖动。
- **原生对话框不在 CDP 范围内**：文件选择框要用 Win32 侧驱动——输**完整绝对路径**再按 Enter（别去点列表行）。
- 受控输入框：坐标点击 + `ctrl+a` + 键入 + Enter 提交。
- 底部任务通知浮层会遮挡导出按钮，提交前先确认它已关闭。
- 断言要落到**界面显示值 vs 产物实测值**（时长/首帧 pts/流数/编码/分辨率），不要只判"没报错"。

### 3.4 回归测试（缺陷驱动）

> 缺陷修复的**强制配套**：`BUG-0NN` 标 `fixed` 前必须先有对应 TC，标 `verified` 必须该 TC 跑通（见 [BUGS.md](./BUGS.md) §2/§4）。
> 号段自 `TC-019` 起独立顺排，**不再区分自动化/手工**（性质写在"验证方式"列）。

| TC | 关联 BUG | 验证什么 | 验证方式 | 状态 |
| --- | --- | --- | --- | --- |
| TC-019 | BUG-001 | 作业体 panic 后：任务进 Failed、并发槽归还，连续两次 panic 不冻结队列 | `cargo test` 单测 | ✅ 通过（2026-09-21，`panicking_job_fails_task_and_returns_slot`：并发位=1 下连续两次 panic 后第三个任务仍完成，清理钩子照跑一次；两次 panic 分别走 `&str` 与 `String` 载荷，文案都能取到） |
| TC-020 | BUG-002 | 输出替换原子性：目标被占用时旧文件不丢、错误信息含 `.part` 完整路径 | `cargo test` 单测（`fs::atomic_replace` 三分支）+ e2e（`output_replace_over_existing_file`） | ✅ 通过（2026-09-21：3 条单测 + 1 条 e2e；目标不可替换时旧文件与 `.part` 均在、错误含完整路径） |
| TC-021 | BUG-003 | 四处指针拖拽：窗口外松手后监听器不残留、无拖拽态卡死、无意外重排 | 手工（合并页列表 / 工作台素材卡 / 剪切页 Timeline 双手柄 / 工作台 ClipTimeline 与裁剪框选） | ⏳ 待跑（实现已统一到 `utils/pointerDrag` 的 `beginPointerDrag`，四处共用同一收尾兜底） |
| TC-022 | BUG-004 | `pxToCrop` 边界：x 在界内 / 恰好压界 / 远超界，w 最小 / 恰好 / 超界 | Vitest（[../src/utils/crop.test.ts](../src/utils/crop.test.ts)，矩阵见下方注）+ 手工（数值微调） | ⏳ 矩阵已固化进 Vitest（2026-09-25 `T-004`，`pnpm test` 常驻）；命令级脚本先已验证通过（2026-09-23）：**14 组期望值 + 4000 组随机扫描，12730 断言 0 失败**，同一矩阵在**修复前**实现上 1554 个非 null 结果里越界 **993** 个（CR 复现值精确复现）。真机手工（数值微调）待跑 |
| TC-023 | BUG-005 | 合并页选 N 个文件、其中一个无法抽帧 → 其余缩略图仍显示 | `cargo test` 单测（真实 sidecar + lavfi 自建夹具，sidecar 缺失时跳过）+ 手工（合并页 UI） | ⏳ 命令级半已过（2026-09-23，`thumbnail_batch_skips_unreadable_file`：坏文件被跳过、其余两张返回且真的落盘；**把 `continue` 换回 `return Err` 该用例立即失败**，证明有灵敏度）；合并页 UI 半待跑 |
| TC-024 | BUG-006 | 容器不被 WebView2 支持（如 `avi` / `flv` / `ts` / `wmv`，编码为 H.264/AAC 的"原生可播"组合）的素材 → `needsProxy` 为真、生成代理；`VIDEO_EXTENSIONS` 九种容器每种都有明确结论 | Vitest（[../src/utils/media.test.ts](../src/utils/media.test.ts)，矩阵见下方注）+ `cargo test`（`container` 原样透传）+ 手工（实际预览，复用 §3.2 的 `TC-018`） | ⏳ 矩阵已固化进 Vitest（2026-09-25 `T-004`，27 断言一比一转写）；命令级矩阵先已通过（2026-09-23）：**27 条断言 0 失败**（9+7+7+4，分项见下方注），九种容器逐一断言，容器维度修复使 `avi/flv/ts/wmv` 四处判定翻转；`cargo test` 锁定 `container` 为原始 `format_name`（2 条）。**真机预览半待跑**（复用 `TC-018`，本轮已在该行写明 `BUG-006` 的回归素材口径） |
| TC-025 | BUG-007 | 关键帧吸附后**产物时长与首帧落点**等于界面承诺（界面 2.7s 而产物 4.036s 即为不过） | 真机 GUI（步骤见 [gui-e2e/cases-import-cut.md](./gui-e2e/cases-import-cut.md) TC-031） | ✅ 通过（2026-09-21 真机复验：产物 2.756s、首帧 pts 0.039333、h264+aac 原样 copy；修复前为 4.036s / 0.052667） |
| TC-026 | BUG-008 | 关键帧列表**条数 == ffprobe 原始行数**、首项为 `0.0` 且严格升序 | 真机 GUI / `cargo test` 解析单测（步骤见 [gui-e2e/cases-import-cut.md](./gui-e2e/cases-import-cut.md) TC-030） | ⏳ 解析单测已通过（2 条，锁住"带额外空字段的行"不再被丢）；真机复跑待发起 |
| TC-027 | BUG-009 | 非吸附入点下 UI **展示实际落点**（而非选区值） | 真机 GUI（步骤见 [gui-e2e/cases-import-cut.md](./gui-e2e/cases-import-cut.md) TC-031） | ✅ 通过（2026-09-21 真机复验：界面出现「实际入点 00:00:01.319」+ 落点虚线） |
| TC-028 | BUG-010 | `cropToPx`（归一化→像素，拖拽框选路径）不得产出越界裁剪：`x + w ≤ dims`、偶数、含贴边与奇数尺寸 | Vitest（[../src/utils/crop.test.ts](../src/utils/crop.test.ts)，同 TC-022 一份文件）；真机手工（拖到贴右边界后导出） | ⏳ 矩阵已固化进 Vitest（2026-09-25 `T-004`：3 组复现值静态用例 + 3 尺寸 × 2000 组扫描，样本量自 3688320/组缩减、域与种子不变——见下方注）；命令级扫描先已通过（2026-09-23）：3 组尺寸 × 3688320 组交互选区**越界 0**（修复前 1920×1080 为 792、101×57 为 19000 右 / 1844160 下）；真机待跑 |
| TC-029 | `ADR-033`（输出容器/扩展名口径） | 容器由命令决定、名字与之一致：copy 类跟随源容器、重编码类固定 mp4、用户给错扩展名时以封装为准校正；`.part` 与成品同扩展名；**校正撞名不静默覆盖**、**校正后撞上输入文件要报错** | `cargo test` 单测（`fs::with_container_ext` / `source_container_ext` / `output_path_for` / `reject_if_input_equals`）+ e2e（`output_container_follows_adr_033`，真实 ffmpeg + matroska 源） | ✅ 通过（2026-09-23）：单测 4 条 + e2e 1 条；e2e 用 matroska 源验证"copy 产物仍是 matroska、把名字写成 `.mkv` 的重编码产物被校正为 `.mp4` 且容器确为 mp4"。**覆盖边界**：`merge`/`pipeline` 的容器决策与 `add_output` 在作业体内（需 AppHandle），命令级无自动化回归，靠走查 + 上面的原语测试兜底 |
| TC-039 | BUG-011 | 输出=输入的同一性守卫**不可被写法差异绕过**：大小写、末尾点/空格、`..` 绕行都判为同一文件；退化输入（空路径、只有文件名、父目录不存在）不 panic 且放行；两处守卫共用同一实现 | `cargo test` 单测（`fs::same_path` 4 条 + `reject_if_input_equals` 经守卫路径；2 条为 `#[cfg(windows)]`） | ✅ 通过（2026-09-24）：81 单测全绿。**灵敏度已验证**：把 `same_path` 临时改成 `a == b`（模拟改动前的逐字符比较）后，`same_path_normalizes_dotdot_detour` 与 `same_path_ignores_case_on_windows` 立即失败。**实测澄清**：`/` 与 `\` 混用、`./` 前缀在 Rust `Path` 里本来就相等（按组件比较），**不是**绕过途径；真正能绕过的是大小写、末尾点/空格、`..` 绕行 |

> **TC-022 / TC-028 边界矩阵**（2026-09-25 `T-004` 已固化为 [../src/utils/crop.test.ts](../src/utils/crop.test.ts)——下列静态期望值一比一转写，随机扫描同域同种子；固化口径见本节末）：
>
> **A. `pxToCrop`（数值输入 → 归一化选区，TC-022）**——`dims=200×200`、`w=h=16`，除非另注：
> 1. `x` 界内 `0`/`8` → 原样；**恰好压界** `184` → 原样；超界 `190`/`300` → 锚点回钳到 `184`；负值 `-5` → 贴 `0`（同上，`y` 对称）
> 2. `w` 恰好到边：`x=100, w=100` → 原样；`x=150, w=100` → 收缩到 `50`；**CR 复现值** `x=190, w=150` → `x=184, w=16`；低于下限 `w=8` → `null`；`w=0` → `null`；奇数 `w=15` → 就近取偶 `16`
> 3. **奇数尺寸** `dims=101×57`：`x=84, w=16` → 原样（`84+16=100 ≤ 101`）；`x=100` → 锚点回钳到 `84`；`x=0, w=200, h=200` → 收缩到 `100×56`（上界与收缩步都必须**向下**取偶；若收缩步就近取偶，`x=84` 会得 `w=18 → 102 > 101`）
> 4. 画面本身小于下限 `dims=8×8` → `null`
> 5. 不变量（4000 组随机输入）：`0 ≤ nx,ny`、`nx+nw ≤ 1`、`ny+nh ≤ 1`、像素宽高 ≥ `MIN_CROP_PX` 且为偶数
>
> **B. `cropToPx`（归一化选区 → 像素，TC-028）**：
> 1. **贴右边界复现值**：`dims=1920×1080`、`nx=5/1920, nw=1-nx` → `x=6, w=1914`（`x+w=1920`；修复前是 `w=1916 → 1922`）
> 2. **奇数尺寸整幅**：`dims=101×57`、`nx=ny=0, nw=nh=1` → `w=100, h=56`（修复前 `h=58 > 57`）
> 3. 退化输入（单击 → `nw=nh=0`）：`dims=101×57`、`nx=ny=1` → `x=100, w=0`（修复前 `x=102 > 101`）
> 4. 不变量（3 组尺寸 × 3688320 组交互选区）：`x ≤ dims.w`、`y ≤ dims.h`、`x + w ≤ dims.w`、`y + h ≤ dims.h`、宽高为偶数
>
> 以上矩阵 2026-09-23 用**一次性脚本**（`node --experimental-strip-types` 直跑 TS，脚本不入库）验证；2026-09-25 `T-004` 固化为 `src/utils/crop.test.ts` 常驻用例，口径：**域不变**（TC-022 = `dims` 各维 `16..415`、`x/y/w/h ∈ [−50, 550]`；TC-028 = 交互选区以整数像素对采样近似——生产路径 `CropOverlay` 产出连续浮点、浮点侧由钳制不变量覆盖；尺寸组第三组原记录未留名，取最小合法画面 16×16）、**种子不变**（`20260923`）、TC-022 样本量保持 4000、TC-028 由 3688320/组缩到 2000/组（边界由静态复现值兜住，扫描只兜不变量回归）。原脚本的 PRNG 算法未随矩阵入库、无法逐位复现，固化时在用例内固定 mulberry32 实现——从此同种子必然同序列。TC-022 的 `nx + nw ≤ 1` 在浮点下可能超 1 一个 ulp（`x + w = dims` 时），用例带 `1e-9` 容差并以像素侧回投影断言兜底。

> **TC-024 容器矩阵**（2026-09-23 一次性命令级脚本验证；2026-09-25 `T-004` 固化为 [../src/utils/media.test.ts](../src/utils/media.test.ts)，27 断言一比一转写；`utils/media.ts` 的 `containerPlayable` 已随之导出作用例入口）——容器取值 = **真实 ffprobe 9.0.1 实测的 `format_name`**（lavfi 夹具，`-c:v libx264 -pix_fmt yuv420p -c:a aac`；九种容器的编码**全是**原生可播组合，正是 `BUG-006` 的陷阱）。**断言数 27 = 9（A 段）+ 7（B 段）+ 7（C 段）+ 4（D 段）**：
> 1. **A. 九种容器 → 判定**：`mp4`/`mov`/`m4v` = `mov,mp4,m4a,3gp,3g2,mj2`（首位 `mov`）→ **不代理**；`mkv`/`webm` = `matroska,webm`（首位 `matroska`）→ **不代理**；`avi` = `avi`、`flv` = `flv`、`ts` = `mpegts`、`wmv` = `asf` → **代理**（修复前这四处均为"不代理"，即本缺陷）
> 2. **B. 其余三维回归**：`h265` → 代理；`yuv420p10le` → 代理；`ac3` / 多音轨 `aac+eac3` → 代理；无音轨 → 不代理；`vp9+opus`、`vorbis` → 不代理
> 3. **C. 容器串健壮性**：全大写 `MOV,MP4,…`、带空格 `" matroska , webm "` → 不代理（小写 + trim）；空串 / `unknown` → **代理**；**跨族列表取首位**——`mpegts,matroska` 与 `avi,mp4` → **代理**（首位不可播，保守方向），`matroska,mpegts` → 不代理（首位可播）
> 4. **D. `wantsProxy` 三态（4 条）**（DESIGN §3.7/§12）：`off` + 不可播源 → false（只提示、不生成）；`always` + 可播源 → true；`auto` + 不可播源 → true；`auto` + 可播源 → false
>
> `cargo test` 侧另锁一条**跨层契约**：`MediaInfo.container` 必须原样保留 ffprobe 的 `format_name`（不得"友好化"成展示名），否则前端白名单静默失效（`ffmpeg::probe::tests::keeps_non_native_container_verbatim`）。

### 3.5 真机 GUI 自动化（TC-030+）

> **用途**：命令级测试（§3.1）测不到"界面承诺"，这组用例补的是端到端的那一层——**界面显示的值必须等于产物的实测值**。
> **实施细节**（启动方式、驱动命令、每条用例的步骤与断言）在 [gui-e2e/](./gui-e2e/README.md)，本表只登记号与一句话覆盖。
> **前置**：执行沙箱关闭 + dev server 在 1420 + sidecar 就位；运行手册见 [gui-e2e/README.md](./gui-e2e/README.md) §2。

| TC | 覆盖对象 | 一句话覆盖 | 引用 AC | 状态 |
| --- | --- | --- | --- | --- |
| TC-030 | 导入与探测 | 信息面板与独立 ffprobe 一致；关键帧索引不丢项（→ TC-026） | AC-311-1 · AC-312-1 · AC-313-1 | ⏳ `BUG-008` 已修（解析单测已锁），真机待复跑 |
| TC-031 | 极速剪切（含吸附） | 产物时长与首帧落点 == 界面承诺；copy 不重编码（→ TC-025 · TC-027） | AC-321-1 · AC-325-1 | ✅ 通过（2026-09-21 真机复验） |
| TC-032 | 精确剪切 | 时长 3.000±0.2s、音频保留、全帧可解码 | AC-322-1 | ✅ 命令级通过，真机待复跑 |
| TC-033 | 多片段与输出命名 | 顺序/删除语义正确；非法区间被禁用；同名不静默覆盖 | AC-323-1 · AC-324-1 | ⏳ 待跑 |
| TC-034 | 合并 | 一致组秒级无损且接缝可播；不一致组逐项告警+统一后可播 | AC-331-1 · AC-332-1 · AC-332-2 · AC-333-1 | ✅ 无损链路通过，界面侧待复跑 |
| TC-035 | 旋转 | 元数据路径零重编码（分辨率不变+Display Matrix）；重编码路径宽高交换 | AC-341-1 · AC-341-2 · AC-342-1 | ✅ 命令级通过，真机待复跑 |
| TC-036 | 局部放大 | 框选 1/4 回原分辨率；越界钳制不打 ffmpeg | AC-351-1 · AC-352-1 · AC-353-1 | ⏳ 待跑 |
| TC-037 | 工作台流水线 | 成品时长 == 片段和、接缝可播、顺序随轴、成品可连播可 seek | AC-380-1（组级） | ✅ 链路通过，界面侧待复跑 |
| TC-038 | 任务与历史 | 并发上限 2、取消不留半成品、终态恰好一条历史 | AC-360-1 · AC-361-1 · AC-362-1 | ⏳ 待跑 |

> 表中 TC-030 / TC-031 的 ❌ 曾是 2026-09-19 真机首跑当场复现的偏差，已登记 [BUG-007](./BUGS.md) / [BUG-008](./BUGS.md) / [BUG-009](./BUGS.md)，回归口径依次为 TC-025 / TC-026 / TC-027。三条已于 2026-09-21 修复（PLAN `R4-8`）：`BUG-007` / `BUG-009` 真机复验通过并转 `verified`，`BUG-008` 仅由解析单测锁定、真机复跑待发起，故仍为 `fixed`。

## 4. 验收结论记录口径

1. 每条 AC 的状态只有三种：`✅ 通过`（附 TC 号与日期）/ `❌ 未过`（附现象）/ `⏳ 待手测`。
2. **AC 状态的真源是 [DESIGN.md](./DESIGN.md) 对应行的标记**；PLAN 里程碑验收行只列该批次覆盖的 AC 号。
3. 历史批次（M0–M9）的验收结论以 [PLAN.md](./PLAN.md) 与 [handoff-archive.md](./archive/handoff-archive.md) 当时记录为准，不再回溯改写。
4. 目前悬空项（截至 2026-09-19）：M4-5 打包冒烟、M6-7 UI 手测、M9 五项、M7-1/2/3、工作台 2.0 全流程 —— 均归入 TC-010~TC-018，**结论待用户手测**。
