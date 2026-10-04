// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  BOARD_CONNECT_SCHEMA_VERSION,
  BOARD_CONNECT_STORAGE_KEY,
  inferBoardConnects,
  loadBoardConnects,
  parseBoardConnects,
  serializeBoardConnects,
  setBoardConnects,
  toBoardConnectMap,
} from "./boardConnects";
import type { ConnectEntry } from "./connect";

/**
 * コネクトマス自体の解放状態の保存と、旧データからの移行(2026-10-04 ユーザー指示)。旧データにはコネクトの解放状態がなかったので、
 * 初回の読み込みで 次の規則で推定して明示保存する: A. コネクトを通らないと届かないマスが解放済み → 解放済み / B. 配置あり → 解放済み /
 * C. 直前までで配置なし → 未解放(勝手に 1 Pt 消費した状態にしない)。以後は推定しない
 */
const noBoards = { red: [], blue: [], yellow: [], green: [] };
const placement = (
  holomenId: string,
  anchor: "leader" | "card" | "content" | "center",
): ConnectEntry => ({
  holomenId,
  placements: { [anchor]: { extent: "card-3", permil: 1600 } },
});

describe("旧データからの推定(A / B / C)", () => {
  it("A: コネクトの先のマスが解放済みなら、そのコネクトは解放済み(青 B-023 は C の外側)", () => {
    const entries = inferBoardConnects(
      {
        ...noBoards,
        blue: [
          {
            holomenId: "nekomata-okayu",
            nodes: ["B-001", "B-002", "B-005", "B-006", "B-007", "B-008", "B-023"],
          },
        ],
      },
      [],
    );
    expect(entries).toEqual([{ holomenId: "nekomata-okayu", unlocked: ["card"] }]);
  });

  it("A: 赤・黄も同じ(赤 R-009 は C の先、黄 Y-023 は C の外側)。ほかの色のコネクトは巻き込まない", () => {
    const entries = inferBoardConnects(
      {
        ...noBoards,
        red: [
          {
            holomenId: "a",
            nodes: ["R-001", "R-002", "R-005", "R-006", "R-007", "R-008", "R-021"],
          },
        ],
        yellow: [
          {
            holomenId: "b",
            nodes: ["Y-001", "Y-002", "Y-005", "Y-006", "Y-007", "Y-008", "Y-023"],
          },
        ],
      },
      [],
    );
    expect(entries).toEqual([
      { holomenId: "a", unlocked: ["leader"] },
      { holomenId: "b", unlocked: ["content"] },
    ]);
  });

  it("B: コネクトに配置があれば、先のマスがなくても解放済み。中心の配置は解放状態に関係しない", () => {
    const entries = inferBoardConnects(noBoards, [
      placement("a", "card"),
      placement("b", "leader"),
      placement("c", "content"),
      placement("d", "center"),
    ]);
    expect(entries).toEqual([
      { holomenId: "a", unlocked: ["card"] },
      { holomenId: "b", unlocked: ["leader"] },
      { holomenId: "c", unlocked: ["content"] },
    ]);
  });

  it("C: 直前までしか開けておらず配置もなければ未解放(行も作らない)", () => {
    const entries = inferBoardConnects(
      {
        ...noBoards,
        blue: [{ holomenId: "x", nodes: ["B-001", "B-002", "B-005", "B-006", "B-007", "B-008"] }],
      },
      [],
    );
    expect(entries).toEqual([]);
  });

  it("A と B の合わせ: 先がある色と配置のある色が別なら両方解放済み(UNLOCKABLE の順 leader → card → content)", () => {
    const entries = inferBoardConnects(
      {
        ...noBoards,
        blue: [
          {
            holomenId: "x",
            nodes: ["B-001", "B-002", "B-005", "B-006", "B-007", "B-008", "B-023"],
          },
        ],
      },
      [placement("x", "leader")],
    );
    expect(entries).toEqual([{ holomenId: "x", unlocked: ["leader", "card"] }]);
  });
});

describe("保存形式", () => {
  it("版番号つきの封筒で書き、読み戻せる。壊れた・封筒でない値は null(まだ保存されていない扱い)", () => {
    const entries = [{ holomenId: "nekomata-okayu", unlocked: ["leader", "content"] as const }];
    const raw = serializeBoardConnects(entries.map((e) => ({ ...e, unlocked: [...e.unlocked] })));
    expect(JSON.parse(raw)).toEqual({ version: BOARD_CONNECT_SCHEMA_VERSION, entries });
    expect(parseBoardConnects(raw)).toEqual(entries);
    expect(parseBoardConnects(null)).toBeNull();
    expect(parseBoardConnects("{")).toBeNull();
    expect(parseBoardConnects(JSON.stringify({ boards: [] }))).toBeNull();
    // 空配列の封筒は「全員未解放」という有効な保存
    expect(parseBoardConnects(serializeBoardConnects([]))).toEqual([]);
  });

  it("知らないアンカー(center を含む)は読み飛ばし、現在のデータにないホロメン ID は捨てずに持ち回る", () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [
        { holomenId: "future-holomen", unlocked: ["card", "center", "foo", 3] },
        { holomenId: "future-holomen", unlocked: ["leader"] },
      ],
    });
    expect(parseBoardConnects(raw)).toEqual([{ holomenId: "future-holomen", unlocked: ["card"] }]);
  });

  it("setBoardConnects は並びを固定し、空配列で行を外す。toBoardConnectMap は解放なしを含めない", () => {
    let entries = setBoardConnects([], "a", ["content", "leader"]);
    expect(entries).toEqual([{ holomenId: "a", unlocked: ["leader", "content"] }]);
    entries = setBoardConnects(entries, "b", ["card"]);
    expect(toBoardConnectMap(entries)).toEqual({ a: ["leader", "content"], b: ["card"] });
    entries = setBoardConnects(entries, "a", []);
    expect(toBoardConnectMap(entries)).toEqual({ b: ["card"] });
  });
});

describe("loadBoardConnects(初回だけ推定して明示保存する)", () => {
  afterEach(() => localStorage.clear());

  it("キーがなければ推定し、その結果をすぐ保存する。2 回目以降は推定せず保存値を読む", () => {
    let calls = 0;
    const inferred = [{ holomenId: "x", unlocked: ["card" as const] }];
    const first = loadBoardConnects(() => {
      calls += 1;
      return inferred;
    });
    expect(first).toEqual(inferred);
    expect(calls).toBe(1);
    expect(parseBoardConnects(localStorage.getItem(BOARD_CONNECT_STORAGE_KEY))).toEqual(inferred);
    // 保存後はもう推定しない(別の推定結果を返す関数を渡しても、保存値のまま)
    const second = loadBoardConnects(() => {
      calls += 1;
      return [];
    });
    expect(second).toEqual(inferred);
    expect(calls).toBe(1);
  });

  it("推定が空でも「保存済み」にする(以後の読み込みで再推定して 1 Pt 消費の状態へ変えない)", () => {
    loadBoardConnects(() => []);
    expect(localStorage.getItem(BOARD_CONNECT_STORAGE_KEY)).not.toBeNull();
    expect(loadBoardConnects(() => [{ holomenId: "y", unlocked: ["leader"] }])).toEqual([]);
  });

  it("保存が壊れているときは推定し直す(登録を失わない側)", () => {
    localStorage.setItem(BOARD_CONNECT_STORAGE_KEY, "{broken");
    const inferred = [{ holomenId: "z", unlocked: ["content" as const] }];
    expect(loadBoardConnects(() => inferred)).toEqual(inferred);
  });
});
