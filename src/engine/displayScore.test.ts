import { describe, expect, it } from "vite-plus/test";

import { cards as realCards, holomen as realHolomen } from "../data";
import { cardAtBloom } from "../data/bloom";
import type { Card } from "../data/types";
import {
  ACTIVE_PROBABILITY,
  activeSeconds,
  computeDisplayScoreBonus,
  DISPLAY_UNIT_SCORE_FACTOR,
  displayUnitScore,
  round1,
  songBoardRaw,
  toScoreBonusPermil,
} from "./displayScore";
import { buildHolomenMap } from "./score";

/**
 * メニュー画面のスコアボーナスとユニットスコアのゴールデンケース(2026-09-08 ユーザー実機観測 20 ケース。
 * 観測値の全文は docs/ai/tmp/status.md「実機ユニットスコア」)。
 *
 * 各ケースについて [実機値] と [モデルの値] を並べ、モデルの値を厳密に固定する(値が変わればモデルが変わったと分かる)。
 * 実機とのずれは「実装した式 − 実機」で、項目ごとの傾向(2026-09-09 に水着みこ・水着フワワの青ボードを
 * 実機値へ訂正し、アクティブ欄・SP 欄の整数化を 0.1% 単位の切り上げ(permil 整数)に変えた後の数字):
 * - アクティブ欄: **20 ケースすべて実機と完全一致**(5 人共通タイムライン・確率 55/46/37 + permil 切り上げ)
 * - SP 欄: −0.4〜+0.6、20 ケース中 15 が完全一致(残る 4 件はいずれも SP の発動率 UP を含む形成 —
 *   スコアサポートだけの形成は全件一致する)
 * - ホロメンボード効果欄: −1.5〜+2.9(青の発動率 +r は確率に加算・頻度は周期 ÷ (1 + f))。頻度の山
 *   (9.13 < 9.14 > 9.15、さらに 12% で反転して上がる — 下の「発動頻度系列」)はこの式では再現できていない。
 *   9.16 / 9.17 は発動率・頻度だけを変えた実験ではない — 同時に静的な T/S/P のマスも外している(下の note とテスト名、
 *   status.md の 9.16 / 9.17 を参照)。ボードは経路がつながっていないマスを単独で外せないので、
 *   「発動率だけを変えた 2 点」は実機では作れない(pending 12 の実験設計ルール)
 * - パッシブ欄: −1.6〜+0.8(供給側の発動確率で重みづけした仮説)
 * - 合計: −0.8〜+2.3 pt、ユニットスコアは −0.4%〜+1.0%
 * 誤差の幅は 2026-09-09 の青ボードの実効値の訂正(フブキ 39・ぺこら 30)で広がった — モデルを変えたのではなく
 * **入力の実機値が変わった**ため。訂正でボード欄が実機と完全一致するケースも出た(9.12 / 9.16)。
 * 総合力は実機値をそのまま与える(総合力側の ±2 は power.test.ts で別に固定)。
 * 恒常マリン 1凸のパッシブ(3期生 2 人のスコアサポート、開花最大 12%)は 1凸の文言が未確認で、
 * bloom.ts の仮定倍率で割り戻した値になる(残っている仮定はこれと SP_RATE_SECONDS)。
 */

const holomenMap = buildHolomenMap(realHolomen);
const real = (id: string): Card => {
  const card = realCards.find((c) => c.id === id);
  if (!card) throw new Error(`${id} がない`);
  return card;
};

/** 実機の開花段階(2026-09-08 時点) */
const BLOOM: Record<string, number> = {
  "usada-pekora-01": 1,
  "inugami-korone-02": 2,
  "nekomata-okayu-02": 5,
  "shirakami-fubuki-02": 0,
  "ookami-mio-02": 1,
  "nekomata-okayu-01": 1,
  "sakura-miko-02": 1,
  "houshou-marine-01": 1,
  "fuwawa-abyssgard-02": 0,
};
/**
 * 実機の青ボードの表示値(発動率 UP %, 発動頻度 UP %)。ホロメン単位でカードに載る。コネクトマスの増幅込みの実効値。
 * 2026-09-09 のユーザー実機確認による訂正: フブキ水着 33 → **39**、ぺこら恒常 24 → **30**、みこ水着 37 → **36**、
 * フワワ水着 45(新規)。フブキは「39 / 8 の現在状態で 9.13 のユニットスコア・総合力・内訳を実機で再現できた」
 * ことが根拠で、そのあと頻度だけ 8 → 12 にして ボード 4.4 → 5.0 を観測している。
 * マリン恒常は 1 マスも未解放で 0 / 0、ミオ水着は発動率・頻度のマスが未解放で 0 / 0。
 * ころね水着だけは 33.6 のまま置く — 現在値は 39.6 だが、9.9 / ko f0 の観測時点がどちらだったか未確定(保留)。
 */
const BLUE: Record<string, [number, number]> = {
  "usada-pekora-01": [30, 8],
  "inugami-korone-02": [33.6, 4],
  "nekomata-okayu-02": [35.1, 12],
  "shirakami-fubuki-02": [39, 8],
  "ookami-mio-02": [0, 0],
  "nekomata-okayu-01": [35.1, 12],
  "sakura-miko-02": [36, 0],
  "houshou-marine-01": [0, 0],
  "fuwawa-abyssgard-02": [45, 0],
};

