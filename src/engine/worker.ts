/// <reference lib="webworker" />
import { createSearchHandler } from "./searchWorkerHandler";
import type { SearchWorkerRequest } from "./searchWorkerHandler";

/**
 * 探索(さがす)を UI スレッド外で実行する Web Worker。何本か立てて分担する(2026-10-08「計算の高速化」)。
 * 依頼の解決と探索そのものは src/engine/request.ts / optimize.ts、受け答えは searchWorkerHandler.ts が持ち、
 * この層はメッセージの受け渡し(カード ID だけを交換する)に専念する。
 */
const handle = createSearchHandler((response, transfer) => {
  self.postMessage(response, transfer ?? []);
});
self.addEventListener("message", (event: MessageEvent<SearchWorkerRequest>) => {
  handle(event.data);
});
