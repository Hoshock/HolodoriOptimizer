// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";
import type { Ref } from "vue";

import OptimizePlanSheet from "./OptimizePlanSheet.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { clearPlanCache } from "../composables/usePlanCache";
import { cards } from "../data";
import type { HolomenBoards } from "../data/boardState";
import type { ConnectItem } from "../engine/connectOptimize";
import type { OptimizePlanResult } from "../engine/optimizePlan";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import type { ConnectPlacementMap } from "../storage/connect";

/**
 * 最適化のシート(ボード → コネクト → 頻度。2026-10-07 にボードとコネクト、2026-10-08 に頻度を統合した — ユーザー指示)。
 * - 「リソース」の登録値を計算の入力として Worker へ渡し、登録値が違えば古い結果(キャッシュ)を返さず、推奨を反映するときは推奨のあとの余りも
 *   同じ推奨としてまとめて渡す(資材。頻度の資材は不足してよく、不足は負の余りとして渡す)
 * - オプションは既定で畳む。最適化する対象はボード / コネクト / 頻度の独立した ON/OFF(既定は全部 ON。最後の 1 つは外せない。
 *   コネクトを使えないときは OFF で始める)。選んだものだけを依頼に載せる。頻度を選んだときだけ選び方の 3 択(既定は理論値重視)
 * - 変える範囲は「ユニットのみ変更する」の ON/OFF(OFF = 全ホロメン。「すべて変更」の選択肢は持たない)
 * - 頻度の表は 現在 / 推奨。推奨を押すと固定の選択が開き、「一部固定で最適化」で固定を依頼に載せて計算し直す。頻度マスに届かないメンバーは「届かない」
 * - 反映の確認には、頻度を選ばずにボードを反映するときは「発動頻度マスはすべて外れます。」、資材が足りないときは不足をマイナスで登録する一言を添える
 * 計算そのもの(Worker)は差し替え、依頼と結果の受け渡しだけを確かめる
 */
interface RunInput {
  resources?: unknown;
  scope?: string;
  board?: boolean;
  connect?: boolean;
  frequency?: boolean;
  objective?: string;
  fixedFrequencies?: Record<string, number>;
  items?: unknown;
}
const mocks = vi.hoisted(() => ({
  runs: [] as RunInput[],
  result: null as Ref<unknown> | null,
}));
vi.mock("../composables/useOptimizePlan", async () => {
  const { ref } = await import("vue");
  const result = ref<unknown>(null);
  mocks.result = result;
  return {
    useOptimizePlan: () => ({
      running: ref(false),
      result,
      error: ref(null),
      run: (input: RunInput) => {
        mocks.runs.push(input);
      },
    }),
  };
});

const ids: string[] = [];
const seen = new Set<string>();
for (const c of cards) {
  if (seen.has(c.holomenId)) continue;
  seen.add(c.holomenId);
  ids.push(c.id);
  if (ids.length === 6) break;
}
const candidate = { leaderId: ids[0], memberIds: ids.slice(1) } as unknown as CandidateView;
const memberHolomenId = cards.find((c) => c.id === ids[1])?.holomenId ?? "";

const withResources = (green: { cube: number | null; core: number | null }): BoardResources => ({
  ...emptyBoardResources(),
  green,
});
/** 持っているコネクト(形 × ％ × 枚数) */
const ITEMS: ConnectItem[] = [{ placement: { extent: "card-3", permil: 1600 }, count: 1 }];
const hosts: HTMLElement[] = [];
/** 結果を流す ref は全テストで共有なので、前のテストのシートが残っていると結果を横取りしてキャッシュへ書く。毎回アンマウントする */
const apps: { unmount: () => void }[] = [];
beforeEach(() => {
  mocks.runs.length = 0;
  clearPlanCache();
});
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  for (const h of hosts.splice(0)) h.remove();
  document.body.innerHTML = "";
});

