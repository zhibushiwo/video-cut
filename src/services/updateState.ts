/**
 * 应用更新检查的共享状态（M20，FR-398，ADR-046）。
 *
 * 极简外部 store（useSyncExternalStore 消费）：启动静默检查在 App 层发起一次，
 * 结果由设置页「检查更新」区消费；手动检查/下载也在设置页触发，走同一状态。
 * 断网/端点 404 等失败：静默检查回 `idle`（无声）；手动检查保留 error 提示。
 */
import { useSyncExternalStore } from "react";
import { checkForUpdate, downloadAndInstallUpdate } from "../services/tauri";

export interface UpdateStatus {
  status: "idle" | "checking" | "upToDate" | "available" | "downloading" | "ready";
  /** 新版本号（available/ready 态） */
  version?: string;
  /** 发布说明（Release body） */
  notes?: string;
  /** 下载进度 0~100（downloading 态） */
  progress?: number;
  /** 手动检查的失败信息（静默检查不设置） */
  error?: string;
}

let state: UpdateStatus = { status: "idle" };
const listeners = new Set<() => void>();

function set(next: UpdateStatus | ((prev: UpdateStatus) => UpdateStatus)) {
  state = typeof next === "function" ? next(state) : next;
  listeners.forEach((l) => l());
}

export function useUpdateStatus(): UpdateStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** 检查更新（silent = 失败无声回 idle；手动检查保留 error 供 UI 提示） */
export async function runUpdateCheck(silent: boolean): Promise<void> {
  set({ status: "checking" });
  try {
    const r = await checkForUpdate();
    if (r.version) {
      set({ status: "available", version: r.version, notes: r.notes });
    } else {
      set({ status: "upToDate" });
    }
  } catch (e: unknown) {
    set(silent ? { status: "idle" } : { status: "idle", error: String(e) });
  }
}

/** 下载并安装更新包（进度 0~100）；就绪后 UI 出「重启安装」 */
export async function startUpdateDownload(): Promise<void> {
  set((s) => ({ ...s, status: "downloading", progress: 0 }));
  try {
    await downloadAndInstallUpdate((p) => set((s) => ({ ...s, progress: p })));
    set((s) => ({ ...s, status: "ready", progress: 100 }));
  } catch (e: unknown) {
    set({ status: "idle", error: String(e) });
  }
}
