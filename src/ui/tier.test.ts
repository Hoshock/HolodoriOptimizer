import { describe, expect, it } from "vite-plus/test";

import tierJson from "../data/tierList.json";
import { star5Cards } from "../data";
import { evaluateTier, evaluateTierCard } from "../engine/tier";
import type { TierDataset } from "../engine/tier";
import { formatScore } from "./labels";
import { adoptionText, diffPercentText, sameCostumeCount, tierAxes, tierSummary } from "./tier";

const dataset = tierJson as TierDataset;
const total = star5Cards.length;

/** ティア表の評価画面の文言(2026-10-09 ユーザー指示: 総評 1〜2 文 + 評価軸の表。「比」とは言わず採用率・点数・全体の最高との差で言う) */
describe("総評", () => {
  it("役割と段の一言と採用率で始まり、改行を含まない", () => {
    const e = evaluateTier(dataset, "member")[0]!;
    const text = tierSummary(e);
    expect(text).toMatch(
      /^メンバーとして.+カード（持っていたアカウントの \d+% で最高編成に入る）。/,
    );
    expect(text).not.toContain("\n");
    expect(text).not.toContain("比");
    const l = evaluateTier(dataset, "leader").find((x) => !x.inBest)!;
    expect(tierSummary(l)).toMatch(
      /^リーダーとして.+（持っていたアカウントの \d+% で最高編成に入る）。衣装スキルは/,
    );
  });

  it("全体で最高スコアの編成のカードはそのことも言う", () => {
    const id = dataset.best.memberIds[0]!;
    expect(tierSummary(evaluateTierCard(dataset, id, "member")!)).toContain(
      "全体で最高スコアの編成にも入る",
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

describe("表記", () => {
  it("全体の最高との差は 同じなら ±0%、低ければ −、小数 1 桁。採用率は整数 %", () => {
    expect(diffPercentText(1)).toBe("±0%");
    expect(diffPercentText(0.9931)).toBe("−0.7%");
    expect(diffPercentText(0.95)).toBe("−5.0%");
    expect(adoptionText(0.724)).toBe("72%");
    expect(adoptionText(0)).toBe("0%");
  });

  it("同じ衣装スキルのカードの数は自分を除いて数える", () => {
    const a = star5Cards[0]!;
    const same = star5Cards.filter(
      (c) =>
        c.id !== a.id &&
        JSON.stringify(c.costumeSkill.structured) === JSON.stringify(a.costumeSkill.structured),
    ).length;
    expect(sameCostumeCount(a.id)).toBe(same);
  });
});

describe("評価軸の表", () => {
  it("メンバーは 採用率 2 つ → 最高ユニットスコア → 全体の最高との差 → 0凸のまま → 素のパラメータ → パッシブ → アクティブ → SP の 9 行", () => {
    const id = dataset.best.memberIds[0]!;
    const e = evaluateTierCard(dataset, id, "member")!;
    const rows = tierAxes(dataset, e);
    expect(rows.map((r) => r.label)).toEqual([
      "メンバー採用率",
      "リーダー採用率",
      "最高ユニットスコア",
      "全体の最高との差",
      "0凸のまま",
      "素のパラメータ",
      "パッシブ",
      "アクティブ",
      "SP",
    ]);
    expect(rows[0]!.value).toMatch(/^\d+%（[\d,]+ 件中 [\d,]+ 件、±\d+\.\d pt）$/);
    expect(rows[2]!.value).toBe(formatScore(dataset.best.unitScore));
    expect(rows[2]!.rank).toBe(1);
    expect(rows[3]!.value).toBe(`±0（全体の最高 ${formatScore(dataset.best.unitScore)}）`);
    expect(rows[3]!.rank).toBeNull();
    expect(rows[6]!.rank).toBeNull(); // パッシブは目安なので順位なし
    for (const r of rows) {
      if (r.rank !== null) {
        expect(r.rank).toBeGreaterThanOrEqual(1);
        expect(r.rank).toBeLessThanOrEqual(total);
      }
    }
  });

  it("0凸のままの順位は落差の小さい順(文言と同じ尺度)", () => {
    const list = evaluateTier(dataset, "member");
    const drops = list.map((x) => x.ratio - (x.bloom0Ratio ?? x.ratio));
    const least = list[drops.indexOf(Math.min(...drops))]!;
    const row = tierAxes(dataset, least).find((r) => r.key === "bloom0")!;
    expect(row.rank).toBe(1);
  });

  it("最高の編成に入らないカードの差は点数と %", () => {
    const e = evaluateTier(dataset, "member").find((x) => !x.inBest)!;
    const rows = tierAxes(dataset, e);
    expect(rows.find((r) => r.key === "diff")!.value).toMatch(/^−[\d,]+（−\d+\.\d%）$/);
  });

  it("リーダーは 採用率 2 つ → 最高ユニットスコア → 全体の最高との差 → 衣装スキル の 5 行で、衣装スキルに順位は付けず同じ衣装スキルの数を添える", () => {
    const e = evaluateTierCard(dataset, dataset.best.leaderId, "leader")!;
    const rows = tierAxes(dataset, e);
    expect(rows.map((r) => r.label)).toEqual([
      "リーダー採用率",
      "メンバー採用率",
      "最高ユニットスコア",
      "全体の最高との差",
      "衣装スキル",
    ]);
    expect(rows[2]!.rank).toBe(1);
    expect(rows[4]!.rank).toBeNull();
    const same = sameCostumeCount(dataset.best.leaderId);
    if (same > 0) expect(rows[4]!.value).toContain(`同じ衣装スキルのカードが他に ${same} 枚`);
  });

  it("衣装スキルの内容は構造化データから組み立てる(条件 → 対象 → パラメータ → %)", () => {
    const card = star5Cards.find((c) => c.costumeSkill.structured?.condition.kind === "typeCount")!;
    const rows = tierAxes(dataset, evaluateTierCard(dataset, card.id, "leader")!);
    const cond = card.costumeSkill.structured!.condition;
    if (cond.kind === "typeCount") expect(rows[4]!.value).toContain(`${cond.min}人以上で`);
    expect(rows[4]!.value).toMatch(/% UP|スコアサポート/);
  });
});
