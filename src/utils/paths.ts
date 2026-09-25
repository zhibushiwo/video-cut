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