function member(id: string, blue?: [number, number]): Card {
  const bloom = BLOOM[id];
  const base = BLUE[id];
  if (bloom === undefined || !base) throw new Error(`${id} の開花・青ボードが未定義`);
  const b = cardAtBloom(real(id), bloom);
  const [r, f] = blue ?? base;
  return {
    ...b,
    naturalStats: b.stats,
    boardLive: { activeRatePercent: r, activeFrequencyPercent: f },
  };
}
const P = "usada-pekora-01";
const KO = "inugami-korone-02";
const OK2 = "nekomata-okayu-02";
const FB = "shirakami-fubuki-02";
const MI = "ookami-mio-02";
const OK1 = "nekomata-okayu-01";
const MK = "sakura-miko-02";
const MR = "houshou-marine-01";
const FW = "fuwawa-abyssgard-02";
const base = (): Card[] => [member(P), member(KO), member(OK2), member(FB), member(MI)];
const withBlue = (ms: Card[], id: string, r: number, f: number): Card[] =>
  ms.map((m) => (m.id === id ? member(id, [r, f]) : m));
const redSupport = (sup: number) => ({
  fixed: { performance: 0, technique: 0, sense: 0 },
  percent: { performance: 0, technique: 0, sense: 0 },
  scoreSupportPercent: sup,
});

interface GoldenCase {
  name: string;
  leader: Card;
  members: Card[];
  red: number;
  totalPower: number;
  /** そのケースで青ボード以外に何が変わっているか(単独変更でないケースの注記) */
  note?: string;
}
const cases: GoldenCase[] = [
  { name: "B", leader: real(OK2), members: base(), red: 0, totalPower: 256369 },
  { name: "A", leader: real("ookami-mio-01"), members: base(), red: 28.1, totalPower: 310209 },
  {
    name: "ok f8",
    leader: real(OK2),
    members: withBlue(base(), OK2, 35.1, 8),
    red: 0,
    totalPower: 256369,
  },
  {
    name: "ok f4",
    leader: real(OK2),
    members: withBlue(base(), OK2, 35.1, 4),
    red: 0,
    totalPower: 256369,
  },
  {
    name: "ok f0",
    leader: real(OK2),
    members: withBlue(base(), OK2, 35.1, 0),
    red: 0,
    totalPower: 256369,
  },
  {
    name: "ok r32",
    leader: real(OK2),
    members: withBlue(base(), OK2, 32.1, 8),
    red: 0,
    totalPower: 256369,
  },
  {
    name: "ok r25",
    leader: real(OK2),
    members: withBlue(base(), OK2, 25.4, 8),
    red: 0,
    totalPower: 255856,
  },
  {
    name: "ok r25 ko f0",
    leader: real(OK2),
    members: withBlue(withBlue(base(), OK2, 25.4, 8), KO, 33.6, 0),
    red: 0,
    totalPower: 255856,
  },
  {
    name: "ko f0",
    leader: real(OK2),
    members: withBlue(base(), KO, 33.6, 0),
    red: 0,
    totalPower: 256369,
  },
  {
    name: "9.7",
    leader: real(OK2),
    members: [member(OK2), member(MK), member(P), member(MR), member(FW)],
    red: 0,
    totalPower: 192817,
  },
  {
    name: "9.8",
    leader: real(OK2),
    members: [member(OK2), member(FB), member(P), member(MR), member(FW)],
    red: 0,
    totalPower: 247754,
  },
  {
    name: "9.9",
    leader: real(OK2),
    members: [member(OK2), member(FB), member(P), member(MR), member(KO)],
    red: 0,
    totalPower: 249921,
  },
  {
    name: "9.10",
    leader: real(OK2),
    members: [member(OK2), member(FB), member(P), member(MR), member(MI)],
    red: 0,
    totalPower: 241483,
  },
  {
    name: "9.11",
    leader: real(OK2),
    members: [member(OK2), member(FB), member(P), member(MR), member(MK)],
    red: 0,
    totalPower: 248082,
  },
  {
    name: "9.12",
    leader: real(OK2),
    members: [member(OK1), member(FB), member(P), member(MR), member(MK)],
    red: 0,
    totalPower: 237033,
  },
  {
    name: "9.13",
    leader: real(OK2),
    members: [member(OK1), member(MK), member(FB), member(MI), member(P)],
    red: 0,
    totalPower: 248568,
  },
  {
    name: "9.14",
    leader: real(OK2),
    members: [member(OK1), member(MK), member(FB, [39, 4]), member(MI), member(P)],
    red: 0,
    totalPower: 248568,
  },
  {
    name: "9.15",
    leader: real(OK2),
    members: [member(OK1), member(MK), member(FB, [39, 0]), member(MI), member(P)],
    red: 0,
    totalPower: 248568,
  },
  {
    name: "9.16",
    leader: real(OK2),
    members: [member(OK1), member(MK), member(FB, [15, 4]), member(MI), member(P)],
    red: 0,
    totalPower: 247366,
    // 発動率だけの実験ではない: 9.14 の状態から T +150 / T +5.0% / S +150 / S +5.0% のマスも外して発動率が −18pt になった。
    // 15.0% は当時のカード表示の記録。基準を 39 に訂正した後もそのまま置く(21 に読み替える根拠がない — pending 12)
    note: "発動率のみの変更ではない(静的な T/S のマスも同時に解除。総合力 248568 → 247366)",
  },
  {
    name: "9.17",
    leader: real(OK2),
    members: [member(OK1), member(MK), member(FB, [6, 0]), member(MI), member(P)],
    red: 0,
    totalPower: 246892,
    // 9.16 からさらに P +150 / P +5.0% のマスを外し、頻度 4 → 0・発動率 15 → 6 になった
    note: "発動率・頻度のみの変更ではない(静的な P のマスも同時に解除。総合力 247366 → 246892)",
  },
];

