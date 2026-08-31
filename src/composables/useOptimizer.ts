import { onUnmounted, readonly, ref } from "vue";

import type { OptimizeWorkerRequest, OptimizeWorkerResponse } from "../engine/worker";
import type { ScoreBreakdown } from "../engine/score";

export interface CandidateView {
  memberIds: string[];
  breakdown: ScoreBreakdown;
}

/** Web Worker で最適化を実行する composable。実行中の再実行は前の Worker を破棄して置き換える */
export function useOptimizer() {
  const running = ref(false);
  const progress = ref<{ done: number; total: number } | null>(null);
  const candidates = ref<CandidateView[] | null>(null);
  const evaluated = ref(0);
  const error = ref<string | null>(null);
  let worker: Worker | null = null;

  const terminate = (): void => {
    worker?.terminate();
    worker = null;
  };

  const run = (request: OptimizeWorkerRequest): void => {
    terminate();
    running.value = true;
    progress.value = null;
    candidates.value = null;
    error.value = null;
    worker = new Worker(new URL("../engine/worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<OptimizeWorkerResponse>) => {
      const data = event.data;
      if (data.kind === "progress") {
        progress.value = { done: data.done, total: data.total };
      } else if (data.kind === "result") {
        candidates.value = data.candidates;
        evaluated.value = data.evaluated;
        running.value = false;
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
    worker.postMessage(request);
  };

  const cancel = (): void => {
    terminate();
    running.value = false;
    progress.value = null;
  };

  onUnmounted(terminate);

  return {
    running: readonly(running),
    progress: readonly(progress),
    candidates,
    evaluated: readonly(evaluated),
    error: readonly(error),
    run,
    cancel,
  };
}
