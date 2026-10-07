import { useCallback, useEffect, useState } from "react";
import CutPage from "./pages/Cut";
import MergePage from "./pages/Merge";
import EditorPage from "./pages/Editor";
import WorkbenchPage from "./pages/Workbench";
import HistoryPage from "./pages/History";
import SettingsPage from "./pages/Settings";
import TaskProgress from "./components/TaskProgress";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./services/settings";
import { useTauriEvent } from "./hooks/useTauriEvent";
import {
  checkEnvironment,
  onDragHover,
  onVideoDropped,
  onWindowCloseGuard,
} from "./services/tauri";
import { applyAccent } from "./theme";
import type { AppSettings, EnvironmentInfo, PageName } from "./types";

export default function App() {
  const [page, setPage] = useState<PageName>("workbench");
  const [env, setEnv] = useState<EnvironmentInfo | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** 拖入的文件：随页面挂载消费一次 */
  const [pending, setPending] = useState<string[] | null>(null);
  // 设置：App 层一次加载；页面按导航条件挂载，挂载时即拿到最终值
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);

  useEffect(() => {
    checkEnvironment()
      .then(setEnv)
      .catch((err: unknown) =>
        setEnv({
          ok: false,
          ffmpegVersion: null,
          ffprobeVersion: null,
          message: String(err),
        }),
      );
    void loadSettings().then((s) => {
      setSettings(s);
      setSettingsReady(true);
      applyAccent(s.accent);
    });
  }, []);

  // 关闭窗口守卫（DESIGN §9.9）：有未完成任务时二次确认
  useTauriEvent(() => onWindowCloseGuard());

  // 拖拽导入：落在当前页面由其自行接收（工作台追加为素材，剪切/合并/编辑页原地加载）
  useTauriEvent(() =>
    onVideoDropped((paths) => {
      setDragOver(false);
      setPending(paths);
    }),
  );
  useTauriEvent(() => onDragHover(setDragOver));

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      if (patch.accent) applyAccent(patch.accent);
      void saveSettings(next);
    },
    [settings],
  );

  const navigate = (p: PageName) => {
    if (p !== page) {
      // M10-1 页面保活（UI.md §9.2，决策 #24）：工作页切走只隐藏不卸载，隐藏瞬间暂停
      // 所有视频避免后台出声。各播放器的 React 播放态经既有 pause 事件回写同步
      //（VideoPlayer.onPause / ProductPreview.onPause），无需页面各自暴露暂停入口；
      // 隐藏页的视频本就已暂停，重复 pause 幂等
      document.querySelectorAll("video").forEach((v) => v.pause());
    }
    setPending(null);
    setPage(p);
  };

  return (
    <>
      {/*
        M10-1 页面保活（UI.md §9.2 / 决策 #24，`BUG-026`）：四个工作页（Cut/Merge/
        Editor/Workbench）离开时**隐藏不卸载**（display:none，状态全保留）——工作台
        素材/片段/时间轴/撤销栈重建成本高，且页面重置总则（§9.2 M14-2）只允许用户
        显式发起的清空。编辑页（M17-1 起 `rotate`/`crop` 收敛为 `editor`）是**单实例**保活，
        旋转 / 放大两个工具的加工态在页内 tab 各自保留、互不覆盖。
        `initialFiles` 只喂**当前活动页**——保活页常驻挂载，不门控会让隐藏页把同一次
        拖入也消费掉。History/Settings 无状态，维持条件挂载。
      */}
      {settingsReady && (
        <div className={page === "cut" ? "" : "hidden"}>
          <CutPage
            settings={settings}
            active={page === "cut"}
            onBack={() => navigate("workbench")}
            initialFiles={page === "cut" ? pending : null}
          />
        </div>
      )}
      {settingsReady && (
        <div className={page === "merge" ? "" : "hidden"}>
          <MergePage
            settings={settings}
            onBack={() => navigate("workbench")}
            initialFiles={page === "merge" ? pending : null}
          />
        </div>
      )}
      {settingsReady && (
        <div className={page === "editor" ? "" : "hidden"}>
          <EditorPage
            settings={settings}
            onBack={() => navigate("workbench")}
            initialFiles={page === "editor" ? pending : null}
          />
        </div>
      )}
      {page === "settings" && (
        <SettingsPage
          settings={settings}
          env={env}
          onUpdate={updateSettings}
          onBack={() => navigate("workbench")}
        />
      )}
      {page === "history" && <HistoryPage onBack={() => navigate("workbench")} />}
      {settingsReady && (
        <div className={page === "workbench" ? "" : "hidden"}>
          <WorkbenchPage
            settings={settings}
            env={env}
            active={page === "workbench"}
            onNavigate={navigate}
            initialFiles={page === "workbench" ? pending : null}
            onUpdateSettings={updateSettings}
          />
        </div>
      )}
      <TaskProgress autoCloseSec={settings.toastAutoCloseSec} />
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center gap-2 border-4 border-dashed border-signal/60 bg-ink/70 backdrop-blur-sm">
          <p className="text-lg font-medium text-paper">松开以导入视频</p>
          <p className="text-xs text-mute">视频将添加到当前页面</p>
        </div>
      )}
    </>
  );
}
