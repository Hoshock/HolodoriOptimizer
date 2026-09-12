import { createBoardGraph, formatBoardPercent } from "./boardGraph";
import { amplifyFixed, amplifyRatio, factorOf } from "./connect";
import { holomenById } from "./index";
import { songSingers } from "./songSingers";
import type { ParamKind, Song, StatBlock } from "./types";

/**
 * 赤ホロメンボード(全ホロメン共通のノード構成 — 2026-09-08 ユーザー実機確認 4 回。
 * 座標・効果の正典は .claude/skills/parameter-calculation/references/red-board.md)。
 *
 * - 全体配置の上。中心 (0, 0) から上へ幹が伸び、7 マス目 (0, 7) の赤ボード内のコネクトマス C から左右へ枝が分かれる。
 *   4 エリア: 下エリア(16 マス。中心から C を経て真上の R-021・R-049 までの幹と、C の左右 2 マスずつとその上の R-022 / R-032)/
 *   上エリア(12 マス。最上部の格子。R-050 から)/ ライフ系エリア(17 マス。命 の R-023 から。ライフ・判定強化・ライフ回復・報酬)/
 *   ステータス系エリア(18 マス。R-033 から。P/T/S・スコアサポート・歌唱者条件)。合計 63 マス(2026-09-11 に幹を「下」として
 *   上の格子から分け、同日に下エリアを C の周りまで広げた — 「左のSと、その左と上にあるSとAは下エリアに含む。命マスから左エリア」)
 * - 座標は lifeSide = left(ライフ系が左・ステータス系が右)を基準に定義する。lifeSide = right のホロメンは
 *   上下エリアも含めて全体を x 反転して描く(holomen.json の board.lifeSide。青の左右 blueSide とは別)
 * - 効果は**そのホロメンをライブのリーダーにしているとき**だけ効き、「全員の」は**メンバー 5 人**(リーダーは含まない。
 *   リーダーとメンバーは別枠で、同じホロメンとは限らない)。カード詳細の P/T/S には反映されない
 * - 接続は上下左右の 4 近傍で、縦横に隣り合うマスは全部繋がる(斜めなし)。4 エリアは表示の分類で、グラフは 1 つ
 * - マスの表記値(コネクト増幅前)で試算する。実機の合計表示は増幅込み
 * - 試算への反映(2026-09-08 の実機内訳で確定。旧「(本体 + 固定値) × (1 + 割合) にしてからパッシブを掛ける」連鎖乗算は廃止):
 *   パラメータ効果は総合力のホロメンボード効果の項に加算する — 固定値はメンバー 5 人それぞれに、割合は同じパラメータの
 *   % を合算して素値合計に掛けて切り上げる(src/engine/power.ts)。歌唱者条件(「このホロメンが楽曲歌唱者に含まれる時」)は
 *   曲を指定し、リーダーのホロメンがその曲の歌唱者に含まれるときだけ足す(全体楽曲では含まれないと仮定)。歌唱者条件の
 *   P/T/S +10% も同じホロメンボード効果の項に入り、メンバー強化ボーナスの基準にも入ることは 2026-09-11 の実機
 *   (OFF → ON でボード効果 +12,251・強化 +367、他 4 項目は不変)で確定。「全員のスコアサポート効果」は総合力ではなく
 *   表示スコアボーナス(src/engine/displayScore.ts)へ。ライフ・判定強化・ライフ回復・報酬は表示のみ
 */

/** 4 エリア(表示・分類用。解放のグラフは 1 つ)。lower = 幹(中心〜R-021)、upper = 最上部の格子 */
export type RedBoardArea = "lower" | "upper" | "life" | "stats";
export const RED_BOARD_AREAS: readonly RedBoardArea[] = ["lower", "upper", "life", "stats"];
export const RED_AREA_LABELS: Readonly<Record<RedBoardArea, string>> = {
  lower: "下",
  upper: "上",
  life: "ライフ",
  stats: "ステータス",
};

export type RedLiveReward = "memberExp" | "gold";
export type RedLeaderSkill = "judgement" | "lifeRecovery";

