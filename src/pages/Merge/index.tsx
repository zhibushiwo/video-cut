import PageShell from "../../components/PageShell";

const POINTS = ["参数一致性检测面板", "无损拼接（concat）", "参数不一致时自动统一"];

export default function MergePage({ onBack }: { onBack: () => void }) {
  return (
    <PageShell title="合并" onBack={onBack}>
      <div className="max-w-sm rounded-lg border border-hairline bg-panel/60 p-5">
        <p className="text-sm font-medium">按开发计划在 M2 实现</p>
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
