# video-cut 设计文档

> 版本：v0.2 · 更新日期：2026-09-13 · 状态：定稿（待实现）
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
│   ├── VideoPlayer/     # <video> 封装：播放/暂停/逐帧步进/时间上报/代理播放
│   ├── Timeline/        # 时间轴：区间双手柄、关键帧刻度与吸附、片段标记
│   ├── CutEditor/       # 剪切页编辑区：模式选择、片段列表、时间输入
│   ├── MergeEditor/     # 合并页：文件列表拖拽排序、参数检测面板
│   ├── RotateEditor/    # 旋转页：角度/翻转选择与预览
│   ├── CropEditor/      # 放大页：画面框选矩形、比例锁定、数值微调
│   └── TaskProgress/    # 全局任务面板：进度/速度/取消/失败原因
├── pages/
│   ├── Home/            # 入口：四大功能卡片 + 打开视频 + 最近文件
│   ├── Cut/             # 剪切页 = VideoPlayer + Timeline + CutEditor
│   ├── Merge/           # 合并页
│   └── Editor/          # 旋转/放大共用编辑页（按参数切换 Rotate/Crop 编辑器）
├── services/
│   └── tauri.ts         # invoke 封装 + 事件订阅，全部类型安全，UI 不直接碰 @tauri-apps/api
└── types/               # 与 Rust 数据模型对齐的 TS 类型定义
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
  -y <normalized_i.mp4>
```

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
pub enum Rotation { Cw90, Ccw90, R180, HFlip, VFlip }

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QualityPreset { High, Balanced, Small }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VideoTask {
    Cut { input: String, segments: Vec<Segment>, output_dir: String, mode: CutMode },
    Merge { inputs: Vec<String>, output: String, force_transcode: bool },
    Rotate { input: String, rotation: Rotation, output: String, transcode: bool },
    CropZoom { input: String, x: u32, y: u32, width: u32, height: u32, out_width: Option<u32>, out_height: Option<u32>, quality: QualityPreset, output: String },
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
- **半成品保护**：所有输出先写 `<name>.part`，ffmpeg 正常退出后 rename 为最终文件名——保证输出目录永远没有"看起来完整实际损坏"的文件
- **并发控制**：全局并发上限 **2**（stream copy 是 IO 密集，重编码是 CPU/GPU 密集，统一限 2 足够；代理生成任务优先级最低，排队尾）
- **磁盘空间预检**：Running 前按源文件大小估算输出体积（copy ≈ 源；编码按码率估算），可用空间不足直接 Failed 并提示
- 事件通过 `app.emit()` 广播；前端 `TaskProgress` 组件订阅 `task-status` / `task-progress` 渲染

### 8.3 输出命名

- 剪切：`<源文件名>_part_001.<同源扩展名>`；合并：用户指定；旋转/放大：`<源文件名>_rotated.<ext>` / `<源文件名>_zoomed.<ext>`
- 冲突时由前端弹确认（覆盖 / 重命名 / 取消）

---

## 9. UI / UX 设计

### 9.1 窗口与布局

- `tauri.conf.json` 窗口需调整：**1280×800，最小 1024×680**（当前 800×600 放不下时间轴）
- 深色主题为主（视频工具惯例），Tailwind CSS 4 CSS-first 配置（`@theme` 定义色板），**无 tailwind.config 文件**

### 9.2 页面流转

```text
Home ──点击功能──▶ Cut / Merge / Editor(Rotate|Crop)
  ▲                    │
  └────── 返回 ────────┘
