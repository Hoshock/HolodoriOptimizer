import {
  BLUE_FREQUENCY_NODE_IDS,
  blueBoardEffects,
  knownNodeIds,
  reachableNodes,
  unlockNode,
} from "../data/blueBoard";
import type { Card, SkillTrigger } from "../data/types";
import type { BoardMap } from "../storage/boards";
import type { ActiveWindow, LiveActiveSkill, TimelineSegment } from "./liveSkillTimeline";
import { buildActiveWindows, LIVE_ACTIVE_PROBABILITY, segmentTimeline } from "./liveSkillTimeline";
import { isConditionMet } from "./score";
import type { HolomenMap } from "./score";

/**
 * 「発動頻度の青マスを誰に何個開けるべきか」を全探索で比べるエンジン（ADR-007）。
 *
 * 目的関数は 2 つだけ（FrequencyOptimizationMode）。どちらも src/engine/liveSkillTimeline.ts の
 * 同じセグメント列の上で、区間ごとの値を時間で積分して区間長で割る:
 * - "expected-score": **アクティブスキル期待値**。各スキルの発動確率を考慮し、同時に発動した中で
 *   最も高いスコア UP だけが有効という前提の期待値（segmentExpectedScore）
 * - "perfect-score": **理論最大**。発動抽選がすべて成功した前提で、その区間で有効になる最大のスコア UP
 *   （segmentPerfectScore）
 * カバレッジ（期待・構造）と空白は**補助指標**で、主目的関数より優先しない（スコア UP の大きさを
 * 見ないので、弱いスキルを長く維持する案が強いスキルの案に勝ってしまう）。tie-break にだけ使う。
 *
 * ユニット編成画面の表示ユニットスコア（src/engine/displayScore.ts）を最大化するものではなく、
 * 未解明のスキルツリー欄の近似式（score_up_permil_up_by_skill_tree に相当する部分）は目的関数に使わない。
 * ここで出す値は**実際のライブスコアではない**（譜面・コンボ・SP の発動位置・スコアサポートは入っていない）。
 *
 * 探索は 5 人 × 合法な発動頻度の候補の直積の全探索（候補は通常 4 通り以下なので 4^5 = 1024 前後）。
 * 近似・greedy は使わない。
 */

/** 浮動小数の比較に使う許容値 */
const EPS = 1e-9;

/**
 * 最適化モード（ユーザーに見せる主指標はこの 2 つだけ）。
 * - expected-score: 発動確率込みのアクティブスキル期待値を最大化（平均的に最も高い）
 * - perfect-score: 全部発動した前提の理論最大を最大化（上振れで最も高い）
 */
export type FrequencyOptimizationMode = "expected-score" | "perfect-score";

export const FREQUENCY_OPTIMIZATION_MODES: readonly FrequencyOptimizationMode[] = [
  "expected-score",
  "perfect-score",
];

/**
 * 推薦ポリシー（**ゲーム仕様ではない**。このツールが「どの案を勧めるか」の方針で、
 * ゲームの計算式とは無関係）。省素材案は「そのモードの最高値との差がこの範囲に収まる案のうち、
 * 追加解放数が最も少ないもの」。
 */
export const FREQUENCY_RECOMMEND_POLICY = {
  /** 「ほぼ同等」とみなす主目的関数の差（ポイント） */
  nearOptimalTolerancePoint: 0.1,
};

/** 1 人ぶんの、実際に取得できる発動頻度の状態 */
export interface FrequencyCandidate {
  /** 解放済みになる発動頻度マスの数（0〜3） */
  frequencyNodeCount: number;
  /** そのときの発動頻度 UP（%。マスの表記値の合計） */
  effectiveFrequencyPercent: number;
  /** そのときの発動率 UP（%）。頻度マスまでの経路に発動率マスが含まれるので一緒に変わる */
  effectiveRatePercent: number;
  /** その状態での解放済みマス（現在の解放マスを必ず含む） */
  unlockedNodeIds: string[];
  /** 現在の状態から追加で解放する必要のあるマス */
  addedNodeIds: string[];
  /** addedNodeIds.length（追加で必要な解放数） */
  additionalNodeCount: number;
}