export type RedBoardEffect =
  /** 全員の全パラメータ +N */
  | { kind: "allParams"; value: number }
  /** 全員の P/T/S +N */
  | { kind: "param"; param: ParamKind; value: number }
  /** 全員の全パラメータ +X% */
  | { kind: "allParamsPercent"; percent: number }
  /** 全員の P/T/S +X%(singer: このホロメンが楽曲歌唱者に含まれる時) */
  | { kind: "paramPercent"; param: ParamKind; percent: number; singer?: true }
  /** 全員のスコアサポート効果 +X%(singer: 歌唱者条件) */
  | { kind: "scoreSupport"; percent: number; singer?: true }
  /** ライフ +N */
  | { kind: "life"; value: number }
  /** ライブでの獲得メンバー Exp / ホロゴールド獲得量 +X% */
  | { kind: "liveReward"; reward: RedLiveReward; percent: number }
  /** ホロメンスキルの習得・強化(text はゲーム内の説明文) */
  | { kind: "leaderSkill"; skill: RedLeaderSkill; stage: "learn" | "upgrade"; text: string };

export interface RedBoardNode {
  id: string;
  /** lifeSide = left 基準の座標(x は右が正、y は上が正) */
  x: number;
  y: number;
  area: RedBoardArea;
  effect: RedBoardEffect;
  /** 実機で大きく描かれるマス(18 個)。描画は 1.5 倍 */
  large?: true;
}

const all = (value: number): RedBoardEffect => ({ kind: "allParams", value });
const param = (p: ParamKind, value: number): RedBoardEffect => ({ kind: "param", param: p, value });
const allPct = (percent: number): RedBoardEffect => ({ kind: "allParamsPercent", percent });
const pct = (p: ParamKind, percent: number): RedBoardEffect => ({
  kind: "paramPercent",
  param: p,
  percent,
});
const singerPct = (p: ParamKind, percent: number): RedBoardEffect => ({
  kind: "paramPercent",
  param: p,
  percent,
  singer: true,
});
const support = (percent: number): RedBoardEffect => ({ kind: "scoreSupport", percent });
const life = (value: number): RedBoardEffect => ({ kind: "life", value });
const reward = (r: RedLiveReward, percent: number): RedBoardEffect => ({
  kind: "liveReward",
  reward: r,
  percent,
});

/** ホロメンスキルの説明文(2026-09-08 実機確認) */
export const RED_SKILL_TEXTS = {
  judgementLearn: "20 秒毎に低確率で 7 秒間 GOOD 以上が PERFECT になる",
  judgementUpgrade: "20 秒毎に中確率で 10 秒間 GOOD 以上が PERFECT になる",
  lifeRecoveryLearn: "20 秒毎に中確率でライフが 100 回復",
} as const;

