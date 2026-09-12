/**
 * 前端访问 Tauri 后端的唯一入口（DESIGN §5.2/§5.4）。
 * UI 组件不得直接 import @tauri-apps/api 或各插件包。
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  EnvironmentInfo,
  MediaInfo,
  TaskProgressPayload,
  TaskSnapshot,
  TaskStatusPayload,
  VideoTask,
} from "../types";

/** 支持 Open/保存的容器扩展名（DESIGN §10 处理范围） */
export const VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "mkv",
  "avi",
  "webm",
  "m4v",
  "ts",
  "flv",
  "wmv",
];

export function checkEnvironment(): Promise<EnvironmentInfo> {
  return invoke("check_environment");
}

export function probeMedia(input: string): Promise<MediaInfo> {
  return invoke("probe_media", { input });
}

export function listKeyframes(input: string): Promise<number[]> {
  return invoke("list_keyframes", { input });
}

export function submitTask(task: VideoTask): Promise<string> {
  return invoke("submit_task", { task });
}

export function cancelTask(taskId: string): Promise<boolean> {
  return invoke("cancel_task", { taskId });
}

export function listTasks(): Promise<TaskSnapshot[]> {
  return invoke("list_tasks");
}

export function generateProxy(
  input: string,
): Promise<{ taskId: string | null; proxyPath: string }> {
  return invoke("generate_proxy", { input });
}

export function onTaskStatus(
  handler: (payload: TaskStatusPayload) => void,
): Promise<UnlistenFn> {
  return listen<TaskStatusPayload>("task-status", (event) => handler(event.payload));
}

export function onTaskProgress(
  handler: (payload: TaskProgressPayload) => void,
): Promise<UnlistenFn> {
  return listen<TaskProgressPayload>("task-progress", (event) => handler(event.payload));
}

/** 本地文件 → WebView 可播放的 asset 协议地址 */
export function fileSrc(path: string): string {
  return convertFileSrc(path);
}

/** 系统文件对话框：选择一个视频 */
export async function pickVideo(): Promise<string | null> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "视频", extensions: VIDEO_EXTENSIONS }],
  });
  return typeof picked === "string" ? picked : null;
}

/** 系统文件对话框：选择一个目录 */
export async function pickDirectory(): Promise<string | null> {
  const picked = await open({ multiple: false, directory: true });
  return typeof picked === "string" ? picked : null;
}

/** 在资源管理器中显示文件 */
export function revealInFolder(path: string): Promise<void> {
  return revealItemInDir(path);
}
