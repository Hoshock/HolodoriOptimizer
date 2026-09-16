import { factorsForColor } from "../data/connect";
import type { ConnectFactorMap } from "../data/connect";
import type { GreenBoardEffects } from "../data/greenBoard";
import { redUnitEffectsByHolomen } from "../data/redBoard";
import { resolveCard } from "../data/resolve";
import type { Card, Song } from "../data/types";
import { accountYellowEffects, yellowSongBonusPermil } from "../data/yellowBoard";
import type { BloomMap } from "../data/bloom";
import type { BoardMap } from "../storage/boards";
import { computeDisplayScoreBonus } from "./displayScore";
import type { FrequencyMember } from "./liveFrequencyOptimizer";
import type { AccountBonus } from "./power";
import { computeStaticPower } from "./power";
import type { HolomenMap } from "./score";

/**
 * 発動頻度マスの開け方を「**表示ユニットスコア（試算）が最大になるように**」選ぶ第 3 の目的関数
 * （2026-09-16 ユーザー指示「ユニットスコア重視の 3 つ目も追加」）。
 *
 * ライブ側の 2 つ（期待値重視 / 理論値重視 — `src/engine/liveFrequencyOptimizer.ts`）とは**別のモデル**で、
 * ここだけが `displayScore.ts` を通る。`live*.ts` は今までどおり `displayScore.ts` を参照しない
 * （`.claude/rules/engine-structure.md`「レイヤーを混ぜない」）— 候補の列挙（`FrequencyMember.candidates`）だけを
 * 共有し、評価は各モデルが自分の式で行う。
 *
 * **土台は「いま登録しているボード」＋「この画面で選んでいる曲」**。案ごとに対象メンバーの青ボードを
 * その候補の解放マスへ差し替えて計算し直すので、結果一覧のユニットスコア（さがしたときの条件で出した値。
 * 「ボード状況を考慮しない」で探索していれば全解放が土台）とは一致しないことがある。
 * この画面の中の**案どうしの比較**にだけ使う。
 *
 * 表示ユニットスコアの発動頻度依存は未解明の配分（`W_blue`）を通る近似で、**単調でもない**
 * （`docs/human/display-score.md` / `.claude/rules/game-facts.md`）。ここで出る差は数千点規模になることがあるが、
 * その差だけを理由にボードを振り直すのは勧めない — UI の脚注にもそう書く。
 */

/** 候補の組合せ 1 通り（`FrequencyMember` と同じ並びの添字）とその試算値 */
export interface FrequencyUnitScorePlan {
  choice: number[];
  /** 表示ユニットスコアの試算値（黄の楽曲スコアボーナス込み。イベントは掛けない） */
  unitScore: number;
  additionalNodeCount: number;
  removedNodeCount: number;
  frequencyNodeCount: number;
}

export interface FrequencyUnitScoreResult {
  /** ユニットスコアが最大の案（同点なら 追加が少ない → 外す数が少ない → 頻度マスが少ない 順） */
  best: FrequencyUnitScorePlan;
  /** いまのボード状況のままの案（比較の基準） */
  current: FrequencyUnitScorePlan;
  /** 評価した組合せ数 */
  evaluated: number;
}

export interface FrequencyUnitScoreInput {
  /** リーダー（開花・ボードを解決する前のカード）。リーダー枠の青ボードは動かさない */
  leader: Card;
  /** メンバー 5 人の解決前のカード。`members` と同じ並び */
  memberCards: readonly Card[];
  /** 候補（`buildFrequencyMembers` が作ったもの。列挙はライブ側と共有する） */
  members: readonly FrequencyMember[];
  holomenMap: HolomenMap;
  blooms?: BloomMap;
  /** いま登録している青ボード。案ごとに対象メンバーのぶんだけ差し替える */
  boards?: BoardMap;
  /** 緑ボードの合計（アカウント全体） */
  green?: GreenBoardEffects | null;
  connect?: ConnectFactorMap;
  yellowBoards?: BoardMap;
  redBoards?: BoardMap;
  account: AccountBonus;
  /** この画面で選んでいる曲（黄の楽曲スコアボーナスと赤の歌唱者条件に効く。null なら曲の補正なし） */
  song: Song | null;
}

