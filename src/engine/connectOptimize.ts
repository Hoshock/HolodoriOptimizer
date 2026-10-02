import { holomenById } from "../data";
import { CONNECT_EXTENT_IDS, connectBestPermil, connectTargets } from "../data/connect";
import type { ConnectAnchor, ConnectLevel, ConnectPlacement } from "../data/connect";
import { GREEN_BOARD_NODES } from "../data/greenBoard";
import { RED_BOARD_NODES } from "../data/redBoard";
import { YELLOW_BOARD_NODES } from "../data/yellowBoard";
import type { BoardColor } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";

/**
 * 「コネクトを外した」探索が使う最適なコネクトの配置(2026-10-02 ユーザー指示)。
 *
 * 赤などの色を外すとその色は全解放(最良の状態)として試算するのに揃えて、コネクトを外したときは**置く形と倍率を最適に選ぶ**。
 * 最適な形は編成・解放マス・ホロメンの左右配置で変わり(青・赤は編成に出るホロメンだけ、緑・黄はアカウント全体に効く)
 * 1 つには定まらないので、**探索は従来どおり(増幅なし)行い、その上位の編成をまとめて最大にする配置を 1 つ選び、数値と順位を
 * 計算し直す**(`runOptimize` — src/engine/request.ts)。ここは「どの配置を選ぶか」だけを持つ純粋な部分で、スコアの評価は
 * 呼び出し側が渡す(`evaluate`)ので、評価器の差し替えとテストがしやすい。
 *
 * - 倍率は**そのレベルで取りうる最大**に固定し(Lv1 = 0〜4凸、Lv2 = 5凸。`connectBestPermil`)、選ぶのは形だけ。
 *   増幅は増えるほどスコアが下がらない前提で、同じ範囲なら高い倍率が必ず良い
 * - 変数は ホロメン × コネクトマス(4 か所)。1 つずつ全部の形を試して上位編成の合計が最も増える形を採る座標降下。
 *   同じマスに複数の範囲が掛かるときは増分の加算(`combineConnectPermils`)なので、交互作用は周回を重ねると拾える(既定は 1 周)
 * - 解放済みのマスに 1 つも掛からない形、スコアに効かないマス(報酬・ライフ・ホロメンスキル・ホロワーク報酬)にしか掛からない形、
 *   効かない色(青はそのホロメンが編成にいるときだけ、赤はリーダーのときだけ、黄は曲を指定したときだけ。緑は常に)にしか
 *   掛からない形は試さない。範囲が同じで倍率が低い形・範囲が他の形に含まれて倍率も
 *   低い形は試さない(増幅は多いほど下がらない前提で、必ず負ける)
 */

export type UnlockedByColor = Readonly<Record<BoardColor, ReadonlySet<string>>>;

/** スコアに効かない効果のマス(報酬・獲得量・ライフ・ホロメンスキル・ホロワーク報酬)。増幅しても値が変わらないので範囲に数えない */
const NO_SCORE_EFFECT = new Set<string>([
  ...GREEN_BOARD_NODES.filter((n) => n.effect.kind === "reward").map((n) => `green/${n.id}`),
  ...RED_BOARD_NODES.filter((n) =>
    ["life", "liveReward", "leaderSkill"].includes(n.effect.kind),
  ).map((n) => `red/${n.id}`),
  ...YELLOW_BOARD_NODES.filter((n) => n.effect.kind === "workReward").map((n) => `yellow/${n.id}`),
]);
/** そのマスの増幅がユニットスコアに効きうるか。黄の楽曲スコアボーナスは曲を指定したときだけ効く */
function affectsScore(color: BoardColor, nodeId: string, hasSong: boolean): boolean {
  if (color === "yellow" && !hasSong) return false;
  return !NO_SCORE_EFFECT.has(`${color}/${nodeId}`);
}

/** ある変数(ホロメン × コネクトマス)に置ける形の候補 */
export interface ConnectOption {
  placement: ConnectPlacement;
  /** その形が掛かる解放済みマスの色 */
  colors: ReadonlySet<BoardColor>;
  /** 掛かる解放済みマスの識別子(色/マス ID)。包含による枝刈りに使う */
  cells: ReadonlySet<string>;
}

