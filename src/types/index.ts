/**
 * 与 Rust 后端共享的数据模型，字段与 src-tauri/src/lib.rs 及 docs/DESIGN.md §7 一一对应。
 */

/** 前端导航状态（App 顶层 state 切换，DESIGN §9.2） */
export type PageName = "home" | "cut" | "merge" | "rotate" | "crop";

export interface EnvironmentInfo {
  ok: boolean;
  ffmpegVersion: string | null;
  ffprobeVersion: string | null;
  message: string | null;
}

export interface VideoStreamInfo {
  codec: string;
  profile: string | null;
  width: number;
  height: number;
  pixFmt: string;
  frameRate: number;
  bitrate: number | null;
}

export interface AudioStreamInfo {
  codec: string;
  sampleRate: number;
  channels: number;
  bitrate: number | null;
}

export interface MediaInfo {
  container: string;
  durationSec: number;
  sizeBytes: number;
  bitrate: number | null;
  video: VideoStreamInfo;
  audio: AudioStreamInfo[];
  subtitleCount: number;
  rotation: number | null;
}

/** 时间约定：秒（f64），展示层才格式化（DESIGN §5.2） */
export interface Segment {
  startSec: number;
  endSec: number;
}

export type CutMode = "fast" | "precise";
export type QualityPreset = "high" | "balanced" | "small";

export type VideoTask =
  | {
      type: "cut";
      input: string;
      segments: Segment[];
      outputDir: string;
      mode: CutMode;
    }
  | { type: "merge"; inputs: string[]; output: string; forceTranscode: boolean }
  | {
      type: "rotate";
      input: string;
      /** 相对源方向的旋转增量（0/90/180/270，正=顺时针） */
      rotateDeg: number;
      hflip: boolean;
      vflip: boolean;
      output: string;
      transcode: boolean;
      quality: QualityPreset;
    }
  | {
      type: "crop_zoom";
      input: string;
      x: number;
      y: number;
      width: number;
      height: number;
      outWidth: number | null;
      outHeight: number | null;
      quality: QualityPreset;
      output: string;
    };

export type TaskStatus =
  | "pending"
  | "probing"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskSnapshot {
  id: string;
  kind: string;
  label: string;
  status: TaskStatus;
  progress: number | null;
  error: string | null;
  outputs: string[];
}

/** `task-status` 事件负载 */
export interface TaskStatusPayload {
  taskId: string;
  status: TaskStatus;
  error: string | null;
  outputs: string[];
}

/** `task-progress` 事件负载 */
export interface TaskProgressPayload {
  taskId: string;
  percent: number;
  speed: string | null;
  etaSeconds: number | null;
}

/** 合并检测事实：MediaInfo + 视频流 time_base（Rust 端 flatten 序列化） */
export interface MergeFileFacts extends MediaInfo {
  videoTimeBase: string;
}

/** 合并参数一致性检测结果（DESIGN §3.3 九项比对） */
export interface MergeComparison {
  files: MergeFileFacts[];
  compatible: boolean;
  differences: string[];
}

/** 首帧缩略图结果 */
export interface FileThumbnail {
  input: string;
  thumbPath: string;
}
