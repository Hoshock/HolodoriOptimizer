import { holomen as allHolomen, holomenById } from "../data";
import type { BoardColor, BoardEntry } from "./boards";
import { toBoardMap } from "./boards";

/**
 * ホロメンボードの登録（4 色 × ホロメンごとの解放マス）を、コピーして持ち出し・貼り付けて取り込むための
 * 構造化データ（JSON）。入口はサイドメニューの管理用 → ホロメンボード（2026-09-11 ユーザー指示。
 * 「4 色のホロメンボードについて構造化データをコピーできる UI。逆に構造化データを入れたらボード側の状態も変わる」）。
 *
 * 形式（所持メンバーの取り込み `holodori-optimizer/import` とは別の封筒）:
 *
 *   {
 *     "format": "holodori-optimizer/boards",
 *     "version": 1,
 *     "boards": [
 *       { "holomen": "猫又おかゆ", "holomenId": "nekomata-okayu",
 *         "red": ["R-001", "R-002"], "blue": ["B-001"], "yellow": [], "green": ["G-001"] }
 *     ]
 *   }
 *
 * ホロメンは `holomenId`（正規 ID）で決め、無ければ `holomen`（表示名）で探す。マス ID は各色の正典
 * （`src/data/*Board.ts` の R-xxx / B-xxx / Y-xxx / G-xxx）で、知らない ID は数だけ知らせて捨てる。
 * 取り込みの意味は「**書いてあるホロメンの 4 色をその内容に置き換える**」— 省いた色はそのホロメンで全部解除、
 * 書いていないホロメンはそのまま（所持メンバーの取り込みが登録を減らさないのと違い、ボードはコピーした
 * 全量を戻すのが目的なので、置き換えを選ぶ。実行前に人数と色ごとの解放数の変化を必ず見せる）。
 * ここは「文字列 → 何が起きるか（プラン）」までを純関数で持ち、保存はしない（`.claude/rules/storage-compat.md`）
 */
export const BOARDS_EXCHANGE_FORMAT = "holodori-optimizer/boards";
export const BOARDS_EXCHANGE_VERSION = 1;
export const BOARD_COLOR_ORDER: readonly BoardColor[] = ["red", "blue", "yellow", "green"];
export const BOARD_COLOR_LABELS: Readonly<Record<BoardColor, string>> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
  green: "緑",
};

export type BoardsByColor = Record<BoardColor, readonly BoardEntry[]>;

/** 1 ホロメンぶんの出力 */
interface ExchangeRow {
  holomen: string;
  holomenId: string;
  red?: string[];
  blue?: string[];
  yellow?: string[];
  green?: string[];
}

/** 登録している 4 色を 1 つの JSON にする（ホロメンはデータの並び順、色は赤・青・黄・緑。空の色は省く） */
export function serializeBoardsExchange(boards: BoardsByColor): string {
  const byHolomen = new Map<string, ExchangeRow>();
  const order: string[] = [];
  for (const color of BOARD_COLOR_ORDER) {
    for (const entry of boards[color]) {
      if (entry.nodes.length === 0) continue;
      let row = byHolomen.get(entry.holomenId);
      if (!row) {
        row = {
          holomen: holomenById.get(entry.holomenId)?.name ?? entry.holomenId,
          holomenId: entry.holomenId,
        };
        byHolomen.set(entry.holomenId, row);
        order.push(entry.holomenId);
      }
      row[color] = [...entry.nodes];
    }
  }
  const index = new Map(allHolomen.map((h, i) => [h.id, i]));
  order.sort((a, b) => (index.get(a) ?? Infinity) - (index.get(b) ?? Infinity));
  const rows = order
    .map((id) => byHolomen.get(id))
    .filter((r): r is ExchangeRow => r !== undefined);
  return JSON.stringify(
    { format: BOARDS_EXCHANGE_FORMAT, version: BOARDS_EXCHANGE_VERSION, boards: rows },
    null,
    2,
  );
}

/** 読み取った 1 ホロメンぶん（ホロメンの解決前） */
export interface ParsedBoardsRow {
  holomen: string | null;
  holomenId: string | null;
  nodes: Record<BoardColor, string[]>;
}

export type ParseBoardsExchangeResult =
  | { ok: true; rows: ParsedBoardsRow[] }
  | { ok: false; message: string };

