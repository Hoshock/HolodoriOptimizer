import { createBoardGraph } from "./boardGraph";
import { amplifyFixed, amplifyRatio, factorOf } from "./connect";
import { holomenById } from "./index";
import type { Card, ParamKind, StatBlock } from "./types";

/**
 * 緑ホロメンボード(全ホロメン共通のノード構成 — 2026-09-07 ユーザー実機確認。
 * 座標・効果の正典は .claude/skills/parameter-calculation/references/green-board.md)。
 *
 * - 緑ボードの効果はアカウント全体に効く: 編成の有無にかかわらず、登録した全ホロメンの緑ボードの
 *   「全員の〜UP」が全カードに、「○期生の全パラメータ UP」がその所属のカードに足される
 * - 全体配置の下側。座標は x が右で正、y は上が正(緑は y ≤ -1)。(0, 0) は全ボードの中心のコネクト
 *   (コネクトに色の概念はない)。左右反転などのホロメンによる配置差はない
 * - 接続は上下左右の 4 近傍(09・10 の列も縦に全部繋がる — 2026-09-07 実機確認)
 * - 所属向け 3 マス(G-008 / G-011 / G-021)の値は所属ごとにデータで持つ(人数から計算しない)。
 *   白上フブキ(1期生 + ゲーマーズ)だけマスごとに対象所属が違う
 * - 所属向け効果の合計は 1 カードあたり +900 が上限(parameter-calculation スキル)
 * - マスの表記値で試算し、コネクト効果の増幅は マス ID → 倍率の表(src/data/connect.ts。暫定仕様)を渡したときだけ掛ける
 */

export type GreenBoardEffect =
  | { kind: "allParams"; value: number }
  | { kind: "param"; param: ParamKind; value: number }
  /** 所属グループの全パラメータ UP(値は affiliationEffectOf で、ホロメンと何個目かで決まる) */
  | { kind: "affiliation"; slot: 0 | 1 | 2 }
  /** 報酬・獲得量 UP(パラメータには効かない。permil 5 = +0.5%) */
  | { kind: "reward"; label: string; permil: number };

export interface GreenBoardNode {
  id: string;
  x: number;
  y: number;
  effect: GreenBoardEffect;
  /** 実機で大きく描かれるマス(G-011 / G-014 / G-017)。描画は 1.5 倍 */
  large?: true;
}

const all = (value: number): GreenBoardEffect => ({ kind: "allParams", value });
const param = (p: ParamKind, value: number): GreenBoardEffect => ({
  kind: "param",
  param: p,
  value,
});
const aff = (slot: 0 | 1 | 2): GreenBoardEffect => ({ kind: "affiliation", slot });
const reward = (label: string): GreenBoardEffect => ({ kind: "reward", label, permil: 5 });

export const GREEN_BOARD_NODES: readonly GreenBoardNode[] = [
  { id: "G-001", x: 0, y: -1, effect: all(5) },
  { id: "G-002", x: 0, y: -2, effect: param("sense", 5) },
  { id: "G-003", x: -1, y: -2, effect: param("technique", 5) },
  { id: "G-004", x: 1, y: -2, effect: param("performance", 5) },
  { id: "G-005", x: 0, y: -3, effect: all(5) },
  { id: "G-006", x: 0, y: -4, effect: all(5) },
  { id: "G-007", x: 0, y: -5, effect: all(5) },
  { id: "G-008", x: 0, y: -6, effect: aff(0) },
  { id: "G-009", x: -1, y: -6, effect: param("technique", 10) },
  { id: "G-010", x: 1, y: -6, effect: param("performance", 10) },
  { id: "G-011", x: 0, y: -7, effect: aff(1), large: true },
  { id: "G-012", x: -1, y: -7, effect: all(5) },
  { id: "G-013", x: -2, y: -7, effect: all(5) },
  { id: "G-014", x: -3, y: -7, effect: reward("ライブのホロゴールド獲得量"), large: true },
  { id: "G-015", x: 1, y: -7, effect: all(5) },
  { id: "G-016", x: 2, y: -7, effect: all(5) },
  { id: "G-017", x: 3, y: -7, effect: reward("ライブの獲得メンバーExp"), large: true },
  { id: "G-018", x: 0, y: -8, effect: param("sense", 10) },
  { id: "G-019", x: -1, y: -8, effect: reward("ホッピン・ロープの獲得報酬量") },
  { id: "G-020", x: 1, y: -8, effect: reward("そろえてクッキングの獲得報酬量") },
  { id: "G-021", x: 0, y: -9, effect: aff(2) },
  { id: "G-022", x: -1, y: -9, effect: reward("メガサーキットの獲得報酬量") },
  { id: "G-023", x: 1, y: -9, effect: reward("ポカジャン！の獲得報酬量") },
  { id: "G-024", x: -1, y: -10, effect: reward("くらやみチェイスの獲得報酬量") },
];

