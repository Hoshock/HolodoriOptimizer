import { createBoardGraph } from "./boardGraph";
import { holomenById } from "./index";
import { songSingers } from "./songSingers";
import type { Song } from "./types";

/**
 * 黄ホロメンボード(全ホロメン共通のノード構成 — 2026-09-08 ユーザー実機確認。
 * 座標・効果の正典は .claude/skills/parameter-calculation/references/yellow-board.md)。
 *
 * - 全体配置の青の反対側。形は青ボードの左右反転と同じ 31 マス。右型(青が左のホロメン)の座標で
 *   定義する(x は中心 0 から正の方向へ、y は上が正)。左型(青が右のホロメン)は x を反転した表示。
 *   左右は holomen.json の board.blueSide から導き、黄の左右を別に持たない
 * - 効果は楽曲のスコアボーナス(本人のソロ楽曲 / 本人を含むユニット楽曲 / 全体楽曲)と
 *   ホロワークの報酬の獲得量(レッスン Pt / キューブ / 特訓アイテム)の 2 系統。パラメータには効かない
 * - フワワ・モココのソロ系マスは「楽曲歌唱者が FUWAMOCO のみの楽曲」が対象(2026-09-08 実機確認)
 * - 楽曲スコアボーナスは合計 10.0% が上限。楽曲の区分(ソロ / ユニット / 全体)は src/data/songSingers.ts。
 *   効果は緑と同じく**アカウント全体**に効く(黄を育てたホロメンが編成外でも、その曲なら乗る)。
 *   実機の表示値はコネクト増幅後で、ツールは表記値で試算する(2026-09-08 ユーザー確認)
 * - ゲーム内の「スコアボーナス」が最終スコアにどう掛かるかは未確認。ツールは総合期待スコアに (1 + X%) を
 *   掛ける仮定(src/engine/live.ts)。複数人の黄は単純合計して上限を掛ける仮定(FUWAMOCO 2 人分も合算)
 * - マスは中心 (0, 0) から隣接連結でのみ解放。コネクトマス C (7, 0) は表示するが入力しない(通路)
 */

/** 楽曲スコアボーナスの対象: 本人のソロ楽曲 / 本人を含むユニット楽曲 / 全体楽曲 */
export type YellowSongScope = "solo" | "unit" | "all";
/** ホロワークの報酬の種類 */
export type YellowWorkReward = "lessonPt" | "cube" | "trainingItem";

export type YellowBoardEffect =
  /** 楽曲のスコアボーナス(permil 5 = +0.5%) */
  | { kind: "songScore"; scope: YellowSongScope; permil: number }
  /** ホロワークの報酬の獲得量 UP(permil 50 = +5%) */
  | { kind: "workReward"; reward: YellowWorkReward; permil: number };

export interface YellowBoardNode {
  id: string;
  /** 右型の座標(x は中心 0 から正の方向へ伸びる。y は上が正) */
  x: number;
  y: number;
  effect: YellowBoardEffect;
  /** 実機で大きく描かれるマス(中央の列の 6 個目と、5 マス塊・右端の両端)。描画は 1.5 倍 */
  large?: true;
}

const song = (scope: YellowSongScope, permil: number): YellowBoardEffect => ({
  kind: "songScore",
  scope,
  permil,
});
const work = (reward: YellowWorkReward, permil: number): YellowBoardEffect => ({
  kind: "workReward",
  reward,
  permil,
});

export const YELLOW_BOARD_NODES: readonly YellowBoardNode[] = [
  { id: "Y-001", x: 1, y: 0, effect: song("solo", 5) },
  { id: "Y-002", x: 2, y: 0, effect: song("solo", 5) },
  { id: "Y-003", x: 2, y: -1, effect: song("unit", 10) },
  { id: "Y-004", x: 2, y: 1, effect: song("all", 1) },
  { id: "Y-005", x: 3, y: 0, effect: song("solo", 5) },
  { id: "Y-006", x: 4, y: 0, effect: song("solo", 5) },
  { id: "Y-007", x: 5, y: 0, effect: song("solo", 5) },
  { id: "Y-008", x: 6, y: 0, effect: work("lessonPt", 50), large: true },
  { id: "Y-009", x: 7, y: -1, effect: song("solo", 5) },
  { id: "Y-010", x: 7, y: -2, effect: work("cube", 40) },
  { id: "Y-011", x: 7, y: -3, effect: song("unit", 10) },
  { id: "Y-012", x: 6, y: -3, effect: work("trainingItem", 40) },
  { id: "Y-013", x: 5, y: -3, effect: work("cube", 80), large: true },
  { id: "Y-014", x: 8, y: -3, effect: work("lessonPt", 30) },
  { id: "Y-015", x: 9, y: -3, effect: song("unit", 20), large: true },
  { id: "Y-016", x: 7, y: 1, effect: song("solo", 5) },
  { id: "Y-017", x: 7, y: 2, effect: work("lessonPt", 30) },
  { id: "Y-018", x: 7, y: 3, effect: song("all", 1) },
  { id: "Y-019", x: 6, y: 3, effect: work("trainingItem", 40) },
  { id: "Y-020", x: 5, y: 3, effect: work("lessonPt", 60), large: true },
  { id: "Y-021", x: 8, y: 3, effect: work("cube", 40) },
  { id: "Y-022", x: 9, y: 3, effect: song("all", 5), large: true },
  { id: "Y-023", x: 8, y: 0, effect: song("solo", 5) },
  { id: "Y-024", x: 8, y: -1, effect: song("solo", 5) },
  { id: "Y-025", x: 8, y: 1, effect: song("solo", 5) },
  { id: "Y-026", x: 9, y: 0, effect: work("trainingItem", 40) },
  { id: "Y-027", x: 10, y: 0, effect: song("solo", 5) },
  { id: "Y-028", x: 10, y: -1, effect: work("cube", 40) },
  { id: "Y-029", x: 10, y: -2, effect: song("solo", 20), large: true },
  { id: "Y-030", x: 10, y: 1, effect: work("lessonPt", 30) },
  { id: "Y-031", x: 10, y: 2, effect: work("trainingItem", 80), large: true },
];

