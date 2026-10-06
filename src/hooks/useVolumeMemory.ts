/**
 * 预览音量的会话级全局记忆（M16-2 / `CAND-029`）：所有 VideoPlayer 实例共用一份
 * 音量与静音态——任一处调滑块/静音，其余实例即时同步；换视频、切页面（M10-1 保活）
 * 都不回默认。**会话级**：不入 settings.json，重启回默认（跨重启持久化将来可并入
 * 设置项，属增量）。外部只经本模块的 set 入口改写，`useSyncExternalStore` 保证
 * 多实例订阅一致。
 */
import { useSyncExternalStore } from "react";

interface VolumeState {
  volume: number;
  muted: boolean;
}

let state: VolumeState = { volume: 1, muted: false };
const listeners = new Set<() => void>();

function set(patch: Partial<VolumeState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useVolumeMemory() {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
  return {
    volume: snapshot.volume,
    muted: snapshot.muted,
    /** 滑块：音量到 0 视为静音；从 0 拉起自动解除静音（与既有交互语义一致） */
    setVolume(n: number) {
      set({ volume: n, muted: n > 0 ? false : state.muted });
    },
    toggleMuted() {
      set({ muted: !state.muted });
    },
  };
}
