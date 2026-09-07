import { describe, expect, it } from "vite-plus/test";

import { BLUE_BOARD_EDGES, BLUE_BOARD_NODES } from "./blueBoard";
import { songById } from "./index";
import {
  accountYellowEffects,
  isYellowLeft,
  YELLOW_BOARD_CONNECT,
  YELLOW_BOARD_EDGES,
  YELLOW_BOARD_NODE_IDS,
  YELLOW_BOARD_NODES,
  yellowBoardEffects,
  yellowEffectLabel,
  yellowKnownNodeIds,
  yellowNodeGlyph,
  yellowReachableNodes,
  yellowSongBonusPermil,
  yellowToggleNode,
} from "./yellowBoard";
import type { Song } from "./types";

const has = (a: string, b: string) =>
  YELLOW_BOARD_EDGES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const coordKey = (x: number, y: number) => `${String(x)},${String(y)}`;

describe("黄ホロメンボードの定義", () => {
  it("31 マスで ID・座標が重複せず、右型は x = 1〜10・y = -3〜3", () => {
    expect(YELLOW_BOARD_NODES).toHaveLength(31);
    expect(new Set(YELLOW_BOARD_NODE_IDS).size).toBe(31);
    const coords = new Set(YELLOW_BOARD_NODES.map((n) => coordKey(n.x, n.y)));
    expect(coords.size).toBe(31);
    expect(coords.has("0,0")).toBe(false);
    expect(coords.has(coordKey(YELLOW_BOARD_CONNECT.x, YELLOW_BOARD_CONNECT.y))).toBe(false);
    expect(YELLOW_BOARD_NODES.every((n) => n.x >= 1 && n.x <= 10 && Math.abs(n.y) <= 3)).toBe(true);
  });

  it("形は青ボードの左右反転と同じ(2026-09-08 実機確認)。コネクトは中心から 7 マス目", () => {
    const blueMirrored = new Set(BLUE_BOARD_NODES.map((n) => coordKey(-n.x, n.y)));
    const yellow = new Set(YELLOW_BOARD_NODES.map((n) => coordKey(n.x, n.y)));
    expect(yellow).toEqual(blueMirrored);
    expect(YELLOW_BOARD_CONNECT).toEqual({ id: "C", x: 7, y: 0 });
    expect(YELLOW_BOARD_EDGES).toHaveLength(BLUE_BOARD_EDGES.length);
  });

  it("接続は 4 近傍で縦横は全部繋がり、斜めは繋がない。中心から全マスに連結", () => {
    expect(has("R", "Y-001")).toBe(true);
    expect(has("Y-008", "C")).toBe(true);
    expect(has("C", "Y-023")).toBe(true);
    expect(has("Y-009", "Y-024")).toBe(true);
    expect(has("Y-016", "Y-025")).toBe(true);
    expect(has("Y-027", "Y-028")).toBe(true);
    expect(has("Y-028", "Y-029")).toBe(true);
    expect(has("Y-027", "Y-030")).toBe(true);
    expect(has("Y-030", "Y-031")).toBe(true);
    expect(has("Y-015", "Y-029")).toBe(false);
    expect(has("Y-022", "Y-031")).toBe(false);
    expect(yellowReachableNodes(new Set(YELLOW_BOARD_NODE_IDS)).size).toBe(31);
  });

  it("大きく描くマスは Y-008 / Y-013 / Y-015 / Y-020 / Y-022 / Y-029 / Y-031", () => {
    expect(YELLOW_BOARD_NODES.filter((n) => n.large).map((n) => n.id)).toEqual([
      "Y-008",
      "Y-013",
      "Y-015",
      "Y-020",
      "Y-022",
      "Y-029",
      "Y-031",
    ]);
  });

  it("全取得の合計はソロ +7.5% / ユニット +4.0% / 全体 +0.7%、ホロワーク 3 種 各 +20%", () => {
    const e = yellowBoardEffects(YELLOW_BOARD_NODE_IDS);
    expect(e.song).toEqual({ solo: 75, unit: 40, all: 7 });
    expect(e.work).toEqual({ lessonPt: 200, cube: 200, trainingItem: 200 });
  });

  it("左右は青の反対(青が右のホロメンは黄が左型)", () => {
    expect(isYellowLeft("houshou-marine")).toBe(false);
    expect(isYellowLeft("nekomata-okayu")).toBe(true);
    expect(isYellowLeft("unknown")).toBe(false);
  });
});

describe("文言と記号", () => {
  const soloNode = YELLOW_BOARD_NODES.find((n) => n.id === "Y-029");
  const workNode = YELLOW_BOARD_NODES.find((n) => n.id === "Y-031");
  if (!soloNode || !workNode) throw new Error("node missing");

  it("ソロ系はフワワ・モココだけ「FUWAMOCO のみの楽曲」が対象(2026-09-08 実機確認)", () => {
    expect(yellowEffectLabel("houshou-marine", soloNode.effect)).toBe(
      "本人のソロ楽曲のスコアボーナス +2.0%",
    );
    expect(yellowEffectLabel("fuwawa-abyssgard", soloNode.effect)).toBe(
      "FUWAMOCO のみの楽曲のスコアボーナス +2.0%",
    );
    expect(yellowEffectLabel("mococo-abyssgard", soloNode.effect)).toBe(
      "FUWAMOCO のみの楽曲のスコアボーナス +2.0%",
    );
  });

  it("ホロワークは整数の %、記号は ソ/ユ/全/レ/キ/特", () => {
    expect(yellowEffectLabel("houshou-marine", workNode.effect)).toBe(
      "ホロワークの特訓アイテム獲得量 +8%",
    );
    expect(YELLOW_BOARD_NODES.map((n) => yellowNodeGlyph(n.effect)).join("")).toBe(
      "ソソユ全ソソソレソキユ特キレユソレ全特レキ全ソソソ特ソキソレ特",
    );
  });
});

