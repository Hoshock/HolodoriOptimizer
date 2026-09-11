import { describe, expect, it } from "vite-plus/test";

import { songById } from "./index";
import {
  isRedMirrored,
  RED_AREA_LABELS,
  RED_BOARD_AREAS,
  isRedSinger,
  RED_BOARD_CONNECT,
  RED_BOARD_EDGES,
  RED_BOARD_NODE_IDS,
  RED_BOARD_NODES,
  redBoardEffects,
  redEffectLabel,
  redKnownNodeIds,
  redNodeGlyph,
  redReachableNodes,
  redToggleNode,
  redUnitEffects,
  redUnitEffectsByHolomen,
} from "./redBoard";
import type { RedBoardArea } from "./redBoard";
import type { Song } from "./types";

const has = (a: string, b: string) =>
  RED_BOARD_EDGES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const coordKey = (x: number, y: number) => `${String(x)},${String(y)}`;
const byArea = (area: RedBoardArea) =>
  RED_BOARD_NODES.filter((n) => n.area === area).map((n) => n.id);

describe("赤ホロメンボードの定義", () => {
  it("63 マスで ID・座標が重複せず、下 9 / 上 13 / ライフ 20 / ステータス 21 に分かれる", () => {
    expect(RED_BOARD_NODES).toHaveLength(63);
    expect(new Set(RED_BOARD_NODE_IDS).size).toBe(63);
    const coords = new Set(RED_BOARD_NODES.map((n) => coordKey(n.x, n.y)));
    expect(coords.size).toBe(63);
    expect(coords.has("0,0")).toBe(false);
    expect(coords.has(coordKey(RED_BOARD_CONNECT.x, RED_BOARD_CONNECT.y))).toBe(false);
    expect(byArea("lower")).toHaveLength(9);
    expect(byArea("upper")).toHaveLength(13);
    expect(byArea("life")).toHaveLength(20);
    expect(byArea("stats")).toHaveLength(21);
    expect(RED_BOARD_AREAS).toEqual(["lower", "upper", "life", "stats"]);
    expect(RED_BOARD_AREAS.map((a) => RED_AREA_LABELS[a])).toEqual([
      "下",
      "上",
      "ライフ",
      "ステータス",
    ]);
    // 下エリアは幹(x = -1〜1、y = 1〜8)、上エリアは最上部の格子(x = -2〜2、y = 9〜14)、ライフ系は左(x < 0)、ステータス系は右(x > 0)
    expect(
      RED_BOARD_NODES.filter((n) => n.area === "lower").every(
        (n) => Math.abs(n.x) <= 1 && n.y >= 1 && n.y <= 8,
      ),
    ).toBe(true);
    expect(
      RED_BOARD_NODES.filter((n) => n.area === "upper").every(
        (n) => Math.abs(n.x) <= 2 && n.y >= 9 && n.y <= 14,
      ),
    ).toBe(true);
    expect(
      RED_BOARD_NODES.filter((n) => n.area === "life").every((n) => n.x < 0 && n.x >= -6),
    ).toBe(true);
    expect(
      RED_BOARD_NODES.filter((n) => n.area === "stats").every((n) => n.x > 0 && n.x <= 9),
    ).toBe(true);
    expect(RED_BOARD_CONNECT).toEqual({ id: "C", x: 0, y: 7 });
  });

  it("接続は 4 近傍で縦横は全部繋がり(74 本)、斜めは繋がない。中心から全マスに連結", () => {
    expect(RED_BOARD_EDGES).toHaveLength(74);
    // 幹と C、C の真上は下エリアの R-021(コネクトマスではない — 2026-09-08 ユーザー指摘)
    expect(has("R", "R-001")).toBe(true);
    expect(has("R-008", "C")).toBe(true);
    expect(has("C", "R-021")).toBe(true);
    expect(has("C", "R-009")).toBe(true);
    expect(has("C", "R-019")).toBe(true);
    expect(has("R-021", "R-022")).toBe(true);
    expect(has("R-021", "R-032")).toBe(true);
    // ライフ系の上下 6 組と縦の枝
    for (const [a, b] of [
      ["R-009", "R-022"],
      ["R-010", "R-023"],
      ["R-011", "R-024"],
      ["R-012", "R-025"],
      ["R-013", "R-026"],
      ["R-014", "R-027"],
      ["R-011", "R-015"],
      ["R-015", "R-016"],
      ["R-024", "R-028"],
      ["R-028", "R-029"],
    ] as const)
      expect(has(a, b)).toBe(true);
    // ステータス系の縦の線
    for (const [a, b] of [
      ["R-019", "R-032"],
      ["R-020", "R-033"],
      ["R-035", "R-040"],
      ["R-040", "R-041"],
      ["R-035", "R-045"],
      ["R-045", "R-046"],
      ["R-039", "R-063"],
    ] as const)
      expect(has(a, b)).toBe(true);
    // 最上部の格子
    for (const [a, b] of [
      ["R-060", "R-056"],
      ["R-061", "R-058"],
      ["R-057", "R-056"],
      ["R-056", "R-055"],
      ["R-055", "R-058"],
      ["R-058", "R-059"],
      ["R-056", "R-053"],
      ["R-055", "R-052"],
      ["R-058", "R-054"],
      ["R-053", "R-052"],
      ["R-052", "R-054"],
      ["R-052", "R-051"],
    ] as const)
      expect(has(a, b)).toBe(true);
    // 斜めは繋がない
    expect(has("R-030", "R-025")).toBe(false);
    expect(has("R-017", "R-012")).toBe(false);
    expect(has("R-003", "R-001")).toBe(false);
    expect(redReachableNodes(new Set(RED_BOARD_NODE_IDS)).size).toBe(63);
  });

  it("大きく描くマスは 18 個(上 6 / ライフ 5 / ステータス 7)", () => {
    const large = RED_BOARD_NODES.filter((n) => n.large).map((n) => n.id);
    expect(large).toEqual([
      "R-002",
      "R-014",
      "R-018",
      "R-024",
      "R-027",
      "R-031",
      "R-034",
      "R-039",
      "R-043",
      "R-044",
      "R-048",
      "R-049",
      "R-051",
      "R-055",
      "R-057",
      "R-059",
      "R-062",
      "R-063",
    ]);
  });

  it("全取得の合計: 全パラ +680 / P・T・S 各 +500、全パラ +6% / P・T・S 各 +7%、歌唱者条件 各 +10%、支 +20%(+10%)、ライフ +300、報酬 各 +55%", () => {
    const e = redBoardEffects(RED_BOARD_NODE_IDS);
    expect(e.allParams).toBe(680);
    expect(e.params).toEqual({ performance: 500, technique: 500, sense: 500 });
    expect(e.allPercent).toBe(6);
    expect(e.percents).toEqual({ performance: 7, technique: 7, sense: 7 });
    expect(e.singerPercents).toEqual({ performance: 10, technique: 10, sense: 10 });
    expect(e.scoreSupportPercent).toBe(20);
    expect(e.singerScoreSupportPercent).toBe(10);
    expect(e.life).toBe(300);
    expect(e.rewards).toEqual({ memberExp: 55, gold: 55 });
    expect(e.judgement).toBe("upgraded");
    expect(e.lifeRecovery).toBe(true);
  });

  it("エリア別の合計(下 / 上 / ライフ / ステータス)", () => {
    // 下(幹)は固定値と歌唱者条件のスコアサポートだけ、上(格子)は割合・スコアサポート・報酬だけ
    const lower = redBoardEffects(byArea("lower"));
    expect(lower.allParams).toBe(200);
    expect(lower.params).toEqual({ performance: 100, technique: 200, sense: 100 });
    expect(lower.allPercent).toBe(0);
    expect(lower.scoreSupportPercent).toBe(0);
    expect(lower.singerScoreSupportPercent).toBe(10);
    const upper = redBoardEffects(byArea("upper"));
    expect(upper.allParams).toBe(0);
    expect(upper.params).toEqual({ performance: 0, technique: 0, sense: 0 });
    expect(upper.allPercent).toBe(6);
    expect(upper.percents).toEqual({ performance: 3, technique: 3, sense: 3 });
    expect(upper.scoreSupportPercent).toBe(14);
    expect(upper.singerScoreSupportPercent).toBe(0);
    expect(upper.rewards).toEqual({ memberExp: 20, gold: 20 });
    const life = redBoardEffects(byArea("life"));
    expect(life.allParams).toBe(100);
    expect(life.params).toEqual({ performance: 0, technique: 0, sense: 100 });
    expect(life.life).toBe(300);
    expect(life.rewards).toEqual({ memberExp: 35, gold: 35 });
    expect(life.judgement).toBe("upgraded");
    expect(life.lifeRecovery).toBe(true);
    const stats = redBoardEffects(byArea("stats"));
    expect(stats.allParams).toBe(380);
    expect(stats.params).toEqual({ performance: 400, technique: 300, sense: 300 });
    expect(stats.percents).toEqual({ performance: 4, technique: 4, sense: 4 });
    expect(stats.singerPercents).toEqual({ performance: 10, technique: 10, sense: 10 });
    expect(stats.scoreSupportPercent).toBe(6);
  });

  it("判定強化は R-024 で習得・R-031 で強化(R-031 は R-024 を通る)", () => {
    expect(redBoardEffects(["R-024"]).judgement).toBe("learned");
    expect(redBoardEffects(["R-024", "R-031"]).judgement).toBe("upgraded");
    expect(redBoardEffects([]).judgement).toBe("none");
    const unlocked = redToggleNode(new Set(), "R-031");
    expect(unlocked.has("R-024")).toBe(true);
    expect(unlocked.has("R-028")).toBe(true);
  });

  it("左右はライフ系の側(lifeSide)で決まり、青の左右とは別", () => {
    expect(isRedMirrored("tokino-sora")).toBe(false); // lifeSide left
    expect(isRedMirrored("shirakami-fubuki")).toBe(true); // lifeSide right
    expect(isRedMirrored("akai-haato")).toBe(true); // blueSide left・lifeSide right
  });
});

