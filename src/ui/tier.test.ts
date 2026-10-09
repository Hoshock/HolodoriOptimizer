import { describe, expect, it } from "vite-plus/test";

import tierJson from "../data/tierList.json";
import { star5Cards } from "../data";
import { evaluateTier, evaluateTierCard } from "../engine/tier";
import type { TierDataset } from "../engine/tier";
import { formatScore } from "./labels";
import { diffPercentText, tierAxes, tierSummary } from "./tier";

const dataset = tierJson as TierDataset;
const total = star5Cards.length;

/** ティア表の評価画面の文言(2026-10-09 ユーザー指示: 総評 1〜2 文 + 評価軸の表。「比」とは言わず点数と全体の最高との差で言う) */
describe("総評", () => {
  it("全体で最高スコアの編成のメンバーは「全体で最高スコアの編成のメンバーで」から始まり、改行を含まない", () => {
    const id = dataset.best.memberIds[0]!;
    const text = tierSummary(evaluateTierCard(dataset, id, "member")!);
    expect(text.startsWith("全体で最高スコアの編成のメンバーで、")).toBe(true);
    expect(text).not.toContain("\n");
    expect(text).not.toContain("比");
  });

  it("最高の編成に入らないカードは役割と段の一言と全体の最高との差で始まる", () => {
    const e = evaluateTier(dataset, "member").find((x) => !x.inBest)!;
    expect(tierSummary(e)).toMatch(/^メンバーとして.+（全体の最高より \d+\.\d% 低い）。/);
    const l = evaluateTier(dataset, "leader").find((x) => !x.inBest)!;
    expect(tierSummary(l)).toMatch(
      /^リーダーとして.+（全体の最高より \d+\.\d% 低い）。衣装スキルは/,
    );
  });

  it("どのカードの総評も 1〜2 文で、「控えめ」とは言わない", () => {
    for (const c of star5Cards) {
      for (const role of ["member", "leader"] as const) {
        const text = tierSummary(evaluateTierCard(dataset, c.id, role)!);
        const n = text.split("。").filter((s) => s !== "").length;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(2);
        expect(text).not.toContain("控えめ");
      }
    }
  });
});

describe("全体の最高との差の表記", () => {
  it("同じなら ±0%、低ければ −、小数 1 桁", () => {
    expect(diffPercentText(1)).toBe("±0%");
    expect(diffPercentText(0.9931)).toBe("−0.7%");
    expect(diffPercentText(0.95)).toBe("−5.0%");
  });
});

describe("評価軸の表", () => {
  it("メンバーは 最高ユニットスコア → 全体の最高との差 → 採用数 → 0凸のまま → 素のパラメータ → パッシブ → アクティブ → SP の 8 行", () => {
    const id = dataset.best.memberIds[0]!;
    const e = evaluateTierCard(dataset, id, "member")!;
    const rows = tierAxes(dataset, e);
    expect(rows.map((r) => r.label)).toEqual([
      "最高ユニットスコア",
      "全体の最高との差",
      "採用数",
      "0凸のまま",
      "素のパラメータ",
      "パッシブ",
      "アクティブ",
      "SP",
    ]);
    expect(rows[0]!.value).toBe(formatScore(dataset.best.unitScore));
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.value).toBe(`±0（全体の最高 ${formatScore(dataset.best.unitScore)}）`);
    expect(rows[1]!.rank).toBeNull();
    expect(rows[2]!.value).toMatch(new RegExp(`^リーダー ${total} 通り中 \\d+ 通り$`));
    expect(rows[3]!.value).toBe(
      `${formatScore(dataset.cards[id]!.memberBloom0.unitScore)}（開花最大より ${diffPercentText(
        dataset.cards[id]!.memberBloom0.unitScore / dataset.best.unitScore,
      )}）`,
    );
    for (const r of rows) {
      if (r.rank !== null) {
        expect(r.rank).toBeGreaterThanOrEqual(1);
        expect(r.rank).toBeLessThanOrEqual(total);
      }
    }
  });

  it("最高の編成に入らないカードの差は点数と %", () => {
    const e = evaluateTier(dataset, "member").find((x) => !x.inBest)!;
    const rows = tierAxes(dataset, e);
    expect(rows[1]!.value).toMatch(/^−[\d,]+（−\d+\.\d%）$/);
  });

  it("リーダーは 最高ユニットスコア → 全体の最高との差 → 衣装スキル の 3 行で、衣装スキルに順位は付けない", () => {
    const e = evaluateTierCard(dataset, dataset.best.leaderId, "leader")!;
    const rows = tierAxes(dataset, e);
    expect(rows.map((r) => r.label)).toEqual([
      "最高ユニットスコア",
      "全体の最高との差",
      "衣装スキル",
    ]);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[2]!.rank).toBeNull();
  });

  it("衣装スキルの内容は構造化データから組み立てる(条件 → 対象 → パラメータ → %)", () => {
    const card = star5Cards.find((c) => c.costumeSkill.structured?.condition.kind === "typeCount")!;
    const rows = tierAxes(dataset, evaluateTierCard(dataset, card.id, "leader")!);
    const cond = card.costumeSkill.structured!.condition;
    if (cond.kind === "typeCount") expect(rows[2]!.value).toContain(`${cond.min}人以上で`);
    expect(rows[2]!.value).toMatch(/% UP|スコアサポート/);
  });

  it("同じ値は同じ順位(全体の最高の 5 枚はどれも 1 位)", () => {
    for (const id of dataset.best.memberIds) {
      const rows = tierAxes(dataset, evaluateTierCard(dataset, id, "member")!);
      expect(rows[0]!.rank).toBe(1);
    }
  });
});