describe("解放・解除", () => {
  it("未解放のマスをタップすると中心からの経路(コネクトは通路)もまとめて解放する", () => {
    const result = yellowToggleNode(new Set(), "Y-023");
    expect([...result].sort()).toEqual([
      "Y-001",
      "Y-002",
      "Y-005",
      "Y-006",
      "Y-007",
      "Y-008",
      "Y-023",
    ]);
    expect(result.has("C")).toBe(false);
  });

  it("解放済みを解除すると、切り離される先も解除する", () => {
    const result = yellowToggleNode(new Set(YELLOW_BOARD_NODE_IDS), "Y-005");
    expect([...result].sort()).toEqual(["Y-001", "Y-002", "Y-003", "Y-004"]);
  });

  it("未知の ID は落とす", () => {
    expect(yellowKnownNodeIds(["Y-001", "Y-999", "Y-001", "C", "B-001"])).toEqual(["Y-001"]);
  });
});

describe("楽曲スコアボーナス(アカウント全体)", () => {
  const SOLO = ["Y-001", "Y-002", "Y-005", "Y-029"]; // ソロ +3.5%
  const UNIT = [
    "Y-001",
    "Y-002",
    "Y-003",
    "Y-005",
    "Y-006",
    "Y-007",
    "Y-008",
    "Y-009",
    "Y-010",
    "Y-011",
  ]; // ユニット +2.0%
  const ALL = ["Y-001", "Y-002", "Y-004"]; // 全体 +0.1%
  const song = (id: string, artists: string[]): Song =>
    ({ id, title: id, artists, kind: "original", durationSeconds: null, charts: {} }) as Song;

  it("ソロ曲は歌唱者本人のソロ、ユニット曲は歌唱者それぞれのユニット、全体楽曲は全員の全体の合計", () => {
    const e = accountYellowEffects({
      "houshou-marine": SOLO,
      "nekomata-okayu": UNIT,
      "inugami-korone": UNIT,
      "sakura-miko": ALL,
      "tokino-sora": ALL,
    });
    expect(yellowSongBonusPermil(e, song("s", ["宝鐘マリン"]))).toBe(35);
    expect(yellowSongBonusPermil(e, song("s", ["猫又おかゆ"]))).toBe(30); // 経路上のソロ系 6 マス
    expect(yellowSongBonusPermil(e, song("s", ["猫又おかゆ", "戌神ころね"]))).toBe(40);
    expect(yellowSongBonusPermil(e, song("s", ["宝鐘マリン", "猫又おかゆ"]))).toBe(20); // マリンはユニット系 0
    expect(yellowSongBonusPermil(e, song("s", ["hololive IDOL PROJECT"]))).toBe(2);
    expect(yellowSongBonusPermil(e, song("s", ["さくらみこ"]))).toBe(10); // 経路上のソロ系 2 マス
  });

  it("合計は 10.0% が上限。編成に依存せず、黄を育てたホロメンが編成外でも乗る", () => {
    const e = accountYellowEffects(
      Object.fromEntries(
        ["nekomata-okayu", "inugami-korone", "shirakami-fubuki", "ookami-mio"].map((id) => [
          id,
          YELLOW_BOARD_NODE_IDS,
        ]),
      ),
    );
    // ユニット +4.0% × 4 = 16% → 10%
    expect(yellowSongBonusPermil(e, song("s", ["ホロライブゲーマーズ"]))).toBe(100);
    expect(yellowSongBonusPermil(e, song("s", ["猫又おかゆ"]))).toBe(75);
  });

  it("フワワ・モココのソロ系は歌唱者が FUWAMOCO のみの曲にだけ乗り、2 人分を合算する", () => {
    const e = accountYellowEffects({ "fuwawa-abyssgard": SOLO, "mococo-abyssgard": UNIT });
    expect(
      yellowSongBonusPermil(e, song("s", ["フワワ・アビスガード", "モココ・アビスガード"])),
    ).toBe(65); // フワワのソロ 35 + モココのソロ 30
    expect(yellowSongBonusPermil(e, song("s", ["フワワ・アビスガード"]))).toBe(0); // 1 人の曲には乗らない
    expect(yellowSongBonusPermil(e, song("s", ["hololive English -Advent-"]))).toBe(20); // モココのユニット
  });

  it("収録曲でも判定できる(なかま歌はユーザー共有の歌唱者)", () => {
    const e = accountYellowEffects({ "omaru-polka": UNIT });
    const nakama = songById.get("song-108");
    expect(nakama).toBeDefined();
    if (!nakama) return;
    expect(yellowSongBonusPermil(e, nakama)).toBe(20);
  });
});
