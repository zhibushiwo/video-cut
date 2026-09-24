/** 批量操作条（M6-8 = 原 M4-4）：全选 / 清除 / 各建全段片段 / 批量旋转。R2-1 自 index.tsx 拆出。 */
import { RotateControls, type RotateState } from "../../components/RotateControls";
import { fieldBtn } from "./shared";

export function BatchBar({
  count,
  onSelectAll,
  onClearSelection,
  onBatchAdd,
  batchRot,
  onBatchRotChange,
  onApplyBatchRot,
  batchMsg,
}: {
  count: number;
  onSelectAll(): void;
  onClearSelection(): void;
  onBatchAdd(): void;
  batchRot: RotateState;
  onBatchRotChange(rot: RotateState): void;
  onApplyBatchRot(): void;
  batchMsg: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-signal/30 bg-signal/5 px-3 py-2">
      <span className="text-xs font-medium text-paper">已选 {count} 个素材</span>
      <button type="button" onClick={onSelectAll} className={fieldBtn}>
        全选
      </button>
      <button type="button" onClick={onClearSelection} className={fieldBtn}>
        清除选择
      </button>
      <span className="h-4 w-px bg-hairline" aria-hidden="true" />
      <button
        type="button"
        onClick={onBatchAdd}
        title="为每个选中素材各建一个全段片段，并入时间轴末尾"
        className="rounded-md border border-signal/40 bg-signal/10 px-2.5 py-1.5 text-xs text-signal transition-colors hover:bg-signal/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        各建全段片段
      </button>
      <span className="h-4 w-px bg-hairline" aria-hidden="true" />
      <RotateControls
        rot={batchRot}
        onChange={onBatchRotChange}
        currentRotation={null}
      />
      <button type="button" onClick={onApplyBatchRot} className={fieldBtn}>
        旋转应用到片段
      </button>
      {batchMsg && <span className="text-xs text-signal">{batchMsg}</span>}
    </div>
  );
}