/** 探索対象のメンバー 1 人 */
export interface FrequencyMember {
  /** ホロメン ID（表示と安定ソートのキー） */
  holomenId: string;
  cardId: string;
  /** アクティブのスコア UP を持たないカードは null（タイムラインに載らない） */
  skill: LiveActiveSkill | null;
  /** そのホロメンの青ボードで実際に到達できる候補（現在の状態を必ず 1 つ含む） */
  candidates: FrequencyCandidate[];
  /** candidates のうち、いまのボード状態（追加 0）の添字 */
  currentIndex: number;
}

/** 1 案の評価値（主目的関数 2 つ + 補助指標） */
export interface FrequencyPlanMetrics {
  /** アクティブスキル期待値の積分（%・秒）。expected-score の目的関数 */
  expectedActiveScoreIntegral: number;
  /** 上を評価区間で割った時間平均（%） */
  averageExpectedActiveScorePercent: number;
  /** 全部発動した前提の理論最大の積分（%・秒）。perfect-score の目的関数 */
  perfectActivationScoreIntegral: number;
  /** 上を評価区間で割った時間平均（%） */
  averagePerfectActivationScorePercent: number;
  /** 【補助】少なくとも 1 つのアクティブが発動している期待時間の割合（0〜1） */
  expectedCoverage: number;
  /** 【補助】発動確率を無視して、候補が 1 つでもある時間の割合（0〜1）。スコア UP の大きさを見ない */
  structuralCoverage: number;
  /** 【補助】候補が 1 つもない時間の合計（秒） */
  totalGapSeconds: number;
  /** 【補助】候補が 1 つもない時間の最長（秒） */
  maximumGapSeconds: number;
}

/** 1 案（5 人ぶんの候補の組合せ） */
export interface FrequencyPlan {
  /** members と同じ並びで、選んだ候補の添字 */
  choice: number[];
  /** 5 人ぶんの追加解放数の合計 */
  additionalNodeCount: number;
  /** 5 人ぶんの発動頻度マスの数の合計 */
  frequencyNodeCount: number;
  metrics: FrequencyPlanMetrics;
}

/** 1 モードぶんのおすすめ */
export interface FrequencyModeResult {
  mode: FrequencyOptimizationMode;
  /** そのモードの目的関数と tie-break で最良の案 */
  best: FrequencyPlan;
  /** 推薦ポリシーによる省素材案（best と同じこともある） */
  saving: FrequencyPlan;
  /** そのモードでの上位の案（best を含む。UI のランキング表示用） */
  ranking: FrequencyPlan[];
}

export interface FrequencyOptimizeResult {
  horizonSeconds: number;
  /** いまのボード状態のままの案（追加 0）。両モードの比較の基準 */
  current: FrequencyPlan;
  /** 期待値重視 */
  expected: FrequencyModeResult;
  /** 理論最大重視 */
  perfect: FrequencyModeResult;
  /** 評価した組合せ数 */
  evaluated: number;
}

/**
 * 【expected-score の区間値】同時に発動候補になっているスキルのうち、実際に発動した中で最も高い
 * スコア UP だけが有効という前提での期待値（%）。スコア UP の降順にグループ化し、
 *   P(その値が有効) = P(そのグループの少なくとも 1 つが発動) × P(それより高いグループが全て不発)
 * で厳密に求める（例: +100%/p=0.5 と +50%/p=0.5 が並ぶ区間は 100 × 0.5 + 50 × 0.5 × 0.5 = 62.5）。
 */
