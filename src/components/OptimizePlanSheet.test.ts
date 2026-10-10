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
 * 組み直しプランのシート(2026-10-08 ユーザー指示で、条件のページ + 結果のタブの形にし、同日「最適化」から改名して条件を組み替えた)。
 * - **開いただけでは計算しない**。条件を変えても計算しない。下端の「最適化を実行」で初めて Worker へ依頼する
 * - タブは ボード / コネクト / 発動頻度 と、その右に離した条件のボタン。開いた直後は条件で、結果のタブは実行するまで disabled。結果が届くと最初の結果のタブへ移る
 * - 条件は 曲 → 最適化するもの(ボード / コネクト / 発動頻度 のチップと、最小限で組み直す / 所持リソースを考慮する)→ 発動頻度の選び方
 *   (3 択と「頻度マスの数」の 1 行。押すとメンバーごとのダイアログ)。効かないあいだは disabled。最適化するものの最後の 1 つは外せない
 * - 結果のタブは実行した対象だけ有効。発動頻度のタブは見るだけ(固定・再計算の操作は置かない)
 * - 条件を変えると前の結果は薄く残り、反映できない。同じ条件に戻すと覚えた結果がそのまま出る
 * - 「リソース」の登録値を依頼へ渡し、反映するときは推奨のあとの余り(不足は負)をまとめて渡す
 * 計算そのもの(Worker)は差し替え、依頼と結果の受け渡しだけを確かめる
 */
