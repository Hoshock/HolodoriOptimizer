import { describe, expect, it } from "vite-plus/test";

import { PLAN_STEP_MS, planEstimate } from "./planProgress";

describe("組み直しプランの進み具合(planEstimate)", () => {
  const planned = ["board", "connect", "frequency"] as const;
  const total = PLAN_STEP_MS.board + PLAN_STEP_MS.connect + PLAN_STEP_MS.frequency;

  it("報告がまだなければ、全部の段がこれからとして目安で見積もる(段の途中は目安の時間ぶん進め、次の段の頭は越えない)", () => {
    expect(planEstimate(null, 0, planned)).toEqual({ fraction: 0, remainingMs: total });
    const mid = planEstimate(null, PLAN_STEP_MS.board / 2, planned);
    expect(mid.fraction).toBeCloseTo(PLAN_STEP_MS.board / 2 / total);
    expect(planEstimate(null, PLAN_STEP_MS.board * 5, planned).fraction).toBeCloseTo(
      PLAN_STEP_MS.board / total,
    );
  });

  it("段が済んだら実測の速さで直す(目安の 2 倍かかった端末は残りも 2 倍)", () => {
    const elapsed = PLAN_STEP_MS.board * 2;
    const out = planEstimate(
      { done: ["board"], remaining: ["connect", "frequency"], elapsedMs: elapsed },
      elapsed,
      planned,
    );
    expect(out.fraction).toBeCloseTo(PLAN_STEP_MS.board / total);
    expect(out.remainingMs).toBeCloseTo((PLAN_STEP_MS.connect + PLAN_STEP_MS.frequency) * 2);
  });

  it("周が早く止まって残りの段が減れば、残りも減る。全部済めば 0", () => {
    const many = planEstimate(
      {
        done: ["board", "connect"],
        remaining: ["board", "connect", "board", "connect", "frequency"],
        elapsedMs: 860,
      },
      860,
      planned,
    );
    const stopped = planEstimate(
      { done: ["board", "connect"], remaining: ["frequency"], elapsedMs: 860 },
      860,
      planned,
    );
    expect(stopped.remainingMs).toBeLessThan(many.remainingMs);
    expect(
      planEstimate({ done: ["board", "frequency"], remaining: [], elapsedMs: 900 }, 900, planned),
    ).toEqual({ fraction: 1, remainingMs: 0 });
  });
});