export function segmentExpectedScore(
  actives: readonly { scoreUpPercent: number; probability: number }[],
): number {
  if (actives.length === 0) return 0;
  const sorted = [...actives].sort((a, b) => b.scoreUpPercent - a.scoreUpPercent);
  let survive = 1;
  let expected = 0;
  let index = 0;
  while (index < sorted.length) {
    const head = sorted[index];
    if (head === undefined) break;
    const value = head.scoreUpPercent;
    let fail = 1;
    while (index < sorted.length) {
      const item = sorted[index];
      if (item === undefined || Math.abs(item.scoreUpPercent - value) > EPS) break;
      fail *= 1 - item.probability;
      index += 1;
    }
    expected += value * survive * (1 - fail);
    survive *= fail;
  }
  return expected;
}

/**
 * 【perfect-score の区間値】発動抽選がすべて成功した前提での区間値（%）。同時発動時に有効になるのは
 * 最も高いスコア UP だけなので、候補の最大値そのもの（例: +100% と +50% が並ぶ区間は 100）。
 * **構造カバレッジ（候補がある時間の割合）ではない** — スコア UP の大きさを見る指標にするための区別。
 */
export function segmentPerfectScore(
  actives: readonly { scoreUpPercent: number; probability: number }[],
): number {
  let best = 0;
  for (const a of actives) if (a.scoreUpPercent > best) best = a.scoreUpPercent;
  return best;
}

/** その時点で少なくとも 1 つ発動している確率 = 1 - Π(1 - p_i) */
export function anyActiveProbability(
  actives: readonly { scoreUpPercent: number; probability: number }[],
): number {
  let fail = 1;
  for (const a of actives) fail *= 1 - a.probability;
  return 1 - fail;
}

/** セグメント列から評価値を求める */
export function evaluateTimeline(
  segments: readonly TimelineSegment[],
  horizonSeconds: number,
): FrequencyPlanMetrics {
  let integral = 0;
  let perfect = 0;
  let coverage = 0;
  let structural = 0;
  let gap = 0;
  let maxGap = 0;
  let runGap = 0;
  for (const segment of segments) {
    const length = segment.end - segment.start;
    if (length <= 0) continue;
    integral += segmentExpectedScore(segment.actives) * length;
    perfect += segmentPerfectScore(segment.actives) * length;
    coverage += anyActiveProbability(segment.actives) * length;
    if (segment.actives.length > 0) {
      structural += length;
      runGap = 0;
    } else {
      gap += length;
      runGap += length;
      if (runGap > maxGap) maxGap = runGap;
    }
  }
  const span = horizonSeconds > 0 ? horizonSeconds : 1;
  return {
    expectedActiveScoreIntegral: integral,
    averageExpectedActiveScorePercent: integral / span,
    perfectActivationScoreIntegral: perfect,
    averagePerfectActivationScorePercent: perfect / span,
    expectedCoverage: coverage / span,
    structuralCoverage: structural / span,
    totalGapSeconds: gap,
    maximumGapSeconds: maxGap,
  };
}

/** 1 案（メンバーごとの候補の組合せ）を評価する */
export function evaluateFrequencyPlan(
  members: readonly FrequencyMember[],
  choice: readonly number[],
  horizonSeconds: number,
): FrequencyPlanMetrics {
  const windows: ActiveWindow[] = [];
  for (const [i, member] of members.entries()) {
    const candidate = member.candidates[choice[i] ?? 0];
    if (!member.skill || !candidate) continue;
    windows.push(
      ...buildActiveWindows(
        member.skill,
        {
          frequencyUpPercent: candidate.effectiveFrequencyPercent,
          rateUpPercent: candidate.effectiveRatePercent,
        },
        horizonSeconds,
      ),
    );
  }
  return evaluateTimeline(segmentTimeline(windows, horizonSeconds), horizonSeconds);
}

