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
 * 最適化のシート(2026-10-08 ユーザー指示で、設定のページ + 結果のタブの形にした)。
 * - **開いただけでは計算しない**。設定を変えても計算しない。下端の「最適化を実行」で初めて Worker へ依頼する
 * - タブは 設定 / ボード / コネクト / 頻度。開いた直後は設定で、結果のタブは実行するまで disabled。結果が届くと最初の結果のタブへ移る
 * - 設定は 曲 → ボードとコネクトの枠(上の行 = ユニットのみ変更する、下の行 = ボードを最適化する / コネクトを最適化する)→ 頻度の枠(頻度を最適化する /
 *   選び方の 3 択 / メンバーごとの頻度マスの数の固定)。主が OFF のぶら下がりは disabled。最適化する対象の最後の 1 つは外せない
 * - 結果のタブは実行した対象だけ有効。頻度のタブは見るだけ(固定・再計算の操作は置かない)
 * - 設定を変えると前の結果は薄く残り、反映できない。同じ設定に戻すと覚えた結果がそのまま出る
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
const tabs = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>(".tabs .seg")];
/** 設定のタブを開く(開いていれば何もしない) */
const openSettings = async (host: HTMLElement): Promise<void> => {
  if (host.querySelector(".settings") === null) {
    tabs(host)[0]?.click();
    await tick();
  }
};
/** 最適化する対象のチップ(ボード / コネクト / 頻度を最適化する) */
const chips = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>(".settings .chip.target"),
];
/** 「ユニットのみ変更する」のチップ */
const scopeChip = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>(".settings .chip.scope");
/** 所持リソースの主と 4 色 */
const resourceChip = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>(".settings .chip.resource");
const colorChips = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>(".settings .chip.color"),
];
/** 頻度の選び方のセグメント */
const objectives = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>(".segment.objective .seg"),
];
/** 先頭のメンバーの頻度マスの数のセグメント(おまかせ / 0〜3 マス) */
const fixSegs = (host: HTMLElement) => [
  ...(host.querySelector(".fix-row")?.querySelectorAll<HTMLButtonElement>(".seg") ?? []),
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
    expect(host.querySelector("h3")?.textContent).toBe("最適化");
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
      scope: "unit",
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

  it("設定を変えても計算しない。結果が届いたあとに設定を変えると結果は薄く残り、反映できない。同じ設定に戻すと覚えた結果がそのまま出る", async () => {
    const { host } = mount(emptyBoardResources());
    await execute(host, fakeResult(emptyBoardResources()));
    expect(applyButton(host)?.disabled).toBe(false);
    expect(runButton(host)?.disabled).toBe(true); // いまの設定の結果はある
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

  it("反映するときは、推奨のボードと推奨のあとの余りを同じ推奨としてまとめて渡す", async () => {
    const remainingAfter = withResources({ cube: 100, core: 10 });
    const { host, applied } = mount(withResources({ cube: 200, core: 20 }));
    await execute(host, fakeResult(remainingAfter));
    applyButton(host)?.click();
    await tick();
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
      "青のキューブが 74 不足します。足りないリソースはマイナスで登録されます。",
    );
    document.body.querySelector<HTMLButtonElement>(".dialog .confirm")?.click();
    await tick();
    expect(applied[0]?.remaining.blue).toEqual({ cube: -74, core: 10 });
  });

  it("頻度を選ばずにボードを反映する確認には一言を添えない(登録の頻度マスは残す)。現在は頻度の選択で変わらない", async () => {
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

  it("コネクトを選んだままボードに置いたコネクトが所持に収まっていないときは、登録を促す文を出して実行できない。コネクトを外せば実行できる", async () => {
    const { host } = mount(emptyBoardResources(), { connectShortage: true });
    expect(host.querySelector(".message")?.textContent).toContain(
      "所持しているコネクトにないものがボードに置かれています",
    );
    expect(runButton(host)?.disabled).toBe(true);
    await openSettings(host);
    chips(host)[1]?.click();
    await tick();
    expect(runButton(host)?.disabled).toBe(false);
  });
});

describe("OptimizePlanSheet の設定", () => {
  it("曲 → ボードとコネクトの枠(上 = ユニットのみ変更する、下 = ボード・コネクト)→ 頻度の枠 の順。対象の 3 つは既定で ON、最後の 1 つは外せない", async () => {
    const { host } = mount(emptyBoardResources());
    // 開いた直後は設定のタブ
    expect(host.querySelector(".settings")).not.toBeNull();
    expect(host.querySelector(".settings .song-block h4")?.textContent).toBe("曲");
    expect(chips(host).map((c) => c.textContent.trim())).toEqual([
      "ボードを最適化する",
      "コネクトを最適化する",
      "頻度を最適化する",
    ]);
    expect(scopeChip(host)?.textContent.trim()).toBe("ユニットのみ変更する");
    // 「ユニットのみ変更する」は枠の上の行、ボード・コネクトは同じ枠の下の行
    const group = scopeChip(host)?.closest(".option-group");
    expect(
      [...(group?.querySelectorAll(".option-subs .chip") ?? [])].map((c) => c.textContent.trim()),
    ).toEqual(["ボードを最適化する", "コネクトを最適化する"]);
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

  it("「ユニットのみ変更する」はボードとコネクトの両方にかかる: どちらかを選んでいれば押せ、両方外すと disabled。頻度を外すと選び方と頻度マスの数が disabled", async () => {
    const { host } = mount(emptyBoardResources());
    await openSettings(host);
    expect(scopeChip(host)?.disabled).toBe(false);
    expect(objectives(host).every((b) => !b.disabled)).toBe(true);
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
    expect(fixSegs(host).every((b) => b.disabled)).toBe(true);
  });

  it("コネクトだけでも「ユニットのみ変更する」を外せば全ホロメン(all)で依頼する", async () => {
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

  it("頻度の選び方と、メンバーごとの頻度マスの数の固定(おまかせ / 0〜3 マス)を依頼に載せる", async () => {
    const { host } = mount(emptyBoardResources());
    await openSettings(host);
    expect(objectives(host).map((b) => b.textContent.trim())).toEqual([
      "期待値重視",
      "理論値重視",
      "ユニットスコア重視",
    ]);
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
    expect(mocks.runs).toHaveLength(0);
    runButton(host)?.click();
    await tick();
    expect(mocks.runs[0]).toMatchObject({
      objective: "unit",
      fixedFrequencyNodes: { [memberHolomenId]: 2 },
    });
  });

  it("所持リソースを考慮する: 主 + 赤・青・黄・緑。登録していない色は OFF の見た目で disabled、外した色を依頼に載せる。ボードを外すと主も disabled", async () => {
    const resources: BoardResources = {
      ...emptyBoardResources(),
      blue: { cube: 100, core: null },
      green: { cube: 0, core: 0 },
    };
    const { host } = mount(resources);
    expect(resourceChip(host)?.textContent.trim()).toBe("所持リソースを考慮する");
    expect(resourceChip(host)?.getAttribute("aria-checked")).toBe("true");
    expect(colorChips(host).map((c) => c.textContent.trim())).toEqual(["赤", "青", "黄", "緑"]);
    expect(colorChips(host).map((c) => c.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
      "true",
    ]);
    expect(colorChips(host).map((c) => c.disabled)).toEqual([true, false, true, false]);
    // 青を外すと緑が最後の 1 色になり、外せない
    colorChips(host)[1]?.click();
    await tick();
    expect(colorChips(host)[3]?.disabled).toBe(true);
    runButton(host)?.click();
    await tick();
    expect(mocks.runs[0]?.relaxedMaterialColors).toEqual(["blue"]);
    // ボードを外すと主も disabled
    chips(host)[0]?.click();
    await tick();
    expect(resourceChip(host)?.disabled).toBe(true);
  });

  it("主を外すと登録している色をすべて考慮しない", async () => {
    const { host } = mount(withResources({ cube: 10, core: 1 }));
    resourceChip(host)?.click();
    await tick();
    expect(colorChips(host).every((c) => c.disabled)).toBe(true);
    runButton(host)?.click();
    await tick();
    expect(mocks.runs[0]?.relaxedMaterialColors).toEqual(["green"]);
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
    expect(tabs(host)[1]?.getAttribute("aria-selected")).toBe("true");
    await openSettings(host);
    expect(objectives(host)[2]?.getAttribute("aria-checked")).toBe("true");
  });
});

describe("OptimizePlanSheet の結果のタブ", () => {
  it("タブは 設定 / ボード / コネクト / 頻度。結果のタブは実行するまで disabled、結果が届くと最初の結果のタブへ移り、実行した対象だけ有効。頻度のタブは見るだけ(固定・再計算の操作がない)", async () => {
    const { host } = mount(emptyBoardResources(), { connectDisabled: true });
    expect(tabs(host).map((t) => t.textContent.trim())).toEqual([
      "設定",
      "ボード",
      "コネクト",
      "頻度",
    ]);
    expect(tabs(host).map((t) => t.disabled)).toEqual([false, true, true, true]);
    expect(tabs(host)[0]?.getAttribute("aria-selected")).toBe("true");
    await execute(
      host,
      fakeResult(emptyBoardResources(), { frequency: frequencySummary([0, 1, 2]) }),
    );
    expect(tabs(host).map((t) => t.disabled)).toEqual([false, false, true, false]);
    expect(tabs(host)[1]?.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector(".open-board")).not.toBeNull();
    tabs(host)[3]?.click();
    await tick();
    expect(host.querySelector(".tab-body .recommended")?.textContent.trim()).toBe("+8.0%");
    expect(host.querySelector(".tab-body button")).toBeNull();
    expect(host.textContent).not.toContain("一部固定で最適化");
    expect(host.textContent).not.toContain("推奨頻度をリセット");
  });

  it("頻度マスに届かないメンバーは推奨を「届かない」と出す", async () => {
    const { host } = mount(emptyBoardResources());
    await execute(host, fakeResult(emptyBoardResources(), { frequency: frequencySummary([0]) }));
    tabs(host)[3]?.click();
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
});
