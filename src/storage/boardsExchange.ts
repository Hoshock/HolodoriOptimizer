import { holomen as allHolomen, holomenById } from "../data";
import type { ConnectPlacements } from "../data/connect";
import type { BoardColor, BoardEntry } from "./boards";
import { toBoardMap } from "./boards";
import { parseConnectPlacements } from "./connect";

/**
 * ホロメンボード（4 色 × ホロメンごとの解放マス）の構造化データ（JSON）。管理用「ホロメンボード」のデバッグ画面で、
 * 手で触ったボードをこの形に出力し、逆にこの形を貼るとデバッグ用のボードがその状態になる（2026-09-11 ユーザー指示。
 * **登録しているボードを書き換える取り込みではない** — 画面の中のデバッグ用の状態だけが動く）。
 *
 * 形式（所持メンバーの取り込み `holodori-optimizer/import` とは別の封筒）:
 *
 *   {
 *     "format": "holodori-optimizer/boards",
 *     "version": 1,
 *     "boards": [
 *       { "holomen": "猫又おかゆ", "holomenId": "nekomata-okayu",
 *         "red": ["R-001", "R-002"], "blue": ["B-001"], "yellow": [], "green": ["G-001"],
 *         "connect": { "card": { "extent": "card-2", "permil": 850 } } }
 *     ]
 *   }
 *
 * ホロメンは `holomenId`（正規 ID）で決め、無ければ `holomen`（表示名）で探す。マス ID は各色の正典
 * （`src/data/*Board.ts` の R-xxx / B-xxx / Y-xxx / G-xxx）で、知らない ID は数だけ知らせて捨てる。
 * `connect` はコネクトマスの入力（アンカー center / leader / card / content → 範囲の形と ‰。`src/storage/connect.ts` と同じ形。
 * 2026-09-11「コネクトマスの情報が入ってない」で追加。無ければ・壊れていれば未配置）。
 * ここは文字列と値の変換だけを純関数で持ち、保存はしない（`.claude/rules/storage-compat.md`）
 */
export const BOARDS_EXCHANGE_FORMAT = "holodori-optimizer/boards";
export const BOARDS_EXCHANGE_VERSION = 1;
export const BOARD_COLOR_ORDER: readonly BoardColor[] = ["red", "blue", "yellow", "green"];

export type BoardsByColor = Record<BoardColor, readonly BoardEntry[]>;

/** 1 ホロメンぶんの出力 */
interface ExchangeRow {
  holomen: string;
  holomenId: string;
  red?: string[];
  blue?: string[];
  yellow?: string[];
  green?: string[];
  connect?: ConnectPlacements;
}
const hasPlacements = (p: ConnectPlacements | undefined): p is ConnectPlacements =>
  p !== undefined && Object.keys(p).length > 0;

/** 4 色の登録 + コネクトの入力を 1 つの JSON にする（ホロメンはデータの並び順、色は赤・青・黄・緑。空の色・空のコネクトは省く） */
export function serializeBoardsExchange(
  boards: BoardsByColor,
  connect: Readonly<Record<string, ConnectPlacements>> = {},
): string {
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
  for (const [holomenId, placements] of Object.entries(connect)) {
    if (!hasPlacements(placements)) continue;
    let row = byHolomen.get(holomenId);
    if (!row) {
      row = { holomen: holomenById.get(holomenId)?.name ?? holomenId, holomenId };
      byHolomen.set(holomenId, row);
      order.push(holomenId);
    }
    row.connect = { ...placements };
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

/**
 * ホロメン ID → 4 色の解放マス（デバッグ画面の状態。複数ホロメン）を JSON にする。全色空のホロメンも行を出す
 * （「このホロメンは何も解放していない」も状態のうち）。並びはデータの順
 */
export function serializeHolomenBoards(
  boards: Readonly<
    Record<
      string,
      Readonly<Record<BoardColor, readonly string[]>> & { readonly connect?: ConnectPlacements }
    >
  >,
): string {
  const index = new Map(allHolomen.map((h, i) => [h.id, i]));
  const ids = Object.keys(boards).sort(
    (a, b) => (index.get(a) ?? Infinity) - (index.get(b) ?? Infinity),
  );
  const rows = ids.map((holomenId) => {
    const nodes = boards[holomenId];
    const row: ExchangeRow = {
      holomen: holomenById.get(holomenId)?.name ?? holomenId,
      holomenId,
    };
    for (const color of BOARD_COLOR_ORDER) {
      const list = nodes?.[color] ?? [];
      if (list.length > 0) row[color] = [...list];
    }
    if (hasPlacements(nodes?.connect)) row.connect = { ...nodes.connect };
    return row;
  });
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
  /** コネクトマスの入力（無ければ空） */
  connect: ConnectPlacements;
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
      connect: parseConnectPlacements(record.connect),
    });
  }
  return { ok: true, rows };
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").replace(/\s/gu, "").toLowerCase();
}

/** 行のホロメンを正規 ID に解決する（`holomenId` → 表示名の順。決まらなければ null） */
export function resolveBoardsHolomen(row: ParsedBoardsRow): string | null {
  if (row.holomenId !== null && holomenById.has(row.holomenId)) return row.holomenId;
  if (row.holomen !== null) {
    const wanted = normalizeName(row.holomen);
    const hit = allHolomen.find((h) => normalizeName(h.name) === wanted);
    if (hit) return hit.id;
  }
  return null;
}

/** 行のマス ID を色の正典で絞る。知らない ID の数も返す */
export function knownBoardsNodes(
  holomenId: string,
  row: ParsedBoardsRow,
): { nodes: Record<BoardColor, string[]>; unknown: number } {
  const nodes = {} as Record<BoardColor, string[]>;
  let unknown = 0;
  for (const color of BOARD_COLOR_ORDER) {
    const known = toBoardMap(color, [{ holomenId, nodes: row.nodes[color] }])[holomenId] ?? [];
    unknown += row.nodes[color].length - known.length;
    nodes[color] = known;
  }
  return { nodes, unknown };
}
