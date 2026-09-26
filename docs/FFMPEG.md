# video-cut FFmpeg 集成规范

> **职责**：二进制管理与版本策略、参数强制约定与命令模板、进度协议、probe 缓存、e2e 夹具。
> **唯一真源**：**所有 FFmpeg / ffprobe 调用方式**的规范（参数、超时、错误处理、缓存键、夹具）以本文为准。
> **读时机**：新增任务类型、修改 `src-tauri/src/ffmpeg/`、排查导出时长/时间戳/画质问题时。
> **写规则**：参数约定变化就地改本文并同步 `command.rs` 的单测；参数拼装位置仍在代码（`ffmpeg/command.rs`），本文只描述契约。
> **关联**：[INDEX.md](./INDEX.md) · 上位 [DESIGN.md](./DESIGN.md) · 进度 [PLAN.md](./PLAN.md) · 测试 [TESTING.md](./TESTING.md)
> **最后更新**：2026-09-19

> 铁律：**所有 FFmpeg 参数只在 `ffmpeg/command.rs` 一处拼装**，命令行为可集中审计（见 [DESIGN.md](./DESIGN.md) §5.3）。

---

## 6. FFmpeg 集成规范

### 6.1 二进制管理

- **版本策略**：跟踪 gyan.dev release-essentials（历史版本包已下架，无法固定 7.x）。当前已知良好版本 **9.0.1**（2026-09-13 下载），满足 `-display_rotation`（≥6.0）要求；升级后跑通 `check_environment` 与冒烟测试即可
- 通过 **Tauri sidecar（`bundle.externalBin`）** 分发，文件命名为 target-triple 后缀：

  ```text
  src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe
  src-tauri/binaries/ffprobe-x86_64-pc-windows-msvc.exe
  ```

  `tauri.conf.json` 中配置 `"bundle": { "externalBin": ["binaries/ffmpeg", "binaries/ffprobe"] }`，运行时经 shell 插件的 sidecar API 解析路径（开发环境与打包后均有效）
- `binaries/` 下的 exe **不提交 git**（加入 `.gitignore`），仓库提供脚本/说明按固定版本号下载
- 启动时执行 `check_environment`：跑 `ffmpeg -version` 校验存在性与版本；**失败不阻塞应用**（`command.rs` 注释明确，应用照常进入），由前端顶部状态条提示未就绪与修复指引

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
ffmpeg -i <input> -map 0:v:0 -map 0:a:0? \
  -vf "scale=-2:min(720\,ih),format=yuv420p" -c:v libx264 -preset veryfast -crf 23 \
  -c:a aac -b:a 128k \
  -y <cache_dir>/<hash>.proxy.mp4
```

代理文件放应用缓存目录（按源文件路径 hash 命名），不污染用户输出目录；已有代理直接复用。**高度不放大**（`min(720\,ih)`：源高 <720 时保持原高）、**强制 `yuv420p`**（WebView2 只吃 8bit 4:2:0）；音频流用 `0:a:0?`（**可选**，无音轨源不报错）。

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

**探测结果缓存（B1，M8）**：MediaInfo / MergeFileFacts / 关键帧列表 / 容器时长在进程内缓存（决策 #22）：

- 缓存键 = `(路径, size, mtime_ns)`——文件被替换或改动后键变化，天然失效，无主动失效逻辑
- 仅缓存**成功**结果：探测失败可能是暂态（文件被占用、网络盘抖动），不应固化
- 作用范围：异步命令入口（probe_media / probe_merge_facts / list_keyframes）与任务作业线程内的同步变体（probe_merge_facts_sync / probe_duration_sync）共用同一缓存
- 缓存量级防御（R3-1）：上限 512 条，**LRU 逐条淘汰**——满后再写入只逐出最久未用的一条，不清空整表；覆盖已有键只刷新使用序不逐出（M12-2 自动渲染预览高频提交探测时不会周期性清光关键帧缓存导致反复重扫；pipeline 中间文件路径每次任务都不同，条目极小但靠逐条淘汰缓慢让位，不膨胀）

### 6.6 核心链路 e2e（B14，M8，`src-tauri/tests/e2e.rs`）

真实 sidecar ffmpeg/ffprobe 跑通「剪切 → 合并 → pipeline」主链路的集成测试（决策 #23）：

- **夹具**：测试自建——用 sidecar ffmpeg lavfi 生成 320×240 短片段（h264+aac），不依赖 `scripts/fixtures` 与网络；产物写入系统临时目录
- **链路断言**（链路部分全部走 command.rs 真实构建器）：
  1. 极速剪切 `cut_args` → 输出时长 ≈ 请求区间、流完整
  2. 精确剪切 `precise_cut_args` → 时长精确到 ±0.3s、可解码
  3. 合并 `concat_list_content` + `concat_args`（用两个剪切产物）→ 总时长 = 片段和
  4. pipeline 全链 `pipeline_copy_args` + `pipeline_transcode_args`（带裁剪）+ `normalize_args` + `concat_args` → 成品时长 = 片段和、全帧可解码
  5. 输出收尾 `fs::atomic_replace`（`BUG-002`）→ 目标路径已有旧产物时被**替换**为新产物、目录不留 `.part`
- **可解码判定**：`ffmpeg -v error -i <out> -f null -` 退出码 0 且 stderr 为空
- **跳过策略**：sidecar 缺失（未跑 fetch-ffmpeg）时打印 skip 并直接通过，保证裸 `cargo test` 不因环境失败