/** [アクティブ, ホロメンボード効果, パッシブ, SP, 合計, ユニットスコア]: 実機値 と モデルの値(小数 1 桁) */
type Row = [number, number, number, number, number, number];
const golden: [string, Row, Row][] = [
  ["B", [77.0, 13.2, 2.2, 46.0, 138.4, 1245189], [77.0, 13.6, 1.8, 46.0, 138.4, 1245189]],
  ["A", [77.0, 36.7, 3.1, 46.0, 162.8, 1660900], [77.0, 39.6, 1.8, 46.0, 164.4, 1671012]],
  ["ok f8", [77.0, 10.9, 1.9, 46.0, 135.8, 1231609], [77.0, 10.5, 1.8, 46.0, 135.3, 1228998]],
  ["ok f4", [77.0, 8.0, 1.5, 46.0, 132.5, 1214373], [77.0, 7.2, 1.8, 46.0, 132.0, 1211762]],
  ["ok f0", [77.0, 5.7, 1.1, 46.0, 129.8, 1200271], [77.0, 4.2, 1.9, 46.0, 129.1, 1196615]],
  ["ok r32", [77.0, 10.8, 1.9, 46.0, 135.7, 1231087], [77.0, 10.3, 1.8, 46.0, 135.1, 1227953]],
  ["ok r25", [77.0, 10.5, 2.0, 46.0, 135.5, 1227581], [77.0, 9.9, 1.8, 46.0, 134.7, 1223411]],
  ["ok r25 ko f0", [77.0, 7.4, 1.4, 46.0, 131.8, 1208294], [77.0, 6.5, 1.5, 46.0, 131.0, 1204124]],
  ["ko f0", [77.0, 9.9, 1.8, 46.0, 134.7, 1225864], [77.0, 10.8, 1.5, 46.0, 135.3, 1228998]],
  ["9.7", [76.7, 10.0, 1.1, 44.2, 132.0, 911375], [76.7, 12.2, 1.1, 44.3, 134.3, 920410]],
  ["9.8", [63.7, 13.9, 3.0, 38.6, 119.2, 1106433], [63.7, 13.8, 1.9, 39.2, 118.6, 1103404]],
  ["9.9", [68.8, 12.1, 2.9, 41.7, 125.5, 1148188], [68.8, 12.3, 2.3, 41.7, 125.1, 1146151]],
  ["9.10", [70.4, 14.3, 3.5, 42.1, 130.3, 1133037], [70.4, 17.0, 1.9, 41.9, 131.2, 1137465]],
  ["9.11", [75.6, 12.5, 2.4, 45.2, 135.7, 1191293], [75.6, 12.9, 1.9, 44.8, 135.2, 1188766]],
  ["9.12", [78.4, 4.5, 0.9, 44.0, 127.8, 1100085], [78.4, 4.5, 1.3, 43.9, 128.1, 1101534]],
  ["9.13", [77.0, 4.4, 0.5, 42.7, 124.6, 1137414], [77.0, 6.1, 0.4, 42.7, 126.2, 1145517]],
  ["9.14", [77.0, 4.7, 0.5, 42.7, 124.9, 1138934], [77.0, 5.9, 0.4, 42.7, 126.0, 1144504]],
  ["9.15", [77.0, 4.6, 0.5, 42.7, 124.8, 1138427], [77.0, 5.2, 0.4, 42.7, 125.3, 1140959]],
  ["9.16", [77.0, 4.3, 0.5, 42.7, 124.5, 1131410], [77.0, 4.3, 0.4, 42.7, 124.4, 1130906]],
  ["9.17", [77.0, 4.1, 0.5, 42.7, 124.3, 1128236], [77.0, 3.5, 0.5, 42.7, 123.7, 1125218]],
];
const LABELS = ["アクティブ", "ホロメンボード", "パッシブ", "SP", "合計", "ユニットスコア"];

