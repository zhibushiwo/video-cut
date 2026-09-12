import PageShell from "../../components/PageShell";

export type EditorTool = "rotate" | "crop";

const TOOLS: Record<EditorTool, { title: string; milestone: string; points: string[] }> = {
  rotate: {
    title: "旋转",
    milestone: "M3",
    points: ["元数据级无损旋转", "重编码旋转（高级选项）"],
  },
  crop: {
    title: "局部放大",
    milestone: "M3",
    points: ["画面框选与比例锁定", "硬件加速编码（NVENC / QSV / AMF）", "质量档位"],
  },
};

export default function EditorPage({
  tool,
  onBack,
}: {
  tool: EditorTool;
  onBack: () => void;
}) {
  const { title, milestone, points } = TOOLS[tool];
  return (
    <PageShell title={title} onBack={onBack}>
      <div className="max-w-sm rounded-lg border border-hairline bg-panel/60 p-5">
        <p className="text-sm font-medium">按开发计划在 {milestone} 实现</p>
        <ul className="mt-3 space-y-1.5 text-sm text-mute">
          {points.map((p) => (
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
