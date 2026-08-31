/**
 * ガチャ・課金まわりの仕様定数(仮想ガチャシミュレーション用)。
 *
 * 出典と調査日(2026-08-31、攻略サイト調べ)は docs/human/game-spec.md「ガチャと課金」を参照。
 * ゲーム内実測での裏取りは未実施。実際の仕様・価格と異なる可能性がある。
 */

/** 通常排出の提供割合(★5 / ★4 / ★3) */
export const GACHA_RATES = { star5: 0.05, star4: 0.1, star3: 0.85 } as const;

/** 10 連の 10 枚目(★4 以上確定枠)の提供割合 */
export const GUARANTEED_SLOT_RATES = { star5: 0.05, star4: 0.95 } as const;

/**
 * ガチャのダイヤ消費(単発 / 10 連)。
 * 実ゲームには無償のレッドダイヤと 1 日 1 回 90 個の割引単発もあるが、
 * 仮想ガチャでは有償ダイヤのみに簡略化して再現しない(2026-08-31 ユーザー指定)
 */
export const PULL_COST = { single: 250, ten: 2500 } as const;

/** ピックアップガチャの対象 1 枚あたりの絶対排出率(例: 新カード 1.0000%) */
export const PICKUP_RATE_EACH = 0.01;

/** 初心者応援ガチャで選んだ 1 人あたりの絶対排出率(0.6666%)と選択人数 */
export const SUPPORT_RATE_EACH = 0.006666;
export const SUPPORT_PICK_COUNT = 3;

/** ショップのブルーダイヤ販売(確認できた通常価格パック。他のパックは未確認のため未収録) */
export const DIA_PACK = { dia: 8200, yen: 9800 } as const;

/**
 * ガチャの種類。実ゲームの天井(ガチャ Pt 200 回ぶんで交換)は仮想ガチャでは
 * 再現しない(2026-08-31 ユーザー指示 — 詳細は docs/human/game-spec.md)
 */
export type GachaKind = "normal" | "pickup" | "support" | "startdash";

export const GACHA_KINDS: { id: GachaKind; name: string }[] = [
  { id: "normal", name: "通常ガチャ" },
  { id: "pickup", name: "ピックアップガチャ" },
  { id: "support", name: "初心者応援ガチャ" },
  { id: "startdash", name: "スタートダッシュガチャ" },
];
