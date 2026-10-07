import type { BloomMap } from "../data/bloom";

/**
 * 3 つの最適化(ホロメンボード・コネクト・発動頻度)の結果のキャッシュ(2026-10-04 ユーザー指示「結果詳細に戻った時まではキャッシュが
 * 残っていて、再計算しない。別の画面に戻ったら消していい」)。シートを閉じて開き直しても同じ編成・曲・範囲なら計算し直さない。
 * 入れ物はモジュールで 1 つ。**結果詳細・お気に入りのユニット詳細を両方閉じたとき**と、結果を登録に反映したとき(登録が変わって結果が古くなる)に
 * `clearPlanCache` で空にする(`OptimizerPanel.vue`)。キーには編成・開花段階・曲・範囲を入れ、登録しているボードなどは入れない
 * (それらは詳細を開いている間は変わらず、変わるときは上のとおり空にするため)。**例外は「リソース」の登録値**: ホロメンボードの最適化は
 * 余りの個数が違えば結果も違うので、`extra` に含める(`BoardPlanSheet.vue`。登録値が違うのに古い結果を返さない)
 */
const store = new Map<string, unknown>();

/** キー: 種類 + 編成(リーダー・メンバーのカード ID と、その開花段階)+ 曲 + 追加の条件(範囲・固定した頻度など) */
export function planCacheKey(
  kind: string,
  team: { leaderId: string; memberIds: readonly string[] },
  blooms: BloomMap,
  songId: string | null,
  extra: unknown = null,
): string {
  const ids = [team.leaderId, ...team.memberIds];
  return JSON.stringify([kind, ids, ids.map((id) => blooms[id] ?? null), songId, extra]);
}

export function getPlan<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setPlan<T>(key: string, value: T): void {
  store.set(key, value);
}

/** あれば返し、なければ計算して入れる(同期の計算用。発動頻度の最適化) */
export function cachedPlan<T>(key: string, compute: () => T): T {
  if (store.has(key)) return store.get(key) as T;
  const value = compute();
  store.set(key, value);
  return value;
}

export function clearPlanCache(): void {
  store.clear();
}