/** そのモードの主目的関数の値（時間平均。%） */
export function primaryScoreOf(
  metrics: FrequencyPlanMetrics,
  mode: FrequencyOptimizationMode,
): number {
  return mode === "expected-score"
    ? metrics.averageExpectedActiveScorePercent
    : metrics.averagePerfectActivationScorePercent;
}

/**
 * 案の優劣（tie-break の順序。コード上の唯一の定義）:
 * 1. そのモードの主目的関数が大きい（期待値 or 理論最大）
 * 2. 同値なら追加で解放するマスが少ない
 * 3. 同値なら期待カバレッジが大きい【補助指標】
 * 4. 同値なら最大空白が小さい【補助指標】
 * 5. 同値なら発動頻度マスの合計が少ない（並びを一意にするための安定化）
 *
 * 補助指標（カバレッジ・空白）を主目的関数より先に見ることはない。
 */
export function compareFrequencyPlans(
  a: FrequencyPlan,
  b: FrequencyPlan,
  mode: FrequencyOptimizationMode,
): number {
  const primary = primaryScoreOf(b.metrics, mode) - primaryScoreOf(a.metrics, mode);
  if (Math.abs(primary) > EPS) return primary;
  if (a.additionalNodeCount !== b.additionalNodeCount) {
    return a.additionalNodeCount - b.additionalNodeCount;
  }
  const coverage = b.metrics.expectedCoverage - a.metrics.expectedCoverage;
  if (Math.abs(coverage) > EPS) return coverage;
  const gap = a.metrics.maximumGapSeconds - b.metrics.maximumGapSeconds;
  if (Math.abs(gap) > EPS) return gap;
  return a.frequencyNodeCount - b.frequencyNodeCount;
}

/**
 * そのホロメンの青ボードで実際に取得できる発動頻度の候補を列挙する。
 *
 * 発動頻度マスは初期地点から連結でないと解放できないので、単純に [0, 4, 8, 12]% を仮定せず、
 * 現在の解放マスから各頻度マスへの経路（`unlockNode` の 0-1 BFS が返す、未解放が最も少ない経路）を
 * 実際に解放した状態を候補にする。経路上の発動率マスも一緒に解放されるので、発動率 UP も候補ごとに変わる。
 * 解放済みのマスは戻せないので、候補は必ず現在の状態を含む（現在の状態そのものも 1 候補）。
 *
 * コネクトマスによる増幅は未確認なので値に含めない（`.claude/rules/game-facts.md`。通路としては通れる）。
 */
