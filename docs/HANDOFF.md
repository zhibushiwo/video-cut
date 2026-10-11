# 开发状态交接（HANDOFF）

> **职责**：会话上下文压缩后的**状态快照**——现在在哪、下一步做什么、未决问题。
> **唯一真源**：**"当前状态与下一步"**以本文为准；进度细节以 [PLAN.md](./PLAN.md) 为准（任务行 ✅ 标注）；长期红线以 [../AGENTS.md](../AGENTS.md) 为准；批次实施要点见 [handoff-archive.md](./archive/handoff-archive.md)（2026-10-11 起含 M17~M21 段）。
> **读时机**：会话开场第一条；接续他人工作时。
> **写规则**：只写当前状态与**近期相关**的坑；批次要点随整理迁 handoff-archive；历史变更进 [CHANGELOG.md](./CHANGELOG.md)。
> **关联**：[../README.md](../README.md) · [INDEX.md](./INDEX.md) · [PLAN.md](./PLAN.md) · [../AGENTS.md](../AGENTS.md) · [RELEASE.md](./RELEASE.md)（发版手册）
> **最后更新**：2026-10-11（文档整理：快照同步至 M21-8 后实况；2026-10-07~10-11 批次要点与各文档头部历史迁 [handoff-archive.md](./archive/handoff-archive.md)）

## 当前状态（2026-10-11）

> 状态真源是 [PLAN.md](./PLAN.md)（任务行 checkbox）。**截至 2026-10-11 实况**：
> - **v0.2.0 已发布**（CI 自动发版 + 应用内更新通道上线；发版手册 [RELEASE.md](./RELEASE.md) 成文，铁律「仅用户明确要求才发包」）
> - **M18 AI 字幕全落地**（含增补 M18-8 预览 / M18-12 软字幕无损封装 / M18-13 烧录样式 / M18-14 信息架构与耗时估算）
> - **M20 应用内自动更新全落地**（含 M20-3 实机反馈修复与 M20-4 检查通道修订——自研 api.github.com 检查 + 原始响应写日志 + 动态端点交接）
> - **M21 工作台布局与播放器打磨八批全落地**（双列布局 / CAND-021 预览拖高 / fill contain / 竖向音量 / 设置三 tab / 框选放大推广 / ffprobe 报错清洗 / 弹性骨架页脚贴底 / RELEASE.md）
> - **真机 CDP 自动化测试通过**（M20-4/M21 全项；手法见 [handoff-archive.md](./archive/handoff-archive.md) 2026-10-11 段）
> - R2/R3/R4、T 台账、M17 均早已收尾；过度工程审查豁免清单见 archive

## 下一步（按序）

1. **0.3.0 发版**（**须用户明确要求**，流程照 [RELEASE.md](./RELEASE.md)）→ 发布后用 0.2.0 应用实测**更新下载/安装链路**（AC-398-1 最后一环，检查通道已在真机验证）
2. **M21-7 手测点清单**（用户实机；汇总见 [PLAN.md](./PLAN.md) M21-7 行）
3. **候选池裁决**（真源 [CANDIDATES.md](./CANDIDATES.md) §16）：`CAND-009` GIF 导出 · `CAND-021` 尾巴（剪切/合并页拖高跟进）· `CAND-028` 会话恢复（低优）· `CAND-036` 批量字幕识别（用户明确放最后）· `CAND-037` 导出目录选择推广

## 待用户统一手测

M21-7 行汇总的七组手测点（PLAN.md）；另 M18 十条手测点（PLAN M18-9 节，第 10 条 GPU 需 N 卡）。

## 未决问题（评审 / 反馈）——待定性

> 硬规则：会话结束前每条未决意见**必须转正**（`BUG`/`T`/`ADR`/`FR`）**或显式保留并写原因**；分流规则见 [INDEX.md](./INDEX.md) §6.2。

