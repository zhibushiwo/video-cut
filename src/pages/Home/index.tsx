import { useMemo } from "react";
import type { EnvironmentInfo, PageName } from "../../types";

interface HomeProps {
  env: EnvironmentInfo | null;
  onNavigate: (page: PageName) => void;
}

type BadgeTone = "signal" | "warn";

interface Operation {
  page: PageName;
  title: string;
  desc: string;
  tags: { label: string; tone: BadgeTone }[];
}

const OPERATIONS: Operation[] = [
  {
    page: "cut",
    title: "剪切",
    desc: "把一个视频切成多个片段，或截取任意区间。入点吸附关键帧，落点所见即所得。",
    tags: [
      { label: "无损", tone: "signal" },
      { label: "极速", tone: "signal" },
    ],
  },
  {
    page: "merge",
    title: "合并",
    desc: "把多个视频按顺序拼成一个文件。参数一致时直接拼接数据流，秒级完成。",
    tags: [
      { label: "无损", tone: "signal" },
      { label: "极速", tone: "signal" },
    ],
  },
  {
    page: "rotate",
    title: "旋转",
    desc: "调整视频方向。默认只改方向元数据并重新封装，画面像素原样保留。",
    tags: [{ label: "无损", tone: "signal" }],
  },
  {
    page: "crop",
    title: "局部放大",
    desc: "框选画面中感兴趣的区域，裁切后放大输出，帧内信息更聚焦。",
    tags: [{ label: "重编码", tone: "warn" }],
  },
];

/** 品牌标记：一条斜切线把画面分成两块——"剪开"本身。 */
function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path d="M6 4.5h9.8L12.7 11H6z" fill="currentColor" />
      <path d="M11.4 13H18v6.5H8.1z" fill="currentColor" />
    </svg>
  );
}

const RULER_TICKS = 61;
/** 示意关键帧落点（百分比位置） */
const KEYFRAMES = [4, 13, 24, 37, 52, 66, 83];
const TIMECODES = ["00:00:00", "00:00:20", "00:00:40", "00:01:00", "00:01:20"];

/** 关键帧标尺：本产品一切操作发生的地方，作为主页的主视觉。 */
function KeyframeRuler() {
  const ticks = useMemo(() => Array.from({ length: RULER_TICKS }, (_, i) => i), []);
  return (
    <div className="relative h-16 select-none overflow-hidden rounded-md border border-hairline bg-panel/60">
      <div className="absolute inset-x-0 bottom-0 flex h-9 items-end justify-between px-1">
        {ticks.map((i) => (
          <span
            key={i}
            className={i % 10 === 0 ? "w-px bg-hairline" : "w-px bg-hairline/50"}
            style={{ height: i % 10 === 0 ? "100%" : "45%" }}
          />
        ))}
      </div>
      {KEYFRAMES.map((p) => (
        <span
          key={p}
          className="absolute bottom-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-signal"
          style={{ left: `${p}%` }}
        />
      ))}
      <span className="vc-playhead absolute bottom-0 top-0 w-px bg-paper/80">
        <span className="absolute -top-px left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-paper/80" />
      </span>
      {TIMECODES.map((t, i) => (
        <span
          key={t}
          className="absolute top-1.5 font-mono text-[10px] text-mute"
          style={{
            left: `${i * 25}%`,
            transform: `translateX(${i === 0 ? "0" : i === TIMECODES.length - 1 ? "-100%" : "-50%"})`,
          }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function EnvChip({ env }: { env: EnvironmentInfo | null }) {
  if (!env) {
    return (
      <div className="flex items-center gap-2 font-mono text-xs text-mute" title="正在检查内置 FFmpeg">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mute" />
        正在检测 FFmpeg…
      </div>
    );
  }
  if (env.ok) {
    return (
      <div
        className="flex items-center gap-2 font-mono text-xs text-mute"
        title={`ffmpeg ${env.ffmpegVersion ?? ""} / ffprobe ${env.ffprobeVersion ?? ""}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        FFmpeg {env.ffmpegVersion?.split("-")[0]} 就绪
      </div>
    );
  }
  return (
    <div
      className="flex items-center gap-2 font-mono text-xs text-warn"
      title={env.message ?? "FFmpeg 不可用"}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
      FFmpeg 未就绪
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const cls =
    tone === "signal"
      ? "border-signal/30 bg-signal/10 text-signal"
      : "border-warn/30 bg-warn/10 text-warn";
  return <span className={`rounded border px-1.5 py-0.5 text-xs ${cls}`}>{label}</span>;
}

function OperationRow({
  op,
  onNavigate,
}: {
  op: Operation;
  onNavigate: (page: PageName) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(op.page)}
      className="group relative flex w-full items-center gap-6 px-4 py-5 text-left transition-colors hover:bg-panel focus:outline-none focus-visible:bg-panel"
    >
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-0 top-3 w-0.5 scale-y-0 bg-signal transition-transform group-hover:scale-y-100 group-focus-visible:scale-y-100"
      />
      <span className="w-24 shrink-0 text-[17px] font-medium tracking-tight">{op.title}</span>
      <span className="min-w-0 flex-1 text-sm leading-relaxed text-mute">{op.desc}</span>
      <span className="flex shrink-0 gap-1.5">
        {op.tags.map((t) => (
          <Badge key={t.label} label={t.label} tone={t.tone} />
        ))}
      </span>
    </button>
  );
}

export default function HomePage({ env, onNavigate }: HomeProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-6">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">video-cut</div>
            <div className="text-[11px] text-mute">本地视频工具 v0.1.0</div>
          </div>
        </div>
        <EnvChip env={env} />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 pb-8">
        <KeyframeRuler />
        <p className="mt-4 text-sm leading-relaxed text-mute">
          剪切、合并、旋转、放大。默认不重新编码，画质和文件大小与原视频保持一致。
        </p>

        <div className="mt-6 divide-y divide-hairline border-y border-hairline">
          {OPERATIONS.map((op) => (
            <OperationRow key={op.page} op={op} onNavigate={onNavigate} />
          ))}
        </div>

        <p className="mt-5 text-xs text-mute/80">所有处理都在本机完成，文件不会离开电脑。</p>
      </main>
    </div>
  );
}
