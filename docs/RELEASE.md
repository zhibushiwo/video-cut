# 发版流程（RELEASE）

> **职责**：发布新版本的完整操作手册——前置配置、发版步骤、CI 产物验证、已知坑。
> **读时机**：执行发包时；排查发版 CI 失败时。
> **关联**：[../AGENTS.md](../AGENTS.md) §5.1（流程概要与"仅用户明确要求才发包"规则） · [CHANGELOG.md](./CHANGELOG.md)（发布说明真源） · `.github/workflows/release.yml`（自动发版工作流）
> **最后更新**：2026-10-11（M20 自动更新上线后首次成文）

## 0. 铁律

**仅当用户（项目所有者）明确要求发包时才执行发包**——agent 不得自行推 `main` 触发发版。

## 1. 前置配置（一次性，已完成则跳过）

| 项 | 位置 | 说明 |
| --- | --- | --- |
| 签名私钥 Secret | 仓库 Settings → Secrets and variables → Actions → `TAURI_SIGNING_PRIVATE_KEY` | 内容 = 本地 `.tauri/video-cut.key` 文件全文（该目录已 gitignore）。**私钥丢失 = 已发版本无法再推送更新**，务必备份到密码管理器等异地 |
| GitHub Pages | 仓库 Settings → Pages → Branch 选 `gh-pages` + `/ (root)` | 更新器端点托管（`https://zhibushiwo.github.io/video-cut/latest.json`）；CI 每次发版整支重推该分支 |

## 2. 发版步骤

1. **收尾确认**：dev 分支满足 [../AGENTS.md](../AGENTS.md) §4 完事标准（tsc/eslint/vitest/cargo test/fmt 全绿；check-docs 第 5 项因缺个人测试素材存量失败属已知，`--no-verify` 提交）
2. **发布说明**：确认 `docs/CHANGELOG.md` 的 `[Unreleased]` 已包含全部用户可见变更（缺失则先补写——CI 从对应版本段提取 Release 说明）
3. **切版本**：`pnpm version:bump <x.y.z> --changelog`——同步 package.json / src-tauri/Cargo.toml（tauri.conf.json 自动跟随，红线 22）、把 `[Unreleased]` 切成 `## [x.y.z] - 日期`；切段后**补写新 `[Unreleased]` 的「开发中」状态行**
4. **提交并推 dev**：`chore:` 前缀提交版本切换，`git push origin dev`
5. **触发发版**：`git switch main && git merge dev && git push origin main`（推 main 触发 `release.yml`；dev 推送不触发）
6. **盯 CI**：`https://github.com/zhibushiwo/video-cut/actions`——Windows 构建约 10~15 分钟
7. **验证产物**（三件套缺一不可）：
   - Release 页出现 `v<x.y.z>`，资产 = `<名>_<版本>_x64-setup.exe` + `.sig` + `latest.json`
   - `https://zhibushiwo.github.io/video-cut/latest.json` 内容为**新版本号 + 真实签名 + 指向新资产直链的 URL**（GitHub Pages 有 ~1 分钟 CDN 延迟）
   - 旧版本应用内「检查更新」能发现新版本并走完 下载 → 重启安装
8. **收尾**：dev/main 同步说明写入 CHANGELOG 状态行（如适用）；真机冒烟（`NFR-011`/`TC-016`）

## 3. 已知坑（踩过的）

| 坑 | 症状 | 处置 |
| --- | --- | --- |
| Tauri 版本错配 | CI 构建步秒挂：`tauri (v2.x) : @tauri-apps/api (v2.y)` major/minor 不一致 | 升 `@tauri-apps/api` 与 Rust `tauri` crate 同 minor（2026-10-11：api 2.11.1 vs crate 2.12.2，pnpm 重装后新 CLI 才启用该检查） |
| 签名等待密码挂死 | 本地构建停在打包后无 `.sig`；CI 无 TTY 会挂到超时 | 工作流已设 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ""`（空密码密钥必须显式给空串）；本地构建同样带上该 env |
| pwsh BOM | latest.json 的 notes 首字符是 `\uFEFF` | 工作流读取时已 replace 掉（读 CHANGELOG 的 `Set-Content -Encoding utf8` 在 PS5.1 写 BOM） |
| 发布说明截断 | latest.json 的 notes 只有前 500 字符 | 工作流 `.slice(0, 500)`——嫌短改这个数字（latest.json 本身无长度限制） |
| check-docs 第 5 项失败 | 提交被 pre-commit 拦 | 缺个人测试素材（`video/*.mp4`）的存量问题，`--no-verify` 提交（同 49fabeb 先例） |

## 4. 更新端点与容错

- 端点双通道（`tauri.conf.json` plugins.updater.endpoints）：① GitHub Pages `latest.json`；② Release 资产直链 `releases/latest/download/latest.json`——插件逐个尝试直到解析成功（`BUG-029`：任一域名都可能被网络污染，双通道互为备份；插件不校验 Content-Type）
- 检查/下载失败写应用日志（warn/error 级），设置页「打开日志文件夹」可查——见 [UI.md](./UI.md) §9.9
- gh-pages 分支每次发版从零重推（孤儿分支，内容仅 latest.json），本地无需管理该分支
