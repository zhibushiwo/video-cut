/**
 * SrtPreview（M18-8，FR-393）：源视频 + .srt 同步只读预览。
 * 字幕由 `utils/srt.ts` 解析（单一真源），按 VideoPlayer 的 rAF 时间上报实时
 * 取当前 cue，经 `overlay` 插槽叠在画面底部；不提供任何编辑入口（§1.3 非目标）。
 */
import { useEffect, useState } from "react";
import VideoPlayer from "../../components/VideoPlayer";
import { fileSrc, readTextFile } from "../../services/tauri";
import { activeCueText, parseSrt, type SrtCue } from "../../utils/srt";

export function SrtPreview({
  videoPath,
  srtPath,
}: {
  videoPath: string;
  srtPath: string;
}) {
  const [cues, setCues] = useState<SrtCue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cue, setCue] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setCues(null);
    setError(null);
    setCue(null);
    readTextFile(srtPath)
      .then((text) => {
        if (alive) setCues(parseSrt(text));
      })
      .catch((e: unknown) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [srtPath]);

  if (error) {
    return (
      <div
        className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn"
        role="alert"
      >
        字幕预览加载失败：{error}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <VideoPlayer
        src={fileSrc(videoPath)}
        onTime={(sec) => setCue(activeCueText(cues ?? [], sec))}
        overlay={
          cue !== null && (
            <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-4">
              <span className="whitespace-pre-line rounded bg-ink/75 px-2.5 py-1 text-center text-sm leading-relaxed text-paper">
                {cue}
              </span>
            </div>
          )
        }
      />
      {cues !== null && (
        <div className="border-t border-hairline px-3 py-1.5 text-xs text-mute">
          字幕预览 · {cues.length} 条 · 只读（编辑请用文本工具打开 .srt）
        </div>
      )}
    </div>
  );
}
