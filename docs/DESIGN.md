# video-cut 设计文档（主规格）

> **职责**：项目定位、设计原则、功能需求（FR）、无损承诺与性能承诺（NFR）、技术架构、数据模型、任务系统、格式/打包/配置/错误处理。
> **唯一真源**：**规格的唯一仲裁者**——专题文档（FFMPEG / UI / TIMELINE）与本文冲突时，先改本文再改专题；FR/NFR/AC 的定义以本文为准。
> **读时机**：任何改动前的上位规格；新会话先读本文（地图见 [INDEX.md](./INDEX.md)）。
> **写规则**：行为规格变化就地改本文并同步对应 FR/AC（一条一行）；实现级方案进 `plans/`，进度进 [PLAN.md](./PLAN.md)，决策进 [DECISIONS.md](./DECISIONS.md)。
> **关联**：[INDEX.md](./INDEX.md)（地图与 ID 规范） · [../AGENTS.md](../AGENTS.md)（工程红线） · 下位：FFMPEG / UI / TIMELINE / plans
> **最后更新**：2026-09-19（v0.9；M0–M9 已实现，M10 暂缓，M11–M13 待实施）

> 状态：M0–M9 已实现（M4-5 实机冒烟、M6-7 e2e 与 M7/M9 验收归用户手测）；M10（保活+深浅主题）已立项**暂缓**（决策 #32）；M11–M13（单轨装配时间线）已立项**待实施**，行为规格见 [TIMELINE.md](./TIMELINE.md)、实施方案见 [plans/M11.md](./plans/M11.md)。
>
> **章节号沿用拆分前的编号**（§6 / §9 / §14–§18 已迁出主规格：§6 → FFMPEG.md，§9 → UI.md，§14 已并入 PLAN.md，§15 → DECISIONS.md（决策），§16 → CANDIDATES.md（候选池），§17 → TIMELINE.md（时间线行为规格），§18 → plans/M11.md（M11 实施方案）），故本文编号不连续——以旧引用对照为准。引用格式：同文件写 `§N`，跨文件写 `文件名 §N`。
>
> **文档地图已收敛到 [INDEX.md](./INDEX.md)**（避免两处维护），本文不再重复列表。

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
- 时间线不做音频轨编辑（波形/音量/分离/替换）、不做空隙模型——音频永远跟随片段（TIMELINE.md §17.1，决策 #26/#27）

产品形态是"精准的瑞士军刀"，不是"全能编辑器"。UI 做简单工具型界面。

---

## 2. 核心设计原则 · NFR-001…005

> **NFR 清单（编号 ↔ 位置）**：NFR-001…005 本节原则 · NFR-002 §4 无损承诺矩阵（含性能基线） · NFR-006–009 §8 任务系统 · NFR-010 §10 格式支持范围 · NFR-011 §11 打包与分发 · NFR-012 §12–§13 配置与错误处理。

以下五条是全项目的最高约束，所有模块设计必须遵守：

1. **Stream copy 优先**（NFR-001）：任何操作先探测媒体信息，判断能否 `-c copy`；只有物理上不可能（像素变化、参数不一致）才走重编码。
2. **无损性显式化**（NFR-002）：UI 上每个操作按钮/面板必须有"无损 / 重编码"徽标，重编码必须告知用户代价（速度慢、大小可能变化）。
3. **所见即所得**（NFR-004）：无损剪切的入点受关键帧约束，必须在时间轴上把选择柄吸附到关键帧并显示真实剪切落点，不允许"剪完才知道偏了"。
4. **数据完整性**（NFR-003）：默认 `-map 0` 保留全部流（多音轨、字幕、章节、封面），与"无损"卖点一致；FFmpeg 默认的流选择会丢流，禁止依赖。
5. **智能兜底**（NFR-005）：无法无损时（如合并参数不一致）给出明确的用户选择（自动统一 / 取消），绝不默默转码。

---

## 3. 功能需求

### 3.1 视频导入与信息展示 · FR-310