/** 同じ実効値（発動頻度 % / 発動率 %）の候補は表示ユニットスコアも同じなので、代表 1 つに畳む */
function representatives(member: FrequencyMember): number[] {
  const byEffect = new Map<string, number>();
  for (const [index, c] of member.candidates.entries()) {
    const key = `${c.effectiveFrequencyPercent}/${c.effectiveRatePercent}`;
    const kept = byEffect.get(key);
    const keptCandidate = kept === undefined ? undefined : member.candidates[kept];
    if (
      !keptCandidate ||
      c.additionalNodeCount < keptCandidate.additionalNodeCount ||
      (c.additionalNodeCount === keptCandidate.additionalNodeCount &&
        c.removedNodeIds.length < keptCandidate.removedNodeIds.length)
    ) {
      byEffect.set(key, index);
    }
  }
  return [...byEffect.values()];
}

/** ユニットスコアが高い順 → 追加が少ない → 外す数が少ない → 頻度マスが少ない */
function better(a: FrequencyUnitScorePlan, b: FrequencyUnitScorePlan): boolean {
  if (a.unitScore !== b.unitScore) return a.unitScore > b.unitScore;
  if (a.additionalNodeCount !== b.additionalNodeCount)
    return a.additionalNodeCount < b.additionalNodeCount;
  if (a.removedNodeCount !== b.removedNodeCount) return a.removedNodeCount < b.removedNodeCount;
  return a.frequencyNodeCount < b.frequencyNodeCount;
}

/** 候補の組合せを全部評価して、ユニットスコア最大の案と現在の案を返す */
export function optimizeFrequencyUnitScore(
  input: FrequencyUnitScoreInput,
): FrequencyUnitScoreResult {
  const { members, memberCards, holomenMap, account, song } = input;
  const connect = input.connect ?? {};
  // 曲で決まる補正は探索（src/engine/request.ts）と同じ作り方をする
  const songBonus = song
    ? yellowSongBonusPermil(
        accountYellowEffects(input.yellowBoards ?? {}, factorsForColor(connect, "yellow")),
        song,
      ) / 1000
    : 0;
  const red =
    redUnitEffectsByHolomen(input.redBoards ?? {}, song, factorsForColor(connect, "red"))[
      input.leader.holomenId
    ] ?? null;
  const baseBoards = input.boards ?? {};
  const leader = resolveCard(input.leader, input.blooms, baseBoards, input.green, connect);

  const evaluate = (choice: readonly number[]): FrequencyUnitScorePlan => {
    const boards: BoardMap = { ...baseBoards };
    let additional = 0;
    let removed = 0;
    let frequencyNodes = 0;
    for (const [i, member] of members.entries()) {
      const candidate = member.candidates[choice[i] ?? 0];
      if (!candidate) continue;
      boards[member.holomenId] = [...candidate.unlockedNodeIds];
      additional += candidate.additionalNodeCount;
      removed += candidate.removedNodeIds.length;
      frequencyNodes += candidate.frequencyNodeCount;
    }
    const resolved = memberCards.map((c) =>
      resolveCard(c, input.blooms, boards, input.green, connect),
    );
    const unit = { leader, members: resolved };
    const power = computeStaticPower(unit, holomenMap, { red, account }).totalPower;
    const display = computeDisplayScoreBonus(unit, holomenMap, power, { red, songBonus });
    return {
      choice: [...choice],
      unitScore: display.unitScore,
      additionalNodeCount: additional,
      removedNodeCount: removed,
      frequencyNodeCount: frequencyNodes,
    };
  };

  const options = members.map((m) => representatives(m));
  const choice: number[] = members.map(() => 0);
  let best: FrequencyUnitScorePlan | null = null;
  let evaluated = 0;
  const walk = (depth: number): void => {
    if (depth === members.length) {
      const plan = evaluate(choice);
      evaluated += 1;
      if (!best || better(plan, best)) best = plan;
      return;
    }
    const list = options[depth] ?? [];
    if (list.length === 0) {
      walk(depth + 1);
      return;
    }
    for (const index of list) {
      choice[depth] = index;
      walk(depth + 1);
    }
    choice[depth] = 0;
  };
  walk(0);

  const current = evaluate(members.map((m) => m.currentIndex));
  if (!best) throw new Error("発動頻度の候補が 1 つもない");
  return { best, current, evaluated };
}
