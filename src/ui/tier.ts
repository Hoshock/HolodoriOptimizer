import { cardById, holomen, star5Cards } from "../data";
import type { Card, SkillCondition, SkillTrigger } from "../data/types";
import {
  compileDisplayMember,
  SP_RATE_UP_DIVISOR,
  SP_SUPPORT_DIVISOR,
} from "../engine/displayScore";
import { affIndexOf } from "../engine/power";
import { buildHolomenMap } from "../engine/score";
import { evaluateTier, evaluateTierCard } from "../engine/tier";
import type { TierCardEvaluation, TierDataset, TierRank } from "../engine/tier";
import { affiliationName, formatScore, TYPE_LABELS } from "./labels";

/**
 * ティア表の評価画面の文言(2026-10-09 ユーザー指示「評価の高いカードはそれぞれなぜ高いのか説明文を出すこと」→ 同日
 * 「文が長すぎると意味不明なので適切な評価軸の表であらわす。表の前に総評を書く」)。
 * 評価そのものは `src/engine/tier.ts`(探索の結果の比)で、ここは **総評(1〜2 文)** と **評価軸の表(項目 / 内容 / ★5 の中の順位)** を作る。
 *
 * 順位は ★5 全枚の中の順位(1 始まり。同じ値は同じ順位)。採用率・最高ユニットスコア・0凸の落差は探索の結果そのもの。
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

/** 採用率の表記(「72%」) */
export function adoptionText(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function adoptionRow(dataset: TierDataset, cardId: string, role: "member" | "leader"): TierAxisRow {
  const e = evaluateTierCard(dataset, cardId, role)!;
  const all = evaluationsOf(dataset, role);
  const count = role === "member" ? e.adoption.member : e.adoption.leader;
  return {
    key: `adoption-${role}`,
    label: role === "member" ? "メンバー採用率" : "リーダー採用率",
    value: `${adoptionText(e.adoptionRate)}（${formatScore(e.adoption.owned)} 件中 ${formatScore(count)} 件、±${(e.adoptionHalfWidth * 100).toFixed(1)} pt）`,
    rank: rankAmong(
      all.map((x) => x.adoptionRate),
      e.adoptionRate,
    ),
  };
}

/** 同じ衣装スキル(構造が同じ)を持つほかの ★5 の数(リーダーの評価は衣装スキルで決まるので、同点の理由になる) */
export function sameCostumeCount(cardId: string): number {
  const card = cardById.get(cardId);
  if (!card?.costumeSkill.structured) return 0;
  const key = JSON.stringify(card.costumeSkill.structured);
  return star5Cards.filter(
    (c) => c.id !== cardId && JSON.stringify(c.costumeSkill.structured) === key,
  ).length;
}

/**
 * 評価軸の表(メンバー 9 行 / リーダー 5 行)。「比」という言い方はせず、採用率(段の根拠)と、最高ユニットスコアと全体の最高との差
 * (点数と %)で言う(2026-10-09 ユーザー指示「最良の比というのがわかりにくい」「定量性も大事」)。
 * 最高スコアのときの編成は表でなくカードの並び(`TierCardSheet` の編成の段)で見せる。
 * パッシブと衣装スキルには順位を付けない(大きさの目安が探索の結果と食い違いうる — レビュー 2026-10-09)
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
    const drop = e.ratio - (e.bloom0Ratio ?? e.ratio);
    return [
      adoptionRow(dataset, e.cardId, "member"),
      adoptionRow(dataset, e.cardId, "leader"),
      ...scoreRows,
      {
        key: "bloom0",
        label: "0凸のまま",
        value: `${formatScore(bloom0)}（開花最大より ${diffPercentText(bloom0 / e.team.unitScore)}）`,
        // 順位は落差の小さい順(文言と同じ尺度)
        rank: rankAmong(
          all.map((x) => -(x.ratio - (x.bloom0Ratio ?? x.ratio))),
          -drop,
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
        rank: null,
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
  const same = sameCostumeCount(e.cardId);
  return [
    adoptionRow(dataset, e.cardId, "leader"),
    adoptionRow(dataset, e.cardId, "member"),
    ...scoreRows,
    {
      key: "costume",
      label: "衣装スキル",
      value: `${buffText(card.costumeSkill.structured)}${same > 0 ? `（同じ衣装スキルのカードが他に ${same} 枚）` : ""}`,
      rank: null,
    },
  ];
}

/** 段の一言(総評の 1 文目。採用率の水準) */
const RANK_TEXT: Record<TierRank, string> = {
  SS: "使われる頻度が飛び抜けて高い、最重要のカード",
  S: "多くのアカウントで使われる主力のカード",
  A: "よく使われるカード",
  B: "ときどき使われるカード",
  C: "使われることが少ないカード",
  D: "ほとんど使われないカード",
};

/** 総評(1〜2 文。表の前に置く) */
export function tierSummary(e: TierCardEvaluation): string {
  const card = cardById.get(e.cardId);
  if (!card) return "";
  const role = e.role === "member" ? "メンバー" : "リーダー";
  const first = `${role}として${RANK_TEXT[e.rank]}（持っていたアカウントの ${adoptionText(e.adoptionRate)} で最高編成に入る）。`;
  const parts: string[] = [];
  if (e.inBest) parts.push("全体で最高スコアの編成にも入る");
  if (e.role === "member") {
    // 強みは探索の結果で裏づけやすい成分だけ(アクティブ・SP。素のパラメータは差が 0.8% しかなく、パッシブは目安 — 「控えめ」も言わない)
    const strong = (["active", "special"] as const).filter(
      (k) => componentRank(k, card.id) <= TOTAL / 3,
    );
    if (strong.length > 0)
      parts.push(`${strong.map((k) => COMPONENT_LABELS[k]).join("・")}が ★5 で上位`);
    const drop = e.ratio - (e.bloom0Ratio ?? e.ratio);
    if (drop >= 0.03)
      parts.push(`開花で大きく伸びる（0凸のままだと ${(drop * 100).toFixed(1)}% 低い）`);
    else if (drop < 0.01) parts.push("0凸でもほぼ同じ");
  } else {
    const c = card.costumeSkill.structured;
    if (c) {
      const cond = conditionText(c.condition);
      const support = c.effects.some((x) => x.kind === "scoreSupport");
      parts.push(
        `衣装スキルは${cond ? `${cond.replace(/で$/, "")}の条件つき` : "条件なし"}${support ? "で、スコアサポート付き" : ""}`,
      );
      const same = sameCostumeCount(e.cardId);
      if (same > 0) parts.push(`同じ衣装スキルのカードが他に ${same} 枚ある`);
    }
  }
  return parts.length > 0 ? `${first}${parts.join("、")}。` : first;
}
