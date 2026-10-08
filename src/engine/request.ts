import { cardById, cards, holomen, songById } from "../data";
import type { BloomMap } from "../data/bloom";
import type { HolomenBoards } from "../data/boardState";
import { withoutFrequencyNodes } from "../data/boardState";
import {
  CONNECT_ANCHORS,
  connectFactorMapOf,
  connectFactorsOf,
  factorsForColor,
} from "../data/connect";
import type { ConnectFactorMap, ConnectFactors, ConnectPlacements } from "../data/connect";
import { accountGreenEffects } from "../data/greenBoard";
import { redUnitEffectsByHolomen } from "../data/redBoard";
import type { RedUnitEffects } from "../data/redBoard";
import { resolveCard } from "../data/resolve";
import { accountYellowEffects, yellowSongBonusPermil } from "../data/yellowBoard";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import type { AccountBonus } from "./power";
import { MEMBER_SLOTS } from "./power";
import { buildHolomenMap } from "./score";
import { prepareSearch, scoreTeam, searchInProcess } from "./optimize";
import type { OptimizeResult, SearchContext } from "./optimize";

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
 * 依頼のカード ID・マス ID を解決して、探索を準備する(`optimize.ts` の `prepareSearch`)。探索を何本かの Worker で分けるときは、
 * Worker ごとにこれを呼んで同じ準備をし、分担(`SearchPartition`)だけを変えて数える(`useOptimizer`)
 */
