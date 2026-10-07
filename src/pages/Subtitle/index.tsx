/**
 * 字幕页（M18-7，DESIGN §3.9 / UI.md §9.11）：导入视频 → 选模型与语言 → 识别
 * → .srt 落盘（任务面板接管进度）。页面保活（M10-1 口径）：模型列表与选择状态
 * 离开不丢失。
 */
import { useCallback, useEffect, useState } from "react";
import { Captions, FolderOpen } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyImport } from "../../components/EmptyImport";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { useConsumeInitialFiles } from "../../hooks/useConsumeInitialFiles";
import {
  deleteWhisperModel,
  downloadWhisperCuda,
  downloadWhisperModel,
  listWhisperModels,
  onTaskProgress,
  onTaskStatus,
  openModelsDir,
  pickVideo,
  probeWhisperBackend,
  submitTask,
} from "../../services/tauri";
import { basename, resolveOutputDir } from "../../utils/paths";
import type {
  AppSettings,
  TaskStatus,
  WhisperBackendStatus,
  WhisperModelInfo,
} from "../../types";
import { ModelPicker } from "./ModelPicker";
import { BackendBadge } from "./BackendBadge";

const LANGUAGES: { value: string; label: string }[] = [
  { value: "auto", label: "自动检测" },
  { value: "zh", label: "中文" },
  { value: "en", label: "英语" },
  { value: "ja", label: "日语" },
];