/** 初期地点 = 全ボードの中心のコネクト(色の概念はない)。解放の起点で、入力対象ではない */
export const YELLOW_BOARD_ORIGIN = { id: "R", x: 0, y: 0 } as const;
/** 黄ボード内のコネクトマス(人物アイコン)。中心から 7 マス目。存在するが入力しない。通路としては常に通れる */
export const YELLOW_BOARD_CONNECT = { id: "C", x: 7, y: 0 } as const;

export const YELLOW_BOARD_NODE_IDS: readonly string[] = YELLOW_BOARD_NODES.map((n) => n.id);
const nodeById = new Map(YELLOW_BOARD_NODES.map((n) => [n.id, n]));
export const YELLOW_BOARD_X_RANGE = { min: 0, max: 10 } as const;
export const YELLOW_BOARD_Y_RANGE = { min: -3, max: 3 } as const;

const graph = createBoardGraph(YELLOW_BOARD_NODES, YELLOW_BOARD_ORIGIN, [YELLOW_BOARD_CONNECT]);
export const YELLOW_BOARD_EDGES = graph.edges;
export const yellowReachableNodes = graph.reachableNodes;
export const yellowToggleNode = graph.toggleNode;
export const yellowKnownNodeIds = graph.knownNodeIds;

/** 黄ボードが全体配置の左にあるホロメン(= 青が右)。左型は右型の座標を x 反転して描く */
export function isYellowLeft(holomenId: string): boolean {
  return holomenById.get(holomenId)?.board.blueSide === "right";
}

/** ソロ系マスの対象が「本人のソロ楽曲」でなく「楽曲歌唱者が FUWAMOCO のみの楽曲」になるホロメン(2026-09-08 実機確認) */
export const FUWAMOCO_HOLOMEN_IDS: ReadonlySet<string> = new Set([
  "fuwawa-abyssgard",
  "mococo-abyssgard",
]);

export function isFuwamoco(holomenId: string): boolean {
  return FUWAMOCO_HOLOMEN_IDS.has(holomenId);
}

/** 解放したマスの効果の合計(マスの表記値、‰。コネクト増幅は含まない) */
export interface YellowBoardEffects {
  /** 楽曲のスコアボーナス(‰) */
  song: Record<YellowSongScope, number>;
  /** ホロワークの報酬の獲得量(‰) */
  work: Record<YellowWorkReward, number>;
}

export function yellowBoardEffects(nodeIds: Iterable<string>): YellowBoardEffects {
  const e: YellowBoardEffects = {
    song: { solo: 0, unit: 0, all: 0 },
    work: { lessonPt: 0, cube: 0, trainingItem: 0 },
  };
  for (const id of nodeIds) {
    const node = nodeById.get(id);
    if (!node) continue;
    const eff = node.effect;
    if (eff.kind === "songScore") e.song[eff.scope] += eff.permil;
    else e.work[eff.reward] += eff.permil;
  }
  return e;
}

/** 楽曲スコアボーナスの上限(1 曲に乗る合計。‰ 100 = 10.0% — 2026-09-08 ユーザー確認) */
export const YELLOW_SONG_BONUS_CAP_PERMIL = 100;

/** アカウント全体(登録した全ホロメンの黄ボード)の楽曲スコアボーナス。ホロメン別のソロ / ユニットと、全体楽曲の合計 */
export interface YellowAccountEffects {
  /** ホロメン ID → そのホロメンが歌唱者のときのソロ / ユニット曲のボーナス(‰) */
  byHolomen: Record<string, { solo: number; unit: number }>;
  /** 全体楽曲のボーナス(‰。全ホロメン分の合計) */
  allPermil: number;
}

