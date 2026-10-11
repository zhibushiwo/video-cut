/**
 * 应用更新检查的共享状态（M20，FR-398，ADR-046）。
 *
 * 极简外部 store（useSyncExternalStore 消费）：启动静默检查在 App 层发起一次，
 * 结果由设置页「检查更新」区消费；手动检查/下载也在设置页触发，走同一状态。
 * 断网/端点 404 等失败：静默检查回 `idle`（无声）；手动检查保留 error 提示。
 */
import { useSyncExternalStore } from "react";
import {
  appendFrontendLog,
  checkForUpdate,
  installUpdate,
  onUpdateProgress,
  type UnlistenFn,
} from "../services/tauri";

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

/** 检查更新（M20-4：Rust 直连 api.github.com；silent = 失败无声回 idle，手动检查保留 error） */
export async function runUpdateCheck(silent: boolean): Promise<void> {
  set({ status: "checking" });
  try {
    const r = await checkForUpdate();
    if (r.latest) {
      set({ status: "available", version: r.latest, notes: r.notes });
    } else {
      set({ status: "upToDate" });
    }
  } catch (e: unknown) {
    // 写日志文件（M20-3）：静默失败也留痕（warn 级），用户可经设置页打开日志定位
    void appendFrontendLog("warn", `[update] 检查更新失败（${silent ? "静默" : "手动"}）：${String(e)}`);
    set(silent ? { status: "idle" } : { status: "idle", error: String(e) });
  }
}

/** 下载并安装更新包（M20-4：动态端点 + 签名校验；进度事件 0~100；安装器拉起后应用退出） */
export async function startUpdateDownload(): Promise<void> {
  const target = state.version;
  if (!target) return;
  set((s) => ({ ...s, status: "downloading", progress: 0 }));
  let unlisten: UnlistenFn | null = null;
  try {
    unlisten = await onUpdateProgress((p) => set((s) => ({ ...s, progress: p })));
    await installUpdate(target);
    // 命令返回 = 安装器已拉起、应用即将退出；ready 仅作未退出时的兜底展示
    set((s) => ({ ...s, status: "ready", progress: 100 }));
  } catch (e: unknown) {
    void appendFrontendLog("error", `[update] 下载/安装失败：${String(e)}`);
    set({ status: "idle", error: String(e) });
  } finally {
    unlisten?.();
  }
}
