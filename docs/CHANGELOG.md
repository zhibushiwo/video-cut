# 变更日志（CHANGELOG）

> **职责**：记录**用户可见**的功能与行为变更（新增、变更、修复、移除），按版本成段。
> **唯一真源**：用户可见变更的对外表述以本文为准；**实现级细节**在各批次提交与 [handoff-archive.md](./archive/handoff-archive.md)，本文不重复。
> **读时机**：发版前整理发布说明；用户问"这版有什么变化"。
> **写规则**：只记用户可见项；只追加不重写历史段；开发中的变更先进 `[Unreleased]`，发版时切成 `[x.y.z] - YYYY-MM-DD`。**不抄 git log**（工程面改动如 lint/重构/文档整理不入本文）。
> **关联**：[INDEX.md](./INDEX.md) · 进度 [PLAN.md](./PLAN.md) · 历史实现 [handoff-archive.md](./archive/handoff-archive.md)
> **最后更新**：2026-09-19（建立模板）

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，分类固定为：新增 / 变更 / 修复 / 移除。

---

## [Unreleased]

> 当前开发中：M11 单轨时间线核心（切割、波纹删除、边缘修剪、拖拽重排、撤销栈、缩放、播放头）。
> 尚未发布，无用户可见变更条目；M11 完成后按实际能力补写。

### 新增
- （待 M11 完成后补写）

### 变更
- （暂无）

### 修复
- （暂无）

### 移除
- （暂无）

<!--
发版时把上面的 [Unreleased] 段整体复制为：

## [1.0.0] - YYYY-MM-DD

### 新增
- ...

然后在顶部重新开一个空的 [Unreleased] 段。
首个正式版本发布时，本文从 v1.0 起记（M0–M9 的开发过程见 git 历史与 handoff-archive.md，不回溯补写）。
-->