**需求**：FR-310（组级）　·　FR-311 打开文件　·　FR-312 信息面板字段　·　FR-313 关键帧索引与扫描进度
**验收**：AC-311-1　·　AC-312-1　·　AC-313-1　——　执行：TESTING.md TC-010（打开/面板）· TC-004（关键帧缓存）；口径以本节为准。

- 打开文件：系统文件对话框 + 拖拽到窗口
- 加载后立即用 **ffprobe** 解析并展示信息面板：
  - 容器格式、总时长、文件大小、封装码率
  - 视频流：编码（如 HEVC）、profile/level、分辨率、像素格式、位深、帧率、码率、旋转元数据
  - 音频流列表：编码、采样率、声道数、码率
  - 字幕流数量、章节
- **关键帧索引**：剪切页需要，后台异步扫描关键帧时间点列表（见 6.5），长视频需显示扫描进度

### 3.2 剪切（Cut） · FR-320

**需求**：FR-320（组级）　·　FR-321 极速剪切（copy）　·　FR-322 精确剪切（重编码）　·　FR-323 多片段与命名　·　FR-324 区间双向编辑　·　FR-325 关键帧吸附
**验收**：AC-321-1　·　AC-321-2　·　AC-322-1　·　AC-323-1　·　AC-324-1　·　AC-325-1　——　执行：TESTING.md TC-001 · TC-002 · TC-010；口径以本节为准。

两种模式：

| 模式 | 实现 | 画质 | 大小 | 速度 | 剪切点 |
| --- | --- | --- | --- | --- | --- |
| **极速剪切**（默认） | `-c copy` | 100% 原画质 | ≈ 源数据量 | 秒级（仅 IO） | 入点对齐关键帧 |
| **精确剪切** | 重编码 | 有损（可用高质量参数减小） | 可能变化 | 慢（受编码速度限制） | 精确到帧 |

- **多片段**：用户可连续添加多个区间，一次性导出为 `part_001.mp4`、`part_002.mp4` …
- **区间编辑**：时间轴双手柄拖拽 + 开始/结束时间数字输入（格式 `HH:MM:SS.mmm`），两种方式双向同步
- **关键帧吸附**：入点默认吸附到关键帧（可关闭吸附，此时 UI 必须显示"实际入点将落在 XX:XX"）；出点默认不吸附（流复制下出点可到包级，主流解码器可正常播放），提供"出点也对齐关键帧"开关
- **输出**：用户选择输出目录；默认同名输出文件冲突时提示确认

### 3.3 合并（Merge） · FR-330

**需求**：FR-330（组级）　·　FR-331 九项参数检测　·　FR-332 无损合并　·　FR-333 自动统一后合并
**验收**：AC-331-1　·　AC-332-1　·　AC-332-2　·　AC-333-1　——　执行：TESTING.md TC-001 · TC-011；口径以本节为准。

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

### 3.4 旋转（Rotate） · FR-340

**需求**：FR-340（组级）　·　FR-341 元数据旋转（无损）　·　FR-342 重编码旋转（高级）
**验收**：AC-341-1　·　AC-341-2　·　AC-342-1　——　执行：TESTING.md TC-012 · TC-004；口径以本节为准。

- 支持：顺/逆时针 90°、180°、水平翻转、垂直翻转
- **优先元数据级旋转**（无损）：FFmpeg 6.0+ 的 `-display_rotation` 输入选项 + `-c copy`，仅改显示矩阵并 remux，秒级完成
- 元数据旋转无法满足时（如目标是导出为真旋转像素的老设备兼容场景）才提供重编码路径（`transpose` 滤镜）
- UI 默认走元数据路径并显示"无损"徽标；重编码路径作为高级选项，并允许用户选择编码器/质量

### 3.5 局部放大（Crop & Zoom） · FR-350

