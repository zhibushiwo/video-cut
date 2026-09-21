# 真机 GUI 自动化测试（gui-e2e）

> **职责**：**真机 GUI 自动化用例的实施细节** —— 怎么启动被测应用、怎么用 CDP 驱动界面、每条用例的步骤与断言口径、实测证据。
> **唯一真源**：**用例的步骤、断言与证据**以本目录为准；**TC 号与一句话覆盖**在 [TESTING.md](../TESTING.md) §3.5（那里是 TC 清单的真源，本目录是它的实施细节，分工同 [plans/M11.md](../plans/M11.md) 之于 [TIMELINE.md](../TIMELINE.md)）。
> **读时机**：要真机跑一遍关键功能时；改动剪切/合并/旋转/放大/工作台导出后做交付前验证时；排查"界面说的和产物不一致"时。
> **写规则**：新增用例先在 TESTING.md §3.5 登记 TC 号与一句话覆盖，再在本目录补步骤与断言；**用例号不复用**；断言必须落到**可比对的量化值**（时长/流数/编码/分辨率/pts），禁止只写"能正常播放"。
> **关联**：[INDEX.md](../INDEX.md)（ID 与地图） · [TESTING.md](../TESTING.md)（TC 清单、夹具、回归组） · 上位 [DESIGN.md](../DESIGN.md)（AC） · [BUGS.md](../BUGS.md)（缺陷） · 工具技能 `windows-computer-use`
> **最后更新**：2026-09-21（回填 TC-030/TC-031 的修复与复验结果）

---

## 1. 这套测试解决什么问题

命令级测试（[TESTING.md](../TESTING.md) §3.1 的 `cargo test` + e2e）只覆盖 Rust 侧参数与链路，**测不到"界面承诺的东西"**。真机 GUI 用例补的正是这一层，核心断言只有一句：

> **界面显示的值，必须等于产物的实测值。**

例：剪切页写着"片段 2.7s"，产物的 `format.duration` 就必须是 2.7s（容差见 §4）。这条断言在 2026-09-19 首次运行时就抓出了 [BUG-007](../BUGS.md)（界面 2.7s / 实际 4.036s）。

## 2. 怎么跑（运行手册）

### 2.1 前置

| 项 | 要求 |
| --- | --- |
| 沙箱 | **必须关闭**（WorkBuddy 执行沙箱）；开着时输入注入与调试端口都不可用 |
| 应用构建 | 已有 `target/debug/video-cut.exe`（`cargo build` 或 `tauri dev` 产物均可，debug 构建会加载 `build.devUrl`） |
| dev server | vite 监听 1420（`devUrl` 指向它） |
| sidecar | `src-tauri/target/debug/ffmpeg.exe` / `ffprobe.exe` 存在（缺失时界面会显示"FFmpeg 不可用"） |
| 夹具 | 见 [TESTING.md](../TESTING.md) §2 |

### 2.2 启动（三步）

```bash
# 1) dev server（后台）
node node_modules/vite/bin/vite.js --port 1420 --strictPort

# 2) 带调试端口启动应用（后台；勿在前台调用里用 & ，调用返回会被回收）
export WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222 --remote-allow-origins=*"
cd src-tauri && ./target/debug/video-cut.exe

# 3) 确认 CDP 目标（应看到 title=video-cut、url=http://localhost:1420/）
curl -s --noproxy '*' http://localhost:9222/json/list
```

> 本环境 `curl` 访问本机必须带 `--noproxy '*'`（否则被 http_proxy 接走）。
> 不要用 `tauri dev` 直接接管端口：它会把 vite 也一起拉起来，与上面第 1 步抢 1420。

### 2.3 驱动界面

工具在技能 `windows-computer-use` 的 `scripts/` 下（`cdp.js` 零依赖 Node 脚本、`uitool.rs` 零依赖 Rust 助手）。**不要用屏幕坐标盲点**：Tauri/WebView2 的客户区在桌面截图里是纯黑或纯白，看不到内容。

