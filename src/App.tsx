import { useEffect, useState } from "react";
import HomePage from "./pages/Home";
import CutPage from "./pages/Cut";
import MergePage from "./pages/Merge";
import EditorPage from "./pages/Editor";
import TaskProgress from "./components/TaskProgress";
import { checkEnvironment } from "./services/tauri";
import type { EnvironmentInfo, PageName } from "./types";

export default function App() {
  const [page, setPage] = useState<PageName>("home");
  const [env, setEnv] = useState<EnvironmentInfo | null>(null);

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
  }, []);

  return (
    <>
      {page === "home" && <HomePage env={env} onNavigate={setPage} />}
      {page === "cut" && <CutPage onBack={() => setPage("home")} />}
      {page === "merge" && <MergePage onBack={() => setPage("home")} />}
      {(page === "rotate" || page === "crop") && (
        <EditorPage tool={page} onBack={() => setPage("home")} />
      )}
      <TaskProgress />
    </>
  );
}
