/** 质量档位的展示名（R2-2 收敛：编辑器页 / 设置页 / 工作台页脚共用一份）。 */
import type { QualityPreset } from "../types";

export const QUALITY_LABELS: Record<QualityPreset, string> = {
  high: "高质量",
  balanced: "平衡",
  small: "小体积",
};
