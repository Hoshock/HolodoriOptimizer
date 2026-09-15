import { ref } from "vue";

import { EMPTY_BLOOM_TEXT_STATE, normalizeBloomTextState } from "../ui/bloomText";
import type { BloomTextState } from "../ui/bloomText";

/**
 * 開発用の「開花文言」で入れた内容（`src/ui/bloomText.ts` の状態を localStorage に置くだけ）。
 * 入力の途中で再読み込みしても消えないように保存するが、**ユーザーが登録したデータではない**ので
 * 壊れていれば空へ戻し、過去形式の移行は持たない（`.claude/rules/storage-compat.md`。
 * `copy-tuning` と同じ扱い）。カードデータ（`src/data/cards.json`）には触らない
 */
export const BLOOM_TEXT_STORAGE_KEY = "holodori-optimizer:bloom-text";

function load(): BloomTextState {
  try {
    const raw = localStorage.getItem(BLOOM_TEXT_STORAGE_KEY);
    return normalizeBloomTextState(raw === null ? null : JSON.parse(raw));
  } catch {
    return { ...EMPTY_BLOOM_TEXT_STATE };
  }
}

const state = ref<BloomTextState>(load());

export function useBloomText() {
  return {
    // 書き換えは必ず set を通す（差分の作り方は純関数側が持つので、ここでは readonly で包まない —
    // 包むと深く readonly になって、その値を純関数へ渡し直せない）
    state,
    /** 状態を丸ごと差し替える（差分の作り方は `src/ui/bloomText.ts` の純関数が持つ） */
    set(next: BloomTextState): void {
      state.value = next;
      try {
        localStorage.setItem(BLOOM_TEXT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 保存できない環境でも、そのセッションのあいだは入力できる
      }
    },
  };
}
