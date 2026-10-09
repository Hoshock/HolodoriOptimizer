import { describe, expect, it } from "vite-plus/test";

import { boardMaterialsOf, emptyHolomenBoards } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { emptyBoardResources } from "../storage/boardResources";
import { applyRows, selectApply, toggleApply } from "./planApply";
import type { ApplyPlan } from "./planApply";

/**
 * 組み直しプランの反映で、ホロメンごとに外す(2026-10-09 ユーザー指示)。盤面・枚数はこのテストで決めた入力(実機の値ではない)
 */
const unit = {
  leaderHolomenId: "hakui-koyori",
  memberHolomenIds: ["nekomata-okayu", "inugami-korone"],
};
const boards = (over: Partial<HolomenBoards>): HolomenBoards => ({
  ...emptyHolomenBoards(),
  ...over,
});
const A = { extent: "card-3", permil: 2100 } as const;
const B = { extent: "content-3", permil: 2000 } as const;
const base: ApplyPlan = {
  boards: {},
  before: {},
  remaining: emptyBoardResources(),
  currentPlacements: {},
  placements: null,
  items: [],
};

describe("反映の確認の行(applyRows)", () => {
  it("ボード → コネクトの順に、それぞれ区分の順(リーダー・メンバー → 所属グループ → その他)で 1 ホロメン 1 行", () => {
    const plan: ApplyPlan = {
      ...base,
      boards: {
        "sakura-miko": boards({ yellow: ["Y-001"] }),
        "ookami-mio": boards({ green: ["G-001"] }),
        "nekomata-okayu": boards({ blue: ["B-001"] }),
      },
      before: {
        "sakura-miko": emptyHolomenBoards(),
        "ookami-mio": emptyHolomenBoards(),
        "nekomata-okayu": emptyHolomenBoards(),
      },
      currentPlacements: { "hakui-koyori": { card: A } },
      placements: { "hakui-koyori": { card: B } },
      items: [
        { placement: A, count: 1 },
        { placement: B, count: 1 },
      ],
    };
    expect(applyRows(plan, unit).map((r) => [r.key, r.section, r.requires])).toEqual([
      ["board:nekomata-okayu", "unit", []],
      ["board:ookami-mio", "group", []],
      ["board:sakura-miko", "other", []],
      ["connect:hakui-koyori", "unit", []],
    ]);
  });

  it("基本はボードとコネクトを別々に外せる(推奨のボードと配置がコネクトマスで依存しないとき)", () => {
    const plan: ApplyPlan = {
      ...base,
      boards: { "nekomata-okayu": boards({ blue: ["B-001"], connects: ["card"] }) },
      before: { "nekomata-okayu": boards({ connects: ["card"] }) },
      currentPlacements: { "nekomata-okayu": { card: B } },
      placements: { "nekomata-okayu": { card: A } },
      items: [
        { placement: A, count: 1 },
        { placement: B, count: 1 },
      ],
    };
    const rows = applyRows(plan, unit);
    expect(rows.map((r) => r.requires)).toEqual([[], []]);
    expect([...toggleApply(rows, new Set(), "board:nekomata-okayu")]).toEqual([
      "board:nekomata-okayu",
    ]);
    expect([...toggleApply(rows, new Set(), "connect:nekomata-okayu")]).toEqual([
      "connect:nekomata-okayu",
    ]);
  });

  it("推奨の配置が推奨のボードで開けたコネクトマスにあるときは、ボードを外すとコネクトも外れる(逆は連動しない)", () => {
    const plan: ApplyPlan = {
      ...base,
      boards: { "nekomata-okayu": boards({ blue: ["B-001"], connects: ["card"] }) },
      before: { "nekomata-okayu": emptyHolomenBoards() },
      currentPlacements: { "nekomata-okayu": { center: B } },
      placements: { "nekomata-okayu": { center: B, card: A } },
      items: [
        { placement: A, count: 1 },
        { placement: B, count: 1 },
      ],
    };
    const rows = applyRows(plan, unit);
    expect(rows.map((r) => [r.key, r.requires])).toEqual([
      ["board:nekomata-okayu", []],
      ["connect:nekomata-okayu", ["board:nekomata-okayu"]],
    ]);
    const boardOff = toggleApply(rows, new Set(), "board:nekomata-okayu");
    expect([...boardOff].sort()).toEqual(["board:nekomata-okayu", "connect:nekomata-okayu"]);
    expect([...toggleApply(rows, new Set(), "connect:nekomata-okayu")]).toEqual([
      "connect:nekomata-okayu",
    ]);
    // コネクトを入れ直すと前提のボードも入る
    expect([...toggleApply(rows, boardOff, "connect:nekomata-okayu")]).toEqual([]);
    // 連動のとおりに外せば何も外れない。前提を満たさない外し方を渡されたら、その配置だけ外す(保険)
    expect(selectApply(plan, boardOff).dropped).toEqual([]);
    const out = selectApply(plan, new Set(["board:nekomata-okayu"]));
    expect(out.placements).toEqual({ "nekomata-okayu": { center: B } });
    expect(out.dropped).toEqual([{ holomenId: "nekomata-okayu", anchor: "card" }]);
  });

  it("いまの配置のコネクトマスを推奨のボードが閉じるときは、コネクトを外すとボードも外れる(逆は連動しない)", () => {
    const plan: ApplyPlan = {
      ...base,
      boards: { "nekomata-okayu": boards({ blue: ["B-001"] }) },
      before: { "nekomata-okayu": boards({ connects: ["card"] }) },
      currentPlacements: { "nekomata-okayu": { card: A } },
      placements: { "inugami-korone": { card: A } },
      items: [{ placement: A, count: 2 }],
    };
    const rows = applyRows(plan, unit);
    expect(rows.map((r) => [r.key, r.requires])).toEqual([
      ["board:nekomata-okayu", ["connect:nekomata-okayu"]],
      ["connect:nekomata-okayu", []],
      ["connect:inugami-korone", []],
    ]);
    expect([...toggleApply(rows, new Set(), "connect:nekomata-okayu")].sort()).toEqual([
      "board:nekomata-okayu",
      "connect:nekomata-okayu",
    ]);
    expect([...toggleApply(rows, new Set(), "board:nekomata-okayu")]).toEqual([
      "board:nekomata-okayu",
    ]);
    const out = selectApply(plan, new Set(["connect:nekomata-okayu"]));
    expect(out.placements).toEqual({ "inugami-korone": { card: A } });
    expect(out.dropped).toEqual([{ holomenId: "nekomata-okayu", anchor: "card" }]);
  });

  it("コネクトを回し合うホロメンは、枚数が足りないときだけ互いに連動する", () => {
    // ミオの A を外してころねへ置く推奨
    const plan: ApplyPlan = {
      ...base,
      currentPlacements: { "ookami-mio": { card: A } },
      placements: { "inugami-korone": { card: A } },
      items: [{ placement: A, count: 1 }],
    };
    const rows = applyRows(plan, unit);
    expect(rows.map((r) => r.requires)).toEqual([
      ["connect:ookami-mio"],
      ["connect:inugami-korone"],
    ]);
    expect([...toggleApply(rows, new Set(), "connect:ookami-mio")].sort()).toEqual([
      "connect:inugami-korone",
      "connect:ookami-mio",
    ]);
    // 2 枚持っていれば、ミオだけ登録のままにしても足りる
    expect(
      applyRows({ ...plan, items: [{ placement: A, count: 2 }] }, unit).map((r) => r.requires),
    ).toEqual([[], []]);
  });
});

