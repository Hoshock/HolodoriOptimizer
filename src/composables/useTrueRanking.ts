import { onUnmounted, readonly, ref, shallowRef } from "vue";

import type { OptimizePlanInput, OptimizePlanResult } from "../engine/optimizePlan";
import type { RankingWorkerResponse } from "../engine/rankingWorker";

/**
 * 結果一覧の「最適化順」を裏で計算する composable(`rankingWorker.ts`)。`run` で前の計算を捨てて始め直す。
 * `results` は依頼の並びと同じ添字で、届いたものから埋まる。全件そろったら `done`(失敗したら `error` で、`done` にはならない)
 */
export function useTrueRanking() {
  const running = ref(false);
  const done = ref(false);
  const error = ref<string | null>(null);
  const results = shallowRef<(OptimizePlanResult | null)[]>([]);
  let worker: Worker | null = null;

  const terminate = (): void => {
    worker?.terminate();
    worker = null;
  };

  const cancel = (): void => {
    terminate();
    running.value = false;
    done.value = false;
    error.value = null;
    results.value = [];
  };

  const run = (inputs: OptimizePlanInput[]): void => {
    cancel();
    if (inputs.length === 0) return;
    running.value = true;
    results.value = inputs.map(() => null);
    worker = new Worker(new URL("../engine/rankingWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<RankingWorkerResponse>) => {
      const data = event.data;
      if (data.kind === "item") {
        const next = [...results.value];
        next[data.index] = data.result;
        results.value = next;
      } else if (data.kind === "done") {
        running.value = false;
        done.value = true;
        terminate();
      } else {
        error.value = data.message;
        running.value = false;
        terminate();
      }
    });
    worker.addEventListener("error", (event) => {
      error.value = event.message || "計算中にエラーが発生しました";
      running.value = false;
      terminate();
    });
    worker.postMessage({ inputs });
  };

  onUnmounted(terminate);

  return {
    running: readonly(running),
    done: readonly(done),
    error: readonly(error),
    results,
    run,
    cancel,
  };
}