interface Applied {
  boards: Record<string, HolomenBoards>;
  remaining: BoardResources;
  placements: ConnectPlacementMap | null;
}
function mount(
  resources: BoardResources,
  options: { connectDisabled?: boolean; connectShortage?: boolean } = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const applied: Applied[] = [];
  const app = createApp({
    render: () =>
      h(OptimizePlanSheet, {
        candidate,
        blooms: {},
        boards: {},
        greenBoards: {},
        yellowBoards: {},
        redBoards: {},
        placements: {},
        connects: {},
        ranks: {},
        resources,
        items: ITEMS,
        connectDisabled: options.connectDisabled ?? false,
        connectShortage: options.connectShortage ?? false,
        account: { memoryPercent: 0, enhancementPercent: 0 },
        songId: null,
        onClose: () => undefined,
        onApply: (plan: Applied) => applied.push(plan),
      }),
  });
  app.mount(host);
  apps.push(app);
  return { host, applied };
}
const tick = async () => {
  await nextTick();
  await nextTick();
};
/** オプションは既定で畳んである。開いてからチップを取る(開いていれば何もしない) */
const openOptions = async (host: HTMLElement): Promise<void> => {
  if (host.querySelector(".option-chips") === null) {
    host.querySelector<HTMLButtonElement>(".options-toggle")?.click();
    await tick();
  }
};
/** 最適化する対象のチップ(ボード / コネクト / 頻度を最適化する) */
const chips = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>(".option-chips .chip:not(.scope)"),
];
/** 「ユニットのみ変更する」のチップ */
const scopeChip = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>(".option-chips .chip.scope");
/** 頻度の選び方のセグメント */
const objectives = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>(".option-chips .seg"),
];
const flush = async (value: OptimizePlanResult): Promise<void> => {
  mocks.result!.value = value;
  await tick();
};

const fakeResult = (
  remainingAfter: BoardResources,
  extra: Partial<OptimizePlanResult> = {},
): OptimizePlanResult => ({
  current: 100,
  recommended: 120,
  boards: { "tokino-sora": { red: [], blue: [], yellow: [], green: ["G-001"], connects: [] } },
  changed: ["tokino-sora"],
  infeasible: [],
  before: { "tokino-sora": { red: [], blue: [], yellow: [], green: [], connects: [] } },
  remainingAfter,
  placements: {},
  rounds: 1,
  frequency: null,
  ...extra,
});
const frequencySummary = (choices: number[]): OptimizePlanResult["frequency"] => ({
  rows: [{ holomenId: memberHolomenId, currentPercent: 0, recommendedPercent: 8, choices }],
  metrics: {
    expectedActiveScoreIntegral: 0,
    averageExpectedActiveScorePercent: 10,
    perfectActivationScoreIntegral: 0,
    averagePerfectActivationScorePercent: 12,
    expectedCoverage: 0.5,
    structuralCoverage: 0.5,
    totalGapSeconds: 0,
    maximumGapSeconds: 3,
  },
});

describe("OptimizePlanSheet と資材", () => {
  it("「リソース」の登録値(余り)を計算の依頼へそのまま渡す", () => {
    const resources = withResources({ cube: 700, core: 25 });
    mount(resources);
    expect(mocks.runs).toHaveLength(1);
    expect(mocks.runs[0]?.resources).toEqual(resources);
  });

  it("登録値が違うなら、同じ編成・曲・範囲でも古い結果を使わず計算し直す(キャッシュのキーに資材を含む)", async () => {
    const first = withResources({ cube: 700, core: 25 });
    mount(first);
    await flush(fakeResult(first));
    // 同じ登録値で開き直せば結果を使い回す(再計算しない)
    mount(first);
    expect(mocks.runs).toHaveLength(1);
    // 余りが変わったら、結果を使い回さず計算し直す
    mount(withResources({ cube: 701, core: 25 }));
    expect(mocks.runs).toHaveLength(2);
    expect(mocks.runs[1]?.resources).toEqual(withResources({ cube: 701, core: 25 }));
  });

  it("反映するときは、推奨のボードと推奨のあとの余りを同じ推奨としてまとめて渡す", async () => {
    const remainingAfter = withResources({ cube: 100, core: 10 });
    const { host, applied } = mount(withResources({ cube: 200, core: 20 }));
    await flush(fakeResult(remainingAfter));
    host.querySelector<HTMLButtonElement>(".foot-primary")?.click();
    await tick();
    document.body.querySelector<HTMLButtonElement>(".dialog .confirm")?.click();
    await tick();
    expect(applied).toHaveLength(1);
    expect(applied[0]?.boards["tokino-sora"]?.green).toEqual(["G-001"]);
    expect(applied[0]?.remaining).toEqual(remainingAfter);
  });

  it("資材が足りない推奨は本文の先頭に不足を出し、反映の確認に一言を添えて、負の余りのまま渡す", async () => {
    const remainingAfter: BoardResources = {
      ...emptyBoardResources(),
      blue: { cube: -74, core: 10 },
    };
    const { host, applied } = mount(emptyBoardResources());
    await flush(fakeResult(remainingAfter, { frequency: frequencySummary([0, 4, 8]) }));
    expect(host.querySelector(".warning.lead")?.textContent).toContain("青のキューブが 74");
    expect(host.querySelector(".warning.lead")?.textContent).toContain("不足します");
    host.querySelector<HTMLButtonElement>(".foot-primary")?.click();
    await tick();
    expect(document.body.querySelector(".dialog .note")?.textContent).toBe(
      "足りないリソースはマイナスで登録されます。",
    );
    document.body.querySelector<HTMLButtonElement>(".dialog .confirm")?.click();
    await tick();
    expect(applied[0]?.remaining.blue).toEqual({ cube: -74, core: 10 });
  });
});