describe("表示スコアボーナスのゴールデンケース(2026-09-08 実機 20 ケース)", () => {
  for (const c of cases) {
    const row = golden.find(([name]) => name === c.name);
    if (!row) throw new Error(`${c.name} のゴールデン行がない`);
    const [, observed, model] = row;
    const title = `${c.name}: 実機 ${observed.join(" / ")} → モデル ${model.join(" / ")}${c.note ? ` [${c.note}]` : ""}`;
    it(title, () => {
      const d = computeDisplayScoreBonus(
        { leader: c.leader, members: c.members },
        holomenMap,
        c.totalPower,
        {
          red: c.red ? redSupport(c.red) : null,
        },
      );
      const actual = [
        round1(d.active),
        round1(d.board),
        round1(d.passive),
        round1(d.special),
        round1(d.total),
        d.unitScore,
      ];
      const lines = LABELS.map(
        (label, i) =>
          `${label}: ${String(actual[i])} (実機 ${String(observed[i])}, 差 ${String(round1((actual[i] ?? 0) - (observed[i] ?? 0)))})`,
      );
      const expected = LABELS.map(
        (label, i) =>
          `${label}: ${String(model[i])} (実機 ${String(observed[i])}, 差 ${String(round1((model[i] ?? 0) - (observed[i] ?? 0)))})`,
      );
      expect(lines).toEqual(expected);
    });
  }

  it("アクティブ欄は 20 ケースすべて実機と完全一致する(permil 切り上げ。四捨五入だと 15/20)", () => {
    for (const [name, observed, model] of golden) {
      expect(model[0], name).toBe(observed[0]);
    }
  });

  it("SP 欄は 20 ケース中 15 が完全一致し、外れるのは発動率 UP を含む形成だけ(±0.6)", () => {
    const mismatched = golden
      .filter(([, observed, model]) => model[3] !== observed[3])
      .map(([name]) => name);
    // 9.7 / 9.8 / 9.10 / 9.11 / 9.12 は SP に「スキル発動率 +X%」があり、その項の式が未解明(pending 12)
    expect(mismatched).toEqual(["9.7", "9.8", "9.10", "9.11", "9.12"]);
    for (const [, observed, model] of golden) {
      expect(Math.abs((model[3] ?? 0) - (observed[3] ?? 0))).toBeLessThanOrEqual(0.65);
    }
  });

  it("ユニットスコア = ceil(総合力 × (1 + 表示ボーナス/100) × 2.03734) が実機 20 ケースすべてで成り立つ", () => {
    for (const [name, observed] of golden) {
      const c = cases.find((x) => x.name === name);
      if (!c) throw new Error(name);
      expect(displayUnitScore(c.totalPower, observed[4] ?? 0)).toBe(observed[5]);
    }
    expect(DISPLAY_UNIT_SCORE_FACTOR).toBe(2.03734);
  });

  it("20 ケースの実機との誤差が現在の範囲に収まる(悪化の検知。この値に合わせ込むためのテストではない)", () => {
    // 現状の最大誤差(2026-09-09、青ボードの実効値を訂正した後): アクティブ 0(完全一致) / ボード 2.9 /
    // パッシブ 1.6 / SP 0.6 / 合計 2.3 / ユニットスコア 0.99%。上限はそれをわずかに上回る値で、
    // 下げる(精度を上げる)ときはこの上限も下げる。ボード・合計の上限が前より緩いのは
    // **入力の実機値の訂正**によるもので、モデルの変更を通すために緩めたのではない
    const limits = {
      active: 0.001,
      board: 3.0,
      passive: 1.7,
      special: 0.65,
      total: 2.4,
      unitScoreRelative: 0.01,
    };
    const worst = {
      active: { value: 0, name: "" },
      board: { value: 0, name: "" },
      passive: { value: 0, name: "" },
      special: { value: 0, name: "" },
      total: { value: 0, name: "" },
      unitScoreRelative: { value: 0, name: "" },
    };
    for (const c of cases) {
      const row = golden.find(([name]) => name === c.name);
      if (!row) throw new Error(`${c.name} のゴールデン行がない`);
      const [, observed] = row;
      const d = computeDisplayScoreBonus(
        { leader: c.leader, members: c.members },
        holomenMap,
        c.totalPower,
        { red: c.red ? redSupport(c.red) : null },
      );
      const errors: Record<keyof typeof worst, number> = {
        active: Math.abs(round1(d.active) - (observed[0] ?? 0)),
        board: Math.abs(round1(d.board) - (observed[1] ?? 0)),
        passive: Math.abs(round1(d.passive) - (observed[2] ?? 0)),
        special: Math.abs(round1(d.special) - (observed[3] ?? 0)),
        total: Math.abs(round1(d.total) - (observed[4] ?? 0)),
        unitScoreRelative: Math.abs(d.unitScore / (observed[5] ?? 1) - 1),
      };
      for (const key of Object.keys(worst) as (keyof typeof worst)[]) {
        if (errors[key] > worst[key].value) worst[key] = { value: errors[key], name: c.name };
      }
    }
    for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
      expect(
        worst[key].value,
        `${key} の最大誤差 ${String(round1(worst[key].value * 1000) / 1000)}(${worst[key].name})が上限 ${String(limits[key])} を超えた`,
      ).toBeLessThanOrEqual(limits[key]);
    }
  });

  it("青ボードを変えてもアクティブ欄と SP 欄は変わらない(実機確定)", () => {
    const names = ["B", "ok f8", "ok f4", "ok f0", "ok r32", "ok r25", "ko f0"];
    const values = names.map((n) => {
      const c = cases.find((x) => x.name === n);
      if (!c) throw new Error(n);
      const d = computeDisplayScoreBonus(
        { leader: c.leader, members: c.members },
        holomenMap,
        c.totalPower,
      );
      return [d.active, d.special];
    });
    for (const [a, s] of values) {
      expect(a).toBeCloseTo(values[0]?.[0] ?? 0, 9);
      expect(s).toBeCloseTo(values[0]?.[1] ?? 0, 9);
    }
  });
});

/**
 * 青ボードの発動頻度だけを変えた 4 点(フブキ水着の発動率 39% 固定。0 / 4 / 8% は 9.15 / 9.14 / 9.13 と同じ状態で、
 * 12% は 2026-09-09 のユーザー実機追加)。メンバー 5 枚・リーダー・静的な P/T/S は 4 点とも同じなので、
 * 発動頻度の純粋比較として使える(実機はボード欄・パッシブ欄だけ共有。合計・ユニットスコアは未共有なので置かない)。
 * 実機のボード欄は 4.6(0) → 4.7(4) → 4.4(8) → 5.0(12) と単調でなく、周期 ÷ (1 + f/100) の現行式(単調増加)では
 * 説明できない。次の逆解析(score_up_permil_up_by_skill_tree に相当する欄の算出方法)のベースライン — pending 12
 */
