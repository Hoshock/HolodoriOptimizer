// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";
import type { Component } from "vue";

import TierCardSheet from "./TierCardSheet.vue";
import TierSheet from "./TierSheet.vue";
import tierJson from "../data/tierList.json";
import { evaluateTier, evaluateTierCard } from "../engine/tier";
import type { TierDataset } from "../engine/tier";

const dataset = tierJson as TierDataset;
const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

function mount(component: Component, props: Record<string, unknown>) {
  const picked: unknown[][] = [];
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  createApp({
    render: () =>
      h(component, {
        ...props,
        onPick: (...args: unknown[]) => picked.push(args),
        onCard: (...args: unknown[]) => picked.push(["card", ...args]),
        onClose: () => picked.push(["close"]),
      }),
  }).mount(host);
  return { host, picked };
}

const texts = (host: HTMLElement, selector: string): string[] =>
  [...host.querySelectorAll(selector)].map((el) => el.textContent?.trim() ?? "");

/** ティア表(2026-10-09 ユーザー指示: リーダーが左・細いタイル・押すと評価画面) */
describe("TierSheet", () => {
  it("切り替えは リーダー → メンバー の順で、最初はリーダー", () => {
    const { host } = mount(TierSheet, {});
    const segs = [...host.querySelectorAll(".segment.roles .seg")];
    expect(segs.map((s) => s.textContent?.trim())).toEqual(["リーダー", "メンバー"]);
    expect(segs[0]?.getAttribute("aria-checked")).toBe("true");
    expect(segs[1]?.getAttribute("aria-checked")).toBe("false");
  });

  it("役割の下にタイプの絞り込み(すべて / キュート / ハッピー / ピュア)があり、選ぶとそのタイプのタイルだけになる", async () => {
    const { host } = mount(TierSheet, {});
    const segs = [...host.querySelectorAll(".segment.types .seg")];
    expect(segs.map((s) => s.textContent?.trim())).toEqual([
      "すべて",
      "キュート",
      "ハッピー",
      "ピュア",
    ]);
    expect(segs[0]?.getAttribute("aria-checked")).toBe("true");
    (segs[1] as HTMLButtonElement).click();
    await nextTick();
    const tiles = [...host.querySelectorAll(".tile")];
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) expect(t.classList.contains("type-cute")).toBe(true);
    const total = Object.keys(dataset.cards).length;
    expect(tiles.length).toBeLessThan(total);
    (segs[0] as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelectorAll(".tile")).toHaveLength(total);
  });

  it("段の見出しは上の段から順で、タイルの合計は ★5 全枚。先頭はリーダー採用率が最も高いカード", () => {
    const { host } = mount(TierSheet, {});
    const ranks = texts(host, ".tier-rank");
    expect(ranks[0]).toBe(evaluateTier(dataset, "leader")[0]!.rank);
    expect([...ranks].sort()).toEqual([...new Set(ranks)].sort());
    expect(host.querySelectorAll(".tile")).toHaveLength(Object.keys(dataset.cards).length);
    // タイルに数字は書かず、下の行は開花(5凸)と星(「細いカードにパーセントを書くな」「tier表も星5開花アイコン入れておくこと」)
    const first = host.querySelector(".tile")!;
    expect(first.textContent).not.toMatch(/%/);
    expect(first.querySelector("[aria-label='開花5']")).not.toBeNull();
    expect(first.querySelector("[aria-label='★5']")).not.toBeNull();
  });

  it("タイルを押すと、カード ID と役割で pick を出す。メンバーへ切り替えると役割が変わる", async () => {
    const { host, picked } = mount(TierSheet, {});
    (host.querySelector(".tile") as HTMLButtonElement).click();
    expect(picked[0]).toEqual([evaluateTier(dataset, "leader")[0]!.cardId, "leader"]);

    ([...host.querySelectorAll(".segment.roles .seg")][1] as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector(".tile") as HTMLButtonElement).click();
    expect(picked[1]).toEqual([evaluateTier(dataset, "member")[0]!.cardId, "member"]);
  });
});

describe("TierCardSheet", () => {
  it("並びは カード → 段と採用率 → 総評 → 最高スコアの編成 → 評価軸の表 で、表はメンバー 9 行", () => {
    const id = dataset.best.memberIds[0]!;
    const e = evaluateTierCard(dataset, id, "member")!;
    const { host, picked } = mount(TierCardSheet, { cardId: id, role: "member" });
    expect(host.querySelector(".verdict-rank")?.textContent).toBe(e.rank);
    expect(host.querySelector(".verdict-score-value")?.textContent).toBe(
      `${Math.round(e.adoptionRate * 100)}%`,
    );
    expect(host.querySelector(".verdict-score-diff")?.textContent).toContain("採用率");
    expect(texts(host, "h4")).toEqual(["総評", "最高スコアの編成※2", "評価※3"]);
    // 最高スコアの編成: リーダー 1 + メンバー 5 のタイルで、このカードは太枠(mine)。メンバーのタイルは 開花 5 と星
    expect(host.querySelectorAll(".team .member-tile")).toHaveLength(5);
    expect(host.querySelector(".team .team-leader")).not.toBeNull();
    expect(host.querySelectorAll(".team .mine")).toHaveLength(1);
    expect(host.querySelector(".team .member-tile [aria-label='開花5']")).not.toBeNull();
    const summary = host.querySelector(".summary");
    const table = host.querySelector("table");
    expect(
      summary && table && summary.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(9);
    expect(texts(host, "thead th")).toEqual(["項目", "内容", "順位"]);

    (host.querySelector(".unit-card") as HTMLButtonElement).click();
    expect(picked[0]).toEqual(["card", id]);
    // 編成のタイルを押してもカード詳細
    (host.querySelector(".team .member-tile") as HTMLButtonElement).click();
    expect(picked[1]?.[0]).toBe("card");
  });

  it("リーダーの表は 5 行で、編成のリーダーのパネルが太枠", () => {
    const { host } = mount(TierCardSheet, { cardId: dataset.best.leaderId, role: "leader" });
    expect(host.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(host.querySelector(".verdict-role")?.textContent).toBe("リーダー");
    expect(host.querySelector(".team .team-leader.mine")).not.toBeNull();
    expect(host.querySelectorAll(".team .member-tile.mine")).toHaveLength(0);
  });
});
