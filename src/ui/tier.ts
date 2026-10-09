import { cardById, holomen, star5Cards } from "../data";
import type { Card, SkillCondition, SkillTrigger } from "../data/types";
import {
  compileDisplayMember,
  SP_RATE_UP_DIVISOR,
  SP_SUPPORT_DIVISOR,
} from "../engine/displayScore";
import { affIndexOf } from "../engine/power";
import { buildHolomenMap } from "../engine/score";
import { evaluateTier } from "../engine/tier";
import type { TierCardEvaluation, TierDataset, TierRank } from "../engine/tier";
import { affiliationName, formatScore, TYPE_LABELS } from "./labels";

/**
 * ティア表の評価画面の文言(2026-10-09 ユーザー指示「評価の高いカードはそれぞれなぜ高いのか説明文を出すこと」→ 同日
 * 「文が長すぎると意味不明なので適切な評価軸の表であらわす。表の前に総評を書く」)。
 * 評価そのものは `src/engine/tier.ts`(探索の結果の比)で、ここは **総評(1〜2 文)** と **評価軸の表(項目 / 内容 / ★5 の中の順位)** を作る。
 *
 * 順位は ★5 全枚の中の順位(1 始まり。同じ値は同じ順位)。比・採用数・0凸の比は探索の結果そのもの。
 * 素のパラメータは P+T+S、アクティブは表示モデルの寄与(`linearRaw` = 発動候補の秒 × 発動確率 × スコア UP% の時間平均)、
 * SP は SP 欄の式の係数(効果時間 / 120 × 支援% × (1 + 発動率 UP / 200))。パッシブ・衣装は
 * 「% × かかるパラメータの数 × かかる人数」の目安(全員 5 / 自身 1 / 人数指定はその人数 / タイプ・所属は 3 とみなす。条件つきは 0.85 倍)で、
 * これだけは評価の式ではなく順位を付けるための目安(評価の正典は探索)
 */

const holomenMap = buildHolomenMap(holomen);
const affIndex = affIndexOf(holomenMap);
const TOTAL = star5Cards.length;

interface Components {
  params: number;
  passive: number;
  active: number;
  special: number;
}

function peopleOf(target: { kind: string; count?: number }): number {
  if (target.kind === "all") return 5;
  if (target.kind === "self") return 1;
  return target.count ?? 3;
}

/** 条件+効果型(衣装・パッシブ)の大きさの目安 */
function buffProxy(structured: Card["passiveSkill"]["structured"]): number {
  if (!structured) return 0;
  const factor = structured.condition.kind === "always" ? 1 : 0.85;
  let sum = 0;
  for (const e of structured.effects) {
    if (e.kind === "paramUp")
      sum += e.percent * (e.param === "all" ? 3 : 1) * peopleOf(e.target) * factor;
    else sum += e.percent * peopleOf(e.target) * factor;
  }
  return sum;
}

function componentsOf(card: Card): Components {
  const view = compileDisplayMember(card, holomenMap, affIndex);
  const s = view.special;
  const special = s
    ? ((s.durationSeconds *
        s.scoreSupportPercent *
        (1 + (s.rate?.percent ?? 0) / SP_RATE_UP_DIVISOR)) /
        SP_SUPPORT_DIVISOR) *
      100
    : 0;
  return {
    params: card.stats.performance + card.stats.technique + card.stats.sense,
    passive: buffProxy(card.passiveSkill.structured),
    active: view.active?.linearRaw ?? 0,
    special,
  };
}

type ComponentKey = keyof Components;

/** ★5 全枚の成分(1 回だけ計算) */
const components = new Map<string, Components>(star5Cards.map((c) => [c.id, componentsOf(c)]));

/** 値の大きい順の順位(1 始まり。同じ値は同じ順位) */
function rankAmong(values: Iterable<number>, mine: number): number {
  let above = 0;
  for (const v of values) if (v > mine) above += 1;
  return above + 1;
}

function componentRank(key: ComponentKey, cardId: string): number {
  const mine = components.get(cardId)?.[key] ?? 0;
  return rankAmong(
    [...components.values()].map((c) => c[key]),
    mine,
  );
}

/** 役割ごとの全枚の評価(データごとに 1 回だけ) */
const evaluationCache = new WeakMap<
  TierDataset,
  Partial<Record<"member" | "leader", TierCardEvaluation[]>>
>();
function evaluationsOf(dataset: TierDataset, role: "member" | "leader"): TierCardEvaluation[] {
  let byRole = evaluationCache.get(dataset);
  if (!byRole) {
    byRole = {};
    evaluationCache.set(dataset, byRole);
  }
  byRole[role] ??= evaluateTier(dataset, role);
  return byRole[role];
}