describe("青ボードの発動頻度系列(フブキ水着。実機はボード欄・パッシブ欄のみ)", () => {
  /** [発動頻度 %, 実機ボード, 実機パッシブ, モデルのボード, モデルのパッシブ] */
  const series: [number, number, number, number, number][] = [
    [0, 4.6, 0.5, 5.2, 0.4],
    [4, 4.7, 0.5, 5.9, 0.4],
    [8, 4.4, 0.5, 6.1, 0.4],
    [12, 5.0, 0.5, 7.1, 0.4],
  ];
  for (const [frequency, obBoard, obPassive, board, passive] of series) {
    it(`頻度 ${String(frequency)}%: 実機 ボード ${String(obBoard)} / パッシブ ${String(obPassive)} → モデル ${String(board)} / ${String(passive)}`, () => {
      const members = [member(OK1), member(MK), member(FB, [39, frequency]), member(MI), member(P)];
      const d = computeDisplayScoreBonus({ leader: real(OK2), members }, holomenMap, 248568);
      expect([round1(d.board), round1(d.passive)]).toEqual([board, passive]);
    });
  }
});

/**
 * 黄ボードの楽曲スコアボーナスの適用位置(2026-09-11 ユーザー実機観測。観測値の全文は docs/ai/tmp/status.md「黄ボードの適用位置」)。
 *
 * 編成はリーダー おかゆ水着 5凸、メンバーに ころね水着 2凸・ミオ水着 1凸・フブキ水着 0凸・ぺこら恒常 1凸 + 1 枚。
 * 通常のユニット画面: 総合力 258,144(メンバーパラメータ 122,533 / 衣装 50,166 / ボード 50,440 / パッシブ 20,340 /
 * メモリー 7,359 / 強化 7,306)、スコアボーナス 139.5%(アクティブ 77.0 / ボード 14.2 / パッシブ 2.3 / SP 46.0)、
 * ユニットスコア 1,259,596。黄の % は実機の黄ボード画面でその曲の対象マスを押したときに出る値の転記(ツールの推定ではない)。
 *
 * この編成の青・緑ボードの解放状態は共有されていないので、カードからの end-to-end のゴールデンは作らない(捏造しない)。
 * ここで固定するのは**変換規則**: 総合力は不変、アクティブ / パッシブ / SP は不変、黄はボード欄に
 * 黄 × (100 + アクティブ + パッシブ + SP) として raw で入り、その後 0.1% 単位に量子化される
 */
describe("黄ボードの適用位置(2026-09-11 実機観測)", () => {
  const TOTAL_POWER = 258144;
  /** 黄 0% の表示 4 欄(実機) */
  const ACTIVE = 77.0;
  const PASSIVE = 2.3;
  const SPECIAL = 46.0;
  const BOARD = 14.2;
  /** [黄 %, 実機ユニットスコア]。黄の値は実機の黄ボード画面の表示の転記 */
  const observed: [number, number][] = [
    [0, 1259596], // ぺこらソロ
    [2.0, 1283789], // みこ + ころね
    [3.0, 1295359], // おかゆソロ
    [5.0, 1319026], // おかゆ + ころね
    [5.4, 1323759], // 1期生曲
    [7.4, 1347426], // AZKi + フブキ + マリン曲
    [9.86, 1376352], // フブキソロ(詳細: スコアボーナス 161.7 / ボード 36.4)
    [10.0, 1378455], // ゲマズ曲(詳細: 総合力 258,144 不変 / 162.1 / 77.0 / 36.8 / 2.3 / 46.0)
  ];
  /** 実機ユニットスコアから一意に逆算した表示合計(0.1 刻みで ceil 式を満たす値は各 1 つ)と、そこから出るボード欄 */
  const impliedBoard = (unitScore: number): number => {
    const totals: number[] = [];
    for (let permil = 1000; permil < 2000; permil++) {
      if (displayUnitScore(TOTAL_POWER, permil / 10) === unitScore) totals.push(permil / 10);
    }
    expect(totals).toHaveLength(1);
    return round1((totals[0] ?? 0) - (ACTIVE + PASSIVE + SPECIAL));
  };

  it("実機 8 点はすべて「総合力不変・アクティブ / パッシブ / SP 不変・ボード欄だけ増える」で説明できる", () => {
    // 黄 0% の通常画面と、黄 10% の詳細表示(総合力 258,144 / 77.0 / 36.8 / 2.3 / 46.0 / 162.1)
    expect(displayUnitScore(TOTAL_POWER, ACTIVE + BOARD + PASSIVE + SPECIAL)).toBe(1259596);
    expect(round1(ACTIVE + 36.8 + PASSIVE + SPECIAL)).toBe(162.1);
    expect(displayUnitScore(TOTAL_POWER, 162.1)).toBe(1378455);
    // 黄 9.86% の詳細表示(161.7 / ボード 36.4)
    expect(round1(ACTIVE + 36.4 + PASSIVE + SPECIAL)).toBe(161.7);
    expect(displayUnitScore(TOTAL_POWER, 161.7)).toBe(1376352);
    // 8 点のボード欄(表示値)は 14.2 / 18.8 / 21.0 / 25.5 / 26.4 / 30.9 / 36.4 / 36.8
    expect(observed.map(([, u]) => impliedBoard(u))).toEqual([
      14.2, 18.8, 21.0, 25.5, 26.4, 30.9, 36.4, 36.8,
    ]);
  });

  it("黄の増分は表示済みの 4 欄からではなく raw から計算しないと 8 点はそろわない", () => {
    // 表示値(77.0 / 14.2 / 2.3 / 46.0 → 100 + 125.3 = 225.3)から計算すると、四捨五入では 2.0% と 10% が
    // 実機と 0.1 ずれ(18.7 / 36.7)、切り上げでは 9.86% がずれる(36.5)
    const displayed = { active: ACTIVE, board: BOARD, passive: PASSIVE, special: SPECIAL };
    expect(round1(songBoardRaw(displayed, 0.02))).toBe(18.7);
    expect(round1(songBoardRaw(displayed, 0.1))).toBe(36.7);
    expect(Math.ceil(songBoardRaw(displayed, 0.0986) * 10 - 1e-9) / 10).toBe(36.5);
    // raw の区間(切り上げ前の値は表示値より小さい: アクティブ (76.9, 77.0]・パッシブ (2.2, 2.3]・SP (45.9, 46.0])の
    // 中には 8 点すべてを再現する値がある。下は代表値の一例で、モデル定数ではない(表示値から決まるのは区間だけ)
    const raw = { active: 76.95, board: 14.248, passive: 2.25, special: 45.95 };
    for (const [percent, unitScore] of observed) {
      const board = round1(songBoardRaw(raw, percent / 100));
      expect(board, `黄 ${String(percent)}%`).toBe(impliedBoard(unitScore));
      const total = round1(ACTIVE + board + PASSIVE + SPECIAL);
      expect(displayUnitScore(TOTAL_POWER, total), `黄 ${String(percent)}%`).toBe(unitScore);
    }
  });

  it("songBonus = 0 なら 20 ケースの結果は変わらない(省略と同じ)", () => {
    for (const c of cases) {
      const unit = { leader: c.leader, members: c.members };
      const red = c.red ? redSupport(c.red) : null;
      const plain = computeDisplayScoreBonus(unit, holomenMap, c.totalPower, { red });
      const zero = computeDisplayScoreBonus(unit, holomenMap, c.totalPower, { red, songBonus: 0 });
      expect(zero).toEqual(plain);
      expect(plain.songBonus).toBe(0);
    }
  });

  it("実カードの編成でも、黄はボード欄にだけ入り、ユニットスコアへ後掛けされない", () => {
    const c = cases[0];
    if (!c) throw new Error("ケース B がない");
    const unit = { leader: c.leader, members: c.members };
    const d0 = computeDisplayScoreBonus(unit, holomenMap, c.totalPower);
    for (const songBonus of [0.02, 0.0986, 0.1]) {
      const d = computeDisplayScoreBonus(unit, holomenMap, c.totalPower, { songBonus });
      expect(d.songBonus).toBe(songBonus);
      // アクティブ / パッシブ / SP は不変
      expect(d.active).toBe(d0.active);
      expect(d.passive).toBe(d0.passive);
      expect(d.special).toBe(d0.special);
      // ボード欄の増分 = 黄 × (100 + アクティブ + パッシブ + SP)(表示の丸め ±0.1 以内)
      const gain = songBonus * (100 + d0.active + d0.passive + d0.special);
      expect(Math.abs(d.board - d0.board - gain)).toBeLessThanOrEqual(0.1);
      // 合計 → ユニットスコアは従来の式のまま(黄は合計の中)
      expect(d.total).toBe(round1(d.active + d.board + d.passive + d.special));
      expect(d.unitScore).toBe(displayUnitScore(c.totalPower, d.total));
      // 後掛け(× (1 + 黄))とは一致しない — ボード欄の増分は (1 + 黄) 倍ではなく 黄 × (100 + 他 3 欄) だから
      expect(d.unitScore).not.toBe(Math.ceil(d0.unitScore * (1 + songBonus)));
    }
  });
});