| 项 | 来源 | 现象 / 疑点 | 影响面 | 待定性原因 | 复查点 |
| --- | --- | --- | --- | --- | --- |
| 打包与安装未审 | 评审 §8 | `tauri.conf.json` / NSIS / capability 收窄 / CSP 未纳入审查 | **发布前硬门槛** | 属发布面；已在 `CAND-015` 立项 | 公开发布前统一处理（`CAND-015`） |
| 依赖安全未扫 | 评审 §8 | lockfile 未做已知漏洞扫描 | 供应链安全 | 需联网工具 | 发版前在可联网环境跑一次审计 |
| 性能未 profiling | 评审 §8 | 只有静态开销判断 | 大素材/多片段体验 | 缺 profiling 工具链与夹具 | M11-9（100 片段埋点）时一并取数 |
| e2e 断言强度未评估 | 评审 §8 | 覆盖缺口：rotate、crop_zoom、merge 非兼容转码分支、proxy 去重 | 回归保障强度 | R4/Vitest 基线已就位，评估未做 | 补缺口时参照 T-004 固化的 Vitest 用例形态 |
| 位深是否单独展示 | 自查 | `bit_depth` 字段已随 T-006 删除，若单列需三处同补 | 信息面板呈现 | 产品取舍 | 提"信息面板增强"时一并定 |
| 缩略图整批失败时的 UI 提示 | R4-5 CR | 合并页全部抽不出帧时静默空白 | 合并页可用性 | UX 增强；需先定文案与位置 | 提"合并页体验"批次时定 |
| 工作台中间件固定 mp4 与"copy 跟随源容器"缺口 | R4-6 CR | mkv + VP9 等源 copy 中间件会失败 | 非 mp4 系素材工作台导出 | 需真实素材（VP9/Opus mkv）验证 | 有素材真机验证时一并定 |
| 界面输出名 vs 实际落盘名 | R4-6 CR | ①源扩展名与容器不符时以后端校正为准（可接受）；②任务面板 label 用提交时请求名 | 界面一致性 | ②需后端回传终态路径 | 提"导出体验"批次时一并看 `HistoryEntry` |
| H.265 装了系统扩展也被强制代理 | R4-7 CR | `needsProxy` 静态白名单；宁可多生成代理 | 装了 HEVC 扩展机器的预览耗时 | 方向保守不破坏正确性 | M12 预览强化定；做准则并 `canPlayType` 入 `needsProxy` |

## 关键事实（可复用手法与契约）

- **Rust↔TS 契约集中在 `src-tauri/src/lib.rs`**（serde camelCase；枚举 snake_case）；改动同提交更新 `src/types` + DESIGN §7（红线 17）
- **sidecar 命名**：裸 `ffmpeg.exe` / `ffprobe.exe` / `whisper-cli.exe`；`resolve_sidecar` 对齐插件行为
- **任务系统**：并发 2、kill 取消、`.part`→rename；事件 `task-status` / `task-progress`
- **真机 CDP 测试手法**（2026-10-11 验证）：debug exe + `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223` + 独立 `WEBVIEW2_USER_DATA_FOLDER`；node 裸 CDP（ws 客户端在 `%TEMP%\cdp-driver`，连接助手可复用）；素材经 `__TAURI_INTERNALS__.invoke("plugin:event|emit_to", ...)` 注入 `tauri://drag-drop`；布局断言走 getBoundingClientRect。详见 handoff-archive 2026-10-11 段
- **node_modules 半残树修复**：pnpm 操作 os error 5 部分失败后，`rm -rf node_modules && pnpm install --config.node-linker=hoisted` 可从 store 秒级重建（2026-10-11 实证）
- **发版**：一切以 [RELEASE.md](./RELEASE.md) 为准（前置 Secret/Pages、步骤、坑清单）

## 环境提示

- 本机 `core.autocrlf=true` 来自 system 级 Git 配置（见 AGENTS §7）
- check-docs 第 5 项因缺个人测试素材存量失败（`video/*.mp4` 部分缺失）——`--no-verify` 提交为既有先例，不属新问题