（无路由库，顶层 state 切换；任务提交后可留在页面，由全局任务面板反馈）
```

### 9.3 Home

- 四个功能卡片（剪切 / 合并 / 旋转 / 局部放大）+ "打开视频"主按钮
- 打开视频后根据用户意图进入对应页；最近文件列表（第四阶段）

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

- 文件列表（拖拽排序手柄 ☰、删除）；每项显示探测摘要（编码/分辨率/帧率）
- 底部检测面板：全部一致 → 绿色 ✓ 清单 + "可无损合并"；不一致 → 橙色 ⚠ + 差异项高亮 + [自动统一后合并] [取消]
- "自动统一"需二次确认，显示目标参数（默认=第一个文件参数）

### 9.6 Editor（Rotate / Crop 共用）

- 左侧大预览 + 右侧操作面板
- Rotate：五个方向按钮实时用 CSS transform 预览（纯前端预览，不生成视频），提交时才走 FFmpeg；显示"元数据级无损"
- Crop：预览上叠加可拖拽/缩放的选区矩形，旁有 x/y/w/h 数值输入与比例锁定；显示"将重编码"徽标 + 质量档位选择
- 时间轴不在此页（旋转/放大作用于全片，v1 不支持区间旋转/放大）

### 9.7 TaskProgress（全局）

- 右下角可折叠抽屉；每任务一行：标签 + 进度条 + 百分比 + 速度 + 取消按钮
- 失败时展开显示 ffmpeg stderr 最后若干行 + "复制日志"按钮
- Completed 项提供"打开所在文件夹"（`tauri-plugin-opener`）

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

- 目标平台：**Windows 10/11 x64**；安装包 **NSIS**（默认）+ MSI，`pnpm tauri build` 产出
- FFmpeg 走 sidecar 随安装包分发（见 6.1），用户无需自行安装
- **许可证注意**：内置的 gyan.dev 构建包含 libx264（GPL）。个人使用/内部分发无碍；**若未来公开发布或商用，需评估 GPL 合规**（ffmpeg.exe 作为独立进程与主程序分离，属于边缘地带，建议届时咨询或改用 LGPL 构建 + 仅硬件编码器）
- 代码签名：第一阶段不做，分发自用；对外分发前需购买证书避免 SmartScreen 拦截
- 应用标识：`com.hippo.video-cut`（已配置）

---

## 12. 配置与持久化

- 使用 `tauri-plugin-store`（JSON 文件），**不引入 SQLite**（v1 无关系型数据需求）
- v1 配置项：默认输出目录、默认剪切模式（极速/精确）、关键帧吸附开关、代理预览开关/强制代理、编码器选择（自动/锁定）、质量档位
- （第四阶段）历史记录同样以 JSON 追加存储即可

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

**阶段 4：体验增强**
- 任务历史记录、批量处理、最近文件
- 快捷键、设置页完善、深浅主题切换
- （远期候选）smart cut：精确剪切仅重编码切点附近 GOP，其余 stream copy

---

## 15. 决策记录

| # | 决策 | 理由 |
| --- | --- | --- |
| 1 | 不使用 tailwind.config.ts | Tailwind v4 CSS-first（`@theme`），项目经 `@tailwindcss/vite` 接入 |
| 2 | 配置存储用 JSON（tauri-plugin-store），不用 SQLite | v1 无关系型数据；降低复杂度 |
| 3 | 预览用 `<video>` + 代理文件，第一版不集成 libmpv | WebView2 原生覆盖主流格式，代理兜底长尾；mpv 集成成本高，留待真实兼容性问题出现再评估 |
| 4 | FFmpeg 固定 7.x 并以 sidecar 分发 | `-display_rotation` 需 ≥6.0；sidecar 解决打包路径与版本一致性 |
| 5 | 所有 copy 类命令强制 `-map 0` | FFmpeg 默认流选择会丢弃多音轨/字幕，违背无损承诺 |
| 6 | 进度用 `-progress pipe:1`，禁止解析 stderr | 结构化输出可靠；stderr 仅作错误日志 |
| 7 | 剪切 `-ss` 置于 `-i` 前（copy）/ `-i` 后（重编码） | 输入侧 seek 供 copy 快速对齐关键帧；输出侧 seek 供精确到帧 |
| 8 | 音频在视频类重编码中一律 copy | 避免不必要的音质损失（转码统一场景除外） |
| 9 | 任务全局并发上限 2，输出先写 `.part` | IO/编码资源均衡；保证输出目录无损坏文件 |
| 10 | 合并重编码采用"逐个转中间文件再 concat" | 可并行、可复用进度、失败可重试，优于 concat filter 单命令 |
| 11 | UI 无路由库，顶层 state 切换 | 四页面规模不需要 router；后续需要再引入 |
| 12 | 时间值全程 f64 秒 | 避免 ms/int 转换误差；展示层统一格式化 |