/**
 * そのホロメンのそのコネクトマスに置ける形(解放済みのマスに 1 つ以上掛かるものだけ。包含で負けるものを除く)。
 * 範囲は物理座標のまま(`connectTargets`。ホロメンの左右配置で反転しない)
 */
export function connectOptions(
  holomenId: string,
  anchor: ConnectAnchor,
  unlocked: UnlockedByColor,
  level: ConnectLevel,
  hasSong: boolean,
): ConnectOption[] {
  const layout = holomenById.get(holomenId)?.board;
  if (!layout) return [];
  const all: ConnectOption[] = [];
  for (const extent of CONNECT_EXTENT_IDS) {
    const hit = connectTargets(layout, anchor, extent).filter(
      (t) => unlocked[t.color].has(t.nodeId) && affectsScore(t.color, t.nodeId, hasSong),
    );
    if (hit.length === 0) continue;
    all.push({
      placement: { extent, permil: connectBestPermil(extent, level) },
      colors: new Set(hit.map((t) => t.color)),
      cells: new Set(hit.map((t) => `${t.color}/${t.nodeId}`)),
    });
  }
  // 別の形が同じ(またはより広い)範囲に同じ以上の倍率で掛かるなら、この形は必ず負けるので試さない
  const dominated = (a: ConnectOption, b: ConnectOption): boolean => {
    if (a === b || b.placement.permil < a.placement.permil) return false;
    for (const c of a.cells) if (!b.cells.has(c)) return false;
    // 範囲も倍率も同じ形どうしは先に出てきた方を残す
    const same = a.cells.size === b.cells.size && a.placement.permil === b.placement.permil;
    return !same || all.indexOf(b) < all.indexOf(a);
  };
  return all.filter((a) => !all.some((b) => dominated(a, b)));
}

/** 最適化の対象にする編成(リーダーのホロメンとメンバーのホロメン) */
export interface ConnectTeam {
  leaderHolomenId: string;
  memberHolomenIds: readonly string[];
}

export interface ChooseConnectInput {
  /** 上位の編成(合計を最大にする) */
  teams: readonly ConnectTeam[];
  /** 曲を指定しているか(黄の楽曲スコアボーナスは曲があるときだけ効く) */
  hasSong: boolean;
  /** 色ごとの解放済みマス(ホロメン ID → マス ID の集合)。外した色は全解放のものが入る */
  unlocked: Readonly<Record<BoardColor, ReadonlyMap<string, ReadonlySet<string>>>>;
  /** 編成にいるホロメンを先に、そのあとに全ホロメンを回す(順序は結果に影響しうるので決め打ち) */
  holomenIds: readonly string[];
  level: ConnectLevel;
  /**
   * 配置を渡して、指定した編成(添字)の調整後ユニットスコアを返す(返す配列は teamIndexes と同じ並び)。
   * 呼び出し側が実際の探索と同じ評価経路で計算する
   */
  evaluate: (placements: ConnectPlacementMap, teamIndexes: readonly number[]) => number[];
  /**
   * 座標降下の周回数の上限(既定 1)。2 周目は交互作用の拾い直しで、実データ(全解放・上位 10 件)では合計が 0.0004% 動くだけで
   * 評価回数が倍になる(2026-10-02 計測)ので既定では回さない
   */
  maxPasses?: number;
}

/** コネクトマスを回す順: 1 色だけに掛かるマスを先に、複数色に跨る中心を最後に(2 周目で互いに合わせ直す) */
const ANCHOR_ORDER: readonly ConnectAnchor[] = ["card", "leader", "content", "center"];

/**
 * 上位の編成の調整後ユニットスコアの合計を最大にする配置を選ぶ(座標降下)。
 * 何も置かないより良くならない変数は置かない(増幅が効かないホロメンは入れない)
 */
