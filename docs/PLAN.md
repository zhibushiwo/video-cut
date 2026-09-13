# video-cut 实施计划

> 版本：v1.0 · 制定日期：2026-09-13 · 依据：[DESIGN.md](./DESIGN.md)（需求与设计定稿）
>
> 用法：按里程碑顺序推进，任务用 checkbox 跟踪；每项任务完成后勾选并按约定粒度提交。各任务后的 `§` 引用 DESIGN.md 对应章节。

## 里程碑总览

| 里程碑 | 内容 | 前置 | 预估工作量 | 完成标志 |
| --- | --- | --- | --- | --- |
| **M0 基建** | 模块树、sidecar FFmpeg、服务层、UI 骨架 | — | 1~2 天 | 应用可启动，能探测到 ffmpeg/ffprobe 版本 |
| **M1 剪切垂直切片** | 核心链路：探测→预览→选区→无损剪切→进度 | M0 | 4~6 天 | 1GB MP4 秒级切出、可取消、画质一致 |
| **M2 合并** | 参数检测、无损合并、自动统一 | M1 | 2~3 天 | 三个一致文件秒级合并；不一致可自动统一 |
| **M3 旋转 + 放大 + 精确剪切** | 全部重编码类功能 + 硬件编码器基建 | M1 | 3~5 天 | 元数据旋转秒级；框选放大正确；剪切到帧 |
| **M5 工作台** | 多文件流水线：逐段剪切/旋转/放大 → 合成成品 | M2、M3 | 2~4 天 | 两个源文件配置不同操作，一条成品输出；纯无损场景秒级 |
| **M4 打磨与打包** | 设置、历史、快捷键、安装包 | M2、M3 | 2~4 天 | NSIS 安装包在干净 Win11 实机可用 |

> 预估按单人全职工时，仅供排期参考；顺序上 M2 与 M3 可并行挑选。

---

## M0 基建

**目标：把所有"与业务无关但会卡住后续一切"的事做完。**

- [x] **M0-1 清理模板遗留**：删除 `greet` 命令与调用；清空 `App.tsx` 模板内容；`lib.rs` 声明 `mod commands; mod ffmpeg; mod task;` 空模块树 `§5.3`
- [x] **M0-2 下载并固定 FFmpeg**：gyan.dev essentials 7.x，放入 `src-tauri/binaries/` 并按 target-triple 命名（`ffmpeg-x86_64-pc-windows-msvc.exe` / `ffprobe-...`）；`binaries/` 加入 `.gitignore`；写 `scripts/fetch-ffmpeg.ps1` 下载脚本 `§6.1`
- [x] **M0-3 sidecar 接入**：`tauri.conf.json` 配置 `bundle.externalBin`；引入 `tauri-plugin-shell`；封装路径解析助手
- [x] **M0-4 check_environment**：Rust 命令跑 `ffmpeg -version` / `ffprobe -version`，返回版本与可用性；前端启动时调用，失败阻塞并提示 `§5.4` `§13`
- [x] **M0-5 引入插件**：`tauri-plugin-dialog`（文件选择）、`tauri-plugin-store`（配置，先接入不实现设置页）；capability 权限同步补充 `§5.4` `§12`
- [x] **M0-6 窗口与主题**：`tauri.conf.json` 调整为 1280×800 / min 1024×680；Tailwind v4 `@theme` 定义深色色板基础变量 `§9.1`
- [x] **M0-7 前端骨架**：`services/tauri.ts`（invoke 封装 + 事件订阅，唯一 `@tauri-apps/api` 入口）；`types/` 落地与 DESIGN §7 对齐的 TS 类型；Home 页四功能卡片 + 顶层 state 页面切换（四个空页）`§9.2`
- [x] **M0-8 任务系统空壳**：`task/manager.rs` / `task/worker.rs` 最小实现（提交/状态/取消/事件推送接口），先以 sleep 假任务自测事件通路

**⚠ 前置验证（spike，随 M0-3 一并完成）**：sidecar 在 `tauri dev` 与 `tauri build` 两种模式下路径均能解析——这是全项目第一个风险点，跑通后再继续。

**验收**：`pnpm tauri dev` 启动 → Home 四卡片可切换 → 顶部显示 ffmpeg/ffprobe 版本号。

---

## M1 剪切垂直切片（MVP 核心）

**目标：跑通"打开 → 探测 → 预览 → 选区 → 无损剪切 → 进度 → 输出"全链路。**

