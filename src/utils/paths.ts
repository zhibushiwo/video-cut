/** 输出路径相关的统一规则。 */

/**
 * 输出位置规则（DESIGN §12 设置）：设置了默认输出目录则使用之，
 * 否则跟随源文件所在目录。
 */
export function resolveOutputDir(sourcePath: string, defaultOutputDir: string): string {
  const fallback = sourcePath.replace(/[\\/][^\\/]+$/, "");
  return defaultOutputDir.trim() || fallback;
}