**需求**：FR-350（组级）　·　FR-351 框选与数值微调/比例锁　·　FR-352 编码器探测与回退　·　FR-353 质量档位
**验收**：AC-351-1　·　AC-352-1　·　AC-353-1　——　执行：TESTING.md TC-012 · TC-004；口径以本节为准。

- 在预览画面上拖拽框选区域（x/y/width/height），支持数值微调与比例锁定
- 处理链：`crop → scale`（默认放大回原视频分辨率，可自定义输出尺寸，`lanczos` 缩放算法）
- **必然重编码**，UI 明确标注；音频始终 `-c:a copy` 不转码
- **编码器策略**：自动探测 GPU → `h264_nvenc`（NVIDIA）/ `h264_qsv`（Intel）/ `h264_amf`（AMD），失败回退 `libx264`；用户可在设置中锁定编码器
- **质量档位**（简化暴露，映射到编码参数）：
  - 高质量（libx264 CRF 16 / 硬件高码率）
  - 平衡（默认，CRF 20）
  - 小体积（CRF 26）

### 3.6 任务队列 · FR-360

**需求**：FR-360（组级）　·　FR-361 统一提交与进度/速度/ETA　·　FR-362 取消与半成品清理
**验收**：AC-360-1　·　AC-361-1　·　AC-362-1　——　执行：TESTING.md TC-015 · TC-004；口径以本节为准。

- 四类操作统一为 Task 提交到队列（见第 8 节）
- 进度条 + 处理速度（fps / 倍速）+ 预计剩余时间
- 支持取消（kill ffmpeg 子进程 + 删除半成品）
- 全局任务面板，多任务并行可见
- 任务历史记录（M4-2，UI.md §9.10）与批量处理（M6-8，UI.md §9.8）均已实现

### 3.7 代理预览（新增，属于第一阶段） · FR-370

**需求**：FR-370（组级）　·　FR-371 自动生成代理　·　FR-372 代理提示条与时间基准
**验收**：AC-371-1　·　AC-372-1　——　执行：TESTING.md TC-018；口径以本节为准。

WebView2 的 `<video>` 对部分格式无法直接播放（详见第 10 节）。当源视频不被 WebView2 支持（如 AVI、无 HEVC 扩展时的 H.265、AC-3 音频等）时：

- 自动生成低分辨率 H.264 + AAC 代理文件（720p，`veryfast`，后台低优先级任务）
- 播放器播放代理，但**时间轴、剪切区间、导出全部基于原视频时间**（代理与源时长一致，无需时间映射换算）
- UI 显示"当前为代理预览画面，导出使用原始文件"提示条
- 用户可关闭该功能（此时不支持预览的格式显示占位提示，但仍可按数值剪切）

### 3.8 工作台（Workbench，流水线组合） · FR-380

**需求**：FR-380（组级）
**验收**：AC-380-1　——　执行：TESTING.md TC-003 · TC-013（原子需求随 M11 开工发号 FR-381+）；口径以本节为准。

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
  （如混入不同分辨率源、10bit/8bit 混用导致 H.264/H.265 混编）按 FFMPEG.md §6.3④ 定向归一化后再拼接。
  检测面板在导出前预先提示哪些片段必然/可能重编码
- 已知取舍：若某片段裁剪放大而其他片段旋转到非恒等方向，后者也需重编码（保方向一致性优先）

---

