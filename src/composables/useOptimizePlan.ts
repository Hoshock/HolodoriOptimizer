import { onUnmounted, readonly, ref } from "vue";

import type { OptimizePlanInput, OptimizePlanResult } from "../engine/optimizePlan";
import type { OptimizeWorkerResponse } from "../engine/optimizeWorker";

/**
 * 「最適化」(ボード → コネクト → 頻度)を Web Worker で実行する composable(`useOptimizer` と同じ作り)。
 * 依頼は `run` を呼んだ時点で送る。結果が届くまでは `running`、失敗したら `error`
 */
export function useOptimizePlan() {
  const running = ref(false);
  const result = ref<OptimizePlanResult | null>(null);
  const error = ref<string | null>(null);
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
    worker = new Worker(new URL("../engine/optimizeWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<OptimizeWorkerResponse>) => {
      const data = event.data;
      if (data.kind === "result") result.value = data.result;
      else error.value = data.message;
      running.value = false;
      terminate();
    });
    worker.addEventListener("error", (event) => {
      error.value = event.message || "計算中にエラーが発生しました";
      running.value = false;
      terminate();
    });
    worker.postMessage(input);
  };

  onUnmounted(terminate);

  return { running: readonly(running), result: readonly(result), error: readonly(error), run };
}