export default function SubtitlePage({
  settings,
  active,
  onBack,
  initialFiles,
  onUpdateSettings,
}: {
  settings: AppSettings;
  active: boolean;
  onBack: () => void;
  initialFiles: string[] | null;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [models, setModels] = useState<WhisperModelInfo[] | null>(null);
  const [backend, setBackend] = useState<WhisperBackendStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  /** 进行中的下载任务（模型 / CUDA 加速包）：进度与完成回调 */
  const [dl, setDl] = useState<{
    id: string;
    kind: "model" | "cuda";
    name: string;
    progress: number;
  } | null>(null);

  const refresh = useCallback(() => {
    void listWhisperModels()
      .then(setModels)
      .catch((e: unknown) => setError(String(e)));
    void probeWhisperBackend()
      .then(setBackend)
      .catch(() => setBackend(null));
  }, []);
  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  useConsumeInitialFiles(initialFiles, (files) => {
    const first = files[0] ?? null;
    if (first) {
      setFilePath(first);
      setSubmitted(false);
      setError(null);
    }
  });

  // 下载任务进度 / 终态：完成后刷新模型列表与 GPU 状态
  useTauriEvent(() =>
    onTaskProgress((p) => {
      setDl((d) => (d && d.id === p.taskId ? { ...d, progress: p.percent } : d));
    }),
  );
  useTauriEvent(() =>
    onTaskStatus((s) => {
      setDl((d) => {
        if (!d || d.id !== s.taskId) return d;
        const terminal: TaskStatus = s.status;
        if (terminal === "completed" || terminal === "failed" || terminal === "cancelled") {
          if (terminal === "failed") {
            setError(s.error ?? "下载失败");
          }
          void refresh();
          return null;
        }
        return d;
      });
    }),
  );

  const openFile = useCallback(() => {
    void pickVideo().then((p) => {
      if (p) {
        setFilePath(p);
        setSubmitted(false);
        setError(null);
      }
    });
  }, []);

  const onDownloadModel = useCallback(
    (id: string) => {
      setError(null);
      void downloadWhisperModel(id)
        .then((taskId) => {
          const m = models?.find((x) => x.id === id);
          setDl({ id: taskId, kind: "model", name: m?.fileName ?? id, progress: 0 });
        })
        .catch((e: unknown) => setError(String(e)));
    },
    [models],
  );

  const onDeleteModel = useCallback(
    (id: string) => {
      setError(null);
      void deleteWhisperModel(id)
        .then(refresh)
        .catch((e: unknown) => setError(String(e)));
    },
    [refresh],
  );

  const onDownloadCuda = useCallback(() => {
    setError(null);
    void downloadWhisperCuda()
      .then((taskId) => setDl({ id: taskId, kind: "cuda", name: "cuda", progress: 0 }))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const selectedReady =
    models?.find((m) => m.id === settings.subtitleModel)?.ready ?? false;
  const canSubmit = !!filePath && selectedReady;

  const submit = useCallback(() => {
    if (!filePath) return;
    setError(null);
    setSubmitted(false);
    void submitTask({
      type: "subtitle",
      input: filePath,
      modelId: settings.subtitleModel,
      language: settings.subtitleLanguage,
      backend: settings.subtitleBackend,
      outputDir: resolveOutputDir(filePath, settings.defaultOutputDir),
    })
      .then(() => setSubmitted(true))
      .catch((e: unknown) => setError(String(e)));
  }, [filePath, settings]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="字幕 · 本地语音识别，生成 .srt"
        onBack={onBack}
        right={
          <BackendBadge
            status={backend}
            downloading={dl?.kind === "cuda"}
            progress={dl?.kind === "cuda" ? dl.progress : 0}
            onDownloadCuda={onDownloadCuda}
          />
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {!filePath ? (
          <EmptyImport
            onOpen={openFile}
            icon={Captions}
            label="打开视频，识别语音生成字幕"
            hint="本地转写 · 视频流零改动 · 产物为 .srt 外挂文件"
            maxWidth="max-w-xl"
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm text-paper">{basename(filePath)}</div>
                <div className="mt-0.5 text-xs text-mute">
                  字幕输出到：{resolveOutputDir(filePath, settings.defaultOutputDir)}
                </div>
              </div>
              <button
                type="button"
                onClick={openFile}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                换视频
              </button>
            </div>

            <section aria-label="识别模型">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-medium text-mute">识别模型</h2>
                <button
                  type="button"
                  onClick={() => void openModelsDir().catch((e: unknown) => setError(String(e)))}
                  title="把自行下载的模型文件（如 ggml-small-q5_1.bin）放进此目录即可被识别"
                  className="flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  打开模型文件夹
                </button>
              </div>
              {models ? (
                <ModelPicker
                  models={models}
                  selectedId={settings.subtitleModel}
                  downloadingName={dl?.kind === "model" ? dl.name : null}
                  progress={dl?.kind === "model" ? dl.progress : 0}
                  onSelect={(id) => onUpdateSettings({ subtitleModel: id })}
                  onDownload={onDownloadModel}
                  onDelete={onDeleteModel}
                />
              ) : (
                <div className="rounded-lg border border-hairline px-3 py-4 text-xs text-mute">
                  正在读取模型列表…
                </div>
              )}
              <p className="mt-2 text-xs leading-relaxed text-mute">
                标准与高质量档效果更好；BGM 较响的素材建议高质量档。下载需联网（一次性），
                也可手动把模型文件放入缓存 models 目录。
              </p>
            </section>

            <section aria-label="识别语言" className="flex items-center gap-3">
              <h2 className="text-xs font-medium text-mute">语音语言</h2>
              <select
                value={settings.subtitleLanguage}
                onChange={(e) => onUpdateSettings({ subtitleLanguage: e.target.value })}
                aria-label="语音语言"
                className="rounded-md border border-hairline bg-panel px-2 py-1.5 text-xs text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-mute">转写为语音原文（不做翻译）</span>
            </section>

            {error && (
              <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn" role="alert">
                {error}
              </div>
            )}
            {submitted && (
              <div className="rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-xs text-signal" role="status">
                已提交识别任务，进度见下方任务面板；完成后 .srt 与视频同目录同名。
              </div>
            )}

            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              title={selectedReady ? undefined : "所选模型未下载"}
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-signal text-sm font-medium text-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Captions className="h-4 w-4" />
              开始识别
            </button>
          </>
        )}
      </div>
    </div>
  );
}