/**
 * 赤の歌唱者条件と黄 10% の 4 象限(2026-09-11 ユーザー実機観測。観測値の全文は docs/ai/tmp/status.md「赤の歌唱者条件」)。
 *
 * 同じメンバー 5 枚(おかゆ水着 5凸・ころね水着 2凸・ミオ水着 1凸・フブキ水着 0凸・ぺこら恒常 1凸)、リーダー 水着ミオ
 * (赤: 通常スコアサポート 28.1%、歌唱者条件で +24% と P/T/S +10%)で、曲だけを変えた 4 点:
 *   A ぺこらソロ(赤 OFF・黄 0)/ B ミオソロ(赤 ON・黄 0)/ C ころねソロ(赤 OFF・黄 10%)/ D ゲーマーズ曲(赤 ON・黄 10%)。
 * 総合力は A = C = 308,959、B = D = 321,577(黄は総合力を変えず、赤の歌唱者条件は変える — power.test.ts)。
 *
 * この観測時点の青・緑ボードの解放状態は共有されていないので、実カードの end-to-end は「モデルの値」を並記した
 * known mismatch として固定し、実機で確定した**変換規則**は raw の中間値を明示したフィクスチャで固定する(捏造しない):
 * - 【確定】ユニットスコア = ceil(総合力 × (1 + 表示合計/100) × 2.03734) は 4 点とも 1 点単位で一致
 * - 【確定】黄 10% の増分は赤 OFF / ON の両方で ボード +22.7・合計 +22.7(アクティブ / パッシブ / SP・総合力は不変)。
 *   黄と赤歌唱者条件の表示上の効果は 0.1% の精度で加法分離し、交差する倍率は観測されない
 * - 【確定】赤の歌唱者条件(スコアサポート +24)はアクティブ / SP を変えず、ボード +20.9・パッシブ +0.2・合計 +21.1
 * - 【未解明】赤スコアサポートの合計への基準と、ボード欄 / パッシブ欄への配賦(現行モデルは全部ボード欄で、合計も大きめ)
 */