/** 初期地点 = 全ボードの中心のコネクト(色の概念はない)。解放の起点で、入力対象ではない */
export const GREEN_BOARD_ORIGIN = { id: "C", x: 0, y: 0 } as const;

export const GREEN_BOARD_NODE_IDS: readonly string[] = GREEN_BOARD_NODES.map((n) => n.id);
const nodeById = new Map(GREEN_BOARD_NODES.map((n) => [n.id, n]));
export const GREEN_BOARD_X_RANGE = { min: -3, max: 3 } as const;
export const GREEN_BOARD_Y_RANGE = { min: -10, max: 0 } as const;

const graph = createBoardGraph(GREEN_BOARD_NODES, GREEN_BOARD_ORIGIN);
export const GREEN_BOARD_EDGES = graph.edges;
export const greenReachableNodes = graph.reachableNodes;
export const greenToggleNode = graph.toggleNode;
export const greenKnownNodeIds = graph.knownNodeIds;
/** 解放マス数(緑にはコネクトマスがないので解放済みのマスの数)と、その最大 */
export const greenUnlockedCount = graph.unlockedCount;
export const GREEN_BOARD_CELL_COUNT = graph.cellCount;

/**
 * 所属向け 3 マス(G-008 / G-011 / G-021 の順)の値。所属ごとに持つ(2026-09-07 実機確認)。
 * 4〜5 人の所属は +50 / +150 / +100、3 人の所属は +75 / +225 / +150
 */
export const GREEN_AFFILIATION_VALUES: Readonly<Record<string, readonly [number, number, number]>> =
  {
    gen0: [50, 150, 100],
    gen1: [50, 150, 100],
    gamers: [50, 150, 100],
    gen3: [50, 150, 100],
    gen5: [50, 150, 100],
    holox: [50, 150, 100],
    advent: [50, 150, 100],
    regloss: [50, 150, 100],
    gen2: [75, 225, 150],
    gen4: [75, 225, 150],
    "id-gen1": [75, 225, 150],
    "id-gen2": [75, 225, 150],
    "id-gen3": [75, 225, 150],
    myth: [75, 225, 150],
    promise: [75, 225, 150],
  };

export interface AffiliationEffect {
  affiliation: string;
  value: number;
}

/** 複数所属のホロメンの例外: 白上フブキはマスごとに対象所属が違う(1期生 +100 / ゲーマーズ +300 / 1期生 +200) */
export const GREEN_AFFILIATION_OVERRIDES: Readonly<
  Record<string, readonly [AffiliationEffect, AffiliationEffect, AffiliationEffect]>
> = {
  "shirakami-fubuki": [
    { affiliation: "gen1", value: 100 },
    { affiliation: "gamers", value: 300 },
    { affiliation: "gen1", value: 200 },
  ],
};

/** 所属向け効果の 1 カードあたりの上限(全パラメータ +900。複数所属でも超えない) */
export const GREEN_AFFILIATION_CAP = 900;

/** ホロメンの緑ボードの所属向けマス(何個目か)が、どの所属にいくら効くか。不明なら null */
export function affiliationEffectOf(holomenId: string, slot: 0 | 1 | 2): AffiliationEffect | null {
  const override = GREEN_AFFILIATION_OVERRIDES[holomenId];
  if (override) return override[slot];
  const affiliation = holomenById.get(holomenId)?.affiliations[0];
  if (affiliation === undefined) return null;
  const values = GREEN_AFFILIATION_VALUES[affiliation];
  return values ? { affiliation, value: values[slot] } : null;
}

/** 緑ボードの効果の合計(1 人分でもアカウント全体でも同じ形。マスの表記値、増幅前) */
export interface GreenBoardEffects {
  /** 全員の全パラメータ */
  allParams: number;
  /** 全員の P/T/S */
  params: StatBlock;
  /** 所属 ID → その所属の全パラメータ UP(上限適用前) */
  byAffiliation: Record<string, number>;
  /** 報酬・獲得量 UP のラベル → ‰ */
  rewards: Record<string, number>;
}

