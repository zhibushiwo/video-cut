/**
 * 与 Rust 后端共享的数据模型，字段与 src-tauri/src/lib.rs 及 docs/DESIGN.md §7 一一对应。
 */

/** 前端导航状态（App 顶层 state 切换，DESIGN §9.2；工作台 = 落地页） */
export type PageName =
  | "workbench"
  | "cut"
  | "merge"
  | "rotate"
  | "crop"
  | "history"
  | "settings";

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

/** 代理预览三态（DESIGN §3.7/§10/§12）：按需 / 始终代理 / 关闭 */
export type ProxyMode = "auto" | "always" | "off";

/** 可锁定的编码器；"auto" = 按像素格式自动探测（DESIGN §3.5/§12） */
export type EncoderChoice =
  | "auto"
  | "h264_nvenc"
  | "h264_qsv"
  | "h264_amf"
  | "libx264"
  | "libx265";

/** 应用设置（DESIGN §12，tauri-plugin-store 持久化为 settings.json） */
export interface AppSettings {
  /** 默认输出目录；空 = 跟随源文件所在目录 */
  defaultOutputDir: string;
  /** 新建任务的默认剪切模式 */
  defaultCutMode: CutMode;
  /** 入点吸附关键帧 */
  keyframeSnap: boolean;
  /** 代理预览策略 */
  proxyMode: ProxyMode;
  /** 重编码类任务的编码器 */
  encoder: EncoderChoice;
  /** 重编码类任务的默认质量档位 */
  quality: QualityPreset;
}

export type VideoTask =
  | {
      type: "cut";
      input: string;
      segments: Segment[];
      outputDir: string;
      mode: CutMode;
      /** null = 按像素格式自动探测编码器（极速剪切不使用） */
      encoder: string | null;
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
      encoder: string | null;
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
      encoder: string | null;
    }
  | {
      type: "pipeline";
      items: PipelineItem[];
      output: string;
      quality: QualityPreset;
      encoder: string | null;
    };

/** 工作台单项配置（DESIGN §3.8）：裁剪矩形为显示空间像素坐标 */
export interface PipelineItem {
  input: string;
  /** 剪切区间 [start, end)，null = 整段保留 */
  segment: Segment | null;
  /** 相对源方向的旋转增量（0/90/180/270，正=顺时针） */
  rotateDeg: number;
  hflip: boolean;
  vflip: boolean;
  crop: { x: number; y: number; width: number; height: number } | null;
  outWidth: number | null;
  outHeight: number | null;
}

/** 工作台单片段检测结果 */
export interface PipelineItemCheck {
  input: string;
  facts: MergeFileFacts;
  copy: boolean;
  reasons: string[];
  displayDeg: number;
}

/** 工作台导出前检测结果 */
export interface PipelineCheck {
  items: PipelineItemCheck[];
  allLossless: boolean;
  warnings: string[];
}

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

/** 历史记录条目（DESIGN §12 / M4-2，与 Rust HistoryEntry 对齐；仅终态任务） */
export interface HistoryEntry {
  id: string;
  kind: string;
  label: string;
  status: TaskStatus;
  outputs: string[];
  error: string | null;
  /** 提交时间（unix ms） */
  createdAt: number;
  /** 开始执行时间；0 = 排队即被取消 */
  startedAt: number;
  /** 终态时间（unix ms） */
  finishedAt: number;
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