export const RED_BOARD_NODES: readonly RedBoardNode[] = [
  // 下エリア(幹): 中心から C まで
  { id: "R-001", x: 0, y: 1, area: "lower", effect: all(50) },
  {
    id: "R-002",
    x: 0,
    y: 2,
    area: "lower",
    effect: { kind: "scoreSupport", percent: 10, singer: true },
    large: true,
  },
  { id: "R-003", x: -1, y: 2, area: "lower", effect: param("sense", 100) },
  { id: "R-004", x: 1, y: 2, area: "lower", effect: param("performance", 100) },
  { id: "R-005", x: 0, y: 3, area: "lower", effect: param("technique", 100) },
  { id: "R-006", x: 0, y: 4, area: "lower", effect: all(50) },
  { id: "R-007", x: 0, y: 5, area: "lower", effect: all(50) },
  { id: "R-008", x: 0, y: 6, area: "lower", effect: all(50) },
  // ライフ系エリア(y = 7 の列は C から、y = 8 の列は R-021 から左へ)
  { id: "R-009", x: -1, y: 7, area: "lower", effect: param("sense", 100) },
  { id: "R-010", x: -2, y: 7, area: "lower", effect: all(50) },
  { id: "R-011", x: -3, y: 7, area: "life", effect: reward("memberExp", 5) },
  { id: "R-012", x: -4, y: 7, area: "life", effect: reward("memberExp", 5) },
  { id: "R-013", x: -5, y: 7, area: "life", effect: reward("memberExp", 5) },
  { id: "R-014", x: -6, y: 7, area: "life", effect: reward("memberExp", 20), large: true },
  { id: "R-015", x: -3, y: 6, area: "life", effect: reward("gold", 5) },
  { id: "R-016", x: -3, y: 5, area: "life", effect: reward("gold", 5) },
  { id: "R-017", x: -4, y: 5, area: "life", effect: reward("gold", 5) },
  { id: "R-018", x: -5, y: 5, area: "life", effect: reward("gold", 20), large: true },
  // C の右隣とその上・右(下エリアに含める — 2026-09-11 ユーザー指示。右エリアは R-033 から)
  { id: "R-019", x: 1, y: 7, area: "lower", effect: param("performance", 100) },
  { id: "R-020", x: 2, y: 7, area: "lower", effect: all(50) },
  // 下エリア(幹): C の真上。上エリアは R-050 から(R-049 も下 — 2026-09-11)
  { id: "R-021", x: 0, y: 8, area: "lower", effect: param("technique", 100) },
  // C の左上 R-022 は下エリア(左エリアは 命 の R-023 から — 2026-09-11)、ライフ系エリアは y = 8 以上
  { id: "R-022", x: -1, y: 8, area: "lower", effect: all(50) },
  { id: "R-023", x: -2, y: 8, area: "life", effect: life(50) },
  {
    id: "R-024",
    x: -3,
    y: 8,
    area: "life",
    effect: {
      kind: "leaderSkill",
      skill: "judgement",
      stage: "learn",
      text: RED_SKILL_TEXTS.judgementLearn,
    },
    large: true,
  },
  { id: "R-025", x: -4, y: 8, area: "life", effect: life(50) },
  { id: "R-026", x: -5, y: 8, area: "life", effect: life(50) },
  {
    id: "R-027",
    x: -6,
    y: 8,
    area: "life",
    effect: {
      kind: "leaderSkill",
      skill: "lifeRecovery",
      stage: "learn",
      text: RED_SKILL_TEXTS.lifeRecoveryLearn,
    },
    large: true,
  },
  { id: "R-028", x: -3, y: 9, area: "life", effect: life(50) },
  { id: "R-029", x: -3, y: 10, area: "life", effect: life(50) },
  { id: "R-030", x: -4, y: 10, area: "life", effect: life(50) },
  {
    id: "R-031",
    x: -5,
    y: 10,
    area: "life",
    effect: {
      kind: "leaderSkill",
      skill: "judgement",
      stage: "upgrade",
      text: RED_SKILL_TEXTS.judgementUpgrade,
    },
    large: true,
  },
  // C の右上 R-032 は下エリア、ステータス系エリアは R-033 から(y = 8 以上と y = 6)
  { id: "R-032", x: 1, y: 8, area: "lower", effect: support(2) },
  { id: "R-033", x: 2, y: 8, area: "stats", effect: all(50) },
  { id: "R-034", x: 3, y: 8, area: "stats", effect: support(4), large: true },
  { id: "R-035", x: 4, y: 8, area: "stats", effect: all(70) },
  { id: "R-036", x: 5, y: 8, area: "stats", effect: param("sense", 150) },
  { id: "R-037", x: 6, y: 8, area: "stats", effect: all(70) },
  { id: "R-038", x: 7, y: 8, area: "stats", effect: param("sense", 150) },
  { id: "R-039", x: 8, y: 8, area: "stats", effect: pct("sense", 4), large: true },
  { id: "R-040", x: 4, y: 7, area: "stats", effect: param("performance", 150) },
  { id: "R-041", x: 4, y: 6, area: "stats", effect: all(70) },
  { id: "R-042", x: 5, y: 6, area: "stats", effect: param("performance", 150) },
  { id: "R-043", x: 6, y: 6, area: "stats", effect: pct("performance", 4), large: true },
  { id: "R-044", x: 7, y: 6, area: "stats", effect: singerPct("technique", 10), large: true },
  { id: "R-045", x: 4, y: 9, area: "stats", effect: param("technique", 150) },
  { id: "R-046", x: 4, y: 10, area: "stats", effect: all(70) },
  { id: "R-047", x: 5, y: 10, area: "stats", effect: param("technique", 150) },
  { id: "R-048", x: 6, y: 10, area: "stats", effect: pct("technique", 4), large: true },
  // 上エリア(最上部の格子)
  { id: "R-049", x: 0, y: 9, area: "lower", effect: support(4), large: true },
  { id: "R-050", x: 0, y: 10, area: "upper", effect: allPct(1) },
  { id: "R-051", x: 0, y: 11, area: "upper", effect: support(4), large: true },
  { id: "R-052", x: 0, y: 12, area: "upper", effect: pct("technique", 3) },
  { id: "R-053", x: -1, y: 12, area: "upper", effect: support(3) },
  { id: "R-054", x: 1, y: 12, area: "upper", effect: allPct(1) },
  { id: "R-055", x: 0, y: 13, area: "upper", effect: allPct(3), large: true },
  { id: "R-056", x: -1, y: 13, area: "upper", effect: pct("sense", 3) },
  { id: "R-057", x: -2, y: 13, area: "upper", effect: reward("gold", 20), large: true },
  { id: "R-058", x: 1, y: 13, area: "upper", effect: pct("performance", 3) },
  { id: "R-059", x: 2, y: 13, area: "upper", effect: reward("memberExp", 20), large: true },
  { id: "R-060", x: -1, y: 14, area: "upper", effect: allPct(1) },
  { id: "R-061", x: 1, y: 14, area: "upper", effect: support(3) },
  // ステータス系エリア(右端の歌唱者条件)
  { id: "R-062", x: 7, y: 10, area: "stats", effect: singerPct("sense", 10), large: true },
  { id: "R-063", x: 9, y: 8, area: "stats", effect: singerPct("performance", 10), large: true },
];

