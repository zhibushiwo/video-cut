# AGENTS.md — video-cut 的 agent 作业规程

> **职责**：给自动化 agent（以及新加入的人）一份"开工前必读"：命令怎么跑、哪些线不能碰、什么算完事、去哪查规格。
> **唯一真源**：**工程红线与完事标准**以本文为准；规格内容一律不在本文复述，只给指针（规格 → [docs/DESIGN.md](docs/DESIGN.md)）。
> **读时机**：每次接手任务前；准备动 `ffmpeg/`、`task/`、IPC 层之前必须读完 §3。
> **写规则**：只在"红线、命令、完事标准、流程"变化时改本文；每条尽量一行，能指向文档就指向。**不写规格、不写进度**。
> **关联**：[docs/INDEX.md](docs/INDEX.md)（文档地图与 ID 规范） · [docs/PLAN.md](docs/PLAN.md)（进度与任务） · [docs/HANDOFF.md](docs/HANDOFF.md)（当前状态）
> **最后更新**：2026-09-24（§2/§4/§7 补前端单测 `pnpm test`（M11-0 引入 Vitest））

---

## 1. 项目与技术栈

**video-cut**：Windows 桌面视频工具，无损优先（工作台流水线 + 剪切 / 合并 / 旋转 / 局部放大）。
Tauri 2 · React 19 + TypeScript · Tailwind CSS 4 · Rust · FFmpeg 9.0.1（gyan.dev release-essentials，**sidecar** 分发，由 `scripts/fetch-ffmpeg.ps1` 下载，二进制不入库）。

```
src/           前端（pages / components / hooks / services / utils / types）
src-tauri/src/ Rust（commands / ffmpeg / task + history.rs / logger.rs）
src-tauri/tests/e2e.rs   命令级 e2e
docs/          规格与项目管理（地图见 docs/INDEX.md）
scripts/       fetch-ffmpeg.ps1 / gen-fixtures.ps1 / 图标脚本
```

## 2. 常用命令

| 目的 | 命令 |
| --- | --- |
| 开发（含 Rust 热重载） | `pnpm tauri dev` |
| 仅前端 | `pnpm dev` |
| 构建（tsc + vite） | `pnpm build` |
| 静态检查 | `pnpm lint`（或 `pnpm lint:fix`） |
| 前端单测（纯函数） | `pnpm test`（= `vitest run`；配置 `vitest.config.ts`，node 环境不含 DOM；用例在 `src/**/*.test.ts`） |
| 文档一致性（链接 / § 归属 / ID 交叉 / skip 区间） | `pnpm check:docs`（= `node scripts/check-docs.mjs`；`--strict` 更严，`--list` 列出扫描文件） |
| 安装 git 钩子（克隆后跑一次） | `pnpm hooks:install`（= `git config core.hooksPath .githooks`；钩子在库内 `.githooks/`，提交时自动跑 check-docs） |
| 后端测试（含 e2e） | `cd src-tauri && cargo test` |
| 下载/更新 sidecar FFmpeg | `pwsh scripts/fetch-ffmpeg.ps1` |
| 生成测试夹具 | `pwsh scripts/gen-fixtures.ps1` |

## 3. 红线（改动前必读）

**FFmpeg 层**

1. **所有 FFmpeg 参数只在 `src-tauri/src/ffmpeg/command.rs` 拼装**；其他文件不得自行拼命令参数。改动必须同时补该文件的参数序列单测。
2. copy 类命令强制 `-map 0`（否则丢多音轨/字幕，违背无损承诺）；进度**只解析 `-progress pipe:1`**，禁止解析 stderr。
3. 直接 `spawn` ffmpeg/ffprobe 必须走 `command::spawn_hidden` —— release 是 GUI 子系统，不经它会在用户机器上闪 CMD 窗口。
4. 重编码必须带 `-video_track_timescale <首片段源 tb 分母>`（`command::parse_timescale`）—— 否则 concat 后 seek/播放损坏。
5. 中间产物与半成品一律用 `.part.<令牌>`（`commands::pipeline::temp_token`），并发 2 时防同名互写。
6. copy 剪切 `-ss` 放在 `-i` **前**，精确剪切放 `-i` **后**；统一带 `-avoid_negative_ts make_zero`。

**任务系统**

