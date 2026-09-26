/**
 * 前端类型总入口，两类内容：
 * ① **Rust 契约模型的镜像**——字段与 `src-tauri/src/lib.rs` 及 `docs/DESIGN.md` §7 一一对应
 *    （改 `lib.rs` 的数据模型必须同提交改这里与 DESIGN §7，见 [AGENTS.md](../AGENTS.md) §3 第 17 条）；
 * ② **前端自有类型**——导航/偏好/编辑模型，Rust 侧没有对应结构，见文内「前端编辑模型」分区。
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
  /** 后端发送、前端暂未消费（面板暂无字幕流展示位）；保留以对齐 `lib.rs` 契约 */
  subtitleCount: number;
  rotation: number | null;
}

/** 时间约定：秒（f64），展示层才格式化（DESIGN §5.2） */
export interface Segment {
  startSec: number;
  endSec: number;
}

// ---------------------------------------------------------------------------
// 前端编辑模型（**不对应 Rust**，不要与上面的契约模型混用）
//
// 下面几个类型是纯前端概念，`lib.rs` 里没有对应结构：
// - `RotateState` = 累计旋转 + 独立翻转（Rust 侧收到的是拆开的 `rotateDeg`/`hflip`/`vflip`）
// - `Clip` = 编辑态片段（Rust 侧收到的是扁平化的 `PipelineItem`，见 `PipelineItem`）
// - `CropRect` = **归一化**选区 `nx/ny/nw/nh`（0..1）；而契约里的 `PipelineItem.crop`
//   是**像素**矩形 `x/y/width/height`（下发前由 `utils/crop.ts::cropToPx` 转换）。
//   ⚠ 两者同名但口径不同，改这一带时先看 `docs/DESIGN.md` §3.5（局部放大）与 §7（类型契约）。
// ---------------------------------------------------------------------------

/** 旋转组合状态：增量角度（0/90/180/270）+ 独立翻转（旋转页与工作台共用，M11-0 起收进共享模型） */
export interface RotateState {
  deg: number;
  hflip: boolean;
  vflip: boolean;
}

/** 归一化裁剪选区（0..1，相对画面宽高；见 `utils/crop.ts`）——**不是**契约里的像素 `crop` */
export interface CropRect {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

/**
 * 片段：加工与合成的最小单元，= 后端一个 `PipelineItem`（DESIGN §3.8）。
 * M11-0 起从 `pages/Workbench` 内部类型提到共享模型——`utils/undo/` 的命令层要用它。
 */
export interface Clip {
  id: string;
  sourceId: string;
  /** 源内区间（秒），null = 整段保留 */
  seg: { start: number; end: number } | null;
  rot: RotateState;
  crop: CropRect | null;
  lockRatio: boolean;
}

export type CutMode = "fast" | "precise";
export type QualityPreset = "high" | "balanced" | "small";

/** 代理预览三态（DESIGN §3.7/§10/§12）：按需 / 始终代理 / 关闭 */
export type ProxyMode = "auto" | "always" | "off";

/** 主题色预设（DESIGN §9.1/决策 #16）：只换强调色 --color-signal，避开 warn 琥珀色相 */
export type AccentChoice = "green" | "blue" | "violet" | "rose";

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
  /** 任务浮层自动关闭秒数；0 = 不关闭（M7-5） */
  toastAutoCloseSec: number;
  /** 主题色预设（M4-8） */
  accent: AccentChoice;
}

/** 缓存占用（M4-8，与 Rust CacheUsage 对齐） */
export interface CacheUsage {
  proxyBytes: number;
  thumbBytes: number;
}

/** 缓存清理结果：被占用跳过的文件数（Windows 文件占用常态） */
export interface CacheClearResult {
  removed: number;
  skipped: number;
}

/** 片段起点帧缩略图请求（M6-8，与 Rust ClipThumbRequest 对齐） */
export interface ClipThumbRequest {
  input: string;
  timeSec: number;
}

/** 片段起点帧缩略图 */
export interface ClipThumbnail {
  input: string;
  timeSec: number;
  thumbPath: string;
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
  /** 后端发送、前端暂未消费（徽标由 copy/reasons 表达）；保留以对齐 pipeline.rs `PipelineItemCheck` 契约 */
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
  /** 内部任务（R3-3，如代理生成）：事件照常派发，任务面板凭它跳过展示 */
  internal: boolean;
}

/** `task-progress` 事件负载 */
export interface TaskProgressPayload {
  taskId: string;
  percent: number;
  speed: string | null;
  /** 后端 payload（manager.rs ProgressPayload）恒发 null、值归 `R3-4` 接通 */
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
  /** 后端发送、前端暂未消费（tb 一致性由后端检测表达）；保留以对齐 probe.rs `MergeFileFacts` 契约 */
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
