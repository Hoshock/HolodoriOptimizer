import { describe, expect, it } from "vite-plus/test";

import { boardMaterialsOf, emptyHolomenBoards } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { emptyBoardResources } from "../storage/boardResources";
import { applyGroups, selectApply } from "./planApply";
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

describe("反映の確認の行(applyGroups)", () => {
  it("区分の順(リーダー・メンバー → 所属グループ → その他)に、変更のあるホロメンを 1 行ずつ。ボード / コネクトの変更の有無を添える", () => {
    const plan: ApplyPlan = {
      ...base,
      boards: {
        "sakura-miko": boards({ yellow: ["Y-001"] }),
        "ookami-mio": boards({ green: ["G-001"] }),
        "nekomata-okayu": boards({ blue: ["B-001"] }),
      },
      currentPlacements: { "hakui-koyori": { card: A } },
      placements: { "hakui-koyori": { card: B } },
      items: [
        { placement: A, count: 1 },
        { placement: B, count: 1 },
      ],
    };
    expect(applyGroups(plan, unit)).toEqual([
      { ids: ["hakui-koyori"], section: "unit", board: false, connect: true },
      { ids: ["nekomata-okayu"], section: "unit", board: true, connect: false },
      { ids: ["ookami-mio"], section: "group", board: true, connect: false },
      { ids: ["sakura-miko"], section: "other", board: true, connect: false },
    ]);
  });

  it("コネクトを回し合うホロメンは、枚数が足りないときだけ 1 行にまとめる", () => {
    // ミオの A を外してころねへ置く推奨
    const plan: ApplyPlan = {
      ...base,
      currentPlacements: { "ookami-mio": { card: A } },
      placements: { "inugami-korone": { card: A } },
      items: [{ placement: A, count: 1 }],
    };
    expect(applyGroups(plan, unit).map((g) => g.ids)).toEqual([["inugami-korone", "ookami-mio"]]);
    // 2 枚持っていれば、ミオだけ登録のままにしても足りる
    expect(
      applyGroups({ ...plan, items: [{ placement: A, count: 2 }] }, unit).map((g) => g.ids),
    ).toEqual([["inugami-korone"], ["ookami-mio"]]);
  });
});

describe("外したホロメンを除いた反映(selectApply)", () => {
  it("外したホロメンのボードと配置は登録のまま、余りはそのぶん戻す(未登録の項目は未登録のまま)", () => {
    const before = boards({ yellow: ["Y-001"] });
    const after = boards({ yellow: ["Y-001", "Y-002", "Y-005"] });
    const remaining = emptyBoardResources();
    remaining.yellow = { cube: 10, core: null };
    const plan: ApplyPlan = {
      ...base,
      boards: { "sakura-miko": after, "nekomata-okayu": boards({ blue: ["B-001"] }) },
      before: { "sakura-miko": before, "nekomata-okayu": emptyHolomenBoards() },
      remaining,
      currentPlacements: { "sakura-miko": { center: A } },
      placements: { "sakura-miko": { center: B }, "nekomata-okayu": { card: A } },
    };
    const out = selectApply(plan, new Set(["sakura-miko"]));
    expect(Object.keys(out.boards)).toEqual(["nekomata-okayu"]);
    const diff = boardMaterialsOf(after).yellow.cube - boardMaterialsOf(before).yellow.cube;
    expect(diff).toBeGreaterThan(0);
    expect(out.remaining.yellow).toEqual({ cube: 10 + diff, core: null });
    expect(out.placements).toEqual({
      "sakura-miko": { center: A },
      "nekomata-okayu": { card: A },
    });
    // 何も外さなければ推奨そのまま
    const all = selectApply(plan, new Set());
    expect(all.boards).toEqual(plan.boards);
    expect(all.remaining).toEqual(remaining);
    expect(all.placements).toEqual(plan.placements);
  });

  it("コネクトを反映しないときは配置を変えない(null)。登録で何も置いていないホロメンを外すと配置ごと消える", () => {
    expect(
      selectApply({ ...base, boards: { a: emptyHolomenBoards() } }, new Set(["a"])).placements,
    ).toBeNull();
    const out = selectApply(
      { ...base, placements: { "nekomata-okayu": { card: A } } },
      new Set(["nekomata-okayu"]),
    );
    expect(out.placements).toEqual({});
  });
});
