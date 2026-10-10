import type { BloomMap } from "../data/bloom";

/**
 * 組み直しプランの結果のキャッシュ。**サイトを更新するまで残し、結果詳細・お気に入りのどちらから開いたシートとも共有する**
 * (2026-10-10 ユーザー指示「おきにいりあるいは結果詳細から組み直した結果はサイト更新まで全体で共有してキャッシュ」。それまでは
 * 詳細を両方閉じたときと反映したときに捨てていた — 2026-10-04 の指示)。同じ編成・曲・条件・登録でシートを開くと、計算し直さずに出す。
 * キーには編成・開花段階・曲と、対象・範囲・頻度の選び方と固定・資材の考慮・**登録の指紋**(`fingerprint`)を入れる
 * (`OptimizePlanSheet.vue`)。登録が変われば鍵も変わるので、古い結果を返さない。保存はしない(メモリだけ)
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

/**
 * 値の指紋(キーを短く保つため、JSON を 53 ビットのハッシュにする — cyrb53)。同じ値なら同じ指紋。登録・「組み直すと」の依頼の鍵に使う
 */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function getPlan<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setPlan<T>(key: string, value: T): void {
  store.set(key, value);
}

/** あれば返し、なければ計算して入れる(同期の計算用) */
export function cachedPlan<T>(key: string, compute: () => T): T {
  if (store.has(key)) return store.get(key) as T;
  const value = compute();
  store.set(key, value);
  return value;
}

/** 空にする(テストの後始末用。アプリからは呼ばない) */
export function clearPlanCache(): void {
  store.clear();
}
