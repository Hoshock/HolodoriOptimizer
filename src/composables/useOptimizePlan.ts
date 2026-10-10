import { onUnmounted, readonly, ref } from "vue";

import type { PlanStep } from "../engine/boardConnectPlan";
import type { OptimizePlanInput, OptimizePlanResult } from "../engine/optimizePlan";
import type { OptimizeWorkerResponse } from "../engine/optimizeWorker";
import { CALC_FAILED } from "../ui/messages";

/**
 * 「最適化」(ボード → コネクト → 頻度)を Web Worker で実行する composable(`useOptimizer` と同じ作り)。
 * 依頼は `run` を呼んだ時点で送る。結果が届くまでは `running`、失敗したら `error`。
 * 計算中は段が済むたびに `progress`(済んだ段・これから回るかもしれない段・そのときの経過時間)を更新する(残り時間の見積もり — `src/ui/planProgress.ts`)
 */
export function useOptimizePlan() {
  const running = ref(false);
  const result = ref<OptimizePlanResult | null>(null);
  const error = ref<string | null>(null);
  const progress = ref<{
    done: readonly PlanStep[];
    remaining: readonly PlanStep[];
    elapsedMs: number;
  } | null>(null);
  /** 始めた時刻(`performance.now()`) */
  const startedAt = ref<number | null>(null);
  let worker: Worker | null = null;

  const terminate = (): void => {
    worker?.terminate();
    worker = null;
  };

  const run = (input: OptimizePlanInput): void => {
    terminate();
    running.value = true;
    result.value = null;
    error.value = null;
    progress.value = null;
    const start = performance.now();
    startedAt.value = start;
    worker = new Worker(new URL("../engine/optimizeWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<OptimizeWorkerResponse>) => {
      const data = event.data;
      if (data.kind === "progress") {
        progress.value = {
          done: data.done,
          remaining: data.remaining,
          elapsedMs: performance.now() - start,
        };
        return;
      }
      if (data.kind === "result") result.value = data.result;
      else error.value = data.message;
      running.value = false;
      terminate();
    });
    worker.addEventListener("error", (event) => {
      error.value = event.message || CALC_FAILED;
      running.value = false;
      terminate();
    });
    worker.postMessage(input);
  };

  onUnmounted(terminate);

  return {
    running: readonly(running),
    result: readonly(result),
    error: readonly(error),
    progress: readonly(progress),
    startedAt: readonly(startedAt),
    run,
  };
}
