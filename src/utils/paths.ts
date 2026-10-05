/** 输出路径相关的统一规则。 */
import { withFileTimestamp } from "./time";

/**
 * 输出位置规则（DESIGN §12 设置）：设置了默认输出目录则使用之，
 * 否则跟随源文件所在目录。
 */
export function resolveOutputDir(sourcePath: string, defaultOutputDir: string): string {
  const fallback = sourcePath.replace(/[\\/][^\\/]+$/, "");
  return defaultOutputDir.trim() || fallback;
}

/** 路径的末段文件名（兼容两种分隔符）；无分隔符时原样返回。 */
export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/**
 * 输出目标防覆盖（DESIGN 决策 #19"同名才追加时间戳"）：目标已存在时在扩展名前插入
 * 时间戳（merged.mp4 → merged_20260913_153001.mp4），否则原样返回。
 * `exists` 注入（调用处传 services/tauri 的 `fileExists`），本模块保持无 IPC。
 */
export async function resolveUniqueTarget(
  dir: string,
  name: string,
  exists: (path: string) => Promise<boolean>,
): Promise<string> {
  const base = `${dir}\\${name}`;
  return (await exists(base)) ? `${dir}\\${withFileTimestamp(name)}` : base;
}

/** 路径的文件名（去扩展名）；无扩展名时原样返回 */
export function stemOf(path: string): string {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * 路径的扩展名（小写、不含点）；**没有扩展名时给 `mp4`**（与后端"重编码固定 mp4"的兜底同向）。
 * 末尾只有一个点的写法（`a.`）也按无扩展名处理——那不是一个容器。
 */
export function sourceExtOf(path: string): string {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : "mp4";
}

/**
 * 输出扩展名预判（`ADR-033`，`M14-3`）：**copy 类跟随源容器**——这里用源文件的扩展名表达
 * （用户可见的容器名）；**重编码类固定 `mp4`**。
 *
 * ⚠ **真正的容器判定仍在后端**（`fs::with_container_ext` / `source_container_ext`，`R4-6`）：
 * 前端这张"预判"只为让界面写的名字与落盘名一致，**不在前端复制"容器 ← format_name"映射表**
 * ——那是 Rust 侧的真源，复制一份等于新造一处会漂移的双写。残留差异只有一种：源文件的扩展名
 * 与实际容器不符（如把 mkv 改名成 `.mp4`），此时以后端校正后的名字为准。
 */
export function predictedExt(sourcePath: string, lossless: boolean): string {
  return lossless ? sourceExtOf(sourcePath) : "mp4";
}

/**
 * 默认输出名 `<源文件名去扩展名>_<后缀>.<扩展名>`（`M14-3`）。
 *
 * 三个消费点同源：合并页 `_merged`、工作台 `_workbench`、旋转/放大页 `_rotated`/`_zoomed`
 * （`R2-2`/`T-005` 的收敛方向：命名口径只留一份实现）。`lossless` = 该次导出是否全程 copy
 * ——它决定扩展名走"跟随源容器"还是固定 `mp4`（见 [`predictedExt`]）。
 */
export function defaultOutputName(
  sourcePath: string,
  suffix: string,
  lossless: boolean,
): string {
  return `${stemOf(sourcePath)}_${suffix}.${predictedExt(sourcePath, lossless)}`;
}