/**
 * 4 エリア表示で、枝が画面の外へ続く位置に置く**出口**。`nodeId` は画面の外の最初のマスで、**実在するマス**
 * （その位置には本当にマスがあり、表示中のエリアでは出口の箱に置き換わって直接は触れない）。
 * どのエリアでも、出口のマスはその行き先のエリアの側でタップして解放する。
 * 出口の箱は `nodeId` の解放状態を反映させる — 反映しないと「そこにマスがない」ように見え、隣のマスが
 * 開けられないと誤解される（2026-09-13 ユーザー報告）。
 */
export interface RedAreaExit {
  /** 出口の位置にある実マス */
  nodeId: string;
  /** タップしたときに開くエリア */
  to: RedBoardArea;
}
export const RED_AREA_EXITS: Readonly<Record<RedBoardArea, readonly RedAreaExit[]>> = {
  lower: [
    { nodeId: "R-023", to: "life" },
    { nodeId: "R-033", to: "stats" },
    { nodeId: "R-050", to: "upper" },
  ],
  upper: [{ nodeId: "R-049", to: "lower" }],
  life: [{ nodeId: "R-010", to: "lower" }],
  stats: [{ nodeId: "R-020", to: "lower" }],
};

/** 初期地点 = 全ボードの中心のコネクト(色の概念はない)。解放の起点で、入力対象ではない */
export const RED_BOARD_ORIGIN = { id: "R", x: 0, y: 0 } as const;
/** 赤ボード内のコネクトマス(人物アイコン)。中心から 7 マス目で、3 エリアの分岐点。存在するが入力しない。通路としては常に通れる */
export const RED_BOARD_CONNECT = { id: "C", x: 0, y: 7 } as const;

export const RED_BOARD_NODE_IDS: readonly string[] = RED_BOARD_NODES.map((n) => n.id);
const nodeById = new Map(RED_BOARD_NODES.map((n) => [n.id, n]));
export function redNodeById(id: string): RedBoardNode | undefined {
  return nodeById.get(id);
}

const graph = createBoardGraph(RED_BOARD_NODES, RED_BOARD_ORIGIN, [RED_BOARD_CONNECT]);
export const RED_BOARD_EDGES = graph.edges;
export const redReachableNodes = graph.reachableNodes;
export const redUnlockNode = graph.unlockNode;
export const redToggleNode = graph.toggleNode;
export const redKnownNodeIds = graph.knownNodeIds;
/** 解放マス数(解放済みのマス + 到達済みのコネクトマス C)と、その最大(63 + 1) */
export const redUnlockedCount = graph.unlockedCount;
export const RED_BOARD_CELL_COUNT = graph.cellCount;

/** ライフ系エリアが全体配置の右にあるホロメン。基準(左)の座標を x 反転して描く */
export function isRedMirrored(holomenId: string): boolean {
  return holomenById.get(holomenId)?.board.lifeSide === "right";
}

