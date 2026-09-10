import { cardById, cards as allCards, holomenById } from "../data";
import { BLOOM_MAX } from "../data/bloom";
import type { Card } from "../data/types";
import type { OwnedCard } from "./owned";

/**
 * 貼り付けて取り込む構造化データ（インポート用 JSON）の解釈。
 * 形式の定義とローカル LLM 向けの作り方は `.claude/skills/structure-import/`。
 *
 * ここは「文字列 → 何が起きるか（プラン）」までを純関数で持ち、保存はしない —
 * 画面側は必ずプランを見せてから確定させる（取り込みは取り消せないので確認を挟む
 * 2026-09-10 ユーザー指示）。カードの数値は取り込まない: 保存するのは
 * 「どのカードを持っているか」と開花段階だけ（`.claude/rules/storage-compat.md`）。
 */
function holomenNameOf(holomenId: string): string {
  return holomenById.get(holomenId)?.name ?? holomenId;
}

export const IMPORT_FORMAT = "holodori-optimizer/import";
export const IMPORT_VERSION = 1;

/** 読み取れなかったもの（人間が手で埋める材料。取り込みには使わない） */
export interface ImportUnreadable {
  reason: string;
  hint?: string;
}

/** 所持メンバー 1 行ぶん（kind: "owned-members"） */
export interface OwnedImportRow {
  card: string;
  holomen: string;
  /** 開花段階。null = 未読取 */
  bloom: number | null;
  cardId?: string;
  note?: string;
}

export interface ParsedOwnedImport {
  kind: "owned-members";
  rows: OwnedImportRow[];
  unreadable: ImportUnreadable[];
  capturedAt: string | null;
}

export type ParseImportResult =
  | { ok: true; value: ParsedOwnedImport }
  | { ok: false; message: string };

/** 名前の照合用に表記ゆれを畳む（全角半角・大小・空白・中黒の有無を無視する） */
function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s・]/gu, "")
    .toLowerCase();
}

const cardByName = new Map(allCards.map((c) => [normalizeName(c.name), c]));

/**
 * 読み取りの「少しのブレ」を許す照合（2026-09-10 ユーザー指示）。実例:
 * 「書庫ではぐくむ探究心」→ 探求心（漢字 1 文字違い）、「愛嬌たっぷりビットフィールド」→
 * ラビットフィールド（1 文字の脱字）。**候補が 1 つに絞れるときだけ**採用し、
 * 何をどう読み替えたかは確認画面に必ず出す（黙って別のカードにしない）。
 */
const FUZZY_CARD_DISTANCE = 2;
const FUZZY_HOLOMEN_DISTANCE = 1;

/** レーベンシュタイン距離。cap を超えたら打ち切って cap + 1 を返す */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i, ...Array.from<number>({ length: b.length }).fill(0)];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      best = Math.min(best, row[j] ?? 0);
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length] ?? cap + 1;
}

/** 表記のブレとみなせるか（短い距離、または一方が他方を含む） */
function isNearName(a: string, b: string, cap: number): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  return editDistance(a, b, cap) <= cap;
}

/** そのホロメン名（ブレを許す）の★5 カード */
function cardsOfHolomenName(name: string): Card[] {
  const wanted = normalizeName(name);
  const exact = allCards.filter((c) => normalizeName(holomenNameOf(c.holomenId)) === wanted);
  if (exact.length > 0) return exact;
  return allCards.filter((c) =>
    isNearName(normalizeName(holomenNameOf(c.holomenId)), wanted, FUZZY_HOLOMEN_DISTANCE),
  );
}