describe("OptimizePlanSheet の対象(ボード / コネクト / 頻度)", () => {
  it("題は「最適化」。オプションは既定で畳んであり、開くと 4 つのチップと(頻度が ON なので)選び方の 3 択。既定は全部 ON・理論値重視で、全部を依頼に載せる", async () => {
    const { host } = mount(emptyBoardResources());
    expect(host.querySelector("h3")?.textContent).toBe("最適化");
    // 既定で畳む(チップは出ていない)
    expect(host.querySelector(".options-toggle")?.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(".option-chips")).toBeNull();
    await openOptions(host);
    expect(host.querySelector(".options-toggle")?.getAttribute("aria-expanded")).toBe("true");
    expect(chips(host).map((c) => c.textContent.trim())).toEqual([
      "ボードを最適化する",
      "コネクトを最適化する",
      "頻度を最適化する",
    ]);
    expect(scopeChip(host)?.textContent.trim()).toBe("ユニットのみ変更する");
    expect(chips(host).map((c) => c.getAttribute("aria-checked"))).toEqual([
      "true",
      "true",
      "true",
    ]);
    expect(scopeChip(host)?.getAttribute("aria-checked")).toBe("true");
    expect(objectives(host).map((b) => b.textContent.trim())).toEqual([
      "期待値重視",
      "理論値重視",
      "ユニットスコア重視",
    ]);
    expect(objectives(host)[1]?.getAttribute("aria-checked")).toBe("true");
    expect(mocks.runs[0]).toMatchObject({
      scope: "unit",
      board: true,
      connect: true,
      frequency: true,
      objective: "perfect",
      fixedFrequencies: {},
    });
    expect(mocks.runs[0]?.items).toEqual(ITEMS);
  });

  it("頻度を外すと選び方の 3 択は消え、ボードとコネクトだけで計算し直す。選び方を変えると計算し直す", async () => {
    const { host } = mount(emptyBoardResources());
    await openOptions(host);
    objectives(host)[2]?.click();
    await tick();
    expect(mocks.runs[1]?.objective).toBe("unit");
    chips(host)[2]?.click();
    await tick();
    expect(objectives(host)).toHaveLength(0);
    expect(mocks.runs[2]).toMatchObject({ board: true, connect: true, frequency: false });
  });

  it("最後の 1 つのチップは外せない", async () => {
    const { host } = mount(emptyBoardResources());
    await openOptions(host);
    chips(host)[1]?.click();
    await tick();
    chips(host)[2]?.click();
    await tick();
    expect(mocks.runs.at(-1)).toMatchObject({ board: true, connect: false, frequency: false });
    // 残ったボードは外せない(全部 OFF にできる道を作らない)
    expect(chips(host)[0]?.disabled).toBe(true);
    const before = mocks.runs.length;
    chips(host)[0]?.click();
    await tick();
    expect(mocks.runs).toHaveLength(before);
    expect(chips(host).map((c) => c.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
  });

  it("ボードを外すと「ユニットのみ変更する」は使えない(disabled)", async () => {
    const { host } = mount(emptyBoardResources());
    await openOptions(host);
    expect(scopeChip(host)?.disabled).toBe(false);
    chips(host)[0]?.click();
    await tick();
    expect(mocks.runs[1]).toMatchObject({ board: false, connect: true, frequency: true });
    expect(scopeChip(host)?.disabled).toBe(true);
  });

  it("「ユニットのみ変更する」を外すと全ホロメンを変える範囲(all)で計算し直し、戻すと unit(「すべて変更」の選択肢はない)", async () => {
    const { host } = mount(emptyBoardResources());
    await openOptions(host);
    scopeChip(host)?.click();
    await tick();
    expect(scopeChip(host)?.getAttribute("aria-checked")).toBe("false");
    expect(mocks.runs).toHaveLength(2);
    expect(mocks.runs[1]?.scope).toBe("all");
    scopeChip(host)?.click();
    await tick();
    expect(mocks.runs).toHaveLength(3);
    expect(mocks.runs[2]?.scope).toBe("unit");
    expect(scopeChip(host)?.getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).not.toContain("全て変更");
  });

  it("コネクトを使えないとき(登録がない)は OFF で始まり、チップは押せない", async () => {
    const { host } = mount(emptyBoardResources(), { connectDisabled: true });
    await openOptions(host);
    expect(chips(host)[1]?.disabled).toBe(true);
    expect(chips(host)[1]?.getAttribute("aria-checked")).toBe("false");
    expect(mocks.runs[0]).toMatchObject({ board: true, connect: false });
  });

  it("コネクトを選んだままボードに置いたコネクトが所持に収まっていないときは、計算せずに登録を促す文を出す。コネクトを外せば計算する", async () => {
    const { host } = mount(emptyBoardResources(), { connectShortage: true });
    await openOptions(host);
    expect(mocks.runs).toHaveLength(0);
    expect(host.querySelector(".message")?.textContent).toContain(
      "所持しているコネクトにないものがボードに置かれています",
    );
    chips(host)[1]?.click();
    await tick();
    expect(mocks.runs).toHaveLength(1);
    expect(mocks.runs[0]?.connect).toBe(false);
  });

  it("頻度を選ばずにボードを反映する確認には、発動頻度マスが外れる一言を添える。頻度も選んでいれば添えない", async () => {
    const { host } = mount(emptyBoardResources());
    await flush(fakeResult(emptyBoardResources(), { frequency: frequencySummary([0, 4, 8]) }));
    host.querySelector<HTMLButtonElement>(".foot-primary")?.click();
    await tick();
    expect(document.body.querySelector(".dialog")).not.toBeNull();
    expect(document.body.querySelector(".dialog .note")).toBeNull();
    document.body.querySelector<HTMLButtonElement>(".dialog .cancel")?.click();
    await tick();
    await openOptions(host);
    chips(host)[2]?.click();
    await tick();
    await flush(fakeResult(emptyBoardResources()));
    host.querySelector<HTMLButtonElement>(".foot-primary")?.click();
    await tick();
    expect(document.body.querySelector(".dialog .note")?.textContent).toBe(
      "発動頻度マスはすべて外れます。",
    );
  });

  it("反映の中身は選んだ対象だけ: コネクトを選ばなければ配置は null(触らない)、頻度だけでもボード(頻度マス)の変更は渡す", async () => {
    const { host, applied } = mount(emptyBoardResources(), { connectDisabled: true });
    await openOptions(host);
    chips(host)[0]?.click();
    await tick();
    expect(mocks.runs.at(-1)).toMatchObject({ board: false, connect: false, frequency: true });
    await flush(fakeResult(emptyBoardResources(), { frequency: frequencySummary([0, 4, 8]) }));
    host.querySelector<HTMLButtonElement>(".foot-primary")?.click();
    await tick();
    document.body.querySelector<HTMLButtonElement>(".dialog .confirm")?.click();
    await tick();
    expect(applied[0]?.placements).toBeNull();
    expect(Object.keys(applied[0]?.boards ?? {})).toEqual(["tokino-sora"]);
  });
});

describe("OptimizePlanSheet の頻度", () => {
  it("頻度の表は 現在 / 推奨。推奨を押すと固定の選択が開き、選んだだけでは計算せず、「一部固定で最適化」で固定を載せて計算し直す", async () => {
    const { host } = mount(emptyBoardResources());
    await flush(fakeResult(emptyBoardResources(), { frequency: frequencySummary([0, 4, 8]) }));
    const fix = host.querySelector<HTMLButtonElement>(".fix-btn");
    expect(fix?.textContent.trim()).toBe("+8.0%");
    fix?.click();
    await tick();
    // 届く頻度だけが選択肢(おまかせ + 0 / 4 / 8%)
    const options = [...document.body.querySelectorAll<HTMLButtonElement>(".dialog .seg")];
    expect(options.map((b) => b.textContent.trim())).toEqual([
      "おまかせ",
      "+0.0%",
      "+4.0%",
      "+8.0%",
    ]);
    options[2]?.click();
    await tick();
    expect(mocks.runs).toHaveLength(1);
    expect(host.querySelector(".fix-btn")?.textContent.trim()).toBe("+4.0%");
    const [reset, refix] = [...host.querySelectorAll<HTMLButtonElement>(".fix-action")];
    expect(reset?.disabled).toBe(false);
    refix?.click();
    await tick();
    expect(mocks.runs).toHaveLength(2);
    expect(mocks.runs[1]?.fixedFrequencies).toEqual({ [memberHolomenId]: 4 });
  });

  it("頻度マスに届かないメンバーは推奨を「届かない」と出し、固定の枠を置かない", async () => {
    const { host } = mount(emptyBoardResources());
    await flush(fakeResult(emptyBoardResources(), { frequency: frequencySummary([0]) }));
    expect(host.querySelector(".fix-btn")).toBeNull();
    expect(host.textContent).toContain("届かない");
  });
});