/** 解放したマスの効果の合計(マスの表記値。コネクト増幅は含まない) */
export interface RedBoardEffects {
  /** 全員の全パラメータの固定値 */
  allParams: number;
  /** 全員の P/T/S の固定値 */
  params: StatBlock;
  /** 全員の全パラメータの割合(%) */
  allPercent: number;
  /** 全員の P/T/S の割合(%。無条件) */
  percents: StatBlock;
  /** 歌唱者条件の P/T/S の割合(%) */
  singerPercents: StatBlock;
  /** 全員のスコアサポート効果(%。無条件) */
  scoreSupportPercent: number;
  /** 歌唱者条件のスコアサポート効果(%) */
  singerScoreSupportPercent: number;
  life: number;
  rewards: Record<RedLiveReward, number>;
  /** 判定強化のホロメンスキル(R-024 で習得、R-031 で強化。R-031 は R-024 を通らないと解放できない) */
  judgement: "none" | "learned" | "upgraded";
  lifeRecovery: boolean;
}

/**
 * @param factors コネクト効果によるマス ID → 倍率(src/data/connect.ts。省略で増幅なし)。固定値・ライフは切り上げ、
 *   割合は丸めない。ホロメンスキル(習得 / 強化)は増幅の対象外
 */
export function redBoardEffects(
  nodeIds: Iterable<string>,
  factors?: Readonly<Record<string, number>>,
): RedBoardEffects {
  const e: RedBoardEffects = {
    allParams: 0,
    params: { performance: 0, technique: 0, sense: 0 },
    allPercent: 0,
    percents: { performance: 0, technique: 0, sense: 0 },
    singerPercents: { performance: 0, technique: 0, sense: 0 },
    scoreSupportPercent: 0,
    singerScoreSupportPercent: 0,
    life: 0,
    rewards: { memberExp: 0, gold: 0 },
    judgement: "none",
    lifeRecovery: false,
  };
  for (const id of nodeIds) {
    const node = nodeById.get(id);
    if (!node) continue;
    const eff = node.effect;
    const f = factorOf(factors, id);
    switch (eff.kind) {
      case "allParams":
        e.allParams += amplifyFixed(eff.value, f);
        break;
      case "param":
        e.params[eff.param] += amplifyFixed(eff.value, f);
        break;
      case "allParamsPercent":
        e.allPercent += amplifyRatio(eff.percent, f);
        break;
      case "paramPercent":
        if (eff.singer) e.singerPercents[eff.param] += amplifyRatio(eff.percent, f);
        else e.percents[eff.param] += amplifyRatio(eff.percent, f);
        break;
      case "scoreSupport":
        if (eff.singer) e.singerScoreSupportPercent += amplifyRatio(eff.percent, f);
        else e.scoreSupportPercent += amplifyRatio(eff.percent, f);
        break;
      case "life":
        e.life += amplifyFixed(eff.value, f);
        break;
      case "liveReward":
        e.rewards[eff.reward] += amplifyRatio(eff.percent, f);
        break;
      case "leaderSkill":
        if (eff.skill === "lifeRecovery") e.lifeRecovery = true;
        else if (eff.stage === "upgrade") e.judgement = "upgraded";
        else if (e.judgement === "none") e.judgement = "learned";
        break;
    }
  }
  return e;
}

/**
 * 試算に使う形: リーダーのホロメンの赤ボードがメンバー 5 人の各 P/T/S に足す固定値と割合(%)。
 * 割合は全パラ + 個別 + (歌唱者条件が成立していれば)歌唱者条件。効果がなければ null
 */
export interface RedUnitEffects {
  fixed: StatBlock;
  percent: StatBlock;
  /**
   * 全員のスコアサポート効果(%。歌唱者条件成立分も合算)。総合力には効かず表示スコア側の入力になる。
   * 表示への一般式とカテゴリ配賦は未解明。displayScore.ts の redScoreSupportDisplayGain は
   * 反証済み候補秒率式を互換のため残した既知近似で、ゲーム仕様として扱わない。
   */
  scoreSupportPercent: number;
}

export function redUnitEffects(e: RedBoardEffects, singer: boolean): RedUnitEffects | null {
  const fixed: StatBlock = { performance: 0, technique: 0, sense: 0 };
  const percent: StatBlock = { performance: 0, technique: 0, sense: 0 };
  let any = false;
  for (const p of ["performance", "technique", "sense"] as const) {
    fixed[p] = e.allParams + e.params[p];
    percent[p] = e.allPercent + e.percents[p] + (singer ? e.singerPercents[p] : 0);
    if (fixed[p] !== 0 || percent[p] !== 0) any = true;
  }
  const scoreSupportPercent = e.scoreSupportPercent + (singer ? e.singerScoreSupportPercent : 0);
  if (scoreSupportPercent !== 0) any = true;
  return any ? { fixed, percent, scoreSupportPercent } : null;
}

