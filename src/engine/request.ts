import { cardById, cards, holomen, songById } from "../data";
import type { BloomMap } from "../data/bloom";
import { connectFactorMapOf, factorsForColor } from "../data/connect";
import { accountGreenEffects } from "../data/greenBoard";
import { redUnitEffectsByHolomen } from "../data/redBoard";
import { resolveCard } from "../data/resolve";
import { accountYellowEffects, yellowSongBonusPermil } from "../data/yellowBoard";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import type { AccountBonus } from "./power";
import { buildHolomenMap } from "./score";
import { optimize } from "./optimize";
import type { OptimizeResult } from "./optimize";

/**
 * 探索の依頼(カード ID とアカウントの登録値だけ)と、その依頼を解決して optimize を呼ぶ入口。
 *
 * データセットはバンドルに含まれるので、依頼はカード ID・マス ID だけを持つ — Worker への
 * postMessage で複製できる形に保つ制約でもある(リアクティブ Proxy を渡さない)。
 * Worker(src/engine/worker.ts)と、6 枠がすべて決まっている編成を UI スレッドで直接評価する経路
 * (お気に入りユニットの再計算)で共有する
 */

export interface OptimizeRunRequest {
  /** null = リーダーも探索する(除外カードを除く全カードが候補) */
  leaderId: string | null;
  fixedMemberIds: string[];
  /** リーダー候補・メンバー候補の両方から除外(所持カードから探すときの所持外カードもここ) */
  excludedCardIds: string[];
  /** リーダー候補(おまかせ)からだけ除外 / メンバー候補からだけ除外(さがすのオプションの「除外」。「選択」は選んだカード以外をここへ入れて渡す — src/ui/poolRestriction.ts) */
  excludedLeaderCardIds: string[];
  excludedMemberCardIds: string[];
  /** リーダー未指定時の候補をこの ID に限定する(null = 限定なし)。おかゆモードで使う */
  leaderCandidateIds: string[] | null;
  /** メンバーに必ず含めるホロメン ID(おかゆモードで使う。通常は空) */
  requiredMemberHolomenIds: string[];
  /** 曲別最適化の対象。null なら曲に依存する補正(黄のボード欄への組み込み・イベント)を入れない */
  songId: string | null;
  /** カード ID → 開花段階。未登録のカードは 0凸として扱う */
  blooms: BloomMap;
  /** ホロメン ID → 解放した青ホロメンボードのマス ID。未登録はボードなし */
  boards: BoardMap;
  /** ホロメン ID → 解放した緑ホロメンボードのマス ID。全ホロメン分の合計が全カードに効く */
  greenBoards: BoardMap;
  /** ホロメン ID → 解放した黄ホロメンボードのマス ID。曲を指定したときにその曲の楽曲スコアボーナス(ボード欄に入る)になる */
  yellowBoards: BoardMap;
  /** ホロメン ID → 解放した赤ホロメンボードのマス ID。そのホロメンをリーダーにした編成のメンバー 5 人に効く */
  redBoards: BoardMap;
  /**
   * ホロメン ID → コネクトマスの入力(範囲の形と増幅 ‰。src/data/connect.ts。暫定仕様)。範囲内の解放済みマスを増幅する。
   * 省略・空なら増幅なし。探索はボード状況を考慮するかどうかに関わらず、登録しているコネクトで常に計算する(2026-10-02 ユーザー指示)
   */
  connectPlacements?: ConnectPlacementMap;
  /** アカウント共通の補正(メモリーの「ユニットパラメータ +X%」とメンバー強化ボーナス +X%)。総合力に別枠で加算する */
  account: AccountBonus;
  topN: number;
}

const holomenMap = buildHolomenMap(holomen);

