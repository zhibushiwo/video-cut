# video-cut 设计文档

> 版本：v0.4 · 更新日期：2026-09-13 · 状态：v0.2 已实现（M0–M5、M4-1/2）；工作台 2.0（§3.8/§9.8）与设置页二期（§9.9，M4-8）定稿待实现
>
> 本文档整合了原始需求与可行性分析，作为后续开发的唯一依据。实现与设计冲突时，先改本文档再改代码。

## 目录

1. [项目概述](#1-项目概述)
2. [核心设计原则](#2-核心设计原则)
3. [功能需求](#3-功能需求)
4. [无损性承诺矩阵](#4-无损性承诺矩阵)
5. [技术架构](#5-技术架构)
6. [FFmpeg 集成规范](#6-ffmpeg-集成规范)
7. [数据模型](#7-数据模型)
8. [任务系统设计](#8-任务系统设计)
9. [UI / UX 设计](#9-ui--ux-设计)
10. [格式支持矩阵](#10-格式支持矩阵)
11. [打包与分发](#11-打包与分发)
12. [配置与持久化](#12-配置与持久化)
13. [错误处理与边界情况](#13-错误处理与边界情况)
14. [开发路线图](#14-开发路线图)
15. [决策记录](#15-决策记录)

---

## 1. 项目概述

### 1.1 定位

**video-cut** 是一款面向 Windows 11 的本地视频处理工具，提供四个核心功能：

- **剪切**：把一个视频切成多个片段，或截取其中的区间
- **合并**：把多个视频按顺序拼接为一个
- **旋转**：调整视频方向
- **局部放大**：框选画面区域并放大输出

### 1.2 核心卖点

> **无损优先：能不重新编码的绝不重新编码，保证画质与原视频一致、文件大小基本一致。**

- 纯本地处理，无上传、无联网
- 内置 FFmpeg，用户开箱即用
- 所有操作向用户明示"无损"还是"重编码"，不偷偷转码

### 1.3 非目标（明确不做）

- 不做 Premiere / 剪映式的多轨复杂时间线编辑器
- 不做特效、调色、转场、字幕编辑
- 不做云同步、素材库、AI 功能

产品形态是"精准的瑞士军刀"，不是"全能编辑器"。UI 做简单工具型界面。

---

## 2. 核心设计原则

以下五条是全项目的最高约束，所有模块设计必须遵守：

1. **Stream copy 优先**：任何操作先探测媒体信息，判断能否 `-c copy`；只有物理上不可能（像素变化、参数不一致）才走重编码。
2. **无损性显式化**：UI 上每个操作按钮/面板必须有"无损 / 重编码"徽标，重编码必须告知用户代价（速度慢、大小可能变化）。
3. **所见即所得**：无损剪切的入点受关键帧约束，必须在时间轴上把选择柄吸附到关键帧并显示真实剪切落点，不允许"剪完才知道偏了"。
4. **数据完整性**：默认 `-map 0` 保留全部流（多音轨、字幕、章节、封面），与"无损"卖点一致；FFmpeg 默认的流选择会丢流，禁止依赖。
5. **智能兜底**：无法无损时（如合并参数不一致）给出明确的用户选择（自动统一 / 取消），绝不默默转码。

---

## 3. 功能需求

### 3.1 视频导入与信息展示

- 打开文件：系统文件对话框 + 拖拽到窗口
- 加载后立即用 **ffprobe** 解析并展示信息面板：
  - 容器格式、总时长、文件大小、封装码率
  - 视频流：编码（如 HEVC）、profile/level、分辨率、像素格式、位深、帧率、码率、旋转元数据
  - 音频流列表：编码、采样率、声道数、码率
  - 字幕流数量、章节
- **关键帧索引**：剪切页需要，后台异步扫描关键帧时间点列表（见 6.5），长视频需显示扫描进度

### 3.2 剪切（Cut）

两种模式：

| 模式 | 实现 | 画质 | 大小 | 速度 | 剪切点 |
| --- | --- | --- | --- | --- | --- |
| **极速剪切**（默认） | `-c copy` | 100% 原画质 | ≈ 源数据量 | 秒级（仅 IO） | 入点对齐关键帧 |
| **精确剪切** | 重编码 | 有损（可用高质量参数减小） | 可能变化 | 慢（受编码速度限制） | 精确到帧 |

- **多片段**：用户可连续添加多个区间，一次性导出为 `part_001.mp4`、`part_002.mp4` …
- **区间编辑**：时间轴双手柄拖拽 + 开始/结束时间数字输入（格式 `HH:MM:SS.mmm`），两种方式双向同步
- **关键帧吸附**：入点默认吸附到关键帧（可关闭吸附，此时 UI 必须显示"实际入点将落在 XX:XX"）；出点默认不吸附（流复制下出点可到包级，主流解码器可正常播放），提供"出点也对齐关键帧"开关
- **输出**：用户选择输出目录；默认同名输出文件冲突时提示确认

### 3.3 合并（Merge）

- 文件列表支持拖拽排序、增删
- 提交前用 ffprobe 对比所有文件的以下字段（全部一致才可无损合并）：
  1. 视频编码（codec + profile）
  2. 分辨率
  3. 像素格式 / 位深
  4. 帧率
  5. 视频流 time_base
  6. 音频编码
  7. 音频采样率
  8. 声道数
  9. 流布局（音轨数、字幕流数量需一致，否则 `-map 0` 语义错乱）
- **一致** → 显示绿色检测面板（✓ 各项一致，可无损合并，预计速度极快），concat demuxer + stream copy
- **不一致** → 显示 ⚠ 检测面板 + 选择：
  - **自动统一后合并**：以第一个文件的参数为基准重编码全部（或用户选目标档位：保持首文件参数 / 1080p H.264 高兼容）
  - **取消**
- 合并输出大小 ≈ 各源文件之和（容器 moov/mdat 重组会有 ±1% 级别差异，需在 UI 向用户说明，不承诺字节数相等）

### 3.4 旋转（Rotate）

- 支持：顺/逆时针 90°、180°、水平翻转、垂直翻转
- **优先元数据级旋转**（无损）：FFmpeg 6.0+ 的 `-display_rotation` 输入选项 + `-c copy`，仅改显示矩阵并 remux，秒级完成
- 元数据旋转无法满足时（如目标是导出为真旋转像素的老设备兼容场景）才提供重编码路径（`transpose` 滤镜）
- UI 默认走元数据路径并显示"无损"徽标；重编码路径作为高级选项，并允许用户选择编码器/质量

### 3.5 局部放大（Crop & Zoom）

- 在预览画面上拖拽框选区域（x/y/width/height），支持数值微调与比例锁定
- 处理链：`crop → scale`（默认放大回原视频分辨率，可自定义输出尺寸，`lanczos` 缩放算法）
- **必然重编码**，UI 明确标注；音频始终 `-c:a copy` 不转码
- **编码器策略**：自动探测 GPU → `h264_nvenc`（NVIDIA）/ `h264_qsv`（Intel）/ `h264_amf`（AMD），失败回退 `libx264`；用户可在设置中锁定编码器
- **质量档位**（简化暴露，映射到编码参数）：
  - 高质量（libx264 CRF 16 / 硬件高码率）
  - 平衡（默认，CRF 20）
  - 小体积（CRF 26）

### 3.6 任务队列

- 四类操作统一为 Task 提交到队列（见第 8 节）
- 进度条 + 处理速度（fps / 倍速）+ 预计剩余时间
- 支持取消（kill ffmpeg 子进程 + 删除半成品）
- 全局任务面板，多任务并行可见
- （第四阶段）历史记录、批量处理

### 3.7 代理预览（新增，属于第一阶段）

WebView2 的 `<video>` 对部分格式无法直接播放（详见第 10 节）。当源视频不被 WebView2 支持（如 AVI、无 HEVC 扩展时的 H.265、AC-3 音频等）时：

- 自动生成低分辨率 H.264 + AAC 代理文件（720p，`veryfast`，后台低优先级任务）
- 播放器播放代理，但**时间轴、剪切区间、导出全部基于原视频时间**（代理与源时长一致，无需时间映射换算）
- UI 显示"当前为代理预览画面，导出使用原始文件"提示条
- 用户可关闭该功能（此时不支持预览的格式显示占位提示，但仍可按数值剪切）

### 3.8 工作台（Workbench，流水线组合）

四个独立功能之外的第二种使用范式：**添加若干素材 → 从素材中剪出任意多个片段 → 片段逐个加工 → 在合成时间轴上编排 → 合成一个成品**。

**三层数据模型（v0.3 重构，前端状态；后端命令语义不变）**：

- **素材（SourceFile）**：导入的源文件，卡片展示（首帧缩略图）；可拖拽排序（仅组织用途，不影响导出）
- **片段（Clip）**：加工与合成的最小单元，= 后端一个 `PipelineItem`。字段：
  - **剪切**：源内区间 `[start, end)`（不设 = 整段保留）；**一个素材可剪出多个片段**，各自独立
  - **旋转**：增量角度（0/90/180/270，正=顺时针）+ 水平/垂直翻转，与旋转页语义一致
  - **放大**：显示空间中的裁剪矩形（偶数对齐），默认放大回显示分辨率
- **时间轴（timeline）**：片段 id 有序表，**唯一**决定成品顺序与内容（片段池不做独立排序，避免两处排序语义冲突）

- 导出 = 一个 `pipeline` 任务：`timeline` 逐条映射为 `PipelineItem` 列表（同源多片段 = 多条 item，现有后端已正确支持）→ 逐片段产出中间文件 → concat demuxer 拼接
- **成品预览（虚拟连播）**：顶部预览区按时间轴顺序近似连播全部片段（套用各片段旋转/裁剪变换）；片段边界存在 ±1 帧级误差与切换停顿（代理可缓解），导出结果以 FFmpeg 实际输出为准，UI 明示

**片段处理计划（plan_items，纯函数，核心规则）**：

- 每个片段的"目标朝向" T_i =（源方向元数据 + 用户增量）mod 360，翻转独立叠加
- **规则 A（全程无损）**：所有片段均无裁剪且所有 T_i 相同 → 每个片段一条 copy 命令
  （剪切 `-ss/-t` + 元数据旋转 `-display_rotation T_i` 同命令完成），concat copy 拼接
- **规则 B（其余情况）**：以"无变换"为基准。无裁剪且 T_i 为恒等 → copy（显式覆写矩阵为 0）；
  其余片段重编码，把**绝对变换**烘焙进像素（`-display_rotation 0` 剥离源矩阵防双重旋转）
- 拼接正确性依据：concat 输出的显示矩阵取自第一个文件；copy 片段渲染朝向 = 矩阵，
  重编码片段渲染朝向 = 烘焙像素 + 矩阵(0)。规则 B 下全片矩阵恒等，恒成立
- **参数统一兜底**：中间文件产出后逐个与第 1 个片段做九项比对，不一致者
  （如混入不同分辨率源、10bit/8bit 混用导致 H.264/H.265 混编）按 §6.3④ 定向归一化后再拼接。
  检测面板在导出前预先提示哪些片段必然/可能重编码
- 已知取舍：若某片段裁剪放大而其他片段旋转到非恒等方向，后者也需重编码（保方向一致性优先）

---

## 4. 无损性承诺矩阵

这是产品对用户的承诺，也是各模块的实现边界：

| 操作 | 路径 | 画质 | 文件大小 | 速度 | 剪切/输出精度 |
| --- | --- | --- | --- | --- | --- |
| 剪切-极速 | stream copy | 与源一致 | ≈ 源区间数据量 | 秒级 | 入点=关键帧 |
| 剪切-精确 | 重编码 | 有损可调 | 可能变化 | 慢 | 帧级 |
| 合并-参数一致 | stream copy | 与源一致 | ≈ 源总和 ±1% | 秒级 | — |
| 合并-参数不一致 | 重编码统一 | 有损可调 | 可能变化 | 慢 | — |
| 旋转-元数据 | remux copy | 与源一致 | ≈ 源 | 秒级 | — |
| 旋转-重编码 | transpose | 有损可调 | 可能变化 | 慢 | — |
| 局部放大 | crop+scale+encode | 有损可调 | 可能变化 | 慢 | — |

---

## 5. 技术架构

### 5.1 分层总览

```text
┌─────────────────────────────────────────────┐
│                React UI                     │
│    React 19 + TypeScript + Tailwind CSS 4   │
│    pages / components / services / types    │
├─────────────────────────────────────────────┤
│              Tauri 2 IPC 层                 │
│      invoke 命令（请求） + emit 事件（推送）  │
├─────────────────────────────────────────────┤
│                Rust 后端                    │
│  commands/  命令入口（参数校验、任务提交）    │
│  ffmpeg/    命令构建器 / ffprobe / 进度解析  │
│  task/      任务队列 / 子进程管理 / 事件推送 │
├─────────────────────────────────────────────┤
│          FFmpeg / FFprobe（sidecar）        │
│    剪切 合并 旋转 裁剪 转码 探测 关键帧索引  │
└─────────────────────────────────────────────┘
```

职责边界：**Rust 不实现任何编解码逻辑**，只负责"根据用户操作智能生成正确的 FFmpeg 命令 + 管理任务生命周期"；前端不实现任何媒体处理，只负责交互与展示。

### 5.2 前端结构（对应已建目录）

```text
src/
├── components/
│   ├── VideoPlayer/     # <video> 封装：播放/暂停/倍速/时间上报/overlay 插槽/代理切换
│   ├── Timeline/        # 源内时间轴：区间双手柄、关键帧刻度与吸附
│   ├── ClipTimeline/    # 工作台合成时间轴：片段块编排（§9.8）、池↔轴拖入、播放头
│   ├── ProductPreview/  # 工作台成品虚拟连播（M6-6）：双 video 轮换预加载
│   ├── RotateControls/  # 旋转组合按钮（Editor 页与工作台共享）
│   └── TaskProgress/    # 全局任务面板：进度/速度/取消/复制日志/自动关闭
├── pages/
│   ├── Workbench/       # 工作台（落地页，§9.8：素材卡/片段池/时间轴/三态预览）
│   ├── Cut/             # 剪切页 = VideoPlayer + Timeline
│   ├── Merge/           # 合并页
│   ├── Editor/          # 旋转/放大共用编辑页
│   ├── Settings/        # 设置页（§9.9，受控组件）
│   └── History/         # 历史记录页（§9.10，只读）
├── hooks/
│   └── useDragSort.ts   # 指针事件拖拽排序（决策 #18：禁用 HTML5 DnD）
├── services/
│   └── tauri.ts         # invoke 封装 + 事件订阅，全部类型安全，UI 不直接碰 @tauri-apps/api
├── theme.ts             # 主题色预设与运行时覆写（§9.1/决策 #16）
└── types/               # 与 Rust 数据模型对齐的 TS 类型
```

约定：

- `services/tauri.ts` 是前端唯一允许 import `@tauri-apps/api` 的地方
- 路由用轻量方案（自研 state 切换或 react-router，第一阶段不引入 router 库，四个页面直接 state 切换）
- 时间值统一用**秒（f64）**在前端流转，仅在展示层格式化为 `HH:MM:SS.mmm`

### 5.3 Rust 后端结构（对应已建目录）

```text
src-tauri/src/
├── main.rs              # 入口，调用 lib::run()（保持现状）
├── lib.rs               # 模块声明、Tauri Builder、命令注册、状态注入
├── commands/
│   ├── media.rs         # probe_media / list_keyframes / check_environment
│   ├── cut.rs           # submit_cut_task
│   ├── merge.rs         # submit_merge_task（含参数一致性检测）
│   ├── rotate.rs        # submit_rotate_task
│   └── crop.rs          # submit_crop_task
├── ffmpeg/
│   ├── command.rs       # FFmpeg 命令构建器（核心模块，唯一拼命令的地方）
│   ├── probe.rs         # ffprobe 封装：媒体信息 JSON → MediaInfo、关键帧扫描
│   └── progress.rs      # -progress pipe:1 输出解析 → ProgressEvent
└── task/
    ├── manager.rs       # 队列、状态机、并发控制、Tauri 事件推送
    └── worker.rs        # 子进程启动、stdout 读取循环、取消（kill）、清理
```

约定：

- **所有 FFmpeg 参数只在 `ffmpeg/command.rs` 拼装**，commands 局只做参数校验与任务提交，保证命令行为可集中审计
- 子进程一律用参数数组（`std::process::Command` 的 arg 列表）传递，**禁止 shell 拼接**，天然规避空格/中文路径转义问题
- 命令注册集中在 `lib.rs` 的 `invoke_handler`；模板遗留的 `greet` 命令在阶段 0 移除
- `src-tauri/binaries/` 存放 sidecar 二进制（不进 git，见 6.1）

### 5.4 前后端通信协议

**invoke 命令清单：**

| 命令 | 说明 | 入参 | 出参 |
| --- | --- | --- | --- |
| `check_environment` | 启动时检查 ffmpeg/ffprobe 可用性与版本 | — | `{ ffmpegVersion, ffprobeVersion, ok, message }` |
| `probe_media` | 解析媒体信息 | `input: String` | `MediaInfo` |
| `list_keyframes` | 扫描关键帧时间点 | `input: String` | `Vec<f64>`（秒，升序） |
| `submit_task` | 提交任务（四类统一入口） | `VideoTask` | `taskId: String` |
| `cancel_task` | 取消任务 | `taskId: String` | `bool` |
| `list_tasks` | 查询当前任务列表 | — | `Vec<TaskSnapshot>` |
| `clear_finished_tasks` | 清理已完成/失败/取消记录 | — | `bool` |
| `generate_proxy` | 生成预览代理（内部任务） | `input: String` | `taskId: String` |
| `generate_thumbnails` | 批量生成缩略图（缓存命中即时返回） | `inputs: Vec<String>` | `Vec<FileThumbnail>` |
| `check_merge` / `check_pipeline` | 合并/工作台导出前检测（参数一致性 + 无损判定） | `inputs` / `items: Vec<PipelineItem>` | `MergeComparison` / `PipelineCheck` |
| `cache_usage` / `clear_cache` | 缓存占用统计 / 一键清理（M4-8，清理失败项跳过并计数） | — | `{ proxyBytes, thumbBytes }` / `{ removed, skipped }` |

> M6-8（可选）：`generate_thumbnails` 扩展为 `(input, timeSec)` 对（时间点纳入缓存 key），供片段池显示片段起点帧。

文件/目录选择不做自定义命令，直接用 `tauri-plugin-dialog` 前端调用。

**事件清单（Rust → 前端，payload 均带 `taskId`）：**

| 事件 | 时机 | payload |
| --- | --- | --- |
| `task-status` | 状态机迁移 | `{ taskId, status, error?, outputs? }` |
| `task-progress` | 解析到进度（节流 ~200ms） | `{ taskId, percent, speed, fps?, etaSeconds? }` |
| `task-log` | （调试用）stderr 行 | `{ taskId, line }` |

---

## 6. FFmpeg 集成规范

### 6.1 二进制管理

- **版本策略**：跟踪 gyan.dev release-essentials（历史版本包已下架，无法固定 7.x）。当前已知良好版本 **9.0.1**（2026-09-13 下载），满足 `-display_rotation`（≥6.0）要求；升级后跑通 `check_environment` 与冒烟测试即可 `§6.1`
- 通过 **Tauri sidecar（`bundle.externalBin`）** 分发，文件命名为 target-triple 后缀：

  ```text
  src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe
  src-tauri/binaries/ffprobe-x86_64-pc-windows-msvc.exe
  ```

  `tauri.conf.json` 中配置 `"bundle": { "externalBin": ["binaries/ffmpeg", "binaries/ffprobe"] }`，运行时经 shell 插件的 sidecar API 解析路径（开发环境与打包后均有效）
- `binaries/` 下的 exe **不提交 git**（加入 `.gitignore`），仓库提供脚本/说明按固定版本号下载
- 启动时执行 `check_environment`：跑 `ffmpeg -version` 校验存在性与版本，失败则在 UI 阻塞提示，不进入主界面

### 6.2 命令生成统一规则（command.rs 强制约定）

1. **`-map 0`**：所有 copy 类命令显式保留全部流，禁止依赖默认流选择（默认会丢弃多余音轨/字幕/封面）
2. **音频不转码**：仅视频处理时音频一律 `-c:a copy`
3. **进度**：所有命令带 `-progress pipe:1 -nostats`，从 stdout 读结构化进度；**禁止解析 stderr 的 `time=` 行**
4. **日志**：`-hide_banner -loglevel error`，stderr 逐行收集进任务日志（失败时展示给用户）
5. **覆盖**：输出带 `-y`；但覆盖冲突在前端已做确认，command 层默认允许覆盖
6. **时间戳**：剪切命令带 `-avoid_negative_ts make_zero`
7. **过滤链**：`-vf "..."` 作为单个参数传递（参数数组模式下无需额外转义）
8. 全局附加以便排错：`-stats_period 0.2`（进度上报频率）
9. **隐藏子进程窗口**：Rust 侧直接 spawn ffmpeg/ffprobe 前**必须**调 `command::spawn_hidden`（`CREATE_NO_WINDOW`）——主程序 release 是 GUI 子系统，不处理则每次调用闪 CMD 窗口（经 shell 插件的 sidecar 调用插件已内置处理）

### 6.3 命令模板

**① 极速剪切（stream copy）**

```bash
ffmpeg -hide_banner -nostats -progress pipe:1 -stats_period 0.2 \
  -ss <start> -i <input> -t <duration> \
  -map 0 -c copy -avoid_negative_ts make_zero \
  -y <output>
```

要点：`-ss` 放在 `-i` **之前**（输入侧 seek，直接跳到 ≤ start 的关键帧，快且正确）；用 `-t`（时长）而非 `-to`（绝对时间）避免输入侧 seek 后时间基准歧义。

**② 精确剪切（重编码）**

```bash
ffmpeg -hide_banner -nostats -progress pipe:1 \
  -i <input> -ss <start> -t <duration> \
  -map 0:v:0 -map 0:a \
  -vf <可选: 旋转/裁剪滤镜, 无则不加> \
  -c:v <encoder: h264_nvenc | h264_qsv | h264_amf | libx264> \
  <质量参数: -crf/-cq/-q> \
  -c:a copy \
  -y <output>
```

要点：`-ss` 放在 `-i` **之后**（输出侧 seek，解码到帧后精确开始）。多音轨场景精确模式只保留视频 + 全部音频；字幕流无法与重编码视频安全对齐，默认丢弃并在 UI 提示。

**③ 合并（concat demuxer，stream copy）**

```bash
ffmpeg -hide_banner -nostats -progress pipe:1 \
  -f concat -safe 0 -fflags +genpts \
  -i <concat_list.txt> \
  -map 0 -c copy \
  -y <output>
```

`concat_list.txt` 要求（由 Rust 生成，UTF-8 编码）：

```text
file 'D:/videos/第一段.mp4'
file 'D:/videos/second part.mp4'
```

路径用正斜杠 + 单引号包裹，内容中的单引号按 concat 协议双写转义（`'` → `'\''`）。

**④ 合并-参数不一致（重编码统一）**

以基准文件的参数生成统一转码命令（逐个转码为中间文件后再 concat，或 concat filter 拼接；**采用前者**：单文件转码可并行、可复用进度、失败可重试）：

```bash
ffmpeg -i <input_i> -map 0:v:0 -map 0:a:0 \
  -vf "scale=<W>:<H>:flags=lanczos,fps=<fps>,format=<pix_fmt>" \
  -c:v <encoder> <质量参数> -c:a aac -b:a 192k \
  -video_track_timescale <基准 time_base 分母> \
  -y <normalized_i.mp4>
```

> 归一化输出同样要对齐基准 timescale，否则归一化后的片段与未归一化片段
> 仍会在 concat 环节错乱时间戳。

**⑤ 旋转（元数据级，无损）**

```bash
ffmpeg -hide_banner -nostats -progress pipe:1 \
  -display_rotation <90|180|270> -i <input> \
  -map 0 -c copy \
  -y <output>
```

注意 `-display_rotation` 是**输入选项**，必须放在 `-i` 之前。翻转用 `-display_hflip` / `-display_vflip`（同为输入选项）。

**⑥ 旋转（重编码，高级选项）**

```bash
ffmpeg -i <input> -map 0:v:0 -map 0:a \
  -vf "transpose=<0..3| hflip/vflip 组合>" \
  -c:v <encoder> <质量参数> -c:a copy \
  -y <output>
```

**⑦ 局部放大**

```bash
ffmpeg -i <input> -map 0:v:0 -map 0:a \
  -vf "crop=<w>:<h>:<x>:<y>,scale=<outW>:<outH>:flags=lanczos" \
  -c:v <encoder> <质量参数> -c:a copy \
  -y <output>
```

约束：`x+w ≤ 源宽`、`y+h ≤ 源高`（偶数对齐由 command.rs 负责取整）；crop 参数为 0 宽高时禁止提交。

**⑧ 代理预览生成**

```bash
ffmpeg -i <input> -map 0:v:0 -map 0:a:0 \
  -vf "scale=-2:720" -c:v libx264 -preset veryfast -crf 23 \
  -c:a aac -b:a 128k \
  -y <cache_dir>/<hash>.proxy.mp4
```

代理文件放应用缓存目录（按源文件路径 hash 命名），不污染用户输出目录；已有代理直接复用。

**⑨ 工作台无损片段（剪切 + 元数据旋转一步完成）**

```bash
ffmpeg -hide_banner -nostats -progress pipe:1 -stats_period 0.2 \
  -display_rotation <abs_deg> [-display_hflip] [-display_vflip] \
  [-ss <start>] -i <input> [-t <duration>] \
  -map 0 -c copy -avoid_negative_ts make_zero \
  -y <intermediate.mp4>
```

要点：`-display_rotation/hflip/vflip` 与 `-ss` 同为输入选项，可共存于一条 copy 命令——
"剪一段 + 转 90°"无需两次处理、仍是无损。`-display_rotation` 为**覆盖语义**（写入绝对角度，
与源矩阵无关）。segment 为空（整段保留）时省略 `-ss/-t`。

**⑩ 工作台重编码片段（精确剪切 + 像素变换 + 裁剪放大，单次编码）**

```bash
ffmpeg -hide_banner -nostats -progress pipe:1 \
  -display_rotation 0 -i <input> [-ss <start>] [-t <duration>] \
  -map 0:v:0 -map 0:a \
  -vf "[hflip,][vflip,][transpose=N,][crop=w:h:x:y,]scale=<outW>:<outH>:flags=lanczos" \
  -c:v <encoder> <质量参数> -c:a copy \
  -video_track_timescale <基准段 timescale> \
  -y <intermediate.mp4>
```

要点：`-display_rotation 0` 剥离源方向矩阵，旋转全部烘进像素（防双重旋转）；
滤镜顺序固定为 **翻转（源像素空间）→ 旋转 → 裁剪（显示空间）→ 缩放**——
裁剪矩形按用户所见（显示空间）定义，90°/270° 时以交换后的宽高做边界校验。
各子段可选，链为空时不加 `-vf`。
`-video_track_timescale`（取第 1 个片段的源 video time_base 分母）必须设置：
libx264 默认选 1/15360，与 copy 片段的 1/60000 不一致时，concat demuxer 的
copy 拼接会把后续段的时间戳压缩错乱（实测 23s 被压成 2.1s）。

### 6.4 进度解析协议（progress.rs）

`-progress pipe:1` 每 `stats_period` 输出一组 `key=value`：

```text
frame=1234
fps=180.0
out_time_us=41234000
speed=3.2x
progress=continue
...
progress=end
```

- 百分比 = `out_time_us / 1e6 ÷ 总时长`（总时长来自 probe；剪切任务用区间时长而非全片时长）
- `speed` 透传给 UI；ETA = 剩余时长 ÷ speed
- 兼容性备注：旧版 FFmpeg 的 `out_time_ms` 实际是微单位（历史 bug），统一解析 `out_time_us`，缺失时回退 `out_time_ms` 并按微秒处理
- `progress=end` 视为正常退出信号，结合进程 exit code 判定成败

### 6.5 ffprobe 规范（probe.rs）

**媒体信息**（启动剪切/合并/旋转/放大前必调）：

```bash
ffprobe -v error -print_format json -show_format -show_streams -show_chapters <input>
```

解析映射：`format.duration/size/bit_rate` → MediaInfo 顶层；每个 `stream` 按 `codec_type` 分流到视频/音频/字幕结构体；视频流的旋转信息从 side_data `displaymatrix` 读取。

**关键帧扫描**：

```bash
ffprobe -v error -select_streams v:0 -skip_frame nokey \
  -show_entries frame=pts_time -of csv=p=0 <input>
```

- 该命令只解码关键帧，速度远快于全量扫描，但 1 小时以上视频仍需数秒 → 作为异步任务执行，UI 显示扫描进度
- 修复 `pts_time=N/A` 行跳过；时间基换算为秒（f64）

---

## 7. 数据模型

Rust 端核心类型（`lib.rs` 集中导出，commands/ffmpeg/task 共用；TS 端在 `src/types/` 保持字段一一对应）：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub container: String,        // "mov,mp4,m4a,..."
    pub duration_sec: f64,
    pub size_bytes: u64,
    pub bitrate: Option<u64>,
    pub video: VideoStreamInfo,
    pub audio: Vec<AudioStreamInfo>,
    pub subtitle_count: u32,
    pub rotation: Option<i32>,    // 来自 displaymatrix
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStreamInfo {
    pub codec: String,            // h264 / hevc / av1 / vp9 / mpeg4 ...
    pub profile: Option<String>,
    pub width: u32,
    pub height: u32,
    pub pix_fmt: String,          // yuv420p / yuv420p10le ...
    pub frame_rate: f64,
    pub bitrate: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub start_sec: f64,
    pub end_sec: f64,             // 开区间约定: [start, end)
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CutMode { Fast, Precise }

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QualityPreset { High, Balanced, Small }

/// 工作台单项：裁剪矩形为**显示空间**像素坐标（用户所见画面，含旋转效果）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropRect { pub x: u32, pub y: u32, pub width: u32, pub height: u32 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineItem {
    pub input: String,
    pub segment: Option<Segment>,   // None = 整段保留
    pub rotate_deg: i32,            // 相对源方向的增量（0/90/180/270，正=顺时针）
    pub hflip: bool,
    pub vflip: bool,
    pub crop: Option<CropRect>,     // None = 不裁剪
    pub out_width: Option<u32>,     // 裁剪后放大输出尺寸，None = 显示分辨率
    pub out_height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VideoTask {
    Cut { input: String, segments: Vec<Segment>, output_dir: String, mode: CutMode },
    Merge { inputs: Vec<String>, output: String, force_transcode: bool },
    // rotate_deg 为相对源方向的增量，翻转独立叠加；无损路径换算绝对显示矩阵
    Rotate { input: String, rotate_deg: i32, hflip: bool, vflip: bool, output: String, transcode: bool, quality: QualityPreset },
    CropZoom { input: String, x: u32, y: u32, width: u32, height: u32, out_width: Option<u32>, out_height: Option<u32>, quality: QualityPreset, output: String },
    // 工作台流水线：逐片段处理 → 定向统一 → concat（§3.8）
    Pipeline { items: Vec<PipelineItem>, output: String, quality: QualityPreset },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus { Pending, Probing, Running, Completed, Failed, Cancelled }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSnapshot {
    pub id: String,
    pub kind: String,             // cut / merge / rotate / crop_zoom / proxy
    pub status: TaskStatus,
    pub label: String,            // 展示名，如 "剪切 xxx.mp4 → part_001.mp4"
    pub progress: Option<f64>,    // 0..1
    pub error: Option<String>,
    pub outputs: Vec<String>,
}
```

关键帧数据量可能很大（长视频数万个点），不进 `MediaInfo`，单独走 `list_keyframes`。

---

## 8. 任务系统设计

### 8.1 状态机

```text
Pending ──▶ Probing ──▶ Running ──▶ Completed
   │           │           │
   │           ▼           ├──▶ Failed   (ffmpeg 非零退出 / probe 失败 / 磁盘不足)
   │        (直接失败)     └──▶ Cancelled (用户取消)
   └──▶ Cancelled (排队中被取消)
```

- **Probing**：任务先跑 ffprobe，失败立即进 Failed（如文件损坏）
- **Running**：启动 ffmpeg 主命令；进度事件按 ~200ms 节流后 emit
- 剪切多片段 = 一个任务内串行执行 N 个 ffmpeg 子进程，进度按 (已完成片段 + 当前片段进度)/N 汇总

### 8.2 实现要点（manager.rs / worker.rs）

- `TaskManager` 持有 `Mutex<HashMap<TaskId, TaskHandle>>` + pending 队列，通过 `tauri::State` 注入；任务句柄存子进程 PID + 取消信号
- **取消**：向子进程发 kill（Windows 下 kill 即终止），随后**删除该任务已产生的 `.part` 半成品**；任务内最后一个子进程退出后状态置 Cancelled
- **半成品保护**：所有输出先写 `<name>.part.<原扩展名>`（如 `xxx.part.mp4`——保留真实扩展名供 ffmpeg 推断封装格式），ffmpeg 正常退出后 rename 为最终文件名——保证输出目录永远没有"看起来完整实际损坏"的文件
- **并发控制**：全局并发上限 **2**（stream copy 是 IO 密集，重编码是 CPU/GPU 密集，统一限 2 足够；代理生成任务优先级最低，排队尾）
- **磁盘空间预检**：Running 前按源文件大小估算输出体积（copy ≈ 源；编码按码率估算），可用空间不足直接 Failed 并提示
- 事件通过 `app.emit()` 广播；前端 `TaskProgress` 组件订阅 `task-status` / `task-progress` 渲染

### 8.3 输出命名

- 剪切：`<源文件名>_part_001.<同源扩展名>`；合并：用户指定；旋转/放大：`<源文件名>_rotated.<ext>` / `<源文件名>_zoomed.<ext>`
- 冲突时由前端弹确认（覆盖 / 重命名 / 取消）；用户命名的导出**默认不加时间戳，仅当目标已存在同名文件时自动追加**（M7-4，决策 #19）

---

## 9. UI / UX 设计

### 9.1 窗口与布局

- `tauri.conf.json` 窗口需调整：**1280×800，最小 1024×680**（当前 800×600 放不下时间轴）
- 深色主题为主（视频工具惯例），Tailwind CSS 4 CSS-first 配置（`@theme` 定义色板），**无 tailwind.config 文件**
- **主题色切换（M4-8）**：强调色提供**预设**切换（默认 signal 绿 + 3~4 个备选），实现为运行时覆写 `:root` 的 `--color-signal`；signal（无损/就绪）与 warn（重编码）是**语义色**，warn 永不跟随主题色，预设色相避开 warn 琥珀以免混淆；`::selection` 与代码中硬编码的强调色（现有 `accent-[#4cc38a]`）须一并改为跟随 token。深浅主题切换不在 M4-8 范围，另行规划

### 9.2 页面流转

```text
Workbench（落地页）──右上角导航──▶ Cut / Merge / Editor(Rotate|Crop)
  ▲                                    │
  └──────────── 返回 ──────────────────┘
Workbench ──右上角──▶ History / Settings
（无路由库，顶层 state 切换；任务提交后可留在页面，由全局任务面板反馈；
 拖入视频一律落在当前页面，不再按数量跨页路由）
```

### 9.3 落地页 = 工作台（原 Home 已移除，v0.3）

- 应用启动直接进入工作台；品牌标识 + FFmpeg 环境徽标（原主页头部组件迁移至此）位于头部左侧
- 头部右上角为功能导航：剪切 / 合并 / 旋转 / 局部放大（图标+文字），分隔线后为历史记录 / 设置（图标按钮）
- 其余页面返回按钮统一指回工作台

### 9.4 Cut（最核心页面）

```text
┌──────────────────────────────────────────────┐
│  视频预览（VideoPlayer）          [模式: 极速▾] │
├──────────────────────────────────────────────┤
│  00:00:00 ──●━━━[========●──────]━━━━ 01:25:30│
│              ↑入点(吸附KF)  ↑出点              │
│  [开始时间 00:12:31.125] [结束时间 00:35:20.452]│
│  [+ 添加片段]                                 │
│  片段1  00:00:00 → 00:05:20   [🗑]            │
│  片段2  00:10:20 → 00:20:10   [🗑]            │
│  输出目录: D:\output  [更改]                   │
│                    [开始剪切]  ← 徽标: 无损     │
└──────────────────────────────────────────────┘
```

- 时间轴展示关键帧刻度（来自 `list_keyframes`）；入点手柄吸附最近关键帧，手柄旁 tooltip 显示实际落点时间
- "精确剪切"切换时出现橙色提示：将重编码、速度慢、字幕流将丢弃
- 模式徽标规则：极速=绿色"无损"，精确=橙色"重编码"

### 9.5 Merge

- 文件列表（拖拽排序手柄 ☰、删除，排序用指针事件实现——决策 #18）；每项显示探测摘要（编码/分辨率/帧率）
- 底部检测面板：全部一致 → 绿色 ✓ 清单 + "可无损合并"；不一致 → 橙色 ⚠ + 差异项高亮 + [自动统一后合并] [取消]
- "自动统一"需二次确认，显示目标参数（默认=第一个文件参数）

### 9.6 Editor（Rotate / Crop 共用）

- 左侧大预览 + 右侧操作面板
- Rotate：五个方向按钮实时用 CSS transform 预览（纯前端预览，不生成视频），提交时才走 FFmpeg；显示"元数据级无损"
- Crop：预览上叠加可拖拽/缩放的选区矩形（经 VideoPlayer 的 overlay 插槽渲染：视频之上、控制条之下，不拦截播放控制），旁有 x/y/w/h 数值输入与比例锁定；显示"将重编码"徽标 + 质量档位选择
- 时间轴不在此页（旋转/放大作用于全片，v1 不支持区间旋转/放大）

### 9.7 TaskProgress（全局）

- 右下角可折叠抽屉；每任务一行：标签 + 进度条 + 百分比 + 速度 + 取消按钮
- 失败时展开显示 ffmpeg stderr 最后若干行 + "复制日志"按钮
- Completed 项提供"打开所在文件夹"（`tauri-plugin-opener`）

### 9.8 Workbench（工作台，v0.3 = 2.0 布局）

页面自上而下四区 + 页脚（内容宽度放宽至 max-w-6xl）：

```text
┌────────────────────────────────────────────────────────┐
│ ① 成品预览（三态复用）                  [▶] 0:42/1:03  │ flex-1
├────────────────────────────────────────────────────────┤
│ ② 合成时间轴：刻度+片段块+播放头（块宽∝时长，拖拽排序）  │ ~72px
├────────────────────────────────────────────────────────┤
│ ③ 片段池：片段卡横排（缩略图/来源/区间/时长/徽标）       │ ~110px
├────────────────────────────────────────────────────────┤
│ ④ 素材卡片：首帧缩略图卡（拖拽排序/点击剪切）[+添加]     │ ~120px
├────────────────────────────────────────────────────────┤
│ 页脚：质量档位 · 输出文件名 · 检测汇总一行 · [合成导出]   │
└────────────────────────────────────────────────────────┘
```

- **① 成品预览区（三态复用，避免纵向空间再开一块）**，顶部面包屑标识当前模式：
  - **成品模式**（默认）：虚拟连播时间轴片段序列；双 `<video>` 轮换预加载下一段的源以隐藏切换延迟；播放头与②双向联动
  - **源剪切模式**：点素材卡进入；播放该源 + `Timeline` 双柄选区间 + 关键帧吸附（受设置开关控制）+「添加为片段」（入池并追加时间轴末尾）
  - **片段加工模式**：点池卡或时间轴块进入；播放该片段 + 旋转（复用 RotateControls）/ 放大（显示空间框选，修改旋转清空选区）
- **② 合成时间轴（ClipTimeline 组件）**：片段块显示来源/时长/无损·重编码 mini 徽标（hover 原因）；空白处点击 seek；块拖拽排序、从池拖入、拖回池 = 移出成品
- **③ 片段池**：按创建顺序排列（不提供池内排序——顺序语义只在时间轴）；快捷「加入时间轴末尾」+ 拖拽入轴；删除片段
- **④ 素材卡片**：点击进入源剪切模式；删除素材联动删除其全部片段（有片段时二次确认）
- 预览变换沿用 1.0 实现：外层容器按显示宽高比（90°/270° 时交换）布局，内层视频盒反向旋转回源比例，
  裁剪叠加层贴外层——坐标即所见即所得
- 检测面板压缩为页脚一行汇总（全程无损 ✓ / N 段重编码 ⚠ + 参数不一致自动统一提示），细节由块/卡徽标 hover 承载
- 底部：质量档位 + 输出文件名 + 导出按钮（全程无损=signal 徽标，否则 warn 徽标）
- 拖拽排序与池↔时间轴拖拽一律用指针事件实现（HTML5 DnD 在 Tauri Windows 下被文件拖拽通道吞掉——决策 #18）；跨容器来源由按下起点所属容器判定
- **落地页头部（§9.3）**：品牌标识 + FFmpeg 环境徽标居左，右上角功能导航（剪切/合并/旋转/放大 + 历史/设置）；无返回按钮

### 9.9 设置（M4-1 基础 + M4-8 二期）

- 页内为"标题+说明 | 控件"的行式布局，**改动即保存**（write-through，无显式保存按钮）
- 配置项（定义见 §12）：
  - **默认输出目录**：目录选择器 + 清除按钮。输出位置规则：设置了默认目录则**所有页面**输出到该目录，否则跟随源文件所在目录（剪切/合并/旋转/放大/工作台一致）
  - **默认剪切模式**（极速/精确）与**入点吸附关键帧**（开关）→ 剪切页初始值
  - **代理预览**：自动（按格式支持性按需生成）/ 始终代理（4K 预览卡顿时用）/ 关闭（不生成代理；不支持的格式显示占位提示条，导出不受影响）
  - **编码器**：自动（按位深选 H.264/HEVC 并探测 GPU，失败回退软件）或锁定指定编码器；经任务载荷下发，Rust 侧 `effective_encoder` 校验后采用，非法值回退自动
  - **默认质量档位** → Editor（旋转重编码/放大）与工作台质量选择的初始值
  - **主题色**（M4-8）：强调色预设单选（§9.1），即时生效并持久化
  - **任务浮层自动关闭**（M7-5）：秒数输入（0 = 不关闭，默认 0），终态任务浮层到时自动消失
- **缓存管理区**（M4-8）：显示代理文件 + 缩略图占用（`cache_usage`），「清理缓存」按钮（`clear_cache`，ask 二次确认，被占用文件跳过并提示数量）；清理后刷新占用显示
- **页尾静态区**（M4-8）：重置全部设置（ask 二次确认 → 写回默认值）；关于——应用版本、FFmpeg/ffprobe 版本、"所有处理在本机完成"声明、内置 FFmpeg 构建的 GPL 许可注记（§11）
- **关闭窗口确认**（M4-8，§13 既有承诺的落地）：有未完成任务（Pending/Probing/Running）时 CloseRequested → 确认对话框；无任务直接退出。固定行为，不设开关

### 9.10 历史记录（M4-2）

- Home"历史记录"入口；数据由 **Rust 侧任务终态落盘**（`app_data_dir/history.json`，上限 200 条，原子写），页面只读
- 行内容：状态徽标（完成/失败/已取消）+ 类型标签（剪切/合并/旋转/局部放大/工作台）+ 任务标签 + 完成时间与耗时；失败行展开 stderr 尾部
- **重新定位输出文件**：每个产物是可点标签 → 资源管理器定位该文件（`tauri-plugin-opener`）
- 头部"清空记录"（对话框二次确认）；内部任务（代理预览）不入库

---

## 10. 格式支持矩阵

**处理能力**（交给 FFmpeg，目标是全支持）：容器 MP4 / MOV / MKV / AVI / WebM / M4V / TS；视频编码 H.264 / H.265 / AV1 / VP9 / MPEG-4 Part 2 / MPEG-2；音频 AAC / MP3 / Opus / FLAC / AC-3 / E-AC-3。

**预览能力**（WebView2 `<video>`，决定是否生成代理）：

| 情况 | 预览 | 策略 |
| --- | --- | --- |
| MP4/MOV/MKV + H.264/VP9/AV1 + AAC/MP3/Opus/FLAC（≤1080p yuv420p） | ✅ 直接播放 | 不生成代理 |
| H.265/HEVC | ⚠ 依赖系统 HEVC 扩展 | 探测失败 → 代理 |
| 10bit / HDR（yuv420p10le 等） | ⚠ 多数不可播 | 统一 → 代理 |
| AVI / MPEG-2 / 其他老编码 | ❌ | → 代理 |
| AC-3 / E-AC-3 音频 | ⚠ 依赖系统解码器 | 音频探测失败 → 代理 |
| 4K 及以上 | ✅ 但可能卡顿 | 提供"始终用代理预览"设置 |

代理判定逻辑集中在一次 ffprobe 结果上实现：`needsProxy = 容器/视频编码/像素格式/音频编码 任一不被 WebView2 支持或用户开启强制代理`。

**重编码注意**：10bit/HDR 源走重编码路径时，硬件编码器对 10bit/HDR 支持参差，command.rs 需按 pix_fmt 选择编码器与参数（10bit 优先 `hevc_*` 硬编或 libx265）；VFR（可变帧率）源在重编码路径会被 CFR 化，需在 UI 提示（copy 路径不受影响）。

---

## 11. 打包与分发

- 目标平台：**Windows 10/11 x64**；安装包**只发 NSIS**（决策 #21：MSI 本地化能力弱、维护两套安装器无收益），`pnpm tauri build` 产出；NSIS 界面语言中文（`languages: ["SimpChinese"]`，M7-8）
- FFmpeg 走 sidecar 随安装包分发（见 6.1），用户无需自行安装
- **许可证注意**：内置的 gyan.dev 构建包含 libx264（GPL）。个人使用/内部分发无碍；**若未来公开发布或商用，需评估 GPL 合规**（ffmpeg.exe 作为独立进程与主程序分离，属于边缘地带，建议届时咨询或改用 LGPL 构建 + 仅硬件编码器）
- 代码签名：第一阶段不做，分发自用；对外分发前需购买证书避免 SmartScreen 拦截
- 应用标识：`com.hippo.video-cut`（已配置）

---

## 12. 配置与持久化

- 使用 `tauri-plugin-store`（JSON 文件），**不引入 SQLite**（v1 无关系型数据需求）
- v1 配置项：默认输出目录、默认剪切模式（极速/精确）、关键帧吸附开关、代理预览开关/强制代理、编码器选择（自动/锁定）、质量档位；后续追加：主题色（`accent`，M4-8）、任务浮层自动关闭秒数（`toastAutoCloseSec`，默认 0=不关闭，M7-5）。导出名时间戳**不是**配置项——"同名才追加"为固定行为（决策 #19）
- （第四阶段）历史记录同样以 JSON 追加存储即可
- 实现（M4-1）：`settings.json`（app_config_dir）单键 `settings` 持有整个 `AppSettings`；读取时逐字段校验，非法/缺失回退默认值；App 层启动时一次加载，页面按导航条件挂载即拿到最终值，设置页改动即时回写
- 实现（M4-2）：任务历史由 **Rust 侧终态回调**落盘 `app_data_dir/history.json`（`TaskManager::set_on_terminal`，lib.rs setup 接线），记录 id/kind/label/status/outputs/error/提交·开始·结束时间；上限 200 条、`.tmp`+rename 原子写、终态防重（取消与执行器并发只记首次）；`list_history`/`clear_history` 命令供历史页读取

### 12.1 日志系统（M4-7，提前实施——为工作台 2.0 等后续工程兜底）

**目标**：任何一次"导出失败 / 结果不对"都能只靠日志回查定位，不需要现场复现（M5 排查 concat 时间戳错乱时全靠临时加日志 + 无头复现，代价过高）。

**技术选型**：Rust `log` 门面 + `fern` 实现（轻量、同步写、无异步运行时依赖；不引入 tauri-plugin-log，少一个插件依赖）。前端不直接接日志框架，错误经 invoke `append_frontend_log(level, message)` 转发写入同一份文件。

**落盘**：

- 位置：`app_log_dir()/video-cut.YYYY-MM-DD.log`（app_log_dir 在 Windows 已含 `logs` 目录，即 `%LOCALAPPDATA%\<bundle-id>\logs\`）
- 滚动：按天一个文件，启动时清理 7 天前的旧日志
- 格式：单行 UTF-8，`2026-09-13 15:48:08.123 [INFO] [pipeline] ...`
- 级别：release 默认 `info`，debug 构建默认 `debug`；环境变量 `VIDEO_CUT_LOG=debug|trace` 可覆盖；写文件为同步追加（事件频率低，无性能顾虑）

**记录内容（事件清单）**：

| 事件 | 级别 | 内容 |
| --- | --- | --- |
| 应用启动 | info | 应用版本、FFmpeg/ffprobe 版本与路径 |
| 任务提交 | info | 任务类型 + 完整参数载荷（即现有 `[pipeline] item i: ...` 扩展到全部任务类型，替代 eprintln） |
| ffmpeg 执行 | debug | 完整命令行 argv |
| 任务结束 | info | 成功：输出路径 + 耗时；失败：退出码 + stderr 尾部全文 |
| probe | debug | 容器/编解码摘要（不落 probe 原始 JSON） |
| 前端错误 | error | window.onerror / unhandledrejection 捕获后转发 |

**边界与安全**：只记录文件路径不记录内容；路径含用户名属预期；任务取消与失败都落盘。

**UI 入口**：任务面板失败行补上 DESIGN 欠的"复制日志"按钮（复制该任务 stderr 尾部）；面板顶部加"打开日志文件夹"（`tauri-plugin-opener`）。

---

## 13. 错误处理与边界情况

| 场景 | 处理 |
| --- | --- |
| ffmpeg/ffprobe 缺失或版本过旧 | 启动 `check_environment` 阻塞提示，给出修复指引 |
| 输入文件被占用/无读权限 | probe 阶段即失败，错误信息透传 |
| 输出磁盘空间不足 | 任务前置检查，Failed + 明确提示 |
| 中文/空格/特殊字符路径 | 子进程参数数组传递天然支持；concat 列表按 6.3③ 转义 |
| 源文件无视频流（纯音频） | probe 后拒绝提交剪切/旋转/放大任务 |
| 关键帧扫描慢（长视频） | 异步任务 + 进度提示；未完成前允许数字输入剪切（不吸附） |
| 提示后用户仍选择非吸附入点 | 剪切结果自动落在关键帧，UI 事先展示实际落点 |
| ffmpeg 非零退出 | stderr 尾部日志入 TaskSnapshot.error；`.part` 清理 |
| 应用退出时有运行中任务 | 窗口关闭确认提示；进程退出随主进程 kill ffmpeg |
| 0 宽/0 高/越界 crop | command.rs 提交前校验，拒绝任务 |
| 同名输出冲突 | 前端确认覆盖/重命名 |
| 秒级精度浮点误差 | 时间统一 f64 秒，展示层格式化；segment 校验 end > start |

---

## 14. 开发路线图

> 目录骨架已建好（2026-09-13）。每阶段以"端到端可运行"为完成标准。

**阶段 0：基建**
- 移除模板 `greet`；声明 `commands/ffmpeg/task` 模块树
- 接入 sidecar ffmpeg/ffprobe + `check_environment`
- 接入 `tauri-plugin-dialog`、`tauri-plugin-store`；调整窗口尺寸
- 打通 invoke/事件通路，前端 services/types 骨架

**阶段 1：剪切垂直切片（MVP 核心链路）**
- probe_media → 信息面板 → `<video>` 预览（含代理生成判定）
- 关键帧扫描 + Timeline 区间选择（吸附）
- 极速剪切（多片段）→ 进度 → 输出 `.part` → rename
- 完成后即是一个可日常使用的工具

**阶段 2：合并**
- 多文件探测与参数一致性检测面板
- 无损合并（concat demuxer）；自动统一重编码路径
- 列表拖拽排序

**阶段 3：旋转 + 局部放大**
- 元数据级旋转（`-display_rotation`）+ 重编码旋转高级项
- Crop 框选交互 + 硬件编码器探测/回退 + 质量档位
- 精确剪切（重编码路径）顺带落地（复用编码器基建）

**阶段 3.5：工作台（流水线组合，§3.8）**
- 多文件逐段剪切/旋转/放大配置，显示空间裁剪预览
- plan_items 无损优先计划 + 检测面板 + 定向参数统一
- 单任务串行子步骤（进度加权、取消清理中间文件）

**阶段 4：体验增强**
- 任务历史记录、最近文件（批量处理并入工作台 2.0，决策 #20）
- 快捷键、设置页完善（M4-8 二期：主题色/缓存管理/关闭确认等）、深浅主题切换
- （远期候选）smart cut：精确剪切仅重编码切点附近 GOP，其余 stream copy

**阶段 5：工作台 2.0（多片段与合成时间轴，v0.3）**
- 素材/片段/时间轴三层数据模型；素材卡片 + 片段池 + ClipTimeline 组件
- 三态预览区：源剪切（双柄+吸附）/ 片段加工 / 成品虚拟连播
- 导出链路 timeline → PipelineItem[]（后端无必须改动，同源多片段 = 多条 item）
- （可选增强）片段起点帧缩略图、时间轴块边缘拖动微调修剪

---

## 15. 决策记录

| # | 决策 | 理由 |
| --- | --- | --- |
| 1 | 不使用 tailwind.config.ts | Tailwind v4 CSS-first（`@theme`），项目经 `@tailwindcss/vite` 接入 |
| 2 | 配置存储用 JSON（tauri-plugin-store），不用 SQLite | v1 无关系型数据；降低复杂度 |
| 3 | 预览用 `<video>` + 代理文件，第一版不集成 libmpv | WebView2 原生覆盖主流格式，代理兜底长尾；mpv 集成成本高，留待真实兼容性问题出现再评估 |
| 4 | FFmpeg 9.x（gyan.dev release-essentials）以 sidecar 分发 | `-display_rotation` 需 ≥6.0；sidecar 解决打包路径与版本一致性 |
| 5 | 所有 copy 类命令强制 `-map 0` | FFmpeg 默认流选择会丢弃多音轨/字幕，违背无损承诺 |
| 6 | 进度用 `-progress pipe:1`，禁止解析 stderr | 结构化输出可靠；stderr 仅作错误日志 |
| 7 | 剪切 `-ss` 置于 `-i` 前（copy）/ `-i` 后（重编码） | 输入侧 seek 供 copy 快速对齐关键帧；输出侧 seek 供精确到帧 |
| 8 | 音频在视频类重编码中一律 copy | 避免不必要的音质损失（转码统一场景除外） |
| 9 | 任务全局并发上限 2，输出先写 `.part` | IO/编码资源均衡；保证输出目录无损坏文件 |
| 10 | 合并重编码采用"逐个转中间文件再 concat" | 可并行、可复用进度、失败可重试，优于 concat filter 单命令 |
| 11 | UI 无路由库，顶层 state 切换 | 四页面规模不需要 router；后续需要再引入 |
| 12 | 时间值全程 f64 秒 | 避免 ms/int 转换误差；展示层统一格式化 |
| 13 | 工作台顺序语义只在合成时间轴，片段池不做独立排序 | 两处排序语义冲突会互相覆盖；池按创建序仅作库存视图 |
| 14 | 成品预览用 `<video>` 虚拟连播（近似），不做渲染预览 | 零额外渲染成本；边界 ±1 帧与切换停顿可接受（双 video 预加载 + 代理缓解），导出以 FFmpeg 输出为准 |
| 15 | 同源多片段 = 多条 PipelineItem，后端不动 | 现有 plan_items/临时令牌按条目隔离，语义已正确；重构收敛在前端 |
| 16 | 主题色只提供预设，warn 语义色固定；亮色主题另行规划 | signal/warn 是语义色不是装饰色，预设保证对比度与"无损=signal"的可读性；任意取色会产生不可读组合 |
| 17 | 关闭窗口确认是固定行为，不设开关 | 只在有未完成任务时拦截，无任务不打扰；开关是伪需求 |
| 18 | 窗口内部拖拽排序一律指针事件实现，禁用 HTML5 DnD | Tauri 在 Windows 默认接管 WebView2 拖拽通道处理文件拖入，HTML5 DnD 事件被吞（合并/工作台排序失效实测）；指针方案与文件拖入互不干扰 |
| 19 | 导出名"同名才追加时间戳"为固定行为，不设开关 | 用户预期干净文件名；冲突时自动追加仍兜底防覆盖；开关是伪需求（同 #17 逻辑） |
| 20 | 批量处理（原 M4-4）并入工作台 2.0，不单独立项 | 工作台即多文件流水线；批量 = 多选素材一键建片段/批量应用变换，独立页面与之重叠 |
| 21 | 安装包只发 NSIS，砍掉 MSI | MSI（WiX）本地化能力弱，维护两套安装器无收益；NSIS 支持中文安装界面 |