export function enumerateFrequencyCandidates(
  currentNodeIds: readonly string[] | undefined,
): FrequencyCandidate[] {
  const current = reachableNodes(new Set(knownNodeIds(currentNodeIds ?? [])));
  const targets = BLUE_FREQUENCY_NODE_IDS.filter((id) => !current.has(id));
  const candidates: FrequencyCandidate[] = [];
  const seen = new Set<string>();

  const subsets = allSubsets(targets);
  for (const subset of subsets) {
    const unlocked = cheapestUnlock(current, subset);
    const effects = blueBoardEffects(unlocked);
    const unlockedNodeIds = [...unlocked].sort((a, b) => a.localeCompare(b));
    const addedNodeIds = unlockedNodeIds.filter((id) => !current.has(id));
    const frequencyNodeCount = BLUE_FREQUENCY_NODE_IDS.filter((id) => unlocked.has(id)).length;
    // 効果と追加数が同じ候補は選ぶ意味が同じなので 1 つに畳む（先に見つかった方を残す）
    const signature = `${String(frequencyNodeCount)}|${String(effects.activeFrequencyPercent)}|${String(effects.activeRatePercent)}|${String(addedNodeIds.length)}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    candidates.push({
      frequencyNodeCount,
      effectiveFrequencyPercent: effects.activeFrequencyPercent,
      effectiveRatePercent: effects.activeRatePercent,
      unlockedNodeIds,
      addedNodeIds,
      additionalNodeCount: addedNodeIds.length,
    });
  }
  candidates.sort(
    (a, b) =>
      a.frequencyNodeCount - b.frequencyNodeCount || a.additionalNodeCount - b.additionalNodeCount,
  );
  return candidates;
}

/** 追加する頻度マスの集合すべて（3 マスなので 8 通り以下。ビットマスクで列挙する） */
function allSubsets(ids: readonly string[]): string[][] {
  const result: string[][] = [];
  const total = 2 ** ids.length;
  for (let mask = 0; mask < total; mask++) {
    const subset: string[] = [];
    for (const [i, id] of ids.entries()) {
      if (Math.floor(mask / 2 ** i) % 2 === 1) subset.push(id);
    }
    result.push(subset);
  }
  return result;
}

/**
 * 複数の頻度マスをまとめて解放するときに、追加解放数が最も少なくなる順序で解放する。
 * 経路が共有されると順序で結果が変わるので、順列（3 個以下 = 6 通り以下）を全部試す。
 */
function cheapestUnlock(current: ReadonlySet<string>, targets: readonly string[]): Set<string> {
  let best: Set<string> | null = null;
  for (const order of permutations(targets)) {
    let unlocked: Set<string> = new Set(current);
    for (const id of order) unlocked = unlockNode(unlocked, id);
    if (best === null || unlocked.size < best.size) best = unlocked;
  }
  return best ?? new Set(current);
}

function permutations(ids: readonly string[]): string[][] {
  if (ids.length <= 1) return [[...ids]];
  const result: string[][] = [];
  for (const [i, id] of ids.entries()) {
    const rest = [...ids.slice(0, i), ...ids.slice(i + 1)];
    for (const tail of permutations(rest)) result.push([id, ...tail]);
  }
  return result;
}

/**
 * 編成のメンバー 5 人から探索の入力を作る。カードは表示と同じく開花段階まで解決したものを渡す
 * （青ボードは候補ごとに変えるので、カードに載っている boardLive は使わない）。
 *
 * ライフ・コンボ条件つきのスコア UP は満たされているとみなす【仮説】（表示モデルと同じ扱い）。
 * 編成条件（タイプ・所属の人数）はこの編成で判定する。
 */
export function buildFrequencyMembers(
  memberCards: readonly Card[],
  boards: BoardMap | undefined,
  holomenMap: HolomenMap,
): FrequencyMember[] {
  const members = [...memberCards];
  return members.map((card) => {
    const candidates = enumerateFrequencyCandidates(boards?.[card.holomenId]);
    const currentIndex = Math.max(
      0,
      candidates.findIndex((c) => c.additionalNodeCount === 0),
    );
    return {
      holomenId: card.holomenId,
      cardId: card.id,
      skill: liveActiveSkillOf(card, members, holomenMap),
      candidates,
      currentIndex,
    };
  });
}

/** カードのアクティブスキルをタイムラインに載る形にする（スコア UP を持たないスキルは null） */
export function liveActiveSkillOf(
  card: Card,
  members: readonly Card[],
  holomenMap: HolomenMap,
): LiveActiveSkill | null {
  const structured = card.activeSkill.structured;
  if (!structured) return null;
  const { intervalSeconds, durationSeconds, scoreUpPercent, conditionalScoreUp } = structured;
  if (durationSeconds === null || scoreUpPercent === null) return null;
  const conditional =
    conditionalScoreUp && triggerMet(conditionalScoreUp.condition, members, holomenMap)
      ? conditionalScoreUp.percent
      : null;
  return {
    intervalSeconds,
    durationSeconds,
    baseProbability: LIVE_ACTIVE_PROBABILITY[structured.probability],
    scoreUpPercent: conditional ?? scoreUpPercent,
  };
}

/** ライフ・コンボ条件は満たされているとみなす【仮説】。編成条件はメンバー 5 人で判定する */
function triggerMet(
  trigger: SkillTrigger,
  members: readonly Card[],
  holomenMap: HolomenMap,
): boolean {
  if (trigger.kind === "life" || trigger.kind === "combo") return true;
  return isConditionMet(trigger, [...members], holomenMap);
}

/** 全探索して、最良案・現在の案・省素材案・上位のランキングを返す */
export function optimizeFrequency(
  members: readonly FrequencyMember[],
  horizonSeconds: number,
  options?: { rankingSize?: number; nearOptimalTolerancePoint?: number },
): FrequencyOptimizeResult {
  const rankingSize = options?.rankingSize ?? 5;
  const tolerance =
    options?.nearOptimalTolerancePoint ?? FREQUENCY_RECOMMEND_POLICY.nearOptimalTolerancePoint;

  // 候補ごとの発動窓は先に作っておく（案ごとに作り直さない）
  const windowsByMember = members.map((member) =>
    member.candidates.map((candidate) =>
      member.skill
        ? buildActiveWindows(
            member.skill,
            {
              frequencyUpPercent: candidate.effectiveFrequencyPercent,
              rateUpPercent: candidate.effectiveRatePercent,
            },
            horizonSeconds,
          )
        : [],
    ),
  );

  const plans: FrequencyPlan[] = [];
  const choice: number[] = Array.from({ length: members.length }, () => 0);
  let evaluated = 0;

  const evaluateCurrentChoice = (): FrequencyPlan => {
    const windows: ActiveWindow[] = [];
    let additional = 0;
    let frequencyNodes = 0;
    for (const [i, member] of members.entries()) {
      const index = choice[i] ?? 0;
      const candidate = member.candidates[index];
      if (!candidate) continue;
      additional += candidate.additionalNodeCount;
      frequencyNodes += candidate.frequencyNodeCount;
      const memberWindows = windowsByMember[i]?.[index];
      if (memberWindows) windows.push(...memberWindows);
    }
    evaluated += 1;
    return {
      choice: [...choice],
      additionalNodeCount: additional,
      frequencyNodeCount: frequencyNodes,
      metrics: evaluateTimeline(segmentTimeline(windows, horizonSeconds), horizonSeconds),
    };
  };

  const walk = (depth: number): void => {
    if (depth === members.length) {
      plans.push(evaluateCurrentChoice());
      return;
    }
    const count = members[depth]?.candidates.length ?? 0;
    if (count === 0) {
      walk(depth + 1);
      return;
    }
    for (let i = 0; i < count; i++) {
      choice[depth] = i;
      walk(depth + 1);
    }
    choice[depth] = 0;
  };
  walk(0);

  const currentChoice = members.map((m) => m.currentIndex);
  const current =
    plans.find((p) => p.choice.every((v, i) => v === currentChoice[i])) ??
    (() => {
      for (const [i, value] of currentChoice.entries()) choice[i] = value;
      return evaluateCurrentChoice();
    })();

  const modeResultOf = (mode: FrequencyOptimizationMode): FrequencyModeResult => {
    const sorted = [...plans].sort((a, b) => compareFrequencyPlans(a, b, mode));
    const best = sorted[0];
    if (!best) throw new Error("発動頻度の候補が 1 つもない");
    // 省素材案: そのモードの最高値との差が推薦ポリシーの範囲に収まる案のうち、追加解放数が最も少ないもの
    const nearOptimal = sorted.filter(
      (p) =>
        primaryScoreOf(best.metrics, mode) - primaryScoreOf(p.metrics, mode) <= tolerance + EPS,
    );
    const saving = [...nearOptimal].sort(
      (a, b) => a.additionalNodeCount - b.additionalNodeCount || compareFrequencyPlans(a, b, mode),
    )[0];
    return { mode, best, saving: saving ?? best, ranking: sorted.slice(0, rankingSize) };
  };

  return {
    horizonSeconds,
    current,
    expected: modeResultOf("expected-score"),
    perfect: modeResultOf("perfect-score"),
    evaluated,
  };
}