/** コネクトの配置から決まる、探索・評価に共通の部品 */
function contextOf(request: OptimizeRunRequest, placements: ConnectPlacementMap) {
  const song = request.songId === null ? null : (songById.get(request.songId) ?? null);
  const connect = connectFactorMapOf(placements);
  // 黄ボードの楽曲スコアボーナスは曲を指定したときだけ(曲未指定は曲ごとに違うので入れない)。
  // 値はホロメンボード効果欄に入る(2026-09-11 実機確定。src/engine/displayScore.ts の songBoardRaw)
  const songBonus = song
    ? yellowSongBonusPermil(
        accountYellowEffects(request.yellowBoards, factorsForColor(connect, "yellow")),
        song,
      ) / 1000
    : 0;
  // 赤ボードはリーダーのホロメンで決まり、歌唱者条件は曲を指定したときだけ判定する
  const redByHolomen = redUnitEffectsByHolomen(
    request.redBoards,
    song,
    factorsForColor(connect, "red"),
  );
  const green = accountGreenEffects(request.greenBoards, factorsForColor(connect, "green"));
  return { song, connect, songBonus, redByHolomen, green };
}

/**
 * 依頼のカード ID・マス ID を解決して探索する。進捗が要るとき(Worker)は onProgress を渡す。
 * リーダーと固定メンバー 5 人がすべて決まっている依頼は組合せが 1 通りなので、この関数を
 * UI スレッドから直接呼んでよい(探索せずその 1 通りを評価するだけ)
 */
export function runOptimize(
  request: OptimizeRunRequest,
  onProgress?: (done: number, total: number) => void,
): OptimizeResult {
  // コネクト効果(暫定仕様): 置いたカードと開花段階から 4 色のマスの倍率表を作り、各色の効果関数に渡す
  const { connect, songBonus, redByHolomen, green } = contextOf(
    request,
    request.connectPlacements ?? {},
  );
  // 開花段階と青・緑ボードを解決したカードで探索する(探索コアは開花・青・緑を知らない。赤はリーダー依存なので探索へ渡す)
  const resolvedCards = cards.map((c) =>
    resolveCard(c, request.blooms, request.boards, green, connect),
  );
  const resolvedById = new Map(resolvedCards.map((c) => [c.id, c]));
  let leader: Card | null = null;
  if (request.leaderId !== null) {
    leader = resolvedById.get(request.leaderId) ?? null;
    if (!leader) throw new Error(`リーダーのカードが見つからない: ${request.leaderId}`);
  }
  const fixedMembers = request.fixedMemberIds.map((id) => {
    const card = resolvedById.get(id);
    if (!card) throw new Error(`固定メンバーのカードが見つからない: ${id}`);
    return card;
  });
  return optimize(
    {
      leader,
      fixedMembers,
      excludedCardIds: request.excludedCardIds,
      excludedLeaderCardIds: request.excludedLeaderCardIds,
      excludedMemberCardIds: request.excludedMemberCardIds,
      leaderCandidateIds: request.leaderCandidateIds ?? undefined,
      requiredMemberHolomenIds: request.requiredMemberHolomenIds,
      songBonus,
      redByHolomen,
      account: request.account,
      topN: request.topN,
      onProgress,
      progressInterval: 500_000,
    },
    resolvedCards,
    holomenMap,
  );
}

/** 評価する編成(カード ID) */
export interface TeamIds {
  leaderId: string;
  memberIds: readonly string[];
}

/**
 * 6 枠すべて決まっている編成 1 つを、コネクトの配置を変えながら繰り返し評価する(コネクトの最適化 —
 * src/engine/connectOptimize.ts)。評価は `runOptimize` の 6 枠固定の依頼と同じ経路(`optimize` に編成の 6 枚だけを渡す)で、
 * カード全部を解決し直さないので 1 回あたり 1 ミリ秒前後で済む。依頼の `connectPlacements` は見ず、引数の配置で評価する
 */
export function teamEvaluator(
  request: OptimizeRunRequest,
  team: TeamIds,
): (placements: ConnectPlacementMap) => OptimizeResult["candidates"][number] | undefined {
  return (placements) => {
    const ctx = contextOf(request, placements);
    const resolve = (id: string): Card => {
      const raw = cardById.get(id);
      if (!raw) throw new Error(`カードが見つからない: ${id}`);
      return resolveCard(raw, request.blooms, request.boards, ctx.green, ctx.connect);
    };
    const leader = resolve(team.leaderId);
    const members = team.memberIds.map(resolve);
    return optimize(
      {
        leader,
        fixedMembers: members,
        songBonus: ctx.songBonus,
        redByHolomen: ctx.redByHolomen,
        account: request.account,
        topN: 1,
      },
      [leader, ...members],
      holomenMap,
    ).candidates[0];
  };
}