/** ユーザーがコードブロックごとコピーしてもよいように ``` の囲みを外す */
function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[^\n]*\n?/u, "")
    .replace(/```$/u, "")
    .trim();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && v !== ""))];
}

export function parseBoardsExchange(text: string): ParseBoardsExchangeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch {
    return { ok: false, message: "JSON として読めませんでした。" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: "JSON のルートがオブジェクトではありません。" };
  }
  const format = "format" in parsed ? parsed.format : undefined;
  if (format !== BOARDS_EXCHANGE_FORMAT) {
    return {
      ok: false,
      message: `ホロメンボードのデータではありません（format が "${BOARDS_EXCHANGE_FORMAT}" ではない）。`,
    };
  }
  const version = "version" in parsed ? parsed.version : undefined;
  if (version !== BOARDS_EXCHANGE_VERSION) {
    return { ok: false, message: `version ${String(version)} には対応していません。` };
  }
  if (!("boards" in parsed) || !Array.isArray(parsed.boards)) {
    return { ok: false, message: "boards がありません。" };
  }
  const rows: ParsedBoardsRow[] = [];
  for (const item of parsed.boards) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    rows.push({
      holomen: typeof record.holomen === "string" ? record.holomen : null,
      holomenId: typeof record.holomenId === "string" ? record.holomenId : null,
      nodes: {
        red: stringList(record.red),
        blue: stringList(record.blue),
        yellow: stringList(record.yellow),
        green: stringList(record.green),
      },
    });
  }
  return { ok: true, rows };
}

/** 取り込むと何が起きるか（1 ホロメンぶん） */
export interface BoardsImportRow {
  holomenId: string;
  holomen: string;
  /** 色ごとの解放数（いま → 取り込み後。既知のマスだけ数える） */
  counts: Record<BoardColor, { before: number; after: number }>;
  /** 取り込み後の解放マス（既知のマスだけ） */
  nodes: Record<BoardColor, string[]>;
  changed: boolean;
}

export interface BoardsImportPlan {
  rows: BoardsImportRow[];
  /** ホロメンを特定できなかった行の数（内容は出さない） */
  unknownHolomen: number;
  /** 知らないマス ID の数（色の正典にない ID。捨てる） */
  unknownNodes: number;
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").replace(/\s/gu, "").toLowerCase();
}

function resolveHolomen(row: ParsedBoardsRow): string | null {
  if (row.holomenId !== null && holomenById.has(row.holomenId)) return row.holomenId;
  if (row.holomen !== null) {
    const wanted = normalizeName(row.holomen);
    const hit = allHolomen.find((h) => normalizeName(h.name) === wanted);
    if (hit) return hit.id;
  }
  return null;
}

export function planBoardsImport(
  rows: ParsedBoardsRow[],
  current: BoardsByColor,
): BoardsImportPlan {
  const plan: BoardsImportPlan = { rows: [], unknownHolomen: 0, unknownNodes: 0 };
  const seen = new Set<string>();
  for (const row of rows) {
    const holomenId = resolveHolomen(row);
    if (holomenId === null || seen.has(holomenId)) {
      plan.unknownHolomen += 1;
      continue;
    }
    seen.add(holomenId);
    const counts = {} as BoardsImportRow["counts"];
    const nodes = {} as BoardsImportRow["nodes"];
    let changed = false;
    for (const color of BOARD_COLOR_ORDER) {
      const known = toBoardMap(color, [{ holomenId, nodes: row.nodes[color] }])[holomenId] ?? [];
      plan.unknownNodes += row.nodes[color].length - known.length;
      const before = toBoardMap(color, current[color])[holomenId] ?? [];
      counts[color] = { before: before.length, after: known.length };
      nodes[color] = known;
      const sameSet = before.length === known.length && before.every((id) => known.includes(id));
      if (!sameSet) changed = true;
    }
    plan.rows.push({
      holomenId,
      holomen: holomenById.get(holomenId)?.name ?? holomenId,
      counts,
      nodes,
      changed,
    });
  }
  return plan;
}

/** プランの行を登録に当てる（書いてあるホロメンの 4 色を置き換え、他のホロメンはそのまま）。新しい配列を返す */
export function applyBoardsImport(
  rows: readonly BoardsImportRow[],
  current: BoardsByColor,
): Record<BoardColor, BoardEntry[]> {
  const next = {} as Record<BoardColor, BoardEntry[]>;
  for (const color of BOARD_COLOR_ORDER) {
    const entries = current[color].map((e) => ({ holomenId: e.holomenId, nodes: [...e.nodes] }));
    for (const row of rows) {
      const entry = entries.find((e) => e.holomenId === row.holomenId);
      if (entry) entry.nodes = [...row.nodes[color]];
      else if (row.nodes[color].length > 0) {
        entries.push({ holomenId: row.holomenId, nodes: [...row.nodes[color]] });
      }
    }
    next[color] = entries;
  }
  return next;
}
