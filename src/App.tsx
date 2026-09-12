import { useEffect, useState } from "react";
import HomePage from "./pages/Home";
import CutPage from "./pages/Cut";
import MergePage from "./pages/Merge";
import EditorPage from "./pages/Editor";
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

  if (page === "home") {
    return <HomePage env={env} onNavigate={setPage} />;
  }
  if (page === "cut") {
    return <CutPage onBack={() => setPage("home")} />;
  }
  if (page === "merge") {
    return <MergePage onBack={() => setPage("home")} />;
  }
  return <EditorPage tool={page} onBack={() => setPage("home")} />;
}
