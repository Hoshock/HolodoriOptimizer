import type { AccountBonus } from "../engine/power";

/**
 * アカウント共通の補正(メモリーの「ユニットパラメータ +X%」・メンバー強化ボーナス +X%)の保存。localStorage のみ。
 * ゲーム内の表示値(小数 1〜2 桁の %)をそのまま入力してもらい、総合力に別枠で加算する(src/engine/power.ts)。
 * 後方互換の約束は src/storage/owned.ts と同じ: 版番号つき封筒、壊れていれば既定値(0%)、未知のフィールドは読み飛ばす
 */

export const ACCOUNT_STORAGE_KEY = "holodori-optimizer:account-bonus";
export const ACCOUNT_SCHEMA_VERSION = 1;

interface AccountEnvelope {
  version: number;
  memoryPercent: number;
  enhancementPercent: number;
}

/** 0 以上の有限な数値だけ受け付ける(% の上限は決めない。負値・NaN・文字列は 0) */
function toPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

export const DEFAULT_ACCOUNT_BONUS: AccountBonus = { memoryPercent: 0, enhancementPercent: 0 };

/** 入力欄の値(空文字・NaN を含みうる)を計算に渡せる形にそろえる */
export function normalizeAccount(account: {
  memoryPercent: unknown;
  enhancementPercent: unknown;
}): AccountBonus {
  return {
    memoryPercent: toPercent(account.memoryPercent),
    enhancementPercent: toPercent(account.enhancementPercent),
  };
}

export function parseAccount(raw: string | null): AccountBonus {
  if (raw === null) return { ...DEFAULT_ACCOUNT_BONUS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_ACCOUNT_BONUS };
  }
  if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_ACCOUNT_BONUS };
  return {
    memoryPercent: toPercent("memoryPercent" in parsed ? parsed.memoryPercent : 0),
    enhancementPercent: toPercent("enhancementPercent" in parsed ? parsed.enhancementPercent : 0),
  };
}

export function serializeAccount(account: AccountBonus): string {
  const envelope: AccountEnvelope = {
    version: ACCOUNT_SCHEMA_VERSION,
    ...normalizeAccount(account),
  };
  return JSON.stringify(envelope);
}

export function loadAccount(): AccountBonus {
  try {
    return parseAccount(localStorage.getItem(ACCOUNT_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_ACCOUNT_BONUS };
  }
}

export function saveAccount(account: AccountBonus): void {
  try {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, serializeAccount(account));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}