describe("文言と記号", () => {
  it("説明文はゲーム内の文言(歌唱者条件の書き出し・割合は小数第 1 位・スキルは説明文つき)", () => {
    const label = (id: string) => {
      const node = RED_BOARD_NODES.find((n) => n.id === id);
      return node ? redEffectLabel(node.effect) : "";
    };
    expect(label("R-001")).toBe("全員の全パラメータ +50");
    expect(label("R-002")).toBe(
      "このホロメンが楽曲歌唱者に含まれる時、全員のスコアサポート効果 +10.0%",
    );
    expect(label("R-049")).toBe("全員のスコアサポート効果 +4.0%");
    expect(label("R-050")).toBe("全員の全パラメータ +1.0%");
    expect(label("R-057")).toBe("ライブでのホロゴールド獲得量 +20.0%");
    expect(label("R-011")).toBe("ライブでの獲得メンバー Exp +5.0%");
    expect(label("R-023")).toBe("ライフ +50");
    expect(label("R-024")).toBe(
      "判定強化のホロメンスキル習得（20 秒毎に低確率で 7 秒間 GOOD 以上が PERFECT になる）",
    );
    expect(label("R-031")).toBe(
      "判定強化のホロメンスキル強化（20 秒毎に中確率で 10 秒間 GOOD 以上が PERFECT になる）",
    );
    expect(label("R-027")).toBe(
      "ライフ回復のホロメンスキル習得（20 秒毎に中確率でライフが 100 回復）",
    );
    expect(label("R-044")).toBe("このホロメンが楽曲歌唱者に含まれる時、全員のテクニック +10.0%");
  });

  it("記号は A / P / T / S / 支 / 命 / 判 / 回 / 経 / 金", () => {
    const glyphs = RED_BOARD_NODES.map((n) => redNodeGlyph(n.effect)).join("");
    expect(glyphs).toBe(
      "A支SPTAAA" +
        "SA経経経経金金金金" +
        "PA" +
        "T" +
        "A命判命命回命命命判" +
        "支A支ASASSPAPPTTATT" +
        "支A支T支AAS金P経A支" +
        "SP",
    );
  });
});