## 4. 无损性承诺矩阵 · NFR-002

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
│   ├── ClipTimeline/    # 工作台合成时间轴：片段块编排（UI.md §9.8）、池↔轴拖入、播放头
│   ├── ProductPreview/  # 工作台成品虚拟连播（M6-6）：双 video 轮换预加载
│   ├── CutEditor/       # 剪切页片段列表与导出配置
│   ├── MergeEditor/     # 合并页文件列表与检测面板（⚠ 当前为**空目录**，实现待 R2-1/R2-2 落地）
│   ├── RotateEditor/    # 旋转页操作面板（⚠ 当前为**空目录**，实现待 R2-1/R2-2 落地）
│   ├── CropEditor/      # 放大页操作面板（⚠ 当前为**空目录**，实现待 R2-1/R2-2 落地）
│   ├── RotateControls/  # 旋转组合按钮（Editor 页与工作台共享）
│   └── TaskProgress/    # 全局任务面板：进度/速度/取消/复制日志/自动关闭
├── pages/
│   ├── Workbench/       # 工作台（落地页，UI.md §9.8：素材卡/片段池/时间轴/三态预览）
│   ├── Cut/             # 剪切页 = VideoPlayer + Timeline
│   ├── Merge/           # 合并页
│   ├── Editor/          # 旋转/放大共用编辑页
│   ├── Settings/        # 设置页（UI.md §9.9，受控组件）
│   └── History/         # 历史记录页（UI.md §9.10，只读）
├── hooks/
│   ├── useDragSort.ts   # 指针事件拖拽排序（决策 #18：禁用 HTML5 DnD）
│   ├── useTauriEvent.ts # 事件订阅统一退订封装（R1-2；`listen()` 的 Promise 在 resolve 前卸载会漏退订）
│   └── useHotkeys.ts    # 全局快捷键（输入焦点忽略，见 UI.md §9.4、TIMELINE.md §17.8）
├── utils/
│   ├── crop.ts          # 裁剪归一化↔像素换算、偶数对齐、越界钳制（R1-4，与 components/CropOverlay 配套）
│   ├── media.ts         # 媒体相关纯函数（格式判定、代理判定等）
│   ├── paths.ts         # 输出路径解析 resolveOutputDir / basename / withFileTimestamp
│   └── time.ts          # 时间格式化与解析
├── services/
│   ├── tauri.ts         # invoke 封装 + 事件订阅，全部类型安全，UI 不直接碰 @tauri-apps/api
│   └── settings.ts      # 设置读写（tauri-plugin-store 门面）
├── App.tsx              # 顶层 state 页面切换 + 拖拽分发 + 设置加载门控
├── theme.ts             # 主题色预设与运行时覆写（UI.md §9.1/决策 #16）
├── global.css           # Tailwind CSS 4 @theme 令牌（暗色变量集）
└── types/               # 与 Rust 数据模型对齐的 TS 类型
```

> 落地页改造（M6-0）后**已删除** `pages/Home/` 与 `PageShell`——启动页即工作台（UI.md §9.3）。

约定：

- `services/tauri.ts` 是前端唯一允许 import `@tauri-apps/api` 的地方
- 路由用轻量方案（自研 state 切换或 react-router，第一阶段不引入 router 库，四个页面直接 state 切换）
- 时间值统一用**秒（f64）**在前端流转，仅在展示层格式化为 `HH:MM:SS.mmm`

### 5.3 Rust 后端结构（对应已建目录）

```text
src-tauri/src/
├── main.rs              # 入口，调用 lib::run()（保持现状）
├── lib.rs               # 模块声明、Tauri Builder、命令注册、状态注入、核心类型导出
├── logger.rs            # 日志初始化（fern 按天落盘、7 天清理，见 §12.1）
├── history.rs           # 任务历史落盘（history.json，上限 200 条，终态回调写入）
├── commands/
│   ├── mod.rs           # 公共校验助手（require_disk_space 等）
│   ├── media.rs         # probe_media / list_keyframes / check_environment / 任务查询与取消 / 代理 / 缩略图 / 缓存 / 日志转发
│   ├── cut.rs           # submit_task（四类任务统一提交入口）
│   ├── merge.rs         # check_merge（参数一致性检测）
│   ├── rotate.rs        # 旋转任务载荷校验
│   ├── crop.rs          # 放大任务载荷校验
│   ├── pipeline.rs      # check_pipeline / temp_token（工作台流水线）
│   └── history.rs       # list_history / clear_history
├── ffmpeg/
│   ├── mod.rs           # 子模块导出 + spawn_hidden（CREATE_NO_WINDOW）
│   ├── command.rs       # FFmpeg 命令构建器（核心模块，唯一拼命令的地方）
│   ├── probe.rs         # ffprobe 封装：媒体信息 JSON → MediaInfo、关键帧扫描、探测缓存
│   └── progress.rs      # -progress pipe:1 输出解析 → ProgressEvent
└── task/
    ├── mod.rs
    ├── manager.rs       # 队列、状态机、并发控制、Tauri 事件推送、终态回调
    └── worker.rs        # 子进程启动、stdout 读取循环、取消（kill）、清理