- [x] **M1-1 测试视频夹具**：写 `scripts/gen-fixtures.ps1` 用 ffmpeg 生成标准夹具：H.264+AAC MP4（主用，含 2 分钟以上时长与已知关键帧间隔）、HEVC MP4、10bit MKV、AVI（MPEG-4 Part 2）`§10`
- [x] **M1-2 ffprobe 封装**：`ffmpeg/probe.rs`：JSON 解析 → `MediaInfo`（含 displaymatrix 旋转读取）；对夹具写单元测试 `§6.5`
- [x] **M1-3 关键帧扫描**：`list_keyframes` 实现；**spike：1 小时视频扫描耗时**，若 >3s 改用 `-read_intervals` 按需分段扫描（Timeline 可视区域懒加载）`§6.5` `§13`
- [x] **M1-4 命令构建器**：`ffmpeg/command.rs` 实现 `build_cut_command`（极速剪切，参数数组返回）；单测断言生成的参数序列（不真跑 ffmpeg）`§6.3①` `§6.2`
- [x] **M1-5 任务系统实战化**：worker 启动子进程、stdout `-progress` 解析循环（`ffmpeg/progress.rs`）、stderr 收集、取消 kill + `.part` 清理、磁盘空间预检 `§6.4` `§8`
- [x] **M1-6 提交链路**：`commands/cut.rs` `submit_cut_task`（多片段 = 任务内串行多子进程，进度汇总）`§8.1`
- [x] **M1-7 VideoPlayer 组件**：`<video>` 封装：播放/暂停、时间上报（requestAnimationFrame 节流）、逐帧步进（预留）、加载失败回调 `§9.4`
- [x] **M1-8 代理预览**：`needsProxy` 判定逻辑 + `generate_proxy` 任务 + 播放器无缝切换代理源；UI 提示条 `§3.7` `§10`。**spike：用 canPlayType + video error 事件双探测定不支持格式**
- [x] **M1-9 Timeline 组件**：双手柄区间选择、关键帧刻度渲染（Canvas 或 SVG，长列表需虚拟化或分段绘制）、入点吸附 + 实际落点 tooltip、数字输入双向同步 `§9.4`
- [x] **M1-10 CutEditor + Cut 页组装**：片段列表增删、模式切换（精确剪切按钮先禁用占位）、输出目录选择、覆盖冲突确认、无损/重编码徽标 `§9.4`
- [x] **M1-11 TaskProgress 全局面板**：订阅 `task-status`/`task-progress`，进度条/速度/取消/失败日志展示 `§9.7`

**验收清单**：
1. 打开 1GB H.264 MP4 → 信息面板数据正确（时长/编码/分辨率与 ffprobe 手测一致）
2. 拖拽选区 → 入点吸附关键帧 → 极速剪切 → **秒级完成**，输出文件可播放
3. 输出画质验证：与源对应区间逐帧抽查一致（可抽 3 帧对比 md5 或肉眼）
4. 取消运行中任务 → ffmpeg 进程消失、无 `.part` 残留
5. 打开 AVI / 10bit MKV → 自动生成代理并可预览，剪切仍作用于原文件
6. 多片段一次导出 `part_001/002/003`，进度按 N 段汇总

---

## M2 合并

- [x] **M2-1 参数一致性比对**：`commands/merge.rs` 实现九项比对（DESIGN §3.3 清单），比对函数独立可单测
- [x] **M2-2 检测面板 UI**：文件列表 + 摘要列（编码/分辨率/帧率）+ ✓/⚠ 面板与差异项高亮 `§9.5`
- [x] **M2-3 无损合并**：concat 列表生成（UTF-8、单引号转义、正斜杠）+ `build_merge_command` + 单测 `§6.3③`
- [x] **M2-4 拖拽排序**：列表手柄拖拽（原生 drag events，不引库）
- [x] **M2-5 自动统一路径**：逐个转中间文件（`build_normalize_command`）→ 二次 concat；目标参数选择 UI（首文件参数 / 1080p H.264）；二次确认弹窗 `§6.3④`
- [x] **M2-6 音轨/字幕布局校验**：流布局不一致时的明确报错文案 `§3.3`

**验收**：三个参数一致的夹具 → 秒级合并，输出总时长 = 三者之和；混入 4K HEVC 文件 → ⚠ 面板 → 自动统一后输出可播放、参数统一。

---

## M3 旋转 + 局部放大 + 精确剪切

- [x] **M3-1 硬件编码器探测**：`ffmpeg/command.rs` 增加 encoder 探测（按序试跑 `h264_nvenc`/`h264_qsv`/`h264_amf` 极短编码，缓存结果）；回退 libx264。**spike：三类 GPU 至少验证一类实机** `§3.5`
- [x] **M3-2 质量档位映射**：High/Balanced/Small → 各编码器参数（libx264 CRF 16/20/26；硬编对应 -cq/-q 值），集中在一处映射表
- [x] **M3-3 元数据旋转**：`build_rotate_remux_command`（`-display_rotation` 输入选项 + `-c copy`）+ 单测 `§6.3⑤`
- [x] **M3-4 RotateEditor**：方向按钮 + CSS transform 实时预览 + 无损徽标；重编码旋转为高级折叠项 `§9.6`
- [x] **M3-5 重编码旋转**：`transpose` 滤镜路径，复用 M3-1/M3-2 `§6.3⑥`
- [x] **M3-6 CropEditor**：预览叠加选区矩形（拖拽/缩放/比例锁定）+ 数值微调 + 偶数对齐校验 `§9.6`
- [x] **M3-7 放大命令**：crop + scale(lanczos) 链，输出尺寸默认回原分辨率 `§6.3⑦`
- [x] **M3-8 精确剪切**：输出侧 `-ss` 重编码路径，复用编码器基建；UI 解禁 M1-10 占位并加重编码提示 `§6.3②`
- [x] **M3-9 10bit/HDR 特例**：pix_fmt 为 10bit 时编码器选择策略（hevc 优先）+ VFR 重编码提示 `§10`

