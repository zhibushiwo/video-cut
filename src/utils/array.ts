/** 数组小工具（纯函数）。 */

/** 把下标 `from` 的元素移动到 `to`（先取出再插入），返回新数组、不改原数组。列表拖拽排序共用。 */
export function moveAt<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}