interface RunInput {
  resources?: unknown;
  scope?: string;
  board?: boolean;
  connect?: boolean;
  frequency?: boolean;
  objective?: string;
  fixedFrequencyNodes?: Record<string, number>;
  items?: unknown;
  relaxedMaterialColors?: string[];
}
const mocks = vi.hoisted(() => ({
  runs: [] as RunInput[],
  result: null as Ref<unknown> | null,
  running: null as Ref<boolean> | null,
}));
vi.mock("../composables/useOptimizePlan", async () => {
  const { ref } = await import("vue");
  const result = ref<unknown>(null);
  const running = ref(false);
  mocks.result = result;
  mocks.running = running;
  return {
    useOptimizePlan: () => ({
      running,
      result,
      error: ref(null),
      progress: ref(null),
      startedAt: ref(null),
      run: (input: RunInput) => {
        mocks.runs.push(input);
        running.value = true;
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
  if (mocks.result) mocks.result.value = null;
  if (mocks.running) mocks.running.value = false;
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
  options: {
    connectDisabled?: boolean;
    connectShortage?: boolean;
    preset?: { connect: boolean; result: OptimizePlanResult };
    placements?: ConnectPlacementMap;
    greenBoards?: Record<string, string[]>;
  } = {},
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
        greenBoards: options.greenBoards ?? {},
        yellowBoards: {},
        redBoards: {},
        placements: options.placements ?? {},
        connects: {},
        ranks: {},
        resources,
        items: ITEMS,
        connectDisabled: options.connectDisabled ?? false,
        connectShortage: options.connectShortage ?? false,
        account: { memoryPercent: 0, enhancementPercent: 0 },
        songId: null,
        preset: options.preset ?? null,
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
/** 結果の 3 つのタブ + 条件のボタン(この順) */
const tabs = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>(".tabs .seg, .tabs .cond-tab"),
];
/** 条件のタブ(最後のタブ)を開く(開いていれば何もしない) */
const openSettings = async (host: HTMLElement): Promise<void> => {
  if (host.querySelector(".settings") === null) {
    tabs(host)
      .find((t) => t.textContent.trim() === "条件")
      ?.click();
    await tick();
  }
};
/** 最適化するもののチップ(ボード / コネクト / 発動頻度) */
const chips = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>(".settings .chip.target"),
];
/** 「最小限で組み直す」のチップ */
const scopeChip = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>(".settings .chip.scope");
/** 「所持リソースを考慮する」のチップ */
const resourceChip = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>(".settings .chip.resource");
/** 頻度の選び方のセグメント */
const objectives = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>(".segment.objective .seg"),
];
/** 「頻度マスの数」の行(押すとダイアログ) */
const fixButton = (host: HTMLElement) => host.querySelector<HTMLButtonElement>(".fix-button");
/** ダイアログの先頭のメンバーの頻度マスの数のセグメント(おまかせ / 0〜3 マス) */
const fixSegs = (host: HTMLElement) => [
  ...(host.querySelector(".member")?.querySelectorAll<HTMLButtonElement>(".seg") ?? []),
];
const runButton = (host: HTMLElement) => host.querySelector<HTMLButtonElement>(".foot-primary");
const applyButton = (host: HTMLElement) => host.querySelector<HTMLButtonElement>(".foot-secondary");
/** 実行して、結果を流す */
const execute = async (host: HTMLElement, value: OptimizePlanResult): Promise<void> => {
  runButton(host)?.click();
  await tick();
  mocks.result!.value = value;
  mocks.running!.value = false;
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
const frequencySummary = (reachable: number[]): OptimizePlanResult["frequency"] => ({
  rows: [
    {
      holomenId: memberHolomenId,
      currentPercent: 0,
      recommendedPercent: 8,
      recommendedNodeCount: 2,
      reachableNodeCounts: reachable,
    },
  ],
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

describe("OptimizePlanSheet の実行", () => {
  it("開いただけでは計算せず、現在のユニットスコアだけを出す。「最適化を実行」で初めて依頼する(既定は全部の対象・理論値重視・固定なし)", async () => {
    const { host } = mount(emptyBoardResources());
    expect(host.querySelector("h3")?.textContent).toBe("組み直しプラン");
    expect(mocks.runs).toHaveLength(0);
    const values = [...host.querySelectorAll(".score-value")].map((e) => e.textContent.trim());
    expect(values[0]).not.toBe("");
    expect(values[1]).toBe("");
    expect(applyButton(host)?.disabled).toBe(true);
    expect(runButton(host)?.disabled).toBe(false);
    runButton(host)?.click();
    await tick();
    expect(mocks.runs).toHaveLength(1);
    expect(mocks.runs[0]).toMatchObject({
      scope: "minimal",
      board: true,
      connect: true,
      frequency: true,
      objective: "perfect",
      fixedFrequencyNodes: {},
      items: ITEMS,
    });
    // 計算中はボタンの中にリング、もう押せない
    expect(runButton(host)?.getAttribute("aria-busy")).toBe("true");
    expect(runButton(host)?.disabled).toBe(true);
  });

  it("条件を変えても計算しない。結果が届いたあとに条件を変えると結果は薄く残り、反映できない。同じ条件に戻すと覚えた結果がそのまま出る", async () => {
    const { host } = mount(emptyBoardResources());
    await execute(host, fakeResult(emptyBoardResources()));
    expect(applyButton(host)?.disabled).toBe(false);
    expect(runButton(host)?.disabled).toBe(true); // いまの条件の結果はある
    await openSettings(host);
    scopeChip(host)?.click();
    await tick();
    expect(mocks.runs).toHaveLength(1);
    expect(host.querySelector(".summary.stale")).not.toBeNull();
    expect(applyButton(host)?.disabled).toBe(true);
    expect(runButton(host)?.disabled).toBe(false);
    scopeChip(host)?.click();
    await tick();
    expect(host.querySelector(".summary.stale")).toBeNull();
    expect(applyButton(host)?.disabled).toBe(false);
    expect(mocks.runs).toHaveLength(1);
  });

  it("「リソース」の登録値を依頼へ渡し、登録値が違えば前の結果は使い回さない(キャッシュのキーに資材を含む)", async () => {
    const first = withResources({ cube: 700, core: 25 });
    const a = mount(first);
    await execute(a.host, fakeResult(first));
    expect(mocks.runs[0]?.resources).toEqual(first);
    // 同じ登録値で開き直せば、覚えた結果がそのまま出る(実行は押せない)
    const b = mount(first);
    await tick();
    expect(runButton(b.host)?.disabled).toBe(true);
    // 余りが変わったら覚えた結果は使わない
    const c = mount(withResources({ cube: 701, core: 25 }));
    await tick();
    expect(runButton(c.host)?.disabled).toBe(false);
  });

  it("計算した結果は閉じても残り(サイトを更新するまで)、登録のボードが違えば使い回さない(キャッシュのキーに登録の指紋を含む)", async () => {
    const a = mount(emptyBoardResources());
    await execute(a.host, fakeResult(emptyBoardResources()));
    for (const app of apps.splice(0)) app.unmount();
    // 同じ登録で開き直すと、計算せずに結果が出る
    const b = mount(emptyBoardResources());
    await tick();
    expect(runButton(b.host)?.disabled).toBe(true);
    expect(mocks.runs).toHaveLength(1);
    // 反映などで登録のボードが変わったら、前の結果は出さない
    const c = mount(emptyBoardResources(), { greenBoards: { "tokino-sora": ["G-001"] } });
    await tick();
    expect(runButton(c.host)?.disabled).toBe(false);
  });

  it("反映するときは、推奨のボードと推奨のあとの余りを同じ推奨としてまとめて渡す。不足がなければ確認に不足の一言を添えない", async () => {
    const remainingAfter = withResources({ cube: 100, core: 10 });
    const { host, applied } = mount(withResources({ cube: 200, core: 20 }));
    await execute(host, fakeResult(remainingAfter));
    applyButton(host)?.click();
    await tick();
    expect(document.body.querySelector(".dialog .note")).toBeNull();
    document.body.querySelector<HTMLButtonElement>(".dialog .confirm")?.click();
    await tick();
    expect(applied).toHaveLength(1);
    expect(applied[0]?.boards["tokino-sora"]?.green).toEqual(["G-001"]);
    expect(applied[0]?.remaining).toEqual(remainingAfter);
  });

  it("資材が足りない推奨は画面に不足を出さず、反映の確認に何がいくつ足りないかを添えて、負の余りのまま渡す", async () => {
    const remainingAfter: BoardResources = {
      ...emptyBoardResources(),
      blue: { cube: -74, core: 10 },
    };
    const { host, applied } = mount(emptyBoardResources());
    await execute(host, fakeResult(remainingAfter, { frequency: frequencySummary([0, 1, 2]) }));
    expect(host.querySelector(".warning")).toBeNull();
    applyButton(host)?.click();
    await tick();
    expect(document.body.querySelector(".dialog .note")?.textContent).toBe(
      "青のキューブ 74 が不足します",
    );
    document.body.querySelector<HTMLButtonElement>(".dialog .confirm")?.click();
    await tick();
    expect(applied[0]?.remaining.blue).toEqual({ cube: -74, core: 10 });
  });

  it("余りの負はどれも不足として書く(効かないマスで埋められるぶんは推奨の盤面で外してある)", async () => {
    const remainingAfter: BoardResources = {
      ...emptyBoardResources(),
      blue: { cube: -1714, core: 10 },
      red: { cube: -30, core: 0 },
    };
    const { host } = mount(emptyBoardResources());
    await execute(host, fakeResult(remainingAfter, { frequency: frequencySummary([0, 1, 2]) }));
    applyButton(host)?.click();
    await tick();
    expect(document.body.querySelector(".dialog .note")?.textContent).toBe(
      "赤のキューブ 30・青のキューブ 1,714 が不足します",
    );
  });

  it("発動頻度を選ばずにボードを反映する確認には一言を添えない(登録の頻度マスは残す)。現在は発動頻度の選択で変わらない", async () => {
    const { host } = mount(emptyBoardResources());
    const before = host.querySelector(".score-value")?.textContent;
    await openSettings(host);
    chips(host)[2]?.click();
    await tick();
    expect(host.querySelector(".score-value")?.textContent).toBe(before);
    await execute(host, fakeResult(emptyBoardResources()));
    expect(mocks.runs[0]?.frequency).toBe(false);
    applyButton(host)?.click();
    await tick();
    expect(document.body.querySelector(".dialog .note")).toBeNull();
  });

  it("コネクトを選んだままボードに置いたコネクトが所持に収まっていないときは、赤いエラー文を出して実行できない。コネクトを外せば実行できる", async () => {
    const { host } = mount(emptyBoardResources(), { connectShortage: true });
    expect(host.querySelector(".error-text")?.textContent).toBe(
      "所持より多くコネクトを置いています",
    );
    expect(runButton(host)?.disabled).toBe(true);
    await openSettings(host);
    chips(host)[1]?.click();
    await tick();
    expect(runButton(host)?.disabled).toBe(false);
  });
});

describe("OptimizePlanSheet の条件", () => {
  it("曲 → 最適化するもの → 発動頻度の選び方 の順。対象の 3 つは既定で ON、最後の 1 つは外せない。最小限で組み直すは既定で ON", async () => {
    const { host } = mount(emptyBoardResources());
    // 開いた直後は条件のタブ
    expect(host.querySelector(".settings")).not.toBeNull();
    expect(
      [...host.querySelectorAll(".settings .cond-block h4")].map((e) => e.textContent),
    ).toEqual(["曲", "最適化するもの", "発動頻度の選び方"]);
    expect(chips(host).map((c) => c.textContent.trim())).toEqual([
      "ボード",
      "コネクト",
      "発動頻度",
    ]);
    expect(scopeChip(host)?.textContent.trim()).toBe("最小限で組み直す");
    expect(scopeChip(host)?.getAttribute("aria-checked")).toBe("true");
    chips(host)[1]?.click();
    await tick();
    chips(host)[2]?.click();
    await tick();
    expect(chips(host)[0]?.disabled).toBe(true);
    chips(host)[0]?.click();
    await tick();
    expect(chips(host).map((c) => c.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
  });

  it("「最小限で組み直す」はボードとコネクトの両方にかかる: どちらかを選んでいれば押せ、両方外すと disabled。発動頻度を外すと選び方と頻度マスの数が disabled", async () => {
    const { host } = mount(emptyBoardResources());
    await openSettings(host);
    expect(scopeChip(host)?.disabled).toBe(false);
    expect(objectives(host).every((b) => !b.disabled)).toBe(true);
    expect(fixButton(host)?.disabled).toBe(false);
    chips(host)[0]?.click();
    await tick();
    // コネクトだけでも範囲は効く
    expect(scopeChip(host)?.disabled).toBe(false);
    chips(host)[1]?.click();
    await tick();
    expect(scopeChip(host)?.disabled).toBe(true);
    chips(host)[0]?.click();
    await tick();
    chips(host)[2]?.click();
    await tick();
    expect(objectives(host).every((b) => b.disabled)).toBe(true);
    expect(fixButton(host)?.disabled).toBe(true);
  });

  it("コネクトだけでも「最小限で組み直す」を外せば全ホロメン(all)で依頼する", async () => {
    const { host } = mount(emptyBoardResources());
    await openSettings(host);
    chips(host)[0]?.click();
    chips(host)[2]?.click();
    await tick();
    scopeChip(host)?.click();
    await tick();
    runButton(host)?.click();
    await tick();
    expect(mocks.runs[0]).toMatchObject({
      board: false,
      connect: true,
      frequency: false,
      scope: "all",
    });
  });

  it("発動頻度の選び方と、ダイアログで選ぶメンバーごとの頻度マスの数(おまかせ / 0〜3 マス)を依頼に載せる", async () => {
    const { host } = mount(emptyBoardResources());
    await openSettings(host);
    expect(objectives(host).map((b) => b.textContent.trim())).toEqual([
      "期待値重視",
      "理論値重視",
      "ユニットスコア重視",
    ]);
    expect(fixButton(host)?.textContent).toContain("おまかせ");
    expect(fixSegs(host)).toEqual([]);
    fixButton(host)?.click();
    await tick();
    expect(fixSegs(host).map((b) => b.textContent.trim())).toEqual([
      "おまかせ",
      "0マス",
      "1マス",
      "2マス",
      "3マス",
    ]);
    objectives(host)[2]?.click();
    fixSegs(host)[3]?.click();
    await tick();
    expect(fixSegs(host)[3]?.getAttribute("aria-checked")).toBe("true");
    host.querySelector<HTMLButtonElement>(".dialog .close")?.click();
    await tick();
    expect(fixSegs(host)).toEqual([]);
    expect(fixButton(host)?.textContent).toContain("1人を固定");
    expect(mocks.runs).toHaveLength(0);
    runButton(host)?.click();
    await tick();
    expect(mocks.runs[0]).toMatchObject({
      objective: "unit",
      fixedFrequencyNodes: { [memberHolomenId]: 2 },
    });
  });

  it("所持リソースを考慮する: 1 つのチップ(色ごとの ON / OFF は持たない)。外すと登録している色をすべて考慮しない。ボードを外すと disabled", async () => {
    const resources: BoardResources = {
      ...emptyBoardResources(),
      blue: { cube: 100, core: null },
      green: { cube: 0, core: 0 },
    };
    const { host } = mount(resources);
    expect(resourceChip(host)?.textContent.trim()).toBe("所持リソースを考慮する");
    expect(resourceChip(host)?.getAttribute("aria-checked")).toBe("true");
    expect(host.querySelector(".chip.color")).toBeNull();
    resourceChip(host)?.click();
    await tick();
    runButton(host)?.click();
    await tick();
    expect(mocks.runs[0]?.relaxedMaterialColors).toEqual(["blue", "green"]);
    // ボードを外すと disabled
    chips(host)[0]?.click();
    await tick();
    expect(resourceChip(host)?.disabled).toBe(true);
  });

  it("「リソース」に何も登録していなければ所持リソースを考慮するは効かないので disabled(考慮しない色も渡さない)", async () => {
    const { host } = mount(emptyBoardResources());
    expect(resourceChip(host)?.disabled).toBe(true);
    runButton(host)?.click();
    await tick();
    expect(mocks.runs[0]?.relaxedMaterialColors).toEqual([]);
  });

  it("裏で計算した結果(preset)を渡すと、ユニットスコア重視で開いて結果を最初から出す(実行しない)", async () => {
    const { host } = mount(emptyBoardResources(), {
      preset: {
        connect: true,
        result: fakeResult(emptyBoardResources(), { frequency: frequencySummary([0, 1, 2]) }),
      },
    });
    await tick();
    expect(mocks.runs).toHaveLength(0);
    expect(runButton(host)?.disabled).toBe(true);
    expect(applyButton(host)?.disabled).toBe(false);
    expect(tabs(host)[0]?.getAttribute("aria-selected")).toBe("true");
    await openSettings(host);
    expect(objectives(host)[2]?.getAttribute("aria-checked")).toBe("true");
  });
});

describe("OptimizePlanSheet の結果のタブ", () => {
  it("タブは ボード / コネクト / 発動頻度 / 条件(結果が先・条件が最後)。結果のタブは実行するまで disabled、結果が届くと最初の結果のタブへ移り、実行した対象だけ有効。発動頻度のタブは見るだけ(固定・再計算の操作がない)", async () => {
    const { host } = mount(emptyBoardResources(), { connectDisabled: true });
    expect(tabs(host).map((t) => t.textContent.trim())).toEqual([
      "ボード",
      "コネクト",
      "発動頻度",
      "条件",
    ]);
    expect(tabs(host).map((t) => t.disabled)).toEqual([true, true, true, false]);
    expect(tabs(host)[3]?.getAttribute("aria-selected")).toBe("true");
    await execute(
      host,
      fakeResult(emptyBoardResources(), { frequency: frequencySummary([0, 1, 2]) }),
    );
    expect(tabs(host).map((t) => t.disabled)).toEqual([false, true, false, false]);
    expect(tabs(host)[0]?.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector(".open-board")).not.toBeNull();
    tabs(host)[2]?.click();
    await tick();
    expect(host.querySelector(".tab-body .recommended")?.textContent.trim()).toBe("+8.0%");
    expect(host.querySelector(".tab-body button")).toBeNull();
    expect(host.textContent).not.toContain("一部固定で最適化");
    expect(host.textContent).not.toContain("推奨頻度をリセット");
  });

  it("頻度マスに届かないメンバーは推奨を「届かない」と出す", async () => {
    const { host } = mount(emptyBoardResources());
    await execute(host, fakeResult(emptyBoardResources(), { frequency: frequencySummary([0]) }));
    tabs(host)[2]?.click();
    await tick();
    expect(host.querySelector(".tab-body")?.textContent).toContain("届かない");
  });

  it("反映の中身は実行した対象だけ: コネクトを選ばなければ配置は null(触らない)、頻度だけでもボード(頻度マス)の変更は渡す", async () => {
    const { host, applied } = mount(emptyBoardResources(), { connectDisabled: true });
    await openSettings(host);
    chips(host)[0]?.click();
    await tick();
    await execute(host, fakeResult(emptyBoardResources(), { frequency: frequencySummary([0, 1]) }));
    expect(mocks.runs[0]).toMatchObject({ board: false, connect: false, frequency: true });
    applyButton(host)?.click();
    await tick();
    document.body.querySelector<HTMLButtonElement>(".dialog .confirm")?.click();
    await tick();
    expect(applied[0]?.placements).toBeNull();
    expect(Object.keys(applied[0]?.boards ?? {})).toEqual(["tokino-sora"]);
  });

  // 2026-10-09 ユーザー指示「ボードの反映は一部除いて反映したいことがあるので、モーダルでオプトアウトできる UI」
  it("反映の確認は ボード / コネクト と区分のタブで分け、行ごとに外せる: 外したボードは渡さず、余りはそのぶん戻す。全部外すと反映できない", async () => {
    // 編成はそら(リーダー)・ロボ子・アキ・はあと・フブキ・まつり。ユニット外のみこ(0期生 = 所属グループ)と ぺこら(その他)
    const remainingAfter = withResources({ cube: 100, core: 10 });
    const { host, applied } = mount(withResources({ cube: 200, core: 20 }));
    const empty = { red: [], blue: [], yellow: [], green: [], connects: [] };
    await execute(
      host,
      fakeResult(remainingAfter, {
        boards: {
          "usada-pekora": { ...empty, green: ["G-001"] },
          "sakura-miko": { ...empty, green: ["G-001"] },
          "tokino-sora": { ...empty, green: ["G-001"] },
        },
        changed: ["tokino-sora", "sakura-miko", "usada-pekora"],
        before: { "tokino-sora": empty, "sakura-miko": empty, "usada-pekora": empty },
      }),
    );
    applyButton(host)?.click();
    await tick();
    const dialog = document.body.querySelector(".apply-overlay");
    const segs = (cls: string) => [
      ...(dialog?.querySelectorAll<HTMLButtonElement>(`.${cls} .seg`) ?? []),
    ];
    const rows = () => [...(dialog?.querySelectorAll<HTMLButtonElement>(".row") ?? [])];
    // コネクトの変更はないので、コネクトのタブは押せない
    expect(segs("kinds").map((b) => [b.textContent.trim(), b.disabled])).toEqual([
      ["ボード", false],
      ["コネクト", true],
    ]);
    expect(segs("sections").map((b) => b.textContent.trim())).toEqual([
      "リーダー・メンバー",
      "所属グループ",
      "その他",
    ]);
    expect(rows().map((r) => r.textContent.trim())).toEqual(["ときのそら"]);
    segs("sections")[1]?.click(); // 所属グループ = みこ
    await tick();
    expect(rows().map((r) => r.textContent.trim())).toEqual(["さくらみこ"]);
    expect(rows()[0]?.getAttribute("aria-checked")).toBe("true");
    rows()[0]?.click(); // みこを外す
    await tick();
    expect(rows()[0]?.getAttribute("aria-checked")).toBe("false");
    dialog?.querySelector<HTMLButtonElement>(".confirm")?.click();
    await tick();
    expect(Object.keys(applied[0]?.boards ?? {}).sort()).toEqual(["tokino-sora", "usada-pekora"]);
    // G-001 のぶん(緑)が余りに戻る
    expect(applied[0]?.remaining.green.cube).toBeGreaterThan(100);

    applyButton(host)?.click();
    await tick();
    const again = document.body.querySelector(".apply-overlay");
    for (const sec of again?.querySelectorAll<HTMLButtonElement>(".sections .seg") ?? []) {
      sec.click();
      await tick();
      for (const r of again?.querySelectorAll<HTMLButtonElement>(".row") ?? []) {
        r.click();
        await tick();
      }
    }
    expect(again?.querySelector<HTMLButtonElement>(".confirm")?.disabled).toBe(true);
  });

  it("結果のタブの下に固定の区分のタブ(リーダー・メンバー / 所属グループ / その他)。行のない区分は押せず、条件のタブには出さない。発動頻度にも付き、見出し「メンバー」は置かない", async () => {
    const { host } = mount(emptyBoardResources());
    const empty = { red: [], blue: [], yellow: [], green: [], connects: [] };
    const subtabs = () => [...host.querySelectorAll<HTMLButtonElement>(".fixed-top .subtabs .seg")];
    // 条件のタブには出さない
    expect(subtabs()).toHaveLength(0);
    await execute(
      host,
      fakeResult(emptyBoardResources(), {
        boards: { "usada-pekora": { ...empty, green: ["G-001"] } },
        changed: ["usada-pekora"],
        before: { "usada-pekora": empty },
        frequency: frequencySummary([0, 1]),
      }),
    );
    expect(subtabs().map((t) => t.textContent.trim())).toEqual([
      "リーダー・メンバー",
      "所属グループ",
      "その他",
    ]);
    expect(subtabs().map((t) => t.disabled)).toEqual([true, true, false]);
    // 行のある区分(その他)が選ばれている
    expect(subtabs()[2]?.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelectorAll(".plan-table tbody tr")).toHaveLength(1);
    tabs(host)[2]?.click();
    await tick();
    // 発動頻度はメンバーだけ
    expect(subtabs().map((t) => t.disabled)).toEqual([false, true, true]);
    expect(subtabs()[0]?.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelectorAll(".plan-table tbody tr")).toHaveLength(1);
    expect(host.querySelector(".section-head")).toBeNull();
    await openSettings(host);
    expect(subtabs()).toHaveLength(0);
  });

  it("反映の確認で、片方だけでは成り立たない行はトグルが連動する(補足の文字は出さない)", async () => {
    // ロボ子(メンバー)のコネクトをそら(リーダー)へ回す推奨。持っているのは 1 枚なので、片方だけ外すと枚数を超える
    const A = ITEMS[0]!.placement;
    const { host, applied } = mount(emptyBoardResources(), {
      placements: { "roboco-san": { center: A } },
    });
    await execute(
      host,
      fakeResult(emptyBoardResources(), { placements: { "tokino-sora": { center: A } } }),
    );
    applyButton(host)?.click();
    await tick();
    const dialog = document.body.querySelector(".apply-overlay");
    [...(dialog?.querySelectorAll<HTMLButtonElement>(".kinds .seg") ?? [])][1]?.click();
    await tick();
    const rows = () => [...(dialog?.querySelectorAll<HTMLButtonElement>(".row") ?? [])];
    expect(rows().map((r) => r.textContent.trim())).toEqual(["ときのそら", "ロボ子さん"]);
    rows()[0]?.click();
    await tick();
    expect(rows().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    dialog?.querySelector<HTMLButtonElement>(".confirm")?.click();
    await tick();
    // コネクトは両方とも登録のまま(ボードのそらは反映)
    expect(applied[0]?.placements).toEqual({ "roboco-san": { center: A } });
    expect(Object.keys(applied[0]?.boards ?? {})).toEqual(["tokino-sora"]);
  });

  // 2026-10-09 ユーザー指示(モック 3 案から「タブの横に条件を離して置く」)
  it("結果の 3 つのタブはセグメント、条件はその右の別のボタン(セグメントの中に入れない)", async () => {
    const { host } = mount(emptyBoardResources());
    const segs = [...host.querySelectorAll(".tabs .segment .seg")].map((b) => b.textContent.trim());
    expect(segs).toEqual(["ボード", "コネクト", "発動頻度"]);
    const cond = host.querySelector<HTMLButtonElement>(".tabs > .cond-tab");
    expect(cond?.textContent.trim()).toBe("条件");
    expect(cond?.getAttribute("aria-selected")).toBe("true");
    await execute(host, fakeResult(emptyBoardResources()));
    expect(cond?.getAttribute("aria-selected")).toBe("false");
    cond?.click();
    await tick();
    expect(host.querySelector(".settings")).not.toBeNull();
  });

  it("反映の確認は行ごとに独立。推奨のボードで開けたコネクトマスへの配置だけは、ボードを外すとコネクトも外れる(コネクトだけは外せる)", async () => {
    const A = ITEMS[0]!.placement;
    const empty = { red: [], blue: [], yellow: [], green: [], connects: [] };
    const { host, applied } = mount(emptyBoardResources());
    await execute(
      host,
      fakeResult(emptyBoardResources(), {
        boards: {
          "tokino-sora": { ...empty, blue: ["B-001"], connects: ["card"] },
          "roboco-san": { ...empty, red: ["R-001"] },
        },
        before: { "tokino-sora": empty, "roboco-san": empty },
        placements: { "tokino-sora": { card: A } },
      }),
    );
    applyButton(host)?.click();
    await tick();
    const dialog = document.body.querySelector(".apply-overlay");
    const kinds = () => [...(dialog?.querySelectorAll<HTMLButtonElement>(".kinds .seg") ?? [])];
    const rows = () => [...(dialog?.querySelectorAll<HTMLButtonElement>(".row") ?? [])];
    const checked = () => rows().map((r) => r.getAttribute("aria-checked"));
    expect(rows().map((r) => r.textContent.trim())).toEqual(["ときのそら", "ロボ子さん"]);
    // 前提のないボードは自分だけ外れる
    rows()[1]?.click();
    await tick();
    expect(checked()).toEqual(["true", "false"]);
    // コネクトだけを外しても、ボードは外れない
    kinds()[1]?.click();
    await tick();
    rows()[0]?.click();
    await tick();
    expect(checked()).toEqual(["false"]);
    kinds()[0]?.click();
    await tick();
    expect(checked()).toEqual(["true", "false"]);
    // コネクトを入れ直して、ボードを外すとコネクトも外れる
    kinds()[1]?.click();
    await tick();
    rows()[0]?.click();
    await tick();
    kinds()[0]?.click();
    await tick();
    rows()[0]?.click();
    await tick();
    expect(checked()).toEqual(["false", "false"]);
    kinds()[1]?.click();
    await tick();
    expect(checked()).toEqual(["false"]);
    // コネクトを入れると前提のボードも入る
    rows()[0]?.click();
    await tick();
    kinds()[0]?.click();
    await tick();
    expect(checked()).toEqual(["true", "false"]);
    expect(dialog?.querySelector(".note")).toBeNull();
    dialog?.querySelector<HTMLButtonElement>(".confirm")?.click();
    await tick();
    expect(Object.keys(applied[0]?.boards ?? {})).toEqual(["tokino-sora"]);
    expect(applied[0]?.placements).toEqual({ "tokino-sora": { card: A } });
  });
});
