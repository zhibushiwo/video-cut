import PageShell from "../../components/PageShell";

const POINTS = [
  "视频信息探测（ffprobe）",
  "关键帧吸附时间轴与区间选择",
  "极速剪切 / 精确剪切",
  "任务进度与取消",
];

export default function CutPage({ onBack }: { onBack: () => void }) {
  return (
    <PageShell title="剪切" onBack={onBack}>
      <div className="max-w-sm rounded-lg border border-hairline bg-panel/60 p-5">
        <p className="text-sm font-medium">按开发计划在 M1 实现</p>
        <ul className="mt-3 space-y-1.5 text-sm text-mute">
          {POINTS.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-signal">·</span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </PageShell>
  );
}