describe("外した行を除いた反映(selectApply)", () => {
  it("外したボード・配置は登録のまま、外したボードのぶん余りを戻す(未登録の項目は未登録のまま)。ボードとコネクトは別々に外せる", () => {
    const before = boards({ yellow: ["Y-001"] });
    const after = boards({ yellow: ["Y-001", "Y-002", "Y-005"] });
    const remaining = emptyBoardResources();
    remaining.yellow = { cube: 10, core: null };
    const plan: ApplyPlan = {
      ...base,
      boards: {
        "sakura-miko": after,
        "nekomata-okayu": boards({ blue: ["B-001"], connects: ["card"] }),
      },
      before: { "sakura-miko": before, "nekomata-okayu": emptyHolomenBoards() },
      remaining,
      currentPlacements: { "sakura-miko": { center: A } },
      placements: { "sakura-miko": { center: B }, "nekomata-okayu": { card: A } },
    };
    const out = selectApply(plan, new Set(["board:sakura-miko", "connect:sakura-miko"]));
    expect(Object.keys(out.boards)).toEqual(["nekomata-okayu"]);
    const diff = boardMaterialsOf(after).yellow.cube - boardMaterialsOf(before).yellow.cube;
    expect(diff).toBeGreaterThan(0);
    expect(out.remaining.yellow).toEqual({ cube: 10 + diff, core: null });
    expect(out.placements).toEqual({
      "sakura-miko": { center: A },
      "nekomata-okayu": { card: A },
    });
    // ボードだけ外すと、配置は推奨のまま
    expect(selectApply(plan, new Set(["board:sakura-miko"])).placements).toEqual(plan.placements);
    // 何も外さなければ推奨そのまま
    const all = selectApply(plan, new Set());
    expect(all.boards).toEqual(plan.boards);
    expect(all.remaining).toEqual(remaining);
    expect(all.placements).toEqual(plan.placements);
  });

  it("コネクトを反映しないときは配置を変えない(null)。登録で何も置いていないホロメンを外すと配置ごと消える", () => {
    expect(
      selectApply({ ...base, boards: { a: emptyHolomenBoards() } }, new Set(["board:a"]))
        .placements,
    ).toBeNull();
    const out = selectApply(
      { ...base, placements: { "nekomata-okayu": { card: A } } },
      new Set(["connect:nekomata-okayu"]),
    );
    expect(out.placements).toEqual({});
  });
});
