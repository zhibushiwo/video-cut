# TC-043 · M11-9 性能验收（帧预算埋点报告 · 真机半）

> **职责**：TIMELINE.md §17.9 预算表的**真机测量步骤**。命令层（撤销/重做）的预算已在纯函数层计量并记入 [TESTING.md](../TESTING.md) TC-043（数字见该行）；本文件的另一半 = 拖拽/播放头/seek 的帧时间埋点报告，需要真机跑（用户发起）。
> **关联**：[TESTING.md](../TESTING.md) TC-043 · [TIMELINE.md](../TIMELINE.md) §17.9 · [plans/M11.md](../plans/M11.md) §18.6/§18.9 · [README.md](./README.md)（CDP 运行手册）

## 1. 夹具（100 片段）

```bash
FF=src-tauri/target/debug/ffmpeg.exe
mkdir -p .workbuddy/tmp/perf-fixtures
for i in $(seq -w 1 100); do
  "$FF" -hide_banner -loglevel error -y -f lavfi -i "testsrc=duration=1:size=320x240:rate=15" \
    -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -an ".workbuddy/tmp/perf-fixtures/perf_$i.mp4"
done
```

h264/yuv420p/mp4 → 不触发代理，导入即播。

## 2. 建 100 片段时间轴

1. 启动应用（[README.md](./README.md) §2.2 三步，CDP 可选——本用例手动即可）。
2. 首屏「添加视频素材」→ 多选全部 100 个 `perf_*.mp4`。
3. 勾选任一素材卡 → 批量条「全选」→「批量建片段」——一次手势（composite×100）建满时间轴。
4. 确认页脚「时间轴 100 段 · 总时长 ≈ 100s」。

## 3. 场景与取数

埋点以 `[perf] scene=… frames=N p50=… p95=… max=… drops=…` 行落日志（debug 构建默认 debug 级）：

```bash
grep "\[perf\]" "$APPDATA/com.hippo.video-cut/logs/"*.log
```

| 场景 | 操作 | 判定（§17.9 预算） |
| --- | --- | --- |
| `scene=drag` | 时间轴上**整块拖拽重排** 3~5 次（每次 ≥2s，触发采样窗口；松手冲刷） | P95 ≤ 16.7ms（< 1 帧）且 drops 不随片段数增长 |
| `scene=drag`（修剪） | 抓住某块边缘修剪拖动 3 次 | 同上 |
| `scene=playing` | Space 播放 ≥ 6s 后暂停（停播冲刷） | P95 ≤ 16.7ms；播放头刷新的 React commit 计数 = 0/帧（React DevTools Profiler 手动核一次，§18.4 设计已证） |
| seek 响应 | 放大 PPS 后点击标尺远端 5 次 | 播放头落点 < 100ms（DevTools Performance 或体感） |
| `scene=undo` | Ctrl+Z / Ctrl+Shift+Z（重排/切割/修剪各若干） | 命令层已计量达标（见 TC-043 自动化半）；真机半看操作到重绘是否即时 |

## 4. 记录

测得数字回填 [TESTING.md](../TESTING.md) TC-043 行（格式同 TC-030：`✅ 通过（日期，证据=日志行）`）；不达标 → 按 [BUGS.md](../BUGS.md) 判定线登记缺陷（预算在 §17.9 表）。
