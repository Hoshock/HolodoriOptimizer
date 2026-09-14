import { readonly, ref } from "vue";

import { DEFAULT_COPY_TUNING, normalizeCopyTuning } from "../ui/copyTuning";
import type { CopyTuning } from "../ui/copyTuning";

/**
 * 画面の文言と配置の上書き（開発用の「文言・配置」で編集する）。既定値は `src/ui/copyTuning.ts` にあり、
 * ここはそれを localStorage の保存値で上書きして持つだけ。壊れていれば既定へ戻す
 * （開発用の調整値なので、過去形式の移行は持たない — .claude/rules/storage-compat.md）
 */
export const COPY_TUNING_STORAGE_KEY = "holodori-optimizer:copy-tuning";

function load(): CopyTuning {
  try {
    const raw = localStorage.getItem(COPY_TUNING_STORAGE_KEY);
    return normalizeCopyTuning(raw === null ? null : JSON.parse(raw));
  } catch {
    return { ...DEFAULT_COPY_TUNING };
  }
}

const tuning = ref<CopyTuning>(load());

export function useCopyTuning() {
  return {
    tuning: readonly(tuning),
    /** 1 項目だけ差し替える（入力のたびに保存する） */
    set<K extends keyof CopyTuning>(key: K, value: CopyTuning[K]): void {
      tuning.value = { ...tuning.value, [key]: value };
      try {
        localStorage.setItem(COPY_TUNING_STORAGE_KEY, JSON.stringify(tuning.value));
      } catch {
        // 保存できない環境でも、そのセッションのあいだは調整できる
      }
    },
    /** 既定（コミットされている文言）へ戻す */
    reset(): void {
      tuning.value = { ...DEFAULT_COPY_TUNING };
      try {
        localStorage.removeItem(COPY_TUNING_STORAGE_KEY);
      } catch {
        // 同上
      }
    },
  };
}