export function prepareRunSearch(
  request: OptimizeRunRequest,
  onProgress?: (done: number, total: number) => void,
): SearchContext {
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
  return prepareSearch(
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

/**
 * 依頼のカード ID・マス ID を解決して探索する。進捗が要るとき(Worker)は onProgress を渡す。
 * リーダーと固定メンバー 5 人がすべて決まっている依頼は組合せが 1 通りなので、この関数を
 * UI スレッドから直接呼んでよい(探索せずその 1 通りを評価するだけ)
 */
export function runOptimize(
  request: OptimizeRunRequest,
  onProgress?: (done: number, total: number) => void,
): OptimizeResult {
  return searchInProcess([prepareRunSearch(request, onProgress)]);
}

/** 評価する編成(カード ID) */
export interface TeamIds {
  leaderId: string;
  memberIds: readonly string[];
}

/** 編成 1 つの評価結果(6 枠固定の依頼の 1 件目と同じ形) */
export type TeamCandidate = OptimizeResult["candidates"][number];

/** 依頼の 4 色のマス(`OptimizeRunRequest` の `boards` / `greenBoards` / `yellowBoards` / `redBoards`)。評価は読むだけ */
export interface TeamBoardMaps {
  boards: Readonly<Record<string, readonly string[]>>;
  greenBoards: Readonly<Record<string, readonly string[]>>;
  yellowBoards: Readonly<Record<string, readonly string[]>>;
  redBoards: Readonly<Record<string, readonly string[]>>;
}

/**
 * 6 枠すべて決まっている編成 1 つを、盤面とコネクトの配置を変えながら繰り返し評価する(最適化の各段 — ボード・コネクト・頻度)。
 * 1 回の組み直しプランで数千回呼ぶので、**値を変えずに計算を省く**(2026-10-08 ユーザー指示「計算の高速化」):
 *
 * - 全ホロメンにまたがる量(緑の効果・黄の楽曲スコアボーナス)は、マスとコネクトの配置が前と同じなら作り直さない。
 *   変わったときは `runOptimize` と同じ関数(`accountGreenEffects` など)を同じ並びで呼ぶので、値は 1 点も変わらない
 * - 赤はリーダーのホロメンの分だけ作る(評価が読むのはそこだけ)
 * - カードの解決(開花・青・緑)は、そのホロメンの青のマス・配置と緑の効果が同じなら前の結果を使う
 * - 解決したカードと赤・黄が同じなら、評価の結果そのものを使う(同じ盤面を 2 回測らない)
 *
 * 覚えた値は、この評価器(`createTeamScorer` の戻り値)が捨てられると一緒に消える。保存はしない。
 * 評価は `optimize.ts` の `scoreTeam`(探索の正確な評価と同じ 1 本)で、6 枠固定の `runOptimize` と同じ値になる
 * (`teamScorer.test.ts` で突き合わせる)。開花・アカウント補正・曲は作ったときの `request` のものを使う
 */
export interface TeamScorer {
  /** 依頼の 4 色のマスと配置で評価する */
  evaluateMaps(maps: TeamBoardMaps, placements: ConnectPlacementMap): TeamCandidate;
  /** 全ホロメンの盤面と配置で評価する。`withoutFrequency` なら青の発動頻度マスを外した盤面で測る */
  evaluate(
    boards: Readonly<Record<string, HolomenBoards>>,
    placements: ConnectPlacementMap,
    withoutFrequency: boolean,
  ): TeamCandidate;
}

/** 盤面 → 依頼の 4 色のマス(頻度マスを外した盤面は盤面ごとに 1 回だけ作る。配列は写さない) */
const strippedBoards = new WeakMap<HolomenBoards, HolomenBoards>();
function teamBoardMapsOf(
  boards: Readonly<Record<string, HolomenBoards>>,
  withoutFrequency: boolean,
): TeamBoardMaps {
  const maps = {
    boards: {} as Record<string, readonly string[]>,
    greenBoards: {} as Record<string, readonly string[]>,
    yellowBoards: {} as Record<string, readonly string[]>,
    redBoards: {} as Record<string, readonly string[]>,
  };
  for (const [id, registered] of Object.entries(boards)) {
    let b = registered;
    if (withoutFrequency) {
      let stripped = strippedBoards.get(registered);
      if (!stripped) {
        stripped = withoutFrequencyNodes(registered);
        strippedBoards.set(registered, stripped);
      }
      b = stripped;
    }
    // `requestBoardMaps` と同じく、空の色は載せない
    if (b.blue.length > 0) maps.boards[id] = b.blue;
    if (b.green.length > 0) maps.greenBoards[id] = b.green;
    if (b.yellow.length > 0) maps.yellowBoards[id] = b.yellow;
    if (b.red.length > 0) maps.redBoards[id] = b.red;
  }
  return maps;
}

/** コネクトマス 1 ホロメン分の配置の中身(倍率を決めるものだけ)。配置の器は書き換えられることがあるので、同じかどうかは中身で見る */
function placementKey(p: ConnectPlacements | undefined): string {
  if (!p) return "";
  let key = "";
  for (const anchor of CONNECT_ANCHORS) {
    const placed = p[anchor];
    if (placed && placed.permil > 0) key += `${anchor}:${placed.extent}:${String(placed.permil)};`;
  }
  return key;
}

export function createTeamScorer(request: OptimizeRunRequest, team: TeamIds): TeamScorer {
  const song = request.songId === null ? null : (songById.get(request.songId) ?? null);
  const rawOf = (id: string): Card => {
    const raw = cardById.get(id);
    if (!raw) throw new Error(`カードが見つからない: ${id}`);
    return raw;
  };
  const leaderRaw = rawOf(team.leaderId);
  const memberRaws = team.memberIds.map(rawOf);
  if (memberRaws.length > MEMBER_SLOTS) {
    throw new Error(`固定メンバーは最大 ${String(MEMBER_SLOTS)} 枚`);
  }
  if (new Set(memberRaws.map((c) => c.holomenId)).size !== memberRaws.length) {
    throw new Error("固定メンバーに同一ホロメンが重複している");
  }
  const leaderHolomenId = leaderRaw.holomenId;

  /** マスの並び → 番号(同じ配列は 1 回だけ中身を見る。中身が同じ配列は同じ番号) */
  const arrayIds = new WeakMap<readonly string[], number>();
  const contentIds = new Map<string, number>();
  const idOf = (nodes: readonly string[] | undefined): number => {
    if (nodes === undefined) return 0;
    const known = arrayIds.get(nodes);
    if (known !== undefined) return known;
    const key = nodes.join(",");
    let id = contentIds.get(key);
    if (id === undefined) {
      id = contentIds.size + 1;
      contentIds.set(key, id);
    }
    arrayIds.set(nodes, id);
    return id;
  };
  /** 配置の中身 → 番号(`placementKey` が同じ配置は同じ番号) */
  const placementIds = new Map<string, number>();
  /** ホロメン ID → 番号(鍵を短くする) */
  const holomenIds = new Map<string, number>();
  const holomenIndex = (holomenId: string): number => {
    let i = holomenIds.get(holomenId);
    if (i === undefined) {
      i = holomenIds.size;
      holomenIds.set(holomenId, i);
    }
    return i;
  };
  /** ホロメン × 配置の番号 → 倍率表(`connectFactorsOf` の結果) */
  const factorsCache = new Map<string, ConnectFactors>();

  /**
   * 全ホロメンにまたがる量(緑・黄)の覚え方。鍵は「依頼の順に、ホロメン・その色のマス・そのホロメンの配置」で、値はこの 3 つだけで決まる。
   * 直前の呼び出しと同じ並びなら鍵の文字列も作らずに返す(盤面の最適化は 1 人ずつ変えるので、ほとんどがこれ)
   */
  function accountCache<T>(
    build: (map: Readonly<Record<string, readonly string[]>>, connect: ConnectFactorMap) => T,
  ) {
    const byKey = new Map<string, T>();
    let lastSignature: number[] = [];
    let last: T | undefined;
    return (
      map: Readonly<Record<string, readonly string[]>>,
      placementIdOf: (holomenId: string) => number,
      connect: () => ConnectFactorMap,
    ): T => {
      const signature: number[] = [];
      for (const holomenId in map)
        signature.push(holomenIndex(holomenId), idOf(map[holomenId]), placementIdOf(holomenId));
      if (
        last !== undefined &&
        signature.length === lastSignature.length &&
        signature.every((v, i) => v === lastSignature[i])
      )
        return last;
      const key = signature.join(",");
      let value = byKey.get(key);
      if (value === undefined) {
        value = build(map, connect());
        byKey.set(key, value);
      }
      lastSignature = signature;
      last = value;
      return value;
    };
  }

  let nextId = 0;
  // 変わったときは `runOptimize`(`contextOf`)と同じ関数を同じ並びで呼ぶ
  const greenOf = accountCache((map, connect) => ({
    green: accountGreenEffects(map, factorsForColor(connect, "green")),
    id: (nextId += 1),
  }));
  const songBonusOf = accountCache((map, connect) =>
    song
      ? yellowSongBonusPermil(accountYellowEffects(map, factorsForColor(connect, "yellow")), song) /
        1000
      : 0,
  );
  const redCache = new Map<string, { red: RedUnitEffects | null; id: number }>();
  const cardCache = new Map<string, { card: Card; id: number }>();
  const resultCache = new Map<string, TeamCandidate>();

  const evaluateMaps = (maps: TeamBoardMaps, placements: ConnectPlacementMap): TeamCandidate => {
    // この呼び出しの中だけの、ホロメン → 配置の番号(配置の器は呼び出しの間に書き換えられることがあるので、呼び出しをまたいで覚えない)
    const placementIdMemo = new Map<string, number>();
    const placementIdOf = (holomenId: string): number => {
      let id = placementIdMemo.get(holomenId);
      if (id === undefined) {
        const key = placementKey(placements[holomenId]);
        id = placementIds.get(key);
        if (id === undefined) {
          id = placementIds.size;
          placementIds.set(key, id);
        }
        placementIdMemo.set(holomenId, id);
      }
      return id;
    };
    const factorsOf = (holomenId: string): ConnectFactors => {
      const key = `${String(holomenIndex(holomenId))}.${String(placementIdOf(holomenId))}`;
      let f = factorsCache.get(key);
      if (!f) {
        const p = placements[holomenId];
        f = p ? connectFactorsOf(holomenId, p) : {};
        factorsCache.set(key, f);
      }
      return f;
    };

    /** 全ホロメンの倍率表(`connectFactorMapOf(placements)` と同じ中身。覚えた倍率表から組む) */
    let connectMap: ConnectFactorMap | null = null;
    const connect = (): ConnectFactorMap => {
      if (connectMap) return connectMap;
      connectMap = {};
      for (const holomenId of Object.keys(placements)) {
        const f = factorsOf(holomenId);
        if (Object.keys(f).length > 0) connectMap[holomenId] = f;
      }
      return connectMap;
    };

    const green = greenOf(maps.greenBoards, placementIdOf, connect);
    // 黄の楽曲スコアボーナス(曲を指定したときだけ)
    const songBonus = song ? songBonusOf(maps.yellowBoards, placementIdOf, connect) : 0;
    // 赤(リーダーのホロメンの分だけ評価が読む)
    const leaderRed = maps.redBoards[leaderHolomenId];
    const redKey = `${String(idOf(leaderRed))}.${String(placementIdOf(leaderHolomenId))}`;
    let red = redCache.get(redKey);
    if (!red) {
      const unit =
        leaderRed === undefined
          ? undefined
          : redUnitEffectsByHolomen({ [leaderHolomenId]: leaderRed }, song, {
              [leaderHolomenId]: factorsOf(leaderHolomenId).red,
            })[leaderHolomenId];
      red = { red: unit ?? null, id: (nextId += 1) };
      redCache.set(redKey, red);
    }
    // カードの解決(開花・青・緑): そのホロメンの青のマス・配置と緑が同じなら前の結果
    const resolve = (raw: Card): { card: Card; id: number } => {
      const h = raw.holomenId;
      const key = `${raw.id}.${String(idOf(maps.boards[h]))}.${String(placementIdOf(h))}.${String(green.id)}`;
      let hit = cardCache.get(key);
      if (!hit) {
        hit = {
          card: resolveCard(raw, request.blooms, maps.boards, green.green, { [h]: factorsOf(h) }),
          id: (nextId += 1),
        };
        cardCache.set(key, hit);
      }
      return hit;
    };
    const leader = resolve(leaderRaw);
    const members = memberRaws.map(resolve);
    // 解決したカード・赤・黄が同じなら同じ値(同じ盤面を 2 回測らない)
    const resultKey = `${String(leader.id)}.${members.map((m) => String(m.id)).join(".")}.${String(red.id)}.${String(songBonus)}`;
    let result = resultCache.get(resultKey);
    if (!result) {
      result = scoreTeam(
        leader.card,
        members.map((m) => m.card),
        holomenMap,
        { red: red.red, account: request.account, songBonus },
      );
      resultCache.set(resultKey, result);
    }
    return result;
  };

  return {
    evaluateMaps,
    evaluate: (boards, placements, withoutFrequency) =>
      evaluateMaps(teamBoardMapsOf(boards, withoutFrequency), placements),
  };
}

/**
 * 6 枠すべて決まっている編成 1 つを、コネクトの配置を変えながら評価する(依頼の 4 色のマスは固定)。
 * 評価は `createTeamScorer` と同じで、6 枠固定の `runOptimize` と同じ値になる。依頼の `connectPlacements` は見ず、引数の配置で評価する
 */
export function teamEvaluator(
  request: OptimizeRunRequest,
  team: TeamIds,
): (placements: ConnectPlacementMap) => TeamCandidate {
  const scorer = createTeamScorer(request, team);
  return (placements) => scorer.evaluateMaps(request, placements);
}