function conditionText(c: SkillCondition): string {
  switch (c.kind) {
    case "always":
      return "";
    case "typeCount":
      return `${TYPE_LABELS[c.type]}${c.min}人以上で`;
    case "affiliationCount":
      return `${affiliationName(c.affiliation)}${c.min}人以上で`;
  }
}

function triggerText(t: SkillTrigger): string {
  if (t.kind === "life") return `ライフ${t.min}以上で`;
  if (t.kind === "combo") return `コンボ${t.min}以上で`;
  return conditionText(t);
}

function targetText(t: {
  kind: string;
  type?: string;
  affiliation?: string;
  count?: number;
}): string {
  switch (t.kind) {
    case "all":
      return "全員";
    case "self":
      return "自身";
    case "type":
      return `${TYPE_LABELS[t.type as keyof typeof TYPE_LABELS]}${t.count ? `${t.count}人` : ""}`;
    default:
      return `${affiliationName(t.affiliation ?? "")}${t.count ? `${t.count}人` : ""}`;
  }
}

const PARAM_TEXT = { all: "全パラメータ", performance: "P", technique: "T", sense: "S" } as const;

/** 条件+効果型(衣装・パッシブ)の中身を短く(「ピュア2人以上で全員の全パラメータ 33% UP・全員のスコアサポート 25%」) */
function buffText(structured: Card["passiveSkill"]["structured"]): string {
  if (!structured) return "";
  const body = structured.effects
    .map((e) =>
      e.kind === "paramUp"
        ? `${targetText(e.target)}の${PARAM_TEXT[e.param]} ${e.percent}% UP`
        : `${targetText(e.target)}のスコアサポート ${e.percent}%`,
    )
    .join("・");
  return `${conditionText(structured.condition)}${body}`;
}

const PROBABILITY_TEXT = { low: "低確率", medium: "中確率", high: "高確率", unknown: "" } as const;

function activeText(card: Card): string {
  const a = card.activeSkill.structured;
  if (!a || a.scoreUpPercent === null) return "";
  const parts = [
    `${a.intervalSeconds}秒毎`,
    PROBABILITY_TEXT[a.probability],
    `スコア ${a.scoreUpPercent}% UP`,
  ];
  if (a.conditionalScoreUp)
    parts.push(`${triggerText(a.conditionalScoreUp.condition)}${a.conditionalScoreUp.percent}%`);
  return parts.filter((p) => p !== "").join("・");
}

function specialText(card: Card): string {
  const s = card.specialSkill.structured;
  if (!s || s.scoreSupportPercent === null) return "";
  const parts = [`${s.durationSeconds ?? 0}秒間スコアサポート ${s.scoreSupportPercent}%`];
  if (s.skillRateUp) parts.push(`発動率 ${s.skillRateUp.percent}% UP`);
  return parts.join("・");
}

