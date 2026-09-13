/** 设置页（DESIGN §12 / M4-1）：改动即保存（write-through），无显式保存按钮。 */
import { ArrowLeft, FolderOpen, X } from "lucide-react";
import type { ReactNode } from "react";
import { pickDirectory } from "../../services/tauri";
import type { AppSettings, CutMode, EncoderChoice, ProxyMode, QualityPreset } from "../../types";

const ENCODER_LABELS: Record<EncoderChoice, string> = {
  auto: "自动（探测 GPU，失败回退软件）",
  h264_nvenc: "h264_nvenc（NVIDIA）",
  h264_qsv: "h264_qsv（Intel）",
  h264_amf: "h264_amf（AMD）",
  libx264: "libx264（软件）",
  libx265: "libx265（软件，10bit 用）",
};

const QUALITY_LABELS: Record<QualityPreset, string> = {
  high: "高质量",
  balanced: "平衡",
  small: "小体积",
};

const PROXY_LABELS: Record<ProxyMode, string> = {
  auto: "自动",
  always: "始终代理",
  off: "关闭",
};

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 py-4">
      <div className="min-w-0">
        <div className="text-sm text-paper">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-mute">{desc}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-hairline" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal ${
            value === o.value ? "bg-signal/15 text-signal" : "text-mute hover:text-paper"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage({
  settings,
  onUpdate,
  onBack,
}: {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onBack: () => void;
}) {
  const browseDir = async () => {
    const dir = await pickDirectory();
    if (dir) onUpdate({ defaultOutputDir: dir });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回工作台"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold tracking-tight">设置</h1>
      </header>

      <div className="mx-auto w-full max-w-2xl divide-y divide-hairline overflow-y-auto p-4">
        <Row
          title="默认输出目录"
          desc="导出文件保存的位置。留空则输出到源视频所在目录。"
        >
          <span
            className="max-w-44 truncate font-mono text-xs text-mute"
            title={settings.defaultOutputDir || undefined}
          >
            {settings.defaultOutputDir || "跟随源文件目录"}
          </span>
          <button
            type="button"
            onClick={() => void browseDir()}
            className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            浏览
          </button>
          {settings.defaultOutputDir && (
            <button
              type="button"
              onClick={() => onUpdate({ defaultOutputDir: "" })}
              aria-label="清除默认输出目录"
              className="flex h-6 w-6 items-center justify-center rounded-md text-mute transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </Row>

        <Row title="默认剪切模式" desc="极速 = 关键帧对齐无损剪切；精确 = 重编码到帧。">
          <Segmented<CutMode>
            label="默认剪切模式"
            value={settings.defaultCutMode}
            onChange={(v) => onUpdate({ defaultCutMode: v })}
            options={[
              { value: "fast", label: "极速" },
              { value: "precise", label: "精确" },
            ]}
          />
        </Row>

        <Row title="入点吸附关键帧" desc="剪切选区自动对齐到最近的关键帧，极速模式更精准。">
          <input
            type="checkbox"
            checked={settings.keyframeSnap}
            onChange={(e) => onUpdate({ keyframeSnap: e.target.checked })}
            className="accent-[#4cc38a]"
            aria-label="入点吸附关键帧"
          />
        </Row>

        <Row
          title="代理预览"
          desc="不被 WebView2 支持的格式（AVI/HEVC 等）自动生成低清代理画面，导出仍用原文件。始终代理可让 4K 预览更流畅。"
        >
          <Segmented<ProxyMode>
            label="代理预览"
            value={settings.proxyMode}
            onChange={(v) => onUpdate({ proxyMode: v })}
            options={(Object.keys(PROXY_LABELS) as ProxyMode[]).map((m) => ({
              value: m,
              label: PROXY_LABELS[m],
            }))}
          />
        </Row>

        <Row
          title="编码器"
          desc="重编码类任务（精确剪切/旋转重编码/局部放大/工作台）使用的编码器。自动按画面位深选择 H.264 或 HEVC 并探测 GPU。"
        >
          <select
            value={settings.encoder}
            onChange={(e) => onUpdate({ encoder: e.target.value as EncoderChoice })}
            className="rounded border border-hairline bg-panel px-2 py-1.5 text-xs text-paper focus:border-signal focus:outline-none"
            aria-label="编码器"
          >
            {(Object.keys(ENCODER_LABELS) as EncoderChoice[]).map((enc) => (
              <option key={enc} value={enc}>
                {ENCODER_LABELS[enc]}
              </option>
            ))}
          </select>
        </Row>

        <Row title="默认质量档位" desc="重编码类任务的默认质量。每次导出前仍可单独调整。">
          <select
            value={settings.quality}
            onChange={(e) => onUpdate({ quality: e.target.value as QualityPreset })}
            className="rounded border border-hairline bg-panel px-2 py-1.5 text-xs text-paper focus:border-signal focus:outline-none"
            aria-label="默认质量档位"
          >
            {(Object.keys(QUALITY_LABELS) as QualityPreset[]).map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABELS[q]}
              </option>
            ))}
          </select>
        </Row>

        <p className="py-4 text-xs text-mute/80">
          设置改动即时生效并保存到本机（不随视频文件移动）。
        </p>
      </div>
    </div>
  );
}
