import { computed, ref } from "vue";
import type { ComputedRef } from "vue";

/**
 * 1 つ前に戻る / 1 つ先に進むの履歴(ホロメンボードのシート — 2026-09-11。2026-10-10 からコネクトの付け外し・解放もまとめて戻す)。
 * 写しは呼び出し側が決める(`take` で取り、`restore` で戻す)。`change(fn)` は fn の前後の写しを比べ、変わったときだけ前の写しを積んで
 * 先の履歴を捨てる。写しは JSON にできる値にする(比べるのに使う)。保存はしない
 */
export interface EditHistory {
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  /** 状態を変える操作を包む。変わらなければ履歴に積まない */
  change: (fn: () => void) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

export function useEditHistory<T>(take: () => T, restore: (snapshot: T) => void): EditHistory {
  const past = ref<string[]>([]);
  const future = ref<string[]>([]);
  const snap = (): string => JSON.stringify(take());
  const back = (s: string): void => {
    restore(JSON.parse(s) as T);
  };
  return {
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
    change(fn) {
      const before = snap();
      fn();
      if (snap() === before) return;
      past.value.push(before);
      future.value = [];
    },
    undo() {
      const target = past.value.pop();
      if (target === undefined) return;
      future.value.push(snap());
      back(target);
    },
    redo() {
      const target = future.value.pop();
      if (target === undefined) return;
      past.value.push(snap());
      back(target);
    },
    clear() {
      past.value = [];
      future.value = [];
    },
  };
}
