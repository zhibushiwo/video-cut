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
    setPending(null);
    setPage(p);
  };

  return (
    <>
      {page === "cut" && settingsReady && (
        <CutPage
          settings={settings}
          onBack={() => navigate("workbench")}
          initialFiles={pending}
        />
      )}
      {page === "merge" && settingsReady && (
        <MergePage
          settings={settings}
          onBack={() => navigate("workbench")}
          initialFiles={pending}
        />
      )}
      {(page === "rotate" || page === "crop") && settingsReady && (
        <EditorPage
          tool={page}
          settings={settings}
          onBack={() => navigate("workbench")}
          initialFiles={pending}
        />
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
      {page === "workbench" && settingsReady && (
        <WorkbenchPage
          settings={settings}
          env={env}
          onNavigate={navigate}
          initialFiles={pending}
        />
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
