/**
 * 渲染即预览（M12-2，TIMELINE.md §17.6 / DESIGN §8.2 / plans/M12.md §21.5）。
 *
 * 纯无损时间线编辑停顿 ~1.5s 后，自动提交一个 `preview` 流水线任务渲染真实成品；
 * 完成后把产物路径交给播放层（`ProductPreview` 走单文件分支）。含重编码时不自动渲染
 * （回退虚拟连播），由页脚「精确预览」手动发起。
 *
 * 与 `useProxyPreview` 的两点不同：
 * 1. **新编辑要取消旧任务**（proxy 只切源不取消）——后端 `submit_internal_singleton` 已能
 *    取代旧任务，前端显式 `cancelTask` 只是让旧任务尽早让位、不白占低优先级队列位；
 * 2. 状态机更完整（含失败回退），故判定抽成 `utils/previewRender.ts` 的纯函数。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { appendFrontendLog, cancelTask, onTaskStatus, submitTask } from "../services/tauri";
import type { PipelineItem, QualityPreset } from "../types";
import { decidePreview } from "../utils/previewRender";

/** 编辑停顿多久后自动渲染（规格：~1.5s 防抖） */
export const PREVIEW_DEBOUNCE_MS = 1500;

export type PreviewPhase = "idle" | "rendering" | "ready" | "failed";

export function usePreviewRender(opts: {
  /** 时间线是否有片段 */
  hasEntries: boolean;
  /** 当前时间线是否全程无损（`check.allLossless`） */
  allLossless: boolean;
  /** 提交载荷（与导出同一份 `payload`） */
  items: PipelineItem[];
  quality: QualityPreset;
  encoder: string | null;
}) {
  const { hasEntries, allLossless, items, quality, encoder } = opts;
  // 内容签名 = 载荷 JSON（时间线一变就变；与后端 `dedup_key` 同源口径）
  const key = useMemo(() => JSON.stringify(items), [items]);

  const [renderedSrc, setRenderedSrc] = useState<string | null>(null);
  const [phase, setPhase] = useState<PreviewPhase>("idle");
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  /** 最近一次已提交的签名（ref：不参与渲染，只作判定输入） */
  const submittedKeyRef = useRef<string | null>(null);
  /** 进行中任务的 id 与其签名——**必须按 taskId 匹配事件**，否则旧任务的 completed 会覆盖新画面 */
  const taskIdRef = useRef<string | null>(null);
  const taskKeyRef = useRef<string | null>(null);

  const submit = useCallback(
    (k: string) => {
      if (items.length === 0) return;
      const old = taskIdRef.current;
      taskIdRef.current = null;
      if (old) void cancelTask(old).catch(() => {});
      submittedKeyRef.current = k;
      taskKeyRef.current = k;
      setRenderedSrc(null); // 立刻回落虚拟连播，绝不显示过期画面
      setPhase("rendering");
      void submitTask({
        type: "pipeline",
        items,
        // preview 模式下后端忽略 output（改写 `app_cache_dir/preview/<令牌>.mp4`）
        output: "",
        quality,
        encoder,
        preview: true,
      })
        .then((id) => {
          taskIdRef.current = id;
        })
        .catch(() => {
          // 提交即失败（如 sidecar 缺失）：静默回退虚拟连播
          setPhase("failed");
          setFailedKey(k);
        });
    },
    [items, quality, encoder],
  );

  // 自动渲染：编辑停顿 ~1.5s 后提交（含重编码 / 同签名已提交 / 同签名已失败 → 不提交）
  useEffect(() => {
    const d = decidePreview({
      hasEntries,
      allLossless,
      key,
      readyKey,
      submittedKey: submittedKeyRef.current,
      failedKey,
    });
    if (!d.autoRender) {
      // 自愈：当前签名既没被提交、也没有成品时，不该停留在"渲染中"——
      // 否则页脚会永远显示「渲染预览中…」并把「精确预览」置灰（真机 TC-048 抓到）
      setPhase((p) => (p === "rendering" ? (readyKey ? "ready" : "idle") : p));
      return;
    }
    const timer = window.setTimeout(() => submit(key), PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [hasEntries, allLossless, key, readyKey, failedKey, submit]);

  // 任务终态：完成 → 切真实成品文件；失败/取消 → 静默回退（FR-1761）
  useTauriEvent(() =>
    onTaskStatus((p) => {
      const tid = taskIdRef.current;
      const k = taskKeyRef.current;
      // 诊断留痕（M12-2）：真机曾出现"任务在日志里完成、前端却停在渲染中"。这里**无条件**
      // 记录每个终态事件（含 id 比对），下一跑可直接判定：事件到底没到、还是 id 没匹配上。
      // 排查完请连同本段一起删除（见 gui-e2e `TC-048`）。
      if (p.status !== "pending" && p.status !== "running") {
        void appendFrontendLog(
          "debug",
          `[preview] 终态事件 pid=${p.taskId} tid=${tid ?? "null"} match=${p.taskId === tid} status=${p.status} outputs=${p.outputs.length} key=${String(k).slice(0, 16)}`,
        );
      }
      if (!tid || p.taskId !== tid) return; // 旧任务 / 别人的事件一律忽略
      // 只有真正"落地"的分支才清 taskIdRef——否则一旦落到没分支的情形会永久卡死，
      // 且后续重复事件也再匹配不上（taskIdRef 已清空）
      if (p.status === "completed" && p.outputs[0]) {
        taskIdRef.current = null;
        setRenderedSrc(p.outputs[0]);
        setReadyKey(k);
        setPhase("ready");
      } else if (p.status === "completed") {
        // 完成但没带产物：按失败处理，避免停在"渲染中"
        taskIdRef.current = null;
        setPhase("failed");
        setFailedKey(k);
      } else if (p.status === "failed" || p.status === "cancelled") {
        taskIdRef.current = null;
        setPhase("failed");
        setFailedKey(k);
      }
    }),
  );

  /** 手动「精确预览」：含重编码时用；失败后也用它重试一次 */
  const renderNow = useCallback(() => {
    setFailedKey(null);
    submit(key);
  }, [key, submit]);

  const decision = decidePreview({
    hasEntries,
    allLossless,
    key,
    readyKey,
    submittedKey: submittedKeyRef.current,
    failedKey,
  });

  return {
    /** 非 null 时播放真实成品文件，null 表示回退虚拟连播 */
    renderedSrc: decision.useRendered ? renderedSrc : null,
    phase,
    /** 是否处于"没在用真实成品"的回退态（供提示条文案） */
    fallback: hasEntries && !decision.useRendered,
    /**
     * 页脚「精确预览」是否可用。
     * **只按"有没有东西可渲染"判定，不受 phase 影响**——渲染中再点一次是安全的
     * （`submit` 会先取消旧任务，后端同源单例也会取代），而"因为 phase 卡住就把按钮
     * 永久置灰"会让回退路径没有出口（真机 `TC-048` 抓到的缺陷）。
     */
    canRenderNow: hasEntries && items.length > 0,
    renderNow,
  };
}