describe("赤の歌唱者条件と黄の 4 象限(2026-09-11 実機観測)", () => {
  /** [名前, 総合力, 実機 アクティブ / ボード / パッシブ / SP / 合計 / ユニットスコア, 赤スコアサポート %, 黄] */
  const quadrants: [string, number, Row, number, number][] = [
    ["A ぺこらソロ(赤 OFF・黄 0)", 308959, [77.0, 38.2, 3.1, 46.0, 164.3, 1663649], 28.1, 0],
    ["B ミオソロ(赤 ON・黄 0)", 321577, [77.0, 59.1, 3.3, 46.0, 185.4, 1869832], 52.1, 0],
    ["C ころねソロ(赤 OFF・黄 10%)", 308959, [77.0, 60.9, 3.1, 46.0, 187.0, 1806535], 28.1, 0.1],
    ["D ゲーマーズ曲(赤 ON・黄 10%)", 321577, [77.0, 81.8, 3.3, 46.0, 208.1, 2018554], 52.1, 0.1],
  ];
  /** 実機表示順のメンバー(青ボードは 2026-09-08 の実効値。観測時点の値は未共有) */
  const members2 = (): Card[] => [member(OK2), member(KO), member(MI), member(FB), member(P)];

  it("ユニットスコア = ceil(総合力 × (1 + 表示合計/100) × 2.03734) が 4 点とも成り立ち、合計は 4 欄の和", () => {
    for (const [name, totalPower, ob] of quadrants) {
      expect(round1((ob[0] ?? 0) + (ob[1] ?? 0) + (ob[2] ?? 0) + (ob[3] ?? 0)), name).toBe(ob[4]);
      expect(displayUnitScore(totalPower, ob[4] ?? 0), name).toBe(ob[5]);
    }
  });

  it("黄 10% の増分は赤 OFF / ON の両方で ボード +22.7・合計 +22.7 で、他 3 欄は不変(加法分離)", () => {
    const [a, b, c, d] = quadrants.map((q) => q[2]);
    if (!a || !b || !c || !d) throw new Error("4 象限がない");
    for (const [off, on] of [
      [a, c],
      [b, d],
    ] as const) {
      expect(round1((on[1] ?? 0) - (off[1] ?? 0))).toBe(22.7);
      expect(round1((on[4] ?? 0) - (off[4] ?? 0))).toBe(22.7);
      expect(on[0]).toBe(off[0]);
      expect(on[2]).toBe(off[2]);
      expect(on[3]).toBe(off[3]);
    }
    // 赤の歌唱者条件(スコアサポート +24)の増分は黄 0 / 10% の両方で ボード +20.9・パッシブ +0.2・合計 +21.1
    for (const [off, on] of [
      [a, b],
      [c, d],
    ] as const) {
      expect(round1((on[1] ?? 0) - (off[1] ?? 0))).toBe(20.9);
      expect(round1((on[2] ?? 0) - (off[2] ?? 0))).toBe(0.2);
      expect(round1((on[4] ?? 0) - (off[4] ?? 0))).toBe(21.1);
      expect(on[0]).toBe(off[0]);
      expect(on[3]).toBe(off[3]);
    }
  });

  it("黄の増分 +22.7 は raw の songBoardRaw で再現でき、raw の (100 + アクティブ + パッシブ + SP) は 226.0 を超える", () => {
    // 表示値(77.0 / 3.1 / 46.0 → 226.1)からの 10% は 22.61。表示で +22.7 になるには黄 0 のボード欄の raw が丸め境界の
    // 直前にあり、かつ 100 + アクティブ + パッシブ + SP の raw が 226.0 を超えていなければならない(アクティブ (76.9, 77.0]・
    // SP (45.9, 46.0] の切り上げ区間と、パッシブ欄が 3.1 に丸まる区間の中に、そうなる raw がある)。下は代表値の一例で、
    // モデル定数ではない。ボード欄の量子化規則(切り上げ / 四捨五入)はこの観測でもどちらとも整合し、決まらない
    const rawA = { active: 76.995, board: 38.245, passive: 3.1, special: 45.995 };
    const rawB = { active: 76.995, board: 59.13, passive: 3.3, special: 45.995 };
    for (const [raw, offBoard, onBoard] of [
      [rawA, 38.2, 60.9],
      [rawB, 59.1, 81.8],
    ] as const) {
      expect(round1(raw.board)).toBe(offBoard);
      expect(round1(songBoardRaw(raw, 0.1))).toBe(onBoard);
      expect(100 + raw.active + raw.passive + raw.special).toBeGreaterThan(226.0);
    }
    // 表示済みの値から計算すると A → C は 38.2 + 22.61 = 60.81 → 60.8 で実機(60.9)に届かない
    expect(
      round1(songBoardRaw({ active: 77.0, board: 38.2, passive: 3.1, special: 46.0 }, 0.1)),
    ).toBe(60.8);
  });

  /** 実カードでのモデルの値 [アクティブ, ボード, パッシブ, SP, 合計, ユニットスコア](青ボードは 2026-09-08 の実効値) */
  const modelRows: Row[] = [
    [77.0, 39.6, 1.8, 46.0, 164.4, 1664278],
    [77.0, 61.7, 1.8, 46.0, 186.5, 1877039],
    [77.0, 62.0, 1.8, 46.0, 186.8, 1805276],
    [77.0, 84.2, 1.8, 46.0, 209.0, 2024450],
  ];

  quadrants.forEach(([name, totalPower, observed, redSupportPercent, songBonus], k) => {
    const model = modelRows[k];
    if (!model) throw new Error(name);
    it(`${name}: 実機 ${observed.join(" / ")} → モデル ${model.join(" / ")}(赤スコアサポートの配賦は未解明の既知のずれ)`, () => {
      const d = computeDisplayScoreBonus(
        { leader: real(MI), members: members2() },
        holomenMap,
        totalPower,
        { red: redSupport(redSupportPercent), songBonus },
      );
      const actual = [
        round1(d.active),
        round1(d.board),
        round1(d.passive),
        round1(d.special),
        round1(d.total),
        d.unitScore,
      ];
      const lines = LABELS.map(
        (label, i) =>
          `${label}: ${String(actual[i])} (実機 ${String(observed[i])}, 差 ${String(round1((actual[i] ?? 0) - (observed[i] ?? 0)))})`,
      );
      const expected = LABELS.map(
        (label, i) =>
          `${label}: ${String(model[i])} (実機 ${String(observed[i])}, 差 ${String(round1((model[i] ?? 0) - (observed[i] ?? 0)))})`,
      );
      expect(lines).toEqual(expected);
      // アクティブ欄・SP 欄は 4 点とも実機と完全一致(赤・黄で変わらない)
      expect(actual[0]).toBe(observed[0]);
      expect(actual[3]).toBe(observed[3]);
    });
  });

  it("現行モデルの赤スコアサポートの増分(+24 → 合計 +22.1・全部ボード欄)は実機(+21.1、ボード +20.9 / パッシブ +0.2)より大きく、配賦も違う", () => {
    const unit = { leader: real(MI), members: members2() };
    const a = computeDisplayScoreBonus(unit, holomenMap, 308959, { red: redSupport(28.1) });
    const b = computeDisplayScoreBonus(unit, holomenMap, 321577, { red: redSupport(52.1) });
    // モデルの増分(値が変われば式が変わったと分かる。実機に合わせるための補正は入れない)
    expect(round1(b.board - a.board)).toBe(22.1);
    expect(round1(b.passive - a.passive)).toBe(0);
    expect(round1(b.total - a.total)).toBe(22.1);
    // 実機との差: 合計 +1.0、ボード +1.2、パッシブ −0.2(pending 12)
    expect(round1(b.total - a.total - 21.1)).toBe(1.0);
  });

  it("黄と赤の歌唱者条件は二重に掛からない: モデルでも D − B と C − A の差は表示の丸め以内", () => {
    const unit = { leader: real(MI), members: members2() };
    const a = computeDisplayScoreBonus(unit, holomenMap, 308959, { red: redSupport(28.1) });
    const b = computeDisplayScoreBonus(unit, holomenMap, 321577, { red: redSupport(52.1) });
    const c = computeDisplayScoreBonus(unit, holomenMap, 308959, {
      red: redSupport(28.1),
      songBonus: 0.1,
    });
    const d = computeDisplayScoreBonus(unit, holomenMap, 321577, {
      red: redSupport(52.1),
      songBonus: 0.1,
    });
    // 黄はアクティブ / パッシブ / SP を変えない(赤 OFF / ON とも)
    for (const [off, on] of [
      [a, c],
      [b, d],
    ] as const) {
      expect(on.active).toBe(off.active);
      expect(on.passive).toBe(off.passive);
      expect(on.special).toBe(off.special);
      expect(on.songBonus).toBe(0.1);
    }
    // 黄の増分は 黄 × (100 + アクティブ + パッシブ + SP) で、赤スコアサポートには掛からない(赤 OFF / ON で同じ)
    expect(round1(Math.abs(d.board - b.board - (c.board - a.board)))).toBeLessThanOrEqual(0.1);
    // 黄はユニットスコアへ後掛けされない
    expect(c.unitScore).not.toBe(Math.ceil(a.unitScore * 1.1));
    expect(d.unitScore).not.toBe(Math.ceil(b.unitScore * 1.1));
  });
});