describe("解放・解除", () => {
  it("未解放のマスをタップすると中心からの経路(コネクトは通路)もまとめて解放する", () => {
    const unlocked = redToggleNode(new Set(), "R-063");
    // 幹 6 マス + C から y = 8 の列へ入る 2 マス(R-021 → R-032 / R-019 → R-032 / R-019 → R-020 のどれか。長さは同じ)+ R-033〜R-039 + R-063
    expect(unlocked.size).toBe(16);
    for (const id of [
      "R-001",
      "R-002",
      "R-005",
      "R-006",
      "R-007",
      "R-008",
      "R-033",
      "R-034",
      "R-035",
      "R-036",
      "R-037",
      "R-038",
      "R-039",
      "R-063",
    ])
      expect(unlocked.has(id)).toBe(true);
    expect(unlocked.has("R-003")).toBe(false);
    expect(redReachableNodes(unlocked).size).toBe(16);
    expect(unlocked.has("C")).toBe(false);
  });

  it("解放済みを解除すると、切り離される先も解除する", () => {
    const all = new Set(RED_BOARD_NODE_IDS);
    const next = redToggleNode(all, "R-021");
    // R-021 を外すと上の格子が切れる。ライフ系・ステータス系の y = 8 の列は y = 7 の列から縦に届くので残る
    expect(next.has("R-021")).toBe(false);
    expect(next.has("R-049")).toBe(false);
    expect(next.has("R-061")).toBe(false);
    expect(next.has("R-022")).toBe(true);
    expect(next.has("R-032")).toBe(true);
    expect(next.size).toBe(63 - 14);
    // 幹の R-005 を外すと C の先(上・ライフ系・ステータス系の全部)が切れる
    const cut = redToggleNode(all, "R-005");
    expect([...cut].sort()).toEqual(["R-001", "R-002", "R-003", "R-004"]);
  });

  it("未知の ID は落とす", () => {
    expect(redKnownNodeIds(["R-001", "B-001", "R-999"])).toEqual(["R-001"]);
  });
});