7. 长耗时操作**一律走 `TaskManager`**（并发 2、可取消、`.part`→rename），不要写同步阻塞命令。
8. 提交方若要回收自己的簿记（如去重表条目），用 `submit_with_cleanup` —— **排队中被取消的任务不执行作业体**，写在作业体里的回收会被跳过。
9. 事件名与 payload 固定：`task-status` / `task-progress`（payload camelCase）；Rust 类型集中在 `lib.rs`（serde `rename_all = "camelCase"`，枚举 snake_case）。

**前端**

10. **IPC 只经 `src/services/tauri.ts`**：页面/组件/hooks 不得 import `@tauri-apps/*`（`eslint.config.js` 会拦；仅 `src/services/**` 例外）。
11. 事件订阅统一用 `hooks/useTauriEvent`（`listen()` 的 Promise 在 resolve 前卸载会漏退订，StrictMode 下必现）。
12. 窗口内拖拽一律**指针事件**，禁用 HTML5 DnD（Tauri 在 Windows 吞掉这些事件）。
13. 裁剪框选统一用 `components/CropOverlay` + `utils/crop.ts`；工作台必须把 handlers 挂在旋转舞台上（加覆盖层会挡住视频点击播放）。
14. 主题令牌在 `src/global.css`（signal 绿=无损，warn 琥珀=重编码，mono 只用于时间码）；不要硬编码颜色。

**流程**

15. **规格先于代码**：行为变化先改 `docs/DESIGN.md`（或对应专题文档 + AC），再改实现。
16. **已定过的事不重复决定**：动手前查 [docs/DECISIONS.md](docs/DECISIONS.md)；推翻既有决策要走新 ADR。
17. Rust ↔ TS 类型是双写：改 `lib.rs` 的数据模型必须同提交更新 `src/types/index.ts` 与 DESIGN §7。
18. 新增 Tauri 命令：在 `lib.rs` 的 `invoke_handler` 注册 → 在 `services/tauri.ts` 封装 → 必要时补 capability。

**收尾与状态残留**（2026-09-19 审查补充）

19. **输出文件替换必须原子**：不得"先删目标再 `rename`"，也不得吞掉删除错误 —— 统一走 `fs::atomic_replace(part, final)`。实现只需一次 `std::fs::rename`：它在 Windows 走 `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`、在 Unix 走 `rename(2)`，**目标已存在时由系统替换**，失败则两个文件都原样保留——所以既不先删、也不加中间备份名（多一步就多一个失败窗口）。失败时错误信息必须带 `.part` 完整路径（否则用户既丢旧文件又找不到新产物）。见 [BUGS.md](docs/BUGS.md) `BUG-002`。
20. **指针拖拽必须处理"窗口外松手"**：统一走 `utils/pointerDrag.ts` 的 `beginPointerDrag(onMove, onEnd)`（4 处拖拽共用：裁剪框选 / 列表排序 / 时间轴手柄 / 时间轴块与池→轴）——它在 `pointermove` 内判 `buttons === 0` 即收工，并注册 `pointercancel`；**不要再本地手写 `addEventListener("pointermove"…)`**。否则监听器常驻 window、拖拽态卡死，后续无关点击会触发意外重排。组件卸载要摘监听时用它的返回值 `detach`（不触发 `onEnd`）。见 [BUGS.md](docs/BUGS.md) `BUG-003`。

**精度与落点**（2026-09-21 真机首跑补充）

21. **输入侧与输出侧的 `-ss` 格式化必须分开**：**输入侧** seek（copy 路径 `cut_args` / `pipeline_copy_args`）走 `command::fmt_seek`（**+1µs、6 位小数**）；**输出侧** seek 与 `-t` 走 `fmt_sec`（3 位小数）。输入侧语义是"落到 ≤ 请求时刻的最近关键帧"，而关键帧 pts 常非整毫秒（`tb=1/60000` 下 5.753333），被三位小数舍到请求时刻**之前**就会退到**再前一个**关键帧。见 [BUGS.md](docs/BUGS.md) `BUG-007`（界面 2.7s / 产物 4.036s）。新增带输入侧 seek 的构建器都要补"`-ss` 严格大于请求时刻"的参数序列断言。

## 4. 完事标准

改动**完成**需同时满足：

