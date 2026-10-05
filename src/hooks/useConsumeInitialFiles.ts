/**
 * 消费 App 层原地分发的 `initialFiles`（拖拽导入，UI.md §9.3：页面不跳转）。
 *
 * ref 哨兵保证**同一数组引用只消费一次**；每次新的拖入（App 层传新数组）触发一次
 * `consume`。（T-005 收敛四份手写哨兵：Cut / Editor / Merge / Workbench。）
 */
import { useEffect, useRef } from "react";

export function useConsumeInitialFiles(
  initialFiles: string[] | null | undefined,
  consume: (files: string[]) => void,
): void {
  const consumedRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (!initialFiles || initialFiles === consumedRef.current) return;
    consumedRef.current = initialFiles;
    consume(initialFiles);
  }, [initialFiles, consume]);
}