/** ユーザーがコードブロックごとコピーしてもよいように ``` の囲みを外す */
function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[^\n]*\n?/u, "")
    .replace(/```$/u, "")
    .trim();
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function toRow(entry: unknown): OwnedImportRow | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  const card = asString(record.card);
  const holomen = asString(record.holomen);
  if (card === null || holomen === null) return null;
  const bloom = typeof record.bloom === "number" ? record.bloom : null;
  const row: OwnedImportRow = { card, holomen, bloom };
  const cardId = asString(record.cardId);
  if (cardId !== null) row.cardId = cardId;
  const note = asString(record.note);
  if (note !== null) row.note = note;
  return row;
}

function toUnreadable(entry: unknown): ImportUnreadable | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  const reason = asString(record.reason) ?? "理由の記載なし";
  const hint = asString(record.hint);
  return hint === null ? { reason } : { reason, hint };
}

/** 貼られた文字列を解釈する。エラーは画面にそのまま出す文言で返す */
export function parseImport(text: string): ParseImportResult {
  const body = stripFence(text);
  if (body === "") return { ok: false, message: "取り込むデータが空です。" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      ok: false,
      message: "JSON として読めません。データ全体をそのまま貼り付けてください。",
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: "JSON として読めません（オブジェクトではありません）。" };
  }
  const record = parsed as Record<string, unknown>;
  if (record.format !== IMPORT_FORMAT) {
    return {
      ok: false,
      message: `このツールの取り込み用データではありません（format が "${IMPORT_FORMAT}" ではありません）。`,
    };
  }
  if (record.version !== IMPORT_VERSION) {
    return {
      ok: false,
      message: `対応していない版のデータです（version は ${String(IMPORT_VERSION)} のみ）。`,
    };
  }
  if (record.kind !== "owned-members") {
    return {
      ok: false,
      message: "いま取り込めるのは所持メンバー（kind: owned-members）だけです。",
    };
  }
  if (!Array.isArray(record.cards)) {
    return { ok: false, message: "cards の配列がありません。" };
  }
  const rows = record.cards.map(toRow).filter((r): r is OwnedImportRow => r !== null);
  const dropped = record.cards.length - rows.length;
  if (rows.length === 0) {
    return { ok: false, message: "所持メンバーが 1 件も入っていません。" };
  }
  const unreadable = Array.isArray(record.unreadable)
    ? record.unreadable.map(toUnreadable).filter((u): u is ImportUnreadable => u !== null)
    : [];
  if (dropped > 0) {
    unreadable.push({
      reason: `card / holomen が欠けている ${String(dropped)} 件を読み飛ばしました`,
    });
  }
  return {
    ok: true,
    value: { kind: "owned-members", rows, unreadable, capturedAt: asString(record.capturedAt) },
  };
}

/** 新しく登録するカード */
export interface OwnedImportAdd {
  id: string;
  card: string;
  holomen: string;
  bloom: number;
}

/** すでに登録済みで開花段階が変わるカード */
export interface OwnedImportUpdate {
  id: string;
  card: string;
  holomen: string;
  from: number;
  to: number;
}

/** 取り込まなかった行（理由つき。黙って落とさない） */
export interface OwnedImportReview {
  label: string;
  reason: string;
}

export interface OwnedImportPlan {
  add: OwnedImportAdd[];
  update: OwnedImportUpdate[];
  /** 登録済みで開花段階も同じだった件数（内訳は出さない） */
  unchanged: number;
  review: OwnedImportReview[];
  unreadable: ImportUnreadable[];
}

/**
 * 取り込むと何が起きるかを組み立てる。**JSON に無いカードの既存の登録は消さない** —
 * スクショが全件そろっている保証がないので、取り込みで登録が減るのは危ない
 */
export function planOwnedImport(
  parsed: ParsedOwnedImport,
  current: readonly OwnedCard[],
): OwnedImportPlan {
  const plan: OwnedImportPlan = {
    add: [],
    update: [],
    unchanged: 0,
    review: [],
    unreadable: [...parsed.unreadable],
  };
  const currentById = new Map(current.map((o) => [o.id, o.bloom]));
  const seen = new Set<string>();

  for (const row of parsed.rows) {
    const label = `${row.holomen}「${row.card}」`;
    const byId = row.cardId === undefined ? undefined : cardById.get(row.cardId);
    const exact = byId ?? cardByName.get(normalizeName(row.card));
    let card = exact;
    if (card === undefined) {
      // 表記のブレ: そのホロメンのカードの中で 1 つに絞れるときだけ読み替える
      const near = cardsOfHolomenName(row.holomen).filter((c) =>
        isNearName(normalizeName(c.name), normalizeName(row.card), FUZZY_CARD_DISTANCE),
      );
      if (near.length === 1 && near[0] !== undefined) {
        card = near[0];
        plan.review.push({
          label,
          reason: `「${card.name}」として取り込みます`,
        });
      } else {
        plan.review.push({
          label,
          reason:
            near.length > 1
              ? "似たカード名が複数あるので特定できません"
              : "このカード名が見つかりません（★5 のカードのみ登録できます）",
        });
        continue;
      }
    }
    const holomen = holomenNameOf(card.holomenId);
    if (normalizeName(holomen) !== normalizeName(row.holomen)) {
      // カード名が一致しているなら、ホロメン名の 1 文字違いは表記のブレとして許す
      if (isNearName(normalizeName(holomen), normalizeName(row.holomen), FUZZY_HOLOMEN_DISTANCE)) {
        plan.review.push({
          label,
          reason: `ホロメン名は ${holomen} として取り込みます`,
        });
      } else {
        plan.review.push({
          label,
          reason: `カード名は ${holomen} のものです（ホロメン名と食い違うので取り込みません）`,
        });
        continue;
      }
    }
    if (seen.has(card.id)) {
      plan.review.push({
        label,
        reason: "同じカードが 2 回入っています（最初の 1 件だけ使います）",
      });
      continue;
    }
    if (
      row.bloom !== null &&
      (!Number.isInteger(row.bloom) || row.bloom < 0 || row.bloom > BLOOM_MAX)
    ) {
      plan.review.push({
        label,
        reason: `開花段階が 0〜${String(BLOOM_MAX)} の整数ではありません（${String(row.bloom)}）`,
      });
      continue;
    }
    seen.add(card.id);
    const currentBloom = currentById.get(card.id);

    if (row.bloom === null) {
      // 未読取: 新規なら 0凸で登録し、登録済みなら現在の段階を保つ（推測で上書きしない）
      if (currentBloom === undefined) {
        plan.add.push({ id: card.id, card: card.name, holomen, bloom: 0 });
        plan.review.push({ label, reason: "開花段階が未読取のため 0凸で登録します" });
      } else {
        plan.unchanged += 1;
        plan.review.push({
          label,
          reason: `開花段階が未読取のため、登録済みの ${String(currentBloom)}凸のままにします`,
        });
      }
      continue;
    }
    if (currentBloom === undefined) {
      plan.add.push({ id: card.id, card: card.name, holomen, bloom: row.bloom });
    } else if (currentBloom === row.bloom) {
      plan.unchanged += 1;
    } else {
      plan.update.push({
        id: card.id,
        card: card.name,
        holomen,
        from: currentBloom,
        to: row.bloom,
      });
    }
  }
  return plan;
}

/** プランを現在の登録に当てる（新しい配列を返す。既存の並びと未知の ID は保つ） */
export function applyOwnedImport(
  plan: OwnedImportPlan,
  current: readonly OwnedCard[],
): OwnedCard[] {
  const updates = new Map(plan.update.map((u) => [u.id, u.to]));
  const next = current.map((o) => {
    const bloom = updates.get(o.id);
    return bloom === undefined ? { ...o } : { id: o.id, bloom };
  });
  for (const add of plan.add) next.push({ id: add.id, bloom: add.bloom });
  return next;
}

/** 取り込みで変わる件数（0 なら確定させる意味がない） */
export function importChangeCount(plan: OwnedImportPlan): number {
  return plan.add.length + plan.update.length;
}