export function emptyGreenEffects(): GreenBoardEffects {
  return {
    allParams: 0,
    params: { performance: 0, technique: 0, sense: 0 },
    byAffiliation: {},
    rewards: {},
  };
}

/** 1 人のホロメンの緑ボード(解放マス)の効果を into に足し込む */
export function addGreenBoardEffects(
  into: GreenBoardEffects,
  holomenId: string,
  nodeIds: Iterable<string>,
  /** コネクト効果による マス ID → 倍率(省略で増幅なし。固定値は切り上げ、‰ は丸めない) */
  factors?: Readonly<Record<string, number>>,
): GreenBoardEffects {
  for (const id of nodeIds) {
    const node = nodeById.get(id);
    if (!node) continue;
    const eff = node.effect;
    const f = factorOf(factors, id);
    switch (eff.kind) {
      case "allParams":
        into.allParams += amplifyFixed(eff.value, f);
        break;
      case "param":
        into.params[eff.param] += amplifyFixed(eff.value, f);
        break;
      case "affiliation": {
        const a = affiliationEffectOf(holomenId, eff.slot);
        if (a)
          into.byAffiliation[a.affiliation] =
            (into.byAffiliation[a.affiliation] ?? 0) + amplifyFixed(a.value, f);
        break;
      }
      case "reward":
        into.rewards[eff.label] = (into.rewards[eff.label] ?? 0) + amplifyRatio(eff.permil, f);
        break;
    }
  }
  return into;
}

/** 1 人分の合計(ボード画面の効果表) */
export function greenBoardEffects(
  holomenId: string,
  nodeIds: Iterable<string>,
  factors?: Readonly<Record<string, number>>,
): GreenBoardEffects {
  return addGreenBoardEffects(emptyGreenEffects(), holomenId, nodeIds, factors);
}

/** アカウント全体(登録した全ホロメンの緑ボード)の合計。探索・表示に渡す 1 つの値 */
export function accountGreenEffects(
  boards: Readonly<Record<string, readonly string[]>>,
  /** ホロメン ID → 緑のマス ID → コネクト倍率(省略で増幅なし) */
  factorsByHolomen?: Readonly<Record<string, Readonly<Record<string, number>> | undefined>>,
): GreenBoardEffects {
  const e = emptyGreenEffects();
  for (const [holomenId, nodes] of Object.entries(boards))
    addGreenBoardEffects(e, holomenId, nodes, factorsByHolomen?.[holomenId]);
  return e;
}

export function hasGreenParamEffect(e: GreenBoardEffects): boolean {
  return (
    e.allParams !== 0 ||
    e.params.performance !== 0 ||
    e.params.technique !== 0 ||
    e.params.sense !== 0 ||
    Object.values(e.byAffiliation).some((v) => v !== 0)
  );
}

/** そのカード(のホロメン)に効く所属向けの合計(上限 +900 を適用) */
export function affiliationBonusOf(e: GreenBoardEffects, holomenId: string): number {
  const affiliations = holomenById.get(holomenId)?.affiliations ?? [];
  let sum = 0;
  for (const a of affiliations) sum += e.byAffiliation[a] ?? 0;
  return Math.min(GREEN_AFFILIATION_CAP, sum);
}

/**
 * 緑ボード(アカウント全体の合計)の効果をカードに適用した Card を返す(id は変わらない)。
 * P/T/S = 本体 + 全員の全パラ + 全員の個別 + 所属向け(上限つき)。効果がなければ元のまま
 */
export function applyGreenBoard(card: Card, e: GreenBoardEffects): Card {
  if (!hasGreenParamEffect(e)) return card;
  const affiliation = affiliationBonusOf(e, card.holomenId);
  const stats: StatBlock = { ...card.stats };
  for (const p of ["performance", "technique", "sense"] as const) {
    stats[p] = card.stats[p] + e.allParams + e.params[p] + affiliation;
  }
  return { ...card, stats };
}

/** マス内の記号: A(全員の全パラ)/ P / T / S / ユ(ユニット = 所属向け。2026-09-08 に グ から変更)/ 酬(報酬・獲得量)(ユーザー指定) */
export function greenNodeGlyph(effect: GreenBoardEffect): string {
  const letter: Record<ParamKind, string> = { performance: "P", technique: "T", sense: "S" };
  switch (effect.kind) {
    case "allParams":
      return "A";
    case "param":
      return letter[effect.param];
    case "affiliation":
      return "ユ";
    case "reward":
      return "酬";
  }
}