export function percentText(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** 全体の最高との差(「−0.7%」。同じなら「±0%」) */
export function diffPercentText(ratio: number): string {
  const diff = (ratio - 1) * 100;
  if (Math.abs(diff) < 0.05) return "±0%";
  return `${diff < 0 ? "−" : "+"}${Math.abs(diff).toFixed(1)}%`;
}

/** 点数の差(「−4,661」。同じなら「±0」) */
function diffScoreText(score: number, base: number): string {
  const diff = Math.round(score - base);
  if (diff === 0) return "±0";
  return `${diff < 0 ? "−" : "+"}${formatScore(Math.abs(diff))}`;
}

/** 評価軸の表の 1 行。`rank` は ★5 全枚の中の順位(順位のない行は null) */
export interface TierAxisRow {
  key: string;
  label: string;
  value: string;
  rank: number | null;
}

const COMPONENT_LABELS: Record<ComponentKey, string> = {
  params: "素のパラメータ",
  passive: "パッシブ",
  active: "アクティブ",
  special: "SP",
};

/**
 * 評価軸の表(メンバー 7 行 / リーダー 3 行)。「比」という言い方はせず、最高ユニットスコアと全体の最高との差(点数と %)で言う
 * (2026-10-09 ユーザー指示「最良の比というのがわかりにくい。もっとわかりやすい表現で」「定量性も大事」)。
 * 最高スコアのときの編成は表でなくカードの並び(`TierCardSheet` の編成の段)で見せる
 */
export function tierAxes(dataset: TierDataset, e: TierCardEvaluation): TierAxisRow[] {
  const card = cardById.get(e.cardId);
  if (!card) return [];
  const all = evaluationsOf(dataset, e.role);
  const best = dataset.best.unitScore;
  const scoreRows: TierAxisRow[] = [
    {
      key: "score",
      label: "最高ユニットスコア",
      value: formatScore(e.team.unitScore),
      rank: rankAmong(
        all.map((x) => x.ratio),
        e.ratio,
      ),
    },
    {
      key: "diff",
      label: "全体の最高との差",
      value:
        e.ratio >= 1
          ? `±0（全体の最高 ${formatScore(best)}）`
          : `${diffScoreText(e.team.unitScore, best)}（${diffPercentText(e.ratio)}）`,
      rank: null,
    },
  ];
  if (e.role === "member") {
    const bloom0 = dataset.cards[e.cardId]?.memberBloom0.unitScore ?? e.team.unitScore;
    return [
      ...scoreRows,
      {
        key: "adoption",
        label: "採用数",
        value: `リーダー ${TOTAL} 通り中 ${e.adoption ?? 0} 通り`,
        rank: rankAmong(
          all.map((x) => x.adoption ?? 0),
          e.adoption ?? 0,
        ),
      },
      {
        key: "bloom0",
        label: "0凸のまま",
        value: `${formatScore(bloom0)}（開花最大より ${diffPercentText(bloom0 / e.team.unitScore)}）`,
        rank: rankAmong(
          all.map((x) => x.bloom0Ratio ?? 0),
          e.bloom0Ratio ?? 0,
        ),
      },
      {
        key: "params",
        label: COMPONENT_LABELS.params,
        value: formatScore(card.stats.performance + card.stats.technique + card.stats.sense),
        rank: componentRank("params", card.id),
      },
      {
        key: "passive",
        label: COMPONENT_LABELS.passive,
        value: buffText(card.passiveSkill.structured),
        rank: componentRank("passive", card.id),
      },
      {
        key: "active",
        label: COMPONENT_LABELS.active,
        value: activeText(card),
        rank: componentRank("active", card.id),
      },
      {
        key: "special",
        label: COMPONENT_LABELS.special,
        value: specialText(card),
        rank: componentRank("special", card.id),
      },
    ];
  }
  return [
    ...scoreRows,
    // 衣装スキルの大きさの目安は順位と食い違いうる(条件・対象で効き方が違う)ので、順位は出さず中身だけ
    {
      key: "costume",
      label: "衣装スキル",
      value: buffText(card.costumeSkill.structured),
      rank: null,
    },
  ];
}

/** 段の一言(総評の 1 文目) */
const RANK_TEXT: Record<TierRank, string> = {
  SS: "全体の最高にほぼ届く、最重要のカード",
  S: "全体の最高に迫る主力のカード",
  A: "主力になれるカード",
  B: "平均的なカード",
  C: "ユニットスコアを上げる目的では優先度の低いカード",
  D: "全体の最高から大きく離れるカード",
};

/** 総評(1〜2 文。表の前に置く) */
export function tierSummary(e: TierCardEvaluation): string {
  const card = cardById.get(e.cardId);
  if (!card) return "";
  const role = e.role === "member" ? "メンバー" : "リーダー";
  const first = e.inBest
    ? `全体で最高スコアの編成の${role}で、${RANK_TEXT[e.rank]}。`
    : `${role}として${RANK_TEXT[e.rank]}（全体の最高より ${diffPercentText(e.ratio).replace("−", "")} 低い）。`;
  const parts: string[] = [];
  if (e.role === "member") {
    const strong = (["params", "passive", "active", "special"] as const).filter(
      (k) => componentRank(k, card.id) <= TOTAL / 3,
    );
    // 「控えめ」は言わない — 最高スコアが高いカードで成分の目安だけ低いと矛盾して読める(言うのは探索の結果で裏づく強みだけ)
    if (strong.length > 0)
      parts.push(`${strong.map((k) => COMPONENT_LABELS[k]).join("・")}が ★5 で上位`);
    const adoption = e.adoption ?? 0;
    if (adoption >= 20)
      parts.push(`リーダー ${TOTAL} 通り中 ${adoption} 通りの最高編成に入り、使い回せる`);
    else if (adoption <= 2 && (e.rank === "SS" || e.rank === "S" || e.rank === "A"))
      parts.push("噛み合うリーダーは限られる");
    const drop = e.ratio - (e.bloom0Ratio ?? e.ratio);
    if (drop >= 0.03)
      parts.push(`開花で大きく伸びる（0凸のままだと ${(drop * 100).toFixed(1)}% 低い）`);
    else if (drop < 0.01) parts.push("0凸でもほぼ同じ");
  } else {
    const c = card.costumeSkill.structured;
    if (c) {
      const cond = conditionText(c.condition);
      const support = c.effects.some((e) => e.kind === "scoreSupport");
      parts.push(
        `衣装スキルは${cond ? `${cond.replace(/で$/, "")}の条件つき` : "条件なし"}${support ? "で、スコアサポート付き" : ""}`,
      );
    }
  }
  return parts.length > 0 ? `${first}${parts.join("、")}。` : first;
}
