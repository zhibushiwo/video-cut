/**
 * 前端访问 Tauri 后端的唯一入口（DESIGN §5.2/§5.4）。
 * UI 组件不得直接 import @tauri-apps/api。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  EnvironmentInfo,
  TaskProgressPayload,
  TaskSnapshot,
  TaskStatusPayload,
} from "../types";

/** 检查内置 ffmpeg/ffprobe 可用性与版本 */
export function checkEnvironment(): Promise<EnvironmentInfo> {
  return invoke("check_environment");
}

export function listTasks(): Promise<TaskSnapshot[]> {
  return invoke("list_tasks");
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