describe("試算に使う効果(リーダーのホロメンの赤がメンバー 5 人へ)", () => {
  it("固定値は全パラ + 個別、割合は全パラ + 個別 + 歌唱者条件(成立時のみ)", () => {
    const e = redBoardEffects(RED_BOARD_NODE_IDS);
    expect(redUnitEffects(e, false)).toEqual({
      fixed: { performance: 1180, technique: 1180, sense: 1180 },
      percent: { performance: 13, technique: 13, sense: 13 },
      scoreSupportPercent: 20,
    });
    expect(redUnitEffects(e, true)?.scoreSupportPercent).toBe(30);
    expect(redUnitEffects(e, true)?.percent).toEqual({ performance: 23, technique: 23, sense: 23 });
    expect(redUnitEffects(redBoardEffects(["R-023"]), true)).toBeNull(); // ライフだけでは試算に効かない
  });

  it("歌唱者条件はその曲の歌唱者に含まれるかで判定し、全体楽曲・歌唱者未確認の曲は成立しない", () => {
    const solo: Song = {
      id: "t-solo",
      title: "t",
      artists: ["ときのそら"],
      kind: "original",
      durationSeconds: 120,
      charts: {},
    };
    const all: Song = { ...solo, id: "t-all", artists: ["hololive IDOL PROJECT"] };
    expect(isRedSinger("tokino-sora", solo)).toBe(true);
    expect(isRedSinger("shirakami-fubuki", solo)).toBe(false);
    expect(isRedSinger("tokino-sora", all)).toBe(false);
    const nakamauta = songById.get("nakamauta");
    if (nakamauta) expect(isRedSinger("hoshimachi-suisei", nakamauta)).toBe(true);
    const boards = { "tokino-sora": ["R-001", "R-044"], "akai-haato": ["R-023"] };
    expect(redUnitEffectsByHolomen(boards, solo)).toEqual({
      "tokino-sora": {
        fixed: { performance: 50, technique: 50, sense: 50 },
        percent: { performance: 0, technique: 10, sense: 0 },
        scoreSupportPercent: 0,
      },
    });
    expect(redUnitEffectsByHolomen(boards, null)["tokino-sora"]?.percent.technique).toBe(0);
  });
});
