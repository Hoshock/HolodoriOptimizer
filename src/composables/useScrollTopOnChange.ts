import { watch } from "vue";
import type { Ref, WatchSource } from "vue";

/**
 * 絞り込み・並び替えを変えたら、一覧のスクロール位置を先頭へ戻す（各種ピッカー共通）。
 *
 * 一覧はスクロールする 1 つの要素の中身を入れ替えるだけなので、何もしないと切り替える前の位置が残る
 * （0期生を見たあとに 1期生を選ぶと 1期生の途中から始まる — 2026-09-30 ユーザー指摘「スクロール位置が
 * 保存されてるの使いづらい」）。位置を絞り込みごとに覚えるのではなく、切り替えたら保存しない側にした:
 * 検索語・所属・タイプ・状態の組み合わせごとに持つと状態が膨らみ、並び順の変わった一覧では復元した位置が
 * 意味を持たない。**絞り込みに関わらない変化（タイルのタップによる選択の切り替えなど）では動かさない** —
 * `sources` に絞り込み・並び替えの値だけを渡す。
 */
export function useScrollTopOnChange(
  list: Readonly<Ref<HTMLElement | null>>,
  sources: WatchSource[],
): void {
  watch(
    sources,
    () => {
      const el = list.value;
      if (el) el.scrollTop = 0;
    },
    // 一覧の描画が済んでから戻す（描画前に戻すと、中身が入れ替わるときに位置が再びずれることがある）
    { flush: "post" },
  );
}