export function chooseConnectPlacements(input: ChooseConnectInput): ConnectPlacementMap {
  const { teams, hasSong, unlocked, holomenIds, level, evaluate, maxPasses = 1 } = input;
  const placements: ConnectPlacementMap = {};
  if (teams.length === 0) return placements;

  const all = teams.map((_, i) => i);
  const withMember = (id: string): number[] =>
    all.filter((i) => teams[i]?.memberHolomenIds.includes(id) === true);
  const withLeader = (id: string): number[] => all.filter((i) => teams[i]?.leaderHolomenId === id);

  let scores = evaluate(placements, all);

  const setPlacement = (
    holomenId: string,
    anchor: ConnectAnchor,
    placement: ConnectPlacement | null,
  ): void => {
    const entry = (placements[holomenId] ??= {});
    if (placement === null) delete entry[anchor];
    else entry[anchor] = { ...placement };
    if (Object.keys(entry).length === 0) delete placements[holomenId];
  };

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const holomenId of holomenIds) {
      const unlockedOf: UnlockedByColor = {
        blue: unlocked.blue.get(holomenId) ?? new Set(),
        red: unlocked.red.get(holomenId) ?? new Set(),
        yellow: unlocked.yellow.get(holomenId) ?? new Set(),
        green: unlocked.green.get(holomenId) ?? new Set(),
      };
      const members = withMember(holomenId);
      const leads = withLeader(holomenId);
      for (const anchor of ANCHOR_ORDER) {
        // その色が効く編成(添字)。青 = そのホロメンをメンバーに含む編成、赤 = リーダーの編成、緑・黄 = アカウント全体
        const affectedBy = (colors: ReadonlySet<BoardColor>): number[] => {
          const hit = new Set<number>();
          if (colors.has("blue")) for (const i of members) hit.add(i);
          if (colors.has("red")) for (const i of leads) hit.add(i);
          if (colors.has("green") || (colors.has("yellow") && hasSong))
            for (const i of all) hit.add(i);
          return [...hit].sort((a, b) => a - b);
        };
        const options = connectOptions(holomenId, anchor, unlockedOf, level, hasSong)
          .map((o) => ({ ...o, affected: affectedBy(o.colors) }))
          .filter((o) => o.affected.length > 0);
        const current = placements[holomenId]?.[anchor] ?? null;
        if (options.length === 0 && current === null) continue;

        // 比べる編成: 候補のどれかが効く編成 + いまの配置が効く編成(外す候補も比べるため)
        const universe = new Set<number>();
        for (const o of options) for (const i of o.affected) universe.add(i);
        const currentOption = options.find(
          (o) =>
            current !== null &&
            o.placement.extent === current.extent &&
            o.placement.permil === current.permil,
        );
        for (const i of currentOption?.affected ?? []) universe.add(i);
        const compare = [...universe].sort((a, b) => a - b);
        if (compare.length === 0) continue;

        const sum = (values: readonly number[]): number => values.reduce((a, v) => a + v, 0);
        const baseline = sum(compare.map((i) => scores[i] ?? 0));
        let best: { placement: ConnectPlacement | null; total: number; values: number[] } = {
          placement: current,
          total: baseline,
          values: compare.map((i) => scores[i] ?? 0),
        };

        const consider = (placement: ConnectPlacement | null): void => {
          setPlacement(holomenId, anchor, placement);
          const values = evaluate(placements, compare);
          const total = sum(values);
          if (total > best.total) best = { placement, total, values };
        };
        for (const o of options) {
          if (
            current !== null &&
            o.placement.extent === current.extent &&
            o.placement.permil === current.permil
          )
            continue;
          consider(o.placement);
        }
        if (current !== null) consider(null);

        // 最良を置く(何も良くならなければ元のまま)
        setPlacement(holomenId, anchor, best.placement);
        if (best.placement !== current) {
          changed = true;
          const next = scores.slice();
          compare.forEach((i, k) => {
            next[i] = best.values[k] ?? next[i] ?? 0;
          });
          scores = next;
        }
      }
    }
    if (!changed) break;
  }
  return placements;
}
