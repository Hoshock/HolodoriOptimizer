import { readonly, ref } from "vue";

import { SEARCH_ALL_STORAGE_KEY } from "../storage/searchAll";
import { SEARCH_OPTIONS_STORAGE_KEY } from "../storage/searchOptions";
import { SELECTION_STORAGE_KEY } from "../storage/selection";

/**
 * 「オプションの保持」(2026-09-16 ユーザー指示)。サイドメニューの折り畳み「設定」の
 * データの出力の下のトグル。ON(既定)のあいだだけ、さがすのオプション —
 * 所持カードから探す / ボード・開花の反映 / ボードの色とコネクト / 役割別の除外 — を localStorage に残す。
 *
 * **枠の選択(リーダー・固定メンバー・曲)はこのトグルに関係なく保存しない**(同じ指示で保存をやめた)。
 *
 * OFF にした時点で対象のキーを消す — 次の読み込みで既定から始まる。消すのは画面のオプションだけで、
 * 所持カード・ボード・お気に入りのような**登録したデータには触らない**。ダークモードと同じく、
 * このトグル自体の値は保存する
 */
export const KEEP_OPTIONS_STORAGE_KEY = "holodori-optimizer:keep-options";

/** 保存値が "false" のときだけ OFF。未保存・壊れた値は既定の ON */
function loadKeepOptions(): boolean {
  try {
    return localStorage.getItem(KEEP_OPTIONS_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

/** OFF にしたときに消すキー(さがすのオプションだけ。登録したデータは消さない) */
const CLEARED_KEYS = [
  SEARCH_ALL_STORAGE_KEY,
  SEARCH_OPTIONS_STORAGE_KEY,
  SELECTION_STORAGE_KEY,
] as const;

const active = ref(loadKeepOptions());

export function useKeepOptions() {
  return {
    active: readonly(active),
    toggle(): void {
      active.value = !active.value;
      try {
        localStorage.setItem(KEEP_OPTIONS_STORAGE_KEY, active.value ? "true" : "false");
        if (!active.value) {
          for (const key of CLEARED_KEYS) localStorage.removeItem(key);
        }
      } catch {
        // 保存できない環境でも動作は継続する(そのセッションだけ切り替わる)
      }
    },
  };
}