export function accountYellowEffects(
  boards: Readonly<Record<string, readonly string[]>>,
): YellowAccountEffects {
  const e: YellowAccountEffects = { byHolomen: {}, allPermil: 0 };
  for (const [holomenId, nodes] of Object.entries(boards)) {
    const b = yellowBoardEffects(nodes);
    if (b.song.solo !== 0 || b.song.unit !== 0)
      e.byHolomen[holomenId] = { solo: b.song.solo, unit: b.song.unit };
    e.allPermil += b.song.all;
  }
  return e;
}

export function hasYellowSongEffect(e: YellowAccountEffects): boolean {
  return e.allPermil !== 0 || Object.keys(e.byHolomen).length > 0;
}

/**
 * その曲に乗る楽曲スコアボーナス(‰、上限 10.0% 適用後)。
 * 全体楽曲 = 全員の「全体楽曲」の合計。ソロ曲 = 歌唱者本人のソロ。ユニット曲 = 歌唱者それぞれのユニット。
 * フワワ・モココのソロ系は「歌唱者が FUWAMOCO のみの曲」にだけ乗り(本人 1 人の曲やほかのユニット曲では
 * ユニット側が乗る)、2 人分は合算する(仮定)。歌唱者が未確認の曲は 0
 */
export function yellowSongBonusPermil(e: YellowAccountEffects, song: Song): number {
  const singers = songSingers(song);
  let sum = 0;
  if (singers.scope === "all") sum = e.allPermil;
  else if (singers.holomenIds) {
    const ids = singers.holomenIds;
    const fuwamocoOnly = ids.length === 2 && ids.every(isFuwamoco);
    for (const id of ids) {
      const h = e.byHolomen[id];
      if (!h) continue;
      if (isFuwamoco(id)) {
        if (fuwamocoOnly) sum += h.solo;
        else if (ids.length > 1) sum += h.unit;
      } else sum += singers.scope === "solo" ? h.solo : h.unit;
    }
  }
  return Math.min(YELLOW_SONG_BONUS_CAP_PERMIL, sum);
}

export const YELLOW_SONG_SCOPES: readonly YellowSongScope[] = ["solo", "unit", "all"];
export const YELLOW_WORK_REWARDS: readonly YellowWorkReward[] = [
  "lessonPt",
  "cube",
  "trainingItem",
];

/** 楽曲スコアボーナスの対象の短い表記(効果表の見出し・説明文。ソロはフワワ・モココで変わる) */
export function yellowSongScopeLabel(holomenId: string, scope: YellowSongScope): string {
  switch (scope) {
    case "solo":
      return isFuwamoco(holomenId) ? "FUWAMOCO のみの楽曲" : "本人のソロ楽曲";
    case "unit":
      return "本人を含むユニット楽曲";
    case "all":
      return "全体楽曲";
  }
}

/** ホロワークの報酬の表記(「ホロワークの」に続ける。英字の前後は半角スペース) */
export const YELLOW_WORK_LABELS: Readonly<Record<YellowWorkReward, string>> = {
  lessonPt: "レッスン Pt 獲得量",
  cube: "キューブ獲得量",
  trainingItem: "特訓アイテム獲得量",
};

/** 楽曲は小数 1 桁の %(‰ 5 → +0.5%)、ホロワークは整数の %(‰ 50 → +5%) */
export function formatSongPermil(permil: number): string {
  return `+${(permil / 10).toFixed(1)}%`;
}
export function formatWorkPermil(permil: number): string {
  return `+${String(permil / 10)}%`;
}

/** マス 1 つの効果の文言(ボード UI の説明モード) */
export function yellowEffectLabel(holomenId: string, effect: YellowBoardEffect): string {
  if (effect.kind === "songScore") {
    return `${yellowSongScopeLabel(holomenId, effect.scope)}のスコアボーナス ${formatSongPermil(effect.permil)}`;
  }
  return `ホロワークの${YELLOW_WORK_LABELS[effect.reward]} ${formatWorkPermil(effect.permil)}`;
}

/** マス内の記号: ソ(ソロ)/ ユ(ユニット)/ 全(全体楽曲)/ レ(レッスン Pt)/ キ(キューブ)/ 特(特訓アイテム) */
export function yellowNodeGlyph(effect: YellowBoardEffect): string {
  if (effect.kind === "songScore") {
    const glyph: Record<YellowSongScope, string> = { solo: "ソ", unit: "ユ", all: "全" };
    return glyph[effect.scope];
  }
  const glyph: Record<YellowWorkReward, string> = {
    lessonPt: "レ",
    cube: "キ",
    trainingItem: "特",
  };
  return glyph[effect.reward];
}
