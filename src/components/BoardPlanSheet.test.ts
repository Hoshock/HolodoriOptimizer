// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";
import type { Ref } from "vue";

import BoardPlanSheet from "./BoardPlanSheet.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { clearPlanCache } from "../composables/usePlanCache";
import { cards } from "../data";
import type { HolomenBoards } from "../data/boardState";
import type { BoardConnectPlanResult } from "../engine/boardConnectPlan";
import type { ConnectItem } from "../engine/connectOptimize";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import type { ConnectPlacementMap } from "../storage/connect";

/**
 * ボードの最適化シート(ホロメンボード + コネクト。2026-10-07 ユーザー指示)。
 * - 「リソース」の登録値を計算の入力として Worker へ渡し、登録値が違えば古い結果(キャッシュ)を返さず、推奨を反映するときは推奨のあとの余りも
 *   同じ推奨としてまとめて渡す(資材)
 * - 最適化する対象はボード / コネクトの独立した ON/OFF(最後の 1 つは外せない。コネクトを使えないときは OFF で始める)。選んだものだけを依頼に載せる
 * - ボードを反映する確認には、発動頻度マスが外れる一言の注意を添える
 * 計算そのもの(Worker)は差し替え、依頼と結果の受け渡しだけを確かめる
 */
const mocks = vi.hoisted(() => ({
  runs: [] as {
    resources?: unknown;
    scope?: string;
    board?: boolean;
    connect?: boolean;
    items?: unknown;
  }[],
  result: null as Ref<unknown> | null,
}));
vi.mock("../composables/useBoardPlan", async () => {
  const { ref } = await import("vue");
  const result = ref<unknown>(null);
  mocks.result = result;
  return {
    useBoardPlan: () => ({
      running: ref(false),
      result,
      error: ref(null),
      run: (input: {
        resources?: unknown;
        scope?: string;
        board?: boolean;
        connect?: boolean;
        items?: unknown;
      }) => {
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
      h(BoardPlanSheet, {
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
const chips = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>(".targets .chip"),
];

const fakeResult = (remainingAfter: BoardResources): BoardConnectPlanResult => ({
  current: 100,
  recommended: 120,
  boards: { "tokino-sora": { red: [], blue: [], yellow: [], green: ["G-001"], connects: [] } },
  changed: ["tokino-sora"],
  infeasible: [],
  before: { "tokino-sora": { red: [], blue: [], yellow: [], green: [], connects: [] } },
  remainingAfter,
  placements: {},
  rounds: 1,
});

describe("BoardPlanSheet と資材", () => {
  it("「リソース」の登録値(余り)を計算の依頼へそのまま渡す", () => {
    const resources = withResources({ cube: 700, core: 25 });
    mount(resources);
    expect(mocks.runs).toHaveLength(1);
    expect(mocks.runs[0]?.resources).toEqual(resources);
  });

  it("登録値が違うなら、同じ編成・曲・範囲でも古い結果を使わず計算し直す(キャッシュのキーに資材を含む)", async () => {
    const first = withResources({ cube: 700, core: 25 });
    mount(first);
    mocks.result!.value = fakeResult(first);
    await tick();
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
    mocks.result!.value = fakeResult(remainingAfter);
    await tick();
    host.querySelector<HTMLButtonElement>(".foot-primary")?.click();
    await tick();
    document.body.querySelector<HTMLButtonElement>(".dialog .confirm")?.click();
    await tick();
    expect(applied).toHaveLength(1);
    expect(applied[0]?.boards["tokino-sora"]?.green).toEqual(["G-001"]);
    expect(applied[0]?.remaining).toEqual(remainingAfter);
  });
});

describe("BoardPlanSheet の対象(ボード / コネクト)", () => {
  it("題は「ボードの最適化」で、チップは ボード・コネクト の 2 つ。既定は両方 ON で、両方を依頼に載せる", () => {
    const { host } = mount(emptyBoardResources());
    expect(host.querySelector("h3")?.textContent).toBe("ボードの最適化");
    expect(chips(host).map((c) => c.textContent.trim())).toEqual(["ボード", "コネクト"]);
    expect(chips(host).map((c) => c.getAttribute("aria-checked"))).toEqual(["true", "true"]);
    expect(mocks.runs[0]?.board).toBe(true);
    expect(mocks.runs[0]?.connect).toBe(true);
    expect(mocks.runs[0]?.items).toEqual(ITEMS);
  });

  it("コネクトを外すとボードだけで計算し直し、最後の 1 つのチップは外せない", async () => {
    const { host } = mount(emptyBoardResources());
    chips(host)[1]?.click();
    await tick();
    expect(mocks.runs).toHaveLength(2);
    expect(mocks.runs[1]?.board).toBe(true);
    expect(mocks.runs[1]?.connect).toBe(false);
    // 残ったボードは外せない(両方 OFF にできる道を作らない)
    expect(chips(host)[0]?.disabled).toBe(true);
    chips(host)[0]?.click();
    await tick();
    expect(mocks.runs).toHaveLength(2);
    expect(chips(host).map((c) => c.getAttribute("aria-checked"))).toEqual(["true", "false"]);
  });

  it("ボードを外すとコネクトだけ。範囲の 2 択は使えない(disabled)", async () => {
    const { host } = mount(emptyBoardResources());
    chips(host)[0]?.click();
    await tick();
    expect(mocks.runs[1]?.board).toBe(false);
    expect(mocks.runs[1]?.connect).toBe(true);
    expect(host.querySelectorAll<HTMLButtonElement>(".seg").length).toBe(2);
    expect([...host.querySelectorAll<HTMLButtonElement>(".seg")].every((b) => b.disabled)).toBe(
      true,
    );
  });

  it("コネクトを使えないとき(登録がない)は OFF で始まり、チップは押せず、ボードだけで計算する", () => {
    const { host } = mount(emptyBoardResources(), { connectDisabled: true });
    expect(chips(host)[1]?.disabled).toBe(true);
    expect(chips(host)[1]?.getAttribute("aria-checked")).toBe("false");
    expect(mocks.runs[0]?.board).toBe(true);
    expect(mocks.runs[0]?.connect).toBe(false);
  });

  it("コネクトを選んだままボードに置いたコネクトが所持に収まっていないときは、計算せずに登録を促す文を出す。コネクトを外せばボードだけ計算する", async () => {
    const { host } = mount(emptyBoardResources(), { connectShortage: true });
    expect(mocks.runs).toHaveLength(0);
    expect(host.querySelector(".message")?.textContent).toContain(
      "所持しているコネクトにないものがボードに置かれています",
    );
    chips(host)[1]?.click();
    await tick();
    expect(mocks.runs).toHaveLength(1);
    expect(mocks.runs[0]?.connect).toBe(false);
  });

  it("ボードを反映する確認には、発動頻度マスが外れる一言を添える。コネクトだけの反映には添えない", async () => {
    const both = mount(emptyBoardResources());
    mocks.result!.value = fakeResult(emptyBoardResources());
    await tick();
    both.host.querySelector<HTMLButtonElement>(".foot-primary")?.click();
    await tick();
    expect(document.body.querySelector(".dialog .note")?.textContent).toBe(
      "発動頻度マスはすべて外れます。",
    );
    document.body.querySelector<HTMLButtonElement>(".dialog .cancel")?.click();
    await tick();
    // ボードを外してコネクトだけにすると、注意は出ない(ボードは反映しない)
    chips(both.host)[0]?.click();
    await tick();
    mocks.result!.value = {
      ...fakeResult(emptyBoardResources()),
      boards: {},
      changed: [],
      placements: { "tokino-sora": { card: { extent: "card-3", permil: 1600 } } },
    };
    await tick();
    both.host.querySelector<HTMLButtonElement>(".foot-primary")?.click();
    await tick();
    expect(document.body.querySelector(".dialog")).not.toBeNull();
    expect(document.body.querySelector(".dialog .note")).toBeNull();
  });

  it("反映の中身は、選んだ対象だけ: ボードだけならコネクトの配置は null(触らない)、コネクトだけならボードは空", async () => {
    const boardOnly = mount(emptyBoardResources(), { connectDisabled: true });
    mocks.result!.value = fakeResult(emptyBoardResources());
    await tick();
    boardOnly.host.querySelector<HTMLButtonElement>(".foot-primary")?.click();
    await tick();
    document.body.querySelector<HTMLButtonElement>(".dialog .confirm")?.click();
    await tick();
    expect(boardOnly.applied[0]?.placements).toBeNull();
    expect(Object.keys(boardOnly.applied[0]?.boards ?? {})).toEqual(["tokino-sora"]);
  });
});
