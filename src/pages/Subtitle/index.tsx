/**
 * 字幕页（M18-7，DESIGN §3.9 / UI.md §9.11）：导入视频 → 预览与信息（M18-14）
 * → 选模型与语言 → 识别 → .srt 落盘（任务面板接管进度）。
 * M18-14 信息架构：选片即预览（SrtPreview `srtPath` 可选，识别后同槽叠字幕）+
 * 信息卡（时长/大小/分辨率 + 预计识别耗时，`utils/subtitleEstimate.ts`）；
 * 模型下载/删除/后端管理迁设置页（§9.9「AI 字幕」区），本页只保留选择。
 * M19-3：导出区整合为单卡双模式（无损封装 signal / 烧录 warn），输出目录可临时改。
 * 页面保活（M10-1 口径）：模型列表与选择状态离开不丢失。
 */
import { useCallback, useEffect, useState } from "react";
import { Captions, FolderOpen } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyImport } from "../../components/EmptyImport";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { useConsumeInitialFiles } from "../../hooks/useConsumeInitialFiles";
import {
  fileExists,
  listWhisperModels,
  onTaskStatus,
  pickDirectory,
  pickSrt,
  pickVideo,
  probeMedia,
  submitTask,
} from "../../services/tauri";
import { basename, resolveOutputDir, resolveUniqueTarget, stemOf, subtitleMuxExt } from "../../utils/paths";
import { estimateTranscribeSec, formatEstimate } from "../../utils/subtitleEstimate";
import { formatBitrate, formatBytes, formatTime } from "../../utils/time";
import type {
  AppSettings,
  MediaInfo,
  SubtitleBurnStyle,
  WhisperModelInfo,
} from "../../types";
import { SrtPreview } from "./SrtPreview";

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
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  /** 已提交转写任务的 id（用于捕获完成事件里的真实产物路径，M18-8 预览数据源） */
  const [subtitleTaskId, setSubtitleTaskId] = useState<string | null>(null);
  /** 最近一次识别产出的 .srt 绝对路径（任务完成事件 outputs[0]） */
  const [previewSrt, setPreviewSrt] = useState<string | null>(null);
  /** 两个导出模式共用的字幕文件（默认跟随最近识别产物，可手动选择 .srt） */
  const [exportSrt, setExportSrt] = useState<string | null>(null);
  const [muxSubmitted, setMuxSubmitted] = useState(false);
  const [burnSubmitted, setBurnSubmitted] = useState(false);
  /** 烧录样式（M18-13，FR-396）：留空字段 = libass 默认；不持久化（ADR-045④） */
  // 烧录样式默认值来自设置页（M22-11，FR-399）；页内改动仅本次生效、不回写设置
  const [burnStyle, setBurnStyle] = useState<SubtitleBurnStyle>(settings.subtitleStyle);
  /** 导出卡模式（M19-3 整合）：mux = 无损封装（signal）/ burn = 烧录重编码（warn） */
  const [exportMode, setExportMode] = useState<"mux" | "burn">("mux");
  /** 导出目录覆盖（M19-3）：null = 跟随输出目录规则；会话内记忆不持久化（CAND-037 推广面） */
  const [exportDir, setExportDir] = useState<string | null>(null);

  useEffect(() => {
    if (previewSrt) setExportSrt(previewSrt);
  }, [previewSrt]);

  const refresh = useCallback(() => {
    void listWhisperModels()
      .then(setModels)
      .catch((e: unknown) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  /** 选片即探测（LRU 缓存命中）：信息卡数据源（M18-14，FR-393） */
  useEffect(() => {
    if (!filePath) {
      setMediaInfo(null);
      return;
    }
    let alive = true;
    setMediaInfo(null);
    probeMedia(filePath)
      .then((info) => {
        if (alive) setMediaInfo(info);
      })
      .catch(() => {
        if (alive) setMediaInfo(null);
      });
    return () => {
      alive = false;
    };
  }, [filePath]);

  useConsumeInitialFiles(initialFiles, (files) => {
    const first = files[0] ?? null;
    if (first) {
      setFilePath(first);
      setSubmitted(false);
      setError(null);
    }
  });

  // 转写任务完成 → 捕获真实产物路径（outputs[0]，M18-8 预览数据源；
  // 不猜文件名——防覆盖时间戳、换目录都不影响）
  useTauriEvent(() =>
    onTaskStatus((s) => {
      if (
        s.taskId === subtitleTaskId &&
        s.status === "completed" &&
        s.outputs.length > 0
      ) {
        setPreviewSrt(s.outputs[0] ?? null);
      }
    }),
  );

  const openFile = useCallback(() => {
    // 换素材从当前视频的目录起始（M22-2 / CAND-043）；无视频时缺省系统行为
    void pickVideo(filePath ?? undefined, { withAudio: true }).then((p) => {
      if (p) {
        setFilePath(p);
        setSubmitted(false);
        setError(null);
      }
    });
  }, [filePath]);

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
      .then((taskId) => {
        setSubtitleTaskId(taskId);
        setSubmitted(true);
      })
      .catch((e: unknown) => setError(String(e)));
  }, [filePath, settings]);

  const submitMux = useCallback(async () => {
    if (!filePath || !exportSrt) return;
    setError(null);
    setMuxSubmitted(false);
    try {
      const dir = exportDir ?? resolveOutputDir(filePath, settings.defaultOutputDir);
      const output = await resolveUniqueTarget(
        dir,
        `${stemOf(filePath)}_softsub.${subtitleMuxExt(filePath)}`,
        fileExists,
      );
      await submitTask({
        type: "subtitle_mux",
        input: filePath,
        subtitlePath: exportSrt,
        output,
      });
      setMuxSubmitted(true);
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [filePath, exportSrt, settings, exportDir]);

  const submitBurn = useCallback(async () => {
    if (!filePath || !exportSrt) return;
    setError(null);
    setBurnSubmitted(false);
    try {
      const dir = exportDir ?? resolveOutputDir(filePath, settings.defaultOutputDir);
      const output = await resolveUniqueTarget(
        dir,
        `${stemOf(filePath)}_subbed.mp4`,
        fileExists,
      );
      await submitTask({
        type: "subtitle_burn",
        input: filePath,
        subtitlePath: exportSrt,
        output,
        quality: settings.quality,
        encoder: settings.encoder === "auto" ? null : settings.encoder,
        style: burnStyle,
      });
      setBurnSubmitted(true);
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [filePath, exportSrt, settings, burnStyle, exportDir]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="字幕 · 本地语音识别，生成 .srt" onBack={onBack} />
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

            <section aria-label="视频预览与信息">
              <SrtPreview videoPath={filePath} srtPath={previewSrt} />
              {mediaInfo && (
                <div className="mt-2 rounded-lg border border-hairline px-3 py-2 text-xs text-mute">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      时长 <span className="text-paper">{formatTime(mediaInfo.durationSec, false)}</span>
                    </span>
                    <span>
                      大小 <span className="text-paper">{formatBytes(mediaInfo.sizeBytes)}</span>
                    </span>
                    {mediaInfo.video ? (
                      <>
                        <span>
                          分辨率{" "}
                          <span className="text-paper">
                            {mediaInfo.video.width}×{mediaInfo.video.height}
                          </span>
                        </span>
                        <span>
                          帧率{" "}
                          <span className="text-paper">
                            {mediaInfo.video.frameRate.toFixed(2)} fps
                          </span>
                        </span>
                        <span>
                          编码 <span className="text-paper">{mediaInfo.video.codec}</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-signal">纯音频（无画面，直接转写）</span>
                    )}
                    <span>
                      容器 <span className="text-paper">{mediaInfo.container}</span>
                    </span>
                    {mediaInfo.bitrate !== null && (
                      <span>
                        码率 <span className="text-paper">{formatBitrate(mediaInfo.bitrate)}</span>
                      </span>
                    )}
                    {mediaInfo.audio.length > 0 && (
                      <span>
                        音轨 <span className="text-paper">{mediaInfo.audio.length} 条</span>
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 border-t border-hairline pt-1.5">
                    预计识别耗时：
                    <span className="text-paper">
                      {formatEstimate(
                        estimateTranscribeSec(mediaInfo.durationSec, settings.subtitleModel),
                      )}
                    </span>
                    <span className="ml-1">
                      （CPU 口径估算，随模型档位变化；GPU 可用时实际显著更快）
                    </span>
                  </div>
                </div>
              )}
            </section>

            <section aria-label="识别模型与语言" className="flex flex-wrap items-center gap-3">
              <h2 className="text-xs font-medium text-mute">识别模型</h2>
              <select
                value={settings.subtitleModel}
                onChange={(e) => onUpdateSettings({ subtitleModel: e.target.value })}
                aria-label="识别模型"
                className="rounded-md border border-hairline bg-panel px-2 py-1.5 text-xs text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                {models && !models.some((m) => m.id === settings.subtitleModel) && (
                  <option value={settings.subtitleModel}>{settings.subtitleModel}</option>
                )}
                {(models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.custom ? "（自定义）" : m.bundled ? "（内置）" : m.ready ? "" : "（未下载，设置页可下载）"}
                  </option>
                ))}
              </select>
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
              <span className="text-xs text-mute">转写为语音原文（不做翻译）；模型下载与管理在「设置」页</span>
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

            {filePath && (
              <section
                aria-label="导出"
                className={`rounded-lg border p-3 ${exportMode === "mux" ? "border-signal/40" : "border-warn/40"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2
                    className={`text-sm font-medium ${exportMode === "mux" ? "text-signal" : "text-warn"}`}
                  >
                    {exportMode === "mux" ? "封装字幕（无损）" : "烧录字幕（重编码）"}
                  </h2>
                  <div
                    className="flex overflow-hidden rounded-md border border-hairline"
                    role="group"
                    aria-label="导出模式"
                  >
                    {(
                      [
                        ["mux", "无损封装"],
                        ["burn", "烧录到画面"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setExportMode(v)}
                        aria-label={`导出模式 ${label}`}
                        className={`px-2.5 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal ${
                          exportMode === v ? "bg-signal/15 text-signal" : "text-mute hover:text-paper"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {exportMode === "mux" ? (
                  <p
                    className="mt-1 text-xs leading-relaxed text-mute"
                    title="字幕样式由播放器决定；mov_text 在部分老设备/硬件播放器上可能不显示"
                  >
                    .srt 封装进新容器，视频/音频原样复制（秒级、无损），播放器可开关字幕；输出{" "}
                    <code className="font-mono">{`${stemOf(filePath)}_softsub.${subtitleMuxExt(filePath)}`}</code>。
                  </p>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-mute">
                    字幕渲染进画面，
                    <span className="text-warn">需重编码（有损、耗时）</span>
                    ；输出{" "}
                    <code className="font-mono">{`${stemOf(filePath)}_subbed.mp4`}</code>。
                  </p>
                )}
                {exportMode === "burn" && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-mute">
                    <span>样式：</span>
                    {(
                      [
                        ["fontSize", "字号", 500],
                        ["outline", "描边", 50],
                        ["marginV", "底部边距", 500],
                      ] as const
                    ).map(([key, label, max]) => (
                      <label key={key} className="flex items-center gap-1">
                        {label}
                        <input
                          type="number"
                          min={0}
                          max={max}
                          value={burnStyle[key] ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            // 前端即钳到 [0, max]：负数/超界值若下发会被 Rust Option<u32> 反序列化拒绝
                            //（晦涩 serde 报错），clamp 语义在 UI 层就该兑现（Review 修复）
                            const n = Math.round(Number(raw));
                            const v =
                              raw === "" || !Number.isFinite(n)
                                ? undefined
                                : Math.min(max, Math.max(0, n));
                            setBurnStyle((st) => ({
                              ...st,
                              [key]: v,
                            }));
                          }}
                          placeholder="默认"
                          title="留空 = 默认样式（超范围自动收敛）"
                          className="w-16 rounded-md border border-hairline bg-panel px-1.5 py-1 text-xs text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-warn"
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      onClick={() => setBurnStyle({})}
                      className="text-mute underline-offset-2 transition-colors hover:text-paper hover:underline focus:outline-none"
                    >
                      恢复默认
                    </button>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-mute">
                  <span>
                    字幕文件：
                    {exportSrt ? (
                      <span className="text-paper">{basename(exportSrt)}</span>
                    ) : (
                      "未选择"
                    )}
                  </span>
                  <span className="min-w-0">
                    输出到：
                    <span className="text-paper">
                      {exportDir ?? resolveOutputDir(filePath, settings.defaultOutputDir)}
                    </span>
                    {exportDir && <span className="ml-1">（本次临时）</span>}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void pickSrt().then((p) => p && setExportSrt(p))}
                    className="rounded-md border border-hairline px-2 py-1 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                  >
                    选择 .srt…
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void pickDirectory().then((d) => {
                        if (d) setExportDir(d);
                      })
                    }
                    className="rounded-md border border-hairline px-2 py-1 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                  >
                    选择文件夹…
                  </button>
                  {exportDir && (
                    <button
                      type="button"
                      onClick={() => setExportDir(null)}
                      className="rounded-md border border-hairline px-2 py-1 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                    >
                      恢复默认目录
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!exportSrt}
                    onClick={() => void (exportMode === "mux" ? submitMux() : submitBurn())}
                    className={
                      exportMode === "mux"
                        ? "rounded-md bg-signal px-3 py-1.5 text-xs font-medium text-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40"
                        : "rounded-md border border-warn/60 px-3 py-1.5 text-xs text-warn transition-colors hover:bg-warn/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-warn disabled:cursor-not-allowed disabled:opacity-40"
                    }
                  >
                    {exportMode === "mux" ? "导出封装视频" : "导出烧录视频"}
                  </button>
                </div>
                {(exportMode === "mux" ? muxSubmitted : burnSubmitted) && (
                  <p className="mt-2 text-xs text-signal" role="status">
                    已提交导出任务，进度见任务面板。
                  </p>
                )}
              </section>
            )}

            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              title={selectedReady ? undefined : "所选模型未下载（设置页可下载）"}
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
