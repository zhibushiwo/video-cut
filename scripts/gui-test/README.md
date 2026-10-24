# gui-test:CDP 真机测试助手(M22 真机验证用,工具非规格)

> **职责**:零依赖 CDP 驱动脚本——启动带调试端口的应用后,从命令行 eval/点击/截图、
> 用 Win32 消息驱动**原生文件对话框**(不抢焦点,适配 M10-1 页面保活的可见性过滤)。
> **用法**:见 docs/gui-e2e/README.md §2(启动三步),脚本由各 t*.mjs 用例调用。
> **注意**:测试会操作真实应用;跑之前关掉沙箱,别在用户前台打字。

- `cdp.mjs` — CLI:eval / click / key / drag / shot / dom / targets
- `cdp-lib.mjs` — 库:单连接 + 可见性过滤(offsetParent)的点击原语,测试脚本 import 用
- `add-file.mjs` — 经原生对话框加载文件(close-all → 轮询对话框 → WM_SETTEXT → PostMessage BM_CLICK 默认按钮 → 验证入列)
- `dialog-lib.ps1` / `dialog-clickok.ps1` — Win32 对话框消息助手(枚举 #32770 / WM_SETTEXT / BM_CLICK;**路径必须反斜杠**,IFileDialog 拒绝正斜杠)
- `shot-desktop.ps1` — 系统级截屏(对话框是原生子窗口,CDP 截不到)

## 已验证(M22 真机,2026-10-24)

| 用例 | 结果 |
| --- | --- |
| BUG-030 框选放大溢出 | ✅ 放大 1.54× 严格裁剪在容器内(截图 t1_zoomed.png) |
| CAND-040/045 时间轴 44px + 自适应 | ✅ 容器 44px;2s 片段块 480px(240px/s 上限),填充率 0.39 |
| CAND-039 剪切合并输出 | ✅ 产物 `_merged.mp4` 4.09s(两段标称 2s+2s,copy 吸附延伸),h264+aac 跟源 |
| CAND-041 分组合并 | ✅ 分组展示/单文件组跳过/产物 `_merged_时间戳.mp4` 10.02s(撞名防覆盖) |
| CAND-044 烧录样式默认 | ✅ 设置 42 重载仍在;字幕页烧录区预填 42 |
| CAND-042 mp3 转字幕 | ✅ 信息卡"纯音频";`test_audio.srt` 生成(无语音空 srt 属正确) |
| CAND-043 换素材起始目录 | ⚠ 未单独断言(对话框起始目录无法枚举;defaultPath 生效路径与 T4/T5 共用) |
