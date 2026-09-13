/**
 * 前端访问 Tauri 后端的唯一入口（DESIGN §5.2/§5.4）。
 * UI 组件不得直接 import @tauri-apps/api 或各插件包。
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  EnvironmentInfo,
  FileThumbnail,
  HistoryEntry,
  MediaInfo,
  MergeComparison,
  PipelineCheck,
  PipelineItem,
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

/** 合并前参数一致性检测（DESIGN §3.3 九项比对） */
export function checkMerge(inputs: string[]): Promise<MergeComparison> {
  return invoke("check_merge", { inputs });
}

/** 工作台导出前检测：逐片段无损/重编码判定（DESIGN §3.8） */
export function checkPipeline(items: PipelineItem[]): Promise<PipelineCheck> {
  return invoke("check_pipeline", { items });
}

/** 批量提取首帧缩略图（带缓存） */
export function generateThumbnails(inputs: string[]): Promise<FileThumbnail[]> {
  return invoke("generate_thumbnails", { inputs });
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

/** 拖拽导入：文件拖入窗口并松开时回调路径列表（已在 services 内过滤视频扩展名） */
export function onVideoDropped(handler: (paths: string[]) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop") {
      const videos = event.payload.paths.filter((p) =>
        VIDEO_EXTENSIONS.includes(p.split(".").pop()?.toLowerCase() ?? ""),
      );
      if (videos.length > 0) handler(videos);
    }
  });
}

/** 拖拽悬停状态（显示导入覆盖层）。
 * leave 与 drop 都要清遮罩：拖放松手 Tauri 只发 drop 不发 leave，
 * 且拖入非视频文件时 onVideoDropped 因扩展名过滤不触发——两者都清才不残留。 */
export function onDragHover(handler: (over: boolean) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "enter" || event.payload.type === "over") {
      handler(true);
    } else {
      handler(false);
    }
  });
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

/** 系统文件对话框：选择多个视频 */
export async function pickVideos(): Promise<string[]> {
  const picked = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "视频", extensions: VIDEO_EXTENSIONS }],
  });
  if (Array.isArray(picked)) return picked;
  return typeof picked === "string" ? [picked] : [];
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

/** 前端错误转发到日志文件（DESIGN §12.1，main.tsx 全局捕获后调用） */
export function appendFrontendLog(
  level: "error" | "warn" | "info" | "debug",
  message: string,
): Promise<void> {
  return invoke("append_frontend_log", { level, message });
}

/** 打开日志文件夹（资源管理器，任务面板入口，DESIGN §12.1） */
export function openLogsFolder(): Promise<void> {
  return invoke("open_log_dir");
}

/** 确认对话框（危险操作二次确认），返回用户是否确认 */
export function confirmDialog(message: string, title: string): Promise<boolean> {
  return ask(message, { title, kind: "warning" });
}

/** 历史记录：全部终态任务（存储序，页面按完成时间倒序展示） */
export function listHistory(): Promise<HistoryEntry[]> {
  return invoke("list_history");
}

/** 历史记录：清空 */
export function clearHistory(): Promise<void> {
  return invoke("clear_history");
}