1. `tsc --noEmit` 通过 · `pnpm lint` 0 problems · `pnpm test` 全绿 · `cargo test` 全绿（含 e2e；sidecar 缺失时 e2e 自动跳过，需在说明里注明）
2. 动过 `command.rs` ⇒ 有对应的参数序列断言
3. 动过 UI ⇒ 在提交说明或回复里列出**手测点**（测试口径见 [docs/TESTING.md](docs/TESTING.md)）
4. 动过规格 ⇒ 同步更新 DESIGN 的 FR/AC 或对应文档
5. **动过 `docs/**`、`README.md` 或 `AGENTS.md` ⇒ `node scripts/check-docs.mjs` 五项全绿**（`pnpm check:docs`；链接可达 / § 引用归属 / ID 交叉定义 / skip 区间合规 / 反引号路径可达）
6. 完成的任务在 `docs/PLAN.md` 勾选（一个 checkbox 一次提交）

## 5. 提交约定

- 一个 checkbox 一次提交，提交信息前缀用任务号：`M11-3: …` · `R1-4: …` · `T-001: …`（编号规则见 [docs/INDEX.md](docs/INDEX.md) §3）
- 文档/配置类用 `docs:` / `chore:` 前缀
- 不跳过 hooks；提交前跑 §4 的三项验证

## 6. 改动流程（推荐顺序）

1. 读 [docs/INDEX.md](docs/INDEX.md) → 确定该改哪份文档/哪个模块
2. 查 [docs/DECISIONS.md](docs/DECISIONS.md) → 确认"这事定过没有"
3. 查 [docs/CANDIDATES.md](docs/CANDIDATES.md) → 若属未立项新功能，先走晋升流程
4. 改规格（DESIGN / UI / TIMELINE / FFMPEG）→ 改代码 → 补测试 → 勾 PLAN

## 7. 环境注意

**换行符：全仓库统一 LF（任何终端都适用）**。根 `.gitattributes` 是 `* text=auto eol=lf` —— 属性优先级**高于** `core.autocrlf`，所以无论谁机器上怎么配，索引与工作区都是 LF，`.githooks/pre-commit` 不会因 `#!/bin/sh\r` 静默失效。
若你的工作区仍见 CRLF（或 `git status` 报"内容没变却修改"），跑一次 `git config core.autocrlf false` —— 本机 `core.autocrlf=true` 来自 **system 级** Git 配置（Git for Windows 默认值），**不是仓库设置**，所以只改它不会入库、换机器要重设。

**以下仅受限环境/沙箱，正常终端可跳过**：

- 受限进程里 **pnpm 建不出软链**：`node_modules/<pkg>` 会留空目录、所有命令报 MODULE_NOT_FOUND。
  对策：`pnpm install --force --config.node-linker=hoisted`（真实文件、无链接）。
- **不要用 `pnpm run <script>`**：会触发布局回切，可能把已装好的树弄坏。改用 node 直调：
  `node node_modules/typescript/lib/tsc.js --noEmit` · `node node_modules/eslint/bin/eslint.js .` · `node node_modules/vite/bin/vite.js build` · `node node_modules/vitest/vitest.mjs run`
- 装到一半被中断（`拒绝访问 (os error 5)`）会留下半残树：`.bin` 消失、个别包缺文件。
  修法见用户级技能 `node-modules-broken-links-repair`（`npm pack` 补单包 + 重建 `.bin`）。

## 8. 常见坑速查

| 症状 | 根因 | 对策 |
| --- | --- | --- |
| 输出时长对但 seek/播放坏 | concat 各段 timebase 不一致 | 重编码统一带 `-video_track_timescale`（§3 第 4 条） |
| 成品"时长对但只有前 N 秒可解码" | 并发任务同名输出互写 | 临时文件用 `.part.<令牌>`（§3 第 5 条） |
| 用户机器上闪 CMD 窗口 | release 是 GUI 子系统 | 直接 spawn 必经 `spawn_hidden`（§3 第 3 条） |
| dev 下监听器重复/内存涨 | `listen()` 未退订 | 用 `useTauriEvent`（§3 第 11 条） |
| 拖拽排序在 Windows 失效 | HTML5 DnD 被 Tauri 吞 | 指针事件实现（§3 第 12 条） |
| 硬件编码器"可用"却失败 | 探测误判 | 试跑探测 + 失败回退 libx264（本机 nvenc/qsv/amf 全不可用，10bit 走 HEVC） |
| 同文件二次打开仍等数秒 | probe 缓存未命中 | 缓存键 = 路径+size+mtime_ns；≥512 条整体清空（M12-2 前改 LRU） |
| 契约对不上（前端拿不到字段） | Rust/TS 类型双写不同步 | 同提交更新 `lib.rs` + `src/types` + `docs/DESIGN.md` §7 |