**验收**：手机竖拍视频（带 rotation metadata）旋转后**秒级完成且大小基本不变**；框选 1/4 区域放大到原分辨率输出画面正确；精确剪切入点与选定帧一致。

---

## M4 打磨与打包

- [x] **M4-1 设置页**：输出目录、默认模式、吸附开关、代理开关/强制代理、编码器锁定、质量档位；读写 tauri-plugin-store `§12`
- [x] **M4-2 历史记录**：任务历史 JSON 追加存储 + 历史页（重新定位输出文件）`§12`
- [ ] **M4-3 快捷键**：空格播放/暂停、←/→ 秒级跳转、Shift+←/→ 逐帧、I/O 设入出点、Delete 删片段 `§9.4`
- [ ] **M4-4 批量处理**：多文件批量剪切/旋转队列化（复用任务系统，仅 UI 扩展）
- [ ] **M4-5 安装包**：NSIS + MSI 构建实机验证；干净 Win11 虚拟机安装 → 全功能冒烟；SmartScreen 提示记录 `§11`
- [ ] **M4-6 文档收尾**：README 补截图与下载方式；DESIGN/PLAN 状态同步
- [ ] **M4-7 日志系统**：`log` + `fern` 按天滚动落盘（`app_log_dir/logs/`，保留 7 天，`VIDEO_CUT_LOG` 覆盖级别）；任务提交载荷、ffmpeg 命令行、退出码与失败 stderr 尾部、前端错误全量入日志；任务面板补"复制日志"与"打开日志文件夹"；替代现有 eprintln 调试输出 `§12.1`

## M5 工作台（流水线组合）

- [x] **M5-1 后端计划与构建器**：`plan_items` 纯函数（规则 A/B，`§3.8`）；`pipeline_copy_args`（剪切+元数据旋转一步）与 `pipeline_transcode_args`（精确剪切+变换+裁剪单次编码，滤镜序 翻转→旋转→裁剪→缩放）`§6.3⑨⑩`
- [x] **M5-2 后端任务**：`VideoTask::Pipeline` + `check_pipeline`（逐片段 copy/transcode 判定与提示）+ `submit_pipeline`（逐片段中间文件 → 定向参数统一 → concat，进度按时长加权，取消清理）`§3.8`、`§8.2`
- [x] **M5-3 前端工作台页**：文件列表（排序/缩略图）+ 展开式每片段编辑器（剪切区间、旋转组合、显示空间裁剪框选/微调/移动）+ 检测面板（无损/重编码徽标与原因）+ 导出 `§9.8`
- [x] **M5-4 入口与文档**：Home 增加工作台入口；四个独立页面保留；DESIGN §9.8 页面流转补充
- [x] **M5-5 验证**：cargo test 48 通过 + e2e：双文件纯无损秒级合成；单文件裁剪+另一文件剪切的混合路径正确（方向、时长、参数一致、全文件可解码）。过程中发现并修复：concat 对 tb 不一致中间文件会错乱时间戳（转码统一 `-video_track_timescale`）、同名输出并发任务互踩临时文件（提交级令牌）

---

## 测试与质量约定

1. **命令构建器全单测**：`ffmpeg/command.rs` 每个构建函数配参数序列断言，ffmpeg 行为回归靠它兜底
2. **夹具驱动**：所有手工验收基于 M1-1 的固定夹具，避免"拿手头随便一个视频测"导致结论不可复现
3. **提交粒度**：一个 checkbox 一次提交，信息格式 `M1-4: cut command builder + tests`
4. **性能基线**：1GB 文件极速剪切 ≤ 10s（SSD）、合并 ≤ 15s、元数据旋转 ≤ 5s；超出即回查（多为误入重编码路径）
5. **进度推送节流 200ms**，避免事件风暴拖慢前端

## 风险登记

| 风险 | 影响 | 缓解 | 验证时机 |
| --- | --- | --- | --- |
| sidecar 打包后路径解析失败 | 全项目阻塞 | M0-3 spike 提前跑通 dev+build 双模式 | M0 |
| WebView2 解码能力探测不准 | 代理机制失效 | canPlayType + error 事件双探测 + 夹具实测 | M1-8 |
| 长视频关键帧扫描过慢 | 剪切页体验 | `-read_intervals` 分段懒加载 | M1-3 |
| 硬件编码器探测误判 | 放大/精确剪切失败或回退 | 试跑验证 + 失败回退 libx264 + 结果缓存 | M3-1 |
| HEVC 系统扩展缺失 | HEVC 预览不可用 | 探测失败自动代理，不阻塞处理 | M1-8 |
| concat 列表特殊字符路径 | 合并失败 | 生成器单测覆盖中文/空格/单引号用例 | M2-3 |
