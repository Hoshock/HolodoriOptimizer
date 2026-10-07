// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";
import type { Ref } from "vue";

import BoardPlanSheet from "./BoardPlanSheet.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { clearPlanCache } from "../composables/usePlanCache";
import { cards } from "../data";
import type { HolomenBoards } from "../data/boardState";
import type { BoardPlanResult } from "../engine/boardPlan";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";

/**
 * ホロメンボードの最適化シートと資材(2026-10-07 ユーザー指示): 「リソース」の登録値を計算の入力として Worker へ渡し、
 * 登録値が違えば古い結果(キャッシュ)を返さず、推奨を反映するときは推奨のあとの余りも同じ推奨としてまとめて渡す。
 * 計算そのもの(Worker)は差し替え、依頼と結果の受け渡しだけを確かめる
 */
const mocks = vi.hoisted(() => ({
  runs: [] as { resources?: unknown; scope?: string }[],
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
      run: (input: { resources?: unknown; scope?: string }) => {
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
const hosts: HTMLElement[] = [];
beforeEach(() => {
  mocks.runs.length = 0;
  clearPlanCache();
});
afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
});

function mount(resources: BoardResources) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const applied: { boards: Record<string, HolomenBoards>; remaining: BoardResources }[] = [];
  createApp({
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
        account: { memoryPercent: 0, enhancementPercent: 0 },
        songId: null,
        onClose: () => undefined,
        onApply: (boards: Record<string, HolomenBoards>, remaining: BoardResources) =>
          applied.push({ boards, remaining }),
      }),
  }).mount(host);
  return { host, applied };
}
const tick = async () => {
  await nextTick();
  await nextTick();
};

const fakeResult = (remainingAfter: BoardResources): BoardPlanResult => ({
  current: 100,
  recommended: 120,
  boards: { "tokino-sora": { red: [], blue: [], yellow: [], green: ["G-001"], connects: [] } },
  changed: ["tokino-sora"],
  infeasible: [],
  before: { "tokino-sora": { red: [], blue: [], yellow: [], green: [], connects: [] } },
  remainingAfter,
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
