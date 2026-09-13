import { useCallback, useEffect, useRef, useState } from "react";
import HomePage from "./pages/Home";
import CutPage from "./pages/Cut";
import MergePage from "./pages/Merge";
import EditorPage from "./pages/Editor";
import WorkbenchPage from "./pages/Workbench";
import HistoryPage from "./pages/History";
import SettingsPage from "./pages/Settings";
import TaskProgress from "./components/TaskProgress";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./services/settings";
import {
  checkEnvironment,
  onDragHover,
  onVideoDropped,
} from "./services/tauri";
import type { AppSettings, EnvironmentInfo, PageName } from "./types";

export default function App() {
  const [page, setPage] = useState<PageName>("home");
  const [env, setEnv] = useState<EnvironmentInfo | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** 拖入的文件：随页面挂载消费一次 */
  const [pending, setPending] = useState<string[] | null>(null);
  // 设置：App 层一次加载；页面按导航条件挂载，挂载时即拿到最终值
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  // 拖拽监听只注册一次，用 ref 读取当前页（避免闭包过期）
  const pageRef = useRef<PageName>("home");
  pageRef.current = page;

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
    });
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      void saveSettings(next);
    },
    [settings],
  );

  // 拖拽导入：主页按数量路由；其余页面留在原地，由页面自行接收
  useEffect(() => {
    let unDrop: (() => void) | undefined;
    let unHover: (() => void) | undefined;
    void onVideoDropped((paths) => {
      setDragOver(false);
      if (pageRef.current === "home") {
        setPending(paths);
        setPage(paths.length >= 2 ? "merge" : "cut");
      } else {
        setPending(paths);
      }
    }).then((f) => {
      unDrop = f;
    });
    void onDragHover(setDragOver).then((f) => {
      unHover = f;
    });
    return () => {
      unDrop?.();
      unHover?.();
    };
  }, []);

  const navigate = (p: PageName) => {
    setPending(null);
    setPage(p);
  };

  return (
    <>
      {page === "home" && <HomePage env={env} onNavigate={navigate} />}
      {page === "cut" && settingsReady && (
        <CutPage
          settings={settings}
          onBack={() => navigate("home")}
          initialFiles={pending}
        />
      )}
      {page === "merge" && settingsReady && (
        <MergePage
          settings={settings}
          onBack={() => navigate("home")}
          initialFiles={pending}
        />
      )}
      {(page === "rotate" || page === "crop") && settingsReady && (
        <EditorPage
          tool={page}
          settings={settings}
          onBack={() => navigate("home")}
          initialFiles={pending}
        />
      )}
      {page === "workbench" && settingsReady && (
        <WorkbenchPage
          settings={settings}
          onBack={() => navigate("home")}
          initialFiles={pending}
        />
      )}
      {page === "settings" && (
        <SettingsPage settings={settings} onUpdate={updateSettings} onBack={() => navigate("home")} />
      )}
      {page === "history" && <HistoryPage onBack={() => navigate("home")} />}
      <TaskProgress />
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center gap-2 border-4 border-dashed border-signal/60 bg-ink/70 backdrop-blur-sm">
          <p className="text-lg font-medium text-paper">松开以导入视频</p>
          <p className="text-xs text-mute">
            {page === "home"
              ? "单个文件进入剪切，多个文件进入合并"
              : "视频将添加到当前页面"}
          </p>
        </div>
      )}
    </>
  );
}
