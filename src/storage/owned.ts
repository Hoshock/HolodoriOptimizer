import { BLOOM_MAX } from "../data/bloom";

/**
 * 所持カード(ID+開花段階)の保存。このブラウザ内(localStorage)のみで、サーバ送信はしない。
 *
 * 後方互換の約束: 一度ユーザーが登録したデータは、機能追加・データ更新で読めなくならないようにする。
 * - 過去の全形式を読める(v0: ID の文字列配列 / v1: {id, bloom} の配列 / v2: 版番号つき封筒)
 * - 現在のカードデータに存在しない ID も捨てずに保持して書き戻す(一時的な不整合やデータ側の
 *   ミスで登録が永久に消えないように)。UI 側で使うときに既知のものだけを選ぶ
 * - カード ID 自体は src/data/published-ids.json で凍結し、削除・改名をテストで検知する
 */

export const OWNED_STORAGE_KEY = "holodori-optimizer:owned-card-ids";
export const OWNED_SCHEMA_VERSION = 2;

/** 所持カード 1 枚ぶんの登録内容 */
export interface OwnedCard {
  id: string;
  /** 開花段階(0〜BLOOM_MAX)。既定は 0凸 */
  bloom: number;
}

interface OwnedEnvelope {
  version: number;
  cards: OwnedCard[];
}

function clampBloom(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return 0;
  return Math.min(BLOOM_MAX, Math.max(0, value));
}

function toOwnedCard(entry: unknown): OwnedCard | null {
  // v0: ID の文字列(開花 0 として読み替える)
  if (typeof entry === "string") return entry === "" ? null : { id: entry, bloom: 0 };
  if (typeof entry !== "object" || entry === null) return null;
  if (!("id" in entry) || typeof entry.id !== "string" || entry.id === "") return null;
  return { id: entry.id, bloom: clampBloom("bloom" in entry ? entry.bloom : 0) };
}

function dedupe(cards: OwnedCard[]): OwnedCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

/** 保存文字列を解釈する。壊れていれば空(登録なし)扱い。未知の ID も残す */
export function parseOwned(raw: string | null): OwnedCard[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  // v0 / v1: 配列そのまま
  if (Array.isArray(parsed)) {
    return dedupe(parsed.map(toOwnedCard).filter((c): c is OwnedCard => c !== null));
  }
  // v2 以降: {version, cards}
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "cards" in parsed &&
    Array.isArray(parsed.cards)
  ) {
    return dedupe(parsed.cards.map(toOwnedCard).filter((c): c is OwnedCard => c !== null));
  }
  return [];
}

/** 現在の形式(v2)で文字列化する */
export function serializeOwned(cards: OwnedCard[]): string {
  const envelope: OwnedEnvelope = {
    version: OWNED_SCHEMA_VERSION,
    cards: cards.map((c) => ({ id: c.id, bloom: clampBloom(c.bloom) })),
  };
  return JSON.stringify(envelope);
}

export function loadOwned(storage: Pick<Storage, "getItem"> = localStorage): OwnedCard[] {
  try {
    return parseOwned(storage.getItem(OWNED_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveOwned(
  cards: OwnedCard[],
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(OWNED_STORAGE_KEY, serializeOwned(cards));
  } catch {
    // 保存できない環境(プライベートブラウズ等)でも動作は継続する
  }
}
