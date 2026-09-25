/**
 * 播放走带快捷键（M4-3 / UI §9.4 的共用块，R2-2 收敛）：
 * 空格 播放/暂停 · ←/→ ±1 秒 · Shift+←/→ 逐帧（1/fps）。
 * 剪切页 / 工作台源剪切 / 片段加工 / 成品连播四端共用；
 * 页面专属键（I/O 设点、Delete 删片段等）仍由各页面自己的 useHotkeys 处理。
 * 焦点在输入框时的忽略由底层 useHotkeys 统一负责。
 */
import { useHotkeys } from "./useHotkeys";

export function usePlaybackHotkeys(opts: {
  /** false 时整块跳过（工作台只在成品预览模式启用） */
  enabled?: boolean;
  /** 当前播放位置（秒），←/→ 以它为基准 seek */
  currentTime: number;
  /** seek 上界（秒）；下界恒为 0 */
  maxT: number;
  /** Shift+方向键的步长（秒），默认 1/30 */
  frameStep?: number;
  onTogglePlay(): void;
  onSeek(t: number): void;
}) {
  const { enabled = true, currentTime, maxT, frameStep = 1 / 30, onTogglePlay, onSeek } = opts;
  useHotkeys((e) => {
    if (!enabled) return;
    if (e.code === "Space") {
      if (e.repeat) return;
      e.preventDefault();
      onTogglePlay();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? frameStep : 1);
      onSeek(Math.min(Math.max(0, currentTime + delta), maxT));
    }
  });
}