describe("スコアボーナス欄の permil 整数化", () => {
  it("0.1% 単位の切り上げで permil 整数にする", () => {
    expect(toScoreBonusPermil(38.018935)).toBe(381);
    expect(toScoreBonusPermil(11.627457)).toBe(117);
    expect(toScoreBonusPermil(76.613085)).toBe(767);
    expect(toScoreBonusPermil(0)).toBe(0);
  });

  it("ちょうど 0.1% の倍数は切り上げない(2 進小数の誤差でずり上がらない)", () => {
    expect(toScoreBonusPermil(77)).toBe(770);
    expect(toScoreBonusPermil(42.7)).toBe(427);
    expect(toScoreBonusPermil(0.1 + 0.2)).toBe(3);
  });
});

describe("ACTIVE_PROBABILITY", () => {
  it("低 / 中 / 高 = 0.37 / 0.46 / 0.55(外部のマスターデータと同じ値。unknown は未整備カードのフォールバック)", () => {
    expect(ACTIVE_PROBABILITY.low).toBe(0.37);
    expect(ACTIVE_PROBABILITY.medium).toBe(0.46);
    expect(ACTIVE_PROBABILITY.high).toBe(0.55);
    expect(ACTIVE_PROBABILITY.unknown).toBe(ACTIVE_PROBABILITY.medium);
  });
});

describe("activeSeconds", () => {
  it("k × 周期 ≤ s < k × 周期 + 効果時間(k ≥ 1)の秒に印を付け、200 秒で打ち切る", () => {
    const on = activeSeconds(28, 10, 200);
    expect(on[27]).toBe(0);
    expect(on[28]).toBe(1);
    expect(on[37]).toBe(1);
    expect(on[38]).toBe(0);
    // 7 回目の発動は 196 秒から 200 秒までの 5 秒だけ
    expect(on[196]).toBe(1);
    expect(on[200]).toBe(1);
    let count = 0;
    for (let s = 1; s <= 200; s++) count += on[s] ?? 0;
    expect(count).toBe(65);
    // 頻度 +12% → 周期 25 秒: 8 回目は 200 秒ちょうどから
    const blue = activeSeconds(28 / 1.12, 10, 200);
    expect(blue[25]).toBe(1);
    expect(blue[200]).toBe(1);
  });
});