```

> 另有 `tests/e2e.rs`（命令级集成测试，见 FFMPEG.md §6.6）。

约定：

- **所有 FFmpeg 参数只在 `ffmpeg/command.rs` 拼装**，commands 局只做参数校验与任务提交，保证命令行为可集中审计
- 子进程一律用参数数组（`std::process::Command` 的 arg 列表）传递，**禁止 shell 拼接**，天然规避空格/中文路径转义问题
- 命令注册集中在 `lib.rs` 的 `invoke_handler`；模板遗留的 `greet` 命令在阶段 0 移除
- `src-tauri/binaries/` 存放 sidecar 二进制（不进 git，见 6.1）

### 5.4 前后端通信协议

**invoke 命令清单**（与 `src-tauri/src/lib.rs` 的 `invoke_handler` 一一对应，共 20 个）：

| 命令 | 说明 | 入参 | 出参 |
| --- | --- | --- | --- |
| `check_environment` | 启动时检查 ffmpeg/ffprobe 可用性与版本 | — | `EnvironmentInfo` |
| `probe_media` | 解析媒体信息（命中探测缓存，FFMPEG.md §6.5） | `input: String` | `MediaInfo` |
| `list_keyframes` | 扫描关键帧时间点（命中缓存） | `input: String` | `Vec<f64>`（秒，升序） |
| `submit_task` | 提交任务（五类统一入口） | `VideoTask` | `taskId: String` |
| `cancel_task` | 取消任务 | `taskId: String` | `bool` |
| `list_tasks` | 查询当前任务列表 | — | `Vec<TaskSnapshot>` |
| `clear_finished_tasks` | 清理已完成/失败/取消记录（任务面板） | — | `usize`（清理条数） |
| `generate_proxy` | 生成预览代理（内部任务，同源去重） | `input: String` | `taskId: String` |
| `generate_thumbnails` | 批量生成源首帧缩略图 | `inputs: Vec<String>` | `Vec<FileThumbnail>` |
| `generate_clip_thumbnails` | 批量生成**片段起点帧**缩略图（M6-8；缓存 key = 路径@时间两位小数） | `requests: Vec<ClipThumbRequest>` | `Vec<ClipThumbnail>` |
| `check_merge` / `check_pipeline` | 合并/工作台导出前检测（参数一致性 + 无损判定） | `inputs` / `items: Vec<PipelineItem>` | `MergeComparison` / `PipelineCheck` |
| `expand_video_inputs` | 拖入目录递归展开为视频文件列表（M7-7，≤8 层、跳过隐藏项、排序） | `paths: Vec<String>` | `Vec<String>` |
| `file_exists` | 导出前同名检测（M7-4，决定是否追加时间戳） | `path: String` | `bool` |
| `cache_usage` / `clear_cache` | 缓存占用统计 / 一键清理（M4-8，含代理与缩略图，占用文件跳过并计数） | — | `CacheUsage` / `CacheClearResult` |
| `append_frontend_log` | 前端错误转发落盘（M4-7，失败静默防循环） | `level: String, message: String` | — |
| `open_log_dir` | 打开日志目录（任务面板入口，plugin-opener） | — | — |
| `list_history` / `clear_history` | 任务历史读取 / 清空（M4-2） | — | `Vec<HistoryEntry>` / — |

文件/目录选择不做自定义命令，直接用 `tauri-plugin-dialog` 前端调用。

**事件清单（Rust → 前端，payload 均带 `taskId`）：**

| 事件 | 时机 | payload |
| --- | --- | --- |
| `task-status` | 状态机迁移 | `{ taskId, status, error?, outputs }` |
| `task-progress` | 解析到进度（节流 ~200ms） | `{ taskId, percent, speed?, etaSeconds? }` |

> 早期设计的 `task-log`（逐行转发 stderr）从未实现——stderr 尾部随任务终态进 `TaskSnapshot.error` 并落日志文件（§12.1），前端从这两处取，无需独立事件。

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
    Cut { input: String, segments: Vec<Segment>, output_dir: String, mode: CutMode, encoder: Option<String> },
    Merge { inputs: Vec<String>, output: String, force_transcode: bool },
    // rotate_deg 为相对源方向的增量，翻转独立叠加；无损路径换算绝对显示矩阵
    Rotate { input: String, rotate_deg: i32, hflip: bool, vflip: bool, output: String, transcode: bool, quality: QualityPreset, encoder: Option<String> },
    CropZoom { input: String, x: u32, y: u32, width: u32, height: u32, out_width: Option<u32>, out_height: Option<u32>, quality: QualityPreset, output: String, encoder: Option<String> },
    // 工作台流水线：逐片段处理 → 定向统一 → concat（§3.8）
    Pipeline { items: Vec<PipelineItem>, output: String, quality: QualityPreset, encoder: Option<String> },
}

// 各变体的 `encoder` = 设置中锁定的编码器（M4-1）；None = 按位深自动探测（UI.md §9.9）。
// 除 Merge 外的四类都带此字段——Merge 的“自动统一”硬编码 libx264（范围见 UI.md §9.9）。
// 待 M12-2 追加：Pipeline 增加 `preview: bool`（渲染即预览，输出到缓存目录，见 TIMELINE.md §17.6）。

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus { Pending, Probing, Running, Completed, Failed, Cancelled }
// 注：`Probing` 目前无任何构造点（探测在作业线程内完成，不经状态机），保留类型仅为兼容 wire 格式。

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSnapshot {
    pub id: String,
    pub kind: String,             // cut / merge / rotate / crop_zoom / pipeline（proxy 为内部任务，不出现在面板）
    pub status: TaskStatus,
    pub label: String,            // 展示名，如 "剪切 xxx.mp4 → part_001.mp4"
    pub progress: Option<f64>,    // 0..1
    pub error: Option<String>,
    pub outputs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub kind: String,             // 白名单同 TaskSnapshot.kind（proxy 不入库）
    pub label: String,
    pub status: TaskStatus,
    pub outputs: Vec<String>,
    pub error: Option<String>,
    pub created_at: u64,          // 提交时间（unix ms）
    pub started_at: u64,          // 开始执行时间（unix ms）；排队即被取消时 = created_at
    pub finished_at: u64,         // 终态时间（unix ms）
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
- **Running**：启动 ffmpeg 主命令；进度事件按 ~200ms 节流后 emit（NFR-009）
- 剪切多片段 = 一个任务内串行执行 N 个 ffmpeg 子进程，进度按 (已完成片段 + 当前片段进度)/N 汇总

### 8.2 实现要点（manager.rs / worker.rs）

- **任务实体与标识**：运行中 = `TaskHandle`（进程内）/ 对外快照 = `TaskSnapshot` / 终态落盘 = `HistoryEntry`（结构见 §7）；实例标识 = `taskId`（`t<毫秒十六进制><两位序号>`，如 `t18f3a2b5c01`），类型维度 = `kind` 白名单（`cut`/`merge`/`rotate`/`crop_zoom`/`pipeline`，内部另有 `proxy`）；文档层不为它设独立命名空间。
- `TaskManager` 持有 `Mutex<HashMap<TaskId, TaskHandle>>` + pending 队列，通过 `tauri::State` 注入；任务句柄存子进程 PID + 取消信号
- **取消**：向子进程发 kill（Windows 下 kill 即终止），随后**删除该任务已产生的 `.part` 半成品**；任务内最后一个子进程退出后状态置 Cancelled
- **半成品保护**（NFR-007）：所有输出先写 `<name>.part.<原扩展名>`（如 `xxx.part.mp4`——保留真实扩展名供 ffmpeg 推断封装格式），ffmpeg 正常退出后 rename 为最终文件名——保证输出目录永远没有"看起来完整实际损坏"的文件
- **并发控制**（NFR-006）：全局并发上限 **2**（stream copy 是 IO 密集，重编码是 CPU/GPU 密集，统一限 2 足够；代理生成任务优先级最低，排队尾）
- **磁盘空间预检**（NFR-008，B2/M8 推广到全部输出型任务）：检查在**任务作业线程内**执行（运行时而非提交时——排队期间磁盘状态可能变化）；空间不足直接 Failed 并提示，不再编码中途失败留半成品。估算规则（公共函数 `require_disk_space`，cut/rotate/crop/merge/pipeline/proxy 共用）：

  | 任务 | 估算 |
  | --- | --- |
  | 剪切（copy/精确） | Σ片段时长占比 × 源大小 |
  | 旋转 / 局部放大 | 源大小（remux ≈ 源；重编码同码率量级） |
  | 合并 | 兼容 copy = Σ输入；重编码路径中间文件与成品并存期峰值 ≈ 2 × Σ输入 |
  | pipeline | 2 × Σ片段源大小（中间片段 + 成品并存上界） |
  | 代理生成 | 源大小（保守上界，实际远小于） |

  元数据读取失败（size=0）跳过检查，交给 ffmpeg 自行失败
- 事件通过 `app.emit()` 广播；前端 `TaskProgress` 组件订阅 `task-status` / `task-progress` 渲染

### 8.3 输出命名

- 剪切：`<源文件名>_part_001.<同源扩展名>`；合并：用户指定；旋转/放大：`<源文件名>_rotated.<ext>` / `<源文件名>_zoomed.<ext>`
- 冲突时由前端弹确认（覆盖 / 重命名 / 取消）；用户命名的导出**默认不加时间戳，仅当目标已存在同名文件时自动追加**（M7-4，决策 #19）

---

## 10. 格式支持矩阵 · NFR-010

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

## 11. 打包与分发 · NFR-011

- 目标平台：**Windows 10/11 x64**；安装包**只发 NSIS**（决策 #21：MSI 本地化能力弱、维护两套安装器无收益），`pnpm tauri build` 产出；NSIS 界面语言中文（`languages: ["SimpChinese"]`，M7-8）
- FFmpeg 走 sidecar 随安装包分发（见 6.1），用户无需自行安装
- **许可证注意**：内置的 gyan.dev 构建包含 libx264（GPL）。个人使用/内部分发无碍；**若未来公开发布或商用，需评估 GPL 合规**（ffmpeg.exe 作为独立进程与主程序分离，属于边缘地带，建议届时咨询或改用 LGPL 构建 + 仅硬件编码器）
- 代码签名：第一阶段不做，分发自用；对外分发前需购买证书避免 SmartScreen 拦截
- 应用标识：`com.hippo.video-cut`（已配置）

---

## 12. 配置与持久化 · NFR-012

- 使用 `tauri-plugin-store`（JSON 文件），**不引入 SQLite**（v1 无关系型数据需求）
- v1 配置项：默认输出目录、默认剪切模式（极速/精确）、关键帧吸附开关、代理预览开关/强制代理、编码器选择（自动/锁定）、质量档位；后续追加：主题色（`accent`，M4-8）、任务浮层自动关闭秒数（`toastAutoCloseSec`，默认 0=不关闭，M7-5）。导出名时间戳**不是**配置项——"同名才追加"为固定行为（决策 #19）
- 历史记录同样以 JSON 追加存储（已实现，见下方 M4-2 实现说明）
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

## 13. 错误处理与边界情况 · NFR-012

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