/**
 * 歌唱者条件「このホロメンが楽曲歌唱者に含まれる時」の判定: その曲の歌唱者(src/data/songSingers.ts)に
 * ホロメンが含まれるか。全体楽曲(hololive IDOL PROJECT)は含まれないと仮定し、歌唱者が未確認の曲は false
 */
export function isRedSinger(holomenId: string, song: Song): boolean {
  const singers = songSingers(song);
  return singers.holomenIds !== null && singers.holomenIds.includes(holomenId);
}

/** 登録した全ホロメンの赤ボードを、リーダーのホロメン ID → 試算に使う効果に変換する(曲があれば歌唱者条件を判定) */
export function redUnitEffectsByHolomen(
  boards: Readonly<Record<string, readonly string[]>>,
  song: Song | null,
  /** ホロメン ID → 赤のマス ID → コネクト倍率(省略で増幅なし) */
  factorsByHolomen?: Readonly<Record<string, Readonly<Record<string, number>> | undefined>>,
): Record<string, RedUnitEffects> {
  const map: Record<string, RedUnitEffects> = {};
  for (const [holomenId, nodes] of Object.entries(boards)) {
    const unit = redUnitEffects(
      redBoardEffects(nodes, factorsByHolomen?.[holomenId]),
      song ? isRedSinger(holomenId, song) : false,
    );
    if (unit) map[holomenId] = unit;
  }
  return map;
}

const PARAM_LABELS: Record<ParamKind, string> = {
  performance: "パフォーマンス",
  technique: "テクニック",
  sense: "センス",
};
export const RED_REWARD_LABELS: Readonly<Record<RedLiveReward, string>> = {
  memberExp: "ライブでの獲得メンバー Exp",
  gold: "ライブでのホロゴールド獲得量",
};
const SKILL_LABELS: Record<RedLeaderSkill, string> = {
  judgement: "判定強化",
  lifeRecovery: "ライフ回復",
};
/** 歌唱者条件の書き出し(ゲーム内の文言 — 2026-09-08 実機確認) */
export const RED_SINGER_PREFIX = "このホロメンが楽曲歌唱者に含まれる時、";

/** マス 1 つの効果の文言(ボード UI の説明モード)。ゲーム内の文言に合わせ、割合は小数第 1 位まで */
export function redEffectLabel(effect: RedBoardEffect): string {
  switch (effect.kind) {
    case "allParams":
      return `全員の全パラメータ +${String(effect.value)}`;
    case "param":
      return `全員の${PARAM_LABELS[effect.param]} +${String(effect.value)}`;
    case "allParamsPercent":
      return `全員の全パラメータ ${formatBoardPercent(effect.percent)}`;
    case "paramPercent":
      return `${effect.singer ? RED_SINGER_PREFIX : ""}全員の${PARAM_LABELS[effect.param]} ${formatBoardPercent(effect.percent)}`;
    case "scoreSupport":
      return `${effect.singer ? RED_SINGER_PREFIX : ""}全員のスコアサポート効果 ${formatBoardPercent(effect.percent)}`;
    case "life":
      return `ライフ +${String(effect.value)}`;
    case "liveReward":
      return `${RED_REWARD_LABELS[effect.reward]} ${formatBoardPercent(effect.percent)}`;
    case "leaderSkill":
      return `${SKILL_LABELS[effect.skill]}のホロメンスキル${effect.stage === "learn" ? "習得" : "強化"}（${effect.text}）`;
  }
}

/** マス内の記号: A / P / T / S(固定値・割合・歌唱者条件とも同じ文字)/ 支(スコアサポート)/ 命(ライフ)/ 判 / 回 / 経(メンバー Exp)/ 金(ホロゴールド)— 2026-09-08 ユーザー承認 */
export function redNodeGlyph(effect: RedBoardEffect): string {
  const letter: Record<ParamKind, string> = { performance: "P", technique: "T", sense: "S" };
  switch (effect.kind) {
    case "allParams":
    case "allParamsPercent":
      return "A";
    case "param":
    case "paramPercent":
      return letter[effect.param];
    case "scoreSupport":
      return "支";
    case "life":
      return "命";
    case "liveReward":
      return effect.reward === "memberExp" ? "経" : "金";
    case "leaderSkill":
      return effect.skill === "judgement" ? "判" : "回";
  }
}
