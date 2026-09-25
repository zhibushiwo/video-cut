/**
 * 工作台共享件（R2-1 拆分）：类型 / 常量 / 纯 helper。
 * 在主页面、各视图组件与 hook 之间复用；**不含 React 组件、不含状态**。
 */
import { Layers, RotateCw, Scissors, ZoomIn } from "lucide-react";
import { NO_ROTATE, type RotateState } from "../../components/RotateControls";
import type { Clip, MediaInfo, PageName } from "../../types";

export type EditorTab = "rotate" | "crop";

/**
 * 片段"全段 vs 区间"的判定阈值（秒）：区间时长 ≤ 此值视为全段（`seg: null`）。
 * 「添加为片段」（CutModeView）与导出映射（index.tsx）两处共用，口径不能再漂移。
 */
export const MIN_SEG_DURATION_SEC = 0.05;

/** 素材：导入的源文件（§3.8 三层数据模型之一） */
export interface SourceFile {
  id: string;
  path: string;
  info: MediaInfo | null;
  probeError: string | null;
}

/** 预览区三态（§9.8 ①）：成品（M6-6 连播）/ 源剪切 / 片段加工 */
export type PreviewMode =
  | { type: "product" }
  | { type: "cut"; sourceId: string }
  | { type: "edit"; clipId: string };

/**
 * 加工编辑（旁路状态）可改的字段：**不含 `seg`** —— 区间属于文档状态，只能经命令栈改
 * （plans/M11.md §18.1 的三类边界表）；收窄类型是为了让"绕过撤销栈改区间"在编译期就不可能。
 */
export type ClipEdit = Partial<Pick<Clip, "rot" | "crop" | "lockRatio">>;

/** 右上角功能导航（DESIGN §9.2：工作台为落地页，其余功能经此跳转） */
export const NAV_ITEMS: { page: PageName; label: string; icon: typeof Scissors }[] = [
  { page: "cut", label: "剪切", icon: Scissors },
  { page: "merge", label: "合并", icon: Layers },
  { page: "rotate", label: "旋转", icon: RotateCw },
  { page: "crop", label: "放大", icon: ZoomIn },
];

/** 次级按钮统一样式（页脚 / 批量条 / 视图内多处复用） */
export const fieldBtn =
  "rounded-md border border-hairline px-2.5 py-1.5 text-xs text-mute transition-colors hover:border-mute hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-signal";

let nextId = 1;
export const freshId = (prefix: string) => `${prefix}-${nextId++}`;

/** 新建片段的默认形态（无旋转 / 无裁剪 / 锁定比例）；`id` 由命令层在构建时分配 */
export const newClipOf = (sourceId: string, seg: Clip["seg"]): Omit<Clip, "id"> => ({
  sourceId,
  seg,
  rot: NO_ROTATE,
  crop: null,
  lockRatio: true,
});

/** 显示空间宽高：90°/270° 时为源宽高交换（DESIGN §9.8 预览约定） */
export function displayedDims(info: MediaInfo, rot: RotateState) {
  const quarter = rot.deg === 90 || rot.deg === 270;
  return quarter
    ? { w: info.video.height, h: info.video.width }
    : { w: info.video.width, h: info.video.height };
}