| 目的 | 命令 |
| --- | --- |
| 读界面真实状态（断言用） | `node cdp.js eval "<js>"` |
| 找元素坐标与文本 | `node cdp.js dom "<css 选择器>"` |
| 截应用界面（唯一可见方式） | `node cdp.js shot <out.png>` |
| 点元素 / 按坐标点 / 拖拽 | `node cdp.js click "<css>"` · `mouse <x> <y>` · `drag <x1> <y1> <x2> <y2> <steps>` |
| 键盘 / 输文本 | `node cdp.js key <Key> [ctrl\|shift\|alt]` · `type "<文本>"` |
| 驱动**原生文件对话框** | `uitool.exe type "<绝对路径>"` 然后 `uitool.exe key ENTER` |
| 聚焦窗口（注入前确认前台） | `uitool.exe focus video-cut` · `uitool.exe active` |

要点：
- 指针拖拽（Timeline 双手柄、时间轴块）必须走 `drag`，且 `steps` ≥ 12 —— 中间要有 `pointermove`，否则指针事件序列不完整。
- 受控输入框用坐标点击 + `ctrl+a` + 键入 + Enter 提交。
- 底部任务浮层会遮挡导出按钮，提交前先确认它已关闭。

### 2.4 核验产物

```bash
FP=src-tauri/target/debug/ffprobe.exe
"$FP" -v error -show_entries format=duration -of csv=p=0 <产物>
"$FP" -v error -select_streams v:0 -show_entries packet=pts_time -of csv=p=0 -read_intervals "%+#1" <产物>
"$FP" -v error -show_entries stream=codec_type,codec_name,width,height -of csv=p=0 <产物>
```

## 3. 用例索引

| TC | 文件 | 覆盖 |
| --- | --- | --- |
| TC-030 · TC-031 · TC-032 · TC-033 | [cases-import-cut.md](./cases-import-cut.md) | 导入与探测 · 极速剪切（含关键帧吸附）· 精确剪切 · 多片段与命名 |
| TC-034 · TC-035 · TC-036 | [cases-merge-rotate-zoom.md](./cases-merge-rotate-zoom.md) | 合并（一致性检测/无损拼接/自动统一）· 旋转（元数据/重编码）· 局部放大 |
| TC-037 · TC-038 | [cases-workbench-task.md](./cases-workbench-task.md) | 工作台多片段合成导出 · 任务面板与取消/历史落盘 |

## 4. 断言口径（统一，勿各写各的）

| 量 | 口径 | 容差 |
| --- | --- | --- |
| 成品时长 | `format.duration` 与**界面显示值**比对 | ≤ 0.35s（重编码链路）；copy 链路 ≤ 一个 GOP（见各用例） |
| 起始落点 | 首帧 `packet pts_time` | ≤ 0.1s（B 帧重排 + 音频 priming 的固有量级） |
| 流与编码 | 流数量、`codec_name` 与源一致（无损路径） | 严格相等 |
| 分辨率 | 与规格预期一致 | 严格相等 |
| 全帧可解码 | `ffmpeg -v error -i <out> -f null -` 退出码 0 且 stderr 无解码错误（放行 concat 接缝的 dts 重复告警） | 严格 |
| 接缝可播 | **在接缝前后各取 1s 解一遍**（只测总时长抓不到时间戳损坏） | 严格 |

## 5. 记录口径

每条用例的"现状"列写三选一 + 日期 + 证据路径：
`✅ 通过（YYYY-MM-DD，产物 …）` · `❌ 未通过（现象：… ）` · `⏳ 待跑`。
未通过的必须能在 [BUGS.md](../BUGS.md) 找到对应条目，或当场登记。

## 6. 与其它文档的边界

| 内容 | 落点 |
| --- | --- |
| TC 号、一句话覆盖、扫描式清单 | [TESTING.md](../TESTING.md) §3.5 |
| 用例步骤、断言、证据 | **本目录** |
| 单元测试 | 代码内（`cargo test`），不进文档 |
| 验收口径本身（AC） | [DESIGN.md](../DESIGN.md) §3 各节末 |
| 缺陷 | [BUGS.md](../BUGS.md) |
| 独立号段（如 `RM-0NN`）的诉求 | **勿临时起号**：按 [INDEX.md](../INDEX.md) §3.3 第 4 条先立 ADR |
