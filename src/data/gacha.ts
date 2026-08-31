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

/** ガチャのダイヤ消費(単発 / 10 連 / 1 日 1 回の割引単発)。割引単発はブルーダイヤ専用 */
export const PULL_COST = { single: 250, ten: 2500, discountSingle: 90 } as const;

/** 天井: ガチャ Pt がこの回数ぶん貯まるとピックアップ対象と交換できる(Pt はガチャごと・引き継ぎ不可) */
export const PITY_PULLS = 200;

/** ピックアップガチャの対象 1 枚あたりの絶対排出率(例: 新カード 1.0000%) */
export const PICKUP_RATE_EACH = 0.01;

/** 初心者応援ガチャで選んだ 1 人あたりの絶対排出率(0.6666%)と選択人数 */
export const SUPPORT_RATE_EACH = 0.006666;
export const SUPPORT_PICK_COUNT = 3;

/** ショップのブルーダイヤ販売(確認できた通常価格パック。他のパックは未確認のため未収録) */
export const DIA_PACK = { dia: 8200, yen: 9800 } as const;

/** 仮想ウォレットの初期レッドダイヤ(リリース記念ログインボーナスの配布合計に相当) */
export const INITIAL_RED_DIA = 2500;

/** ガチャの種類 */
export type GachaKind = "normal" | "pickup" | "support" | "startdash";

export const GACHA_KINDS: { id: GachaKind; name: string; note: string }[] = [
  { id: "normal", name: "通常ガチャ", note: "恒常。★5 はすべて同率で排出" },
  {
    id: "pickup",
    name: "ピックアップガチャ",
    note: "選んだ 1 枚が 1.0000% で排出。200 回ぶんのガチャ Pt で交換(天井)あり",
  },
  {
    id: "support",
    name: "初心者応援ガチャ",
    note: "好きな ★5 を 3 人選び、各 0.6666% で排出(ゲーム内では開始 7 日間限定)",
  },
  {
    id: "startdash",
    name: "スタートダッシュガチャ",
    note: "ブルーダイヤ専用の 10 連 1 回限り。★5 が 1 枚確定",
  },
];
