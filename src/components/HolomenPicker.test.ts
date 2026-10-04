// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import HolomenPicker from "./HolomenPicker.vue";
import type { BoardConnectMap } from "../storage/boardConnects";
import type { HolomenRankMap } from "../storage/holomenRank";

/**
 * ホロメンボードのホロメン一覧(2026-10-04 ユーザー指示): 各行に 名前 / Rank / 解放マス数。ランクは押してテンキーで入れる
 * (未登録は Rank --。「未登録に戻す」あり)。解放マス数は明示的に解放したコネクトマスも 1 マスとして数える
 */
const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
});
function mount(
  props: {
    ranks?: HolomenRankMap;
    connects?: BoardConnectMap;
    blue?: Record<string, string[]>;
  } = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const events: unknown[][] = [];
  createApp({
    render: () =>
      h(HolomenPicker, {
        redBoards: {},
        boards: props.blue ?? {},
        yellowBoards: {},
        greenBoards: {},
        ...(props.ranks ? { ranks: props.ranks } : {}),
        ...(props.connects ? { connects: props.connects } : {}),
        onPick: (id: string) => events.push(["pick", id]),
        onRank: (id: string, rank: number | null) => events.push(["rank", id, rank]),
      }),
  }).mount(host);
  const row = (name: string): HTMLElement | undefined =>
    [...host.querySelectorAll<HTMLElement>(".row")].find(
      (r) => r.querySelector(".name")?.textContent.trim() === name,
    );
  return { host, events, row };
}

describe("ホロメンのピッカーのランク", () => {
  it("行に Rank(登録済みは Rank 27、未登録は Rank --)と解放マス数を出す", () => {
    const { row } = mount({ ranks: { "nekomata-okayu": 27 } });
    expect(row("猫又おかゆ")?.querySelector(".rank-chip")?.textContent.trim()).toBe("Rank 27");
    expect(row("ときのそら")?.querySelector(".rank-chip")?.textContent.trim()).toBe("Rank --");
    expect(row("猫又おかゆ")?.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "解放 0 マス",
    );
  });

  it("解放マス数は解放済みのコネクトマスも数える(配置の有無とは無関係)", () => {
    const { row } = mount({
      blue: { "nekomata-okayu": ["B-001", "B-002"] },
      connects: { "nekomata-okayu": ["card", "leader"] },
    });
    expect(row("猫又おかゆ")?.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "解放 4 マス", // B-001 + B-002 + 解放済みの青のコネクト + 赤のコネクト(赤のマスが 0 でも解放したものは数える)
    );
  });

  it("名前を押すとボード画面へ(pick)。ランクを押すとテンキー → 決定で rank を出す", async () => {
    const { host, events, row } = mount({ ranks: { "nekomata-okayu": 27 } });
    row("猫又おかゆ")?.querySelector<HTMLButtonElement>(".row-main")?.click();
    expect(events).toEqual([["pick", "nekomata-okayu"]]);
    row("猫又おかゆ")?.querySelector<HTMLButtonElement>(".rank-chip")?.click();
    await nextTick();
    expect(host.textContent).toContain("猫又おかゆのホロメンランク");
    expect(host.textContent).toContain("未登録に戻す");
    const erase = host.querySelector<HTMLButtonElement>(".key.erase");
    erase?.click();
    erase?.click();
    [...host.querySelectorAll<HTMLButtonElement>(".key")]
      .find((b) => b.textContent.trim() === "5")
      ?.click();
    await nextTick();
    [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent.trim() === "決定")
      ?.click();
    await nextTick();
    expect(events.at(-1)).toEqual(["rank", "nekomata-okayu", 5]);
  });

  it("「未登録に戻す」で null。キャンセルや 0 のまま決定では何も出ない", async () => {
    const { host, events, row } = mount({ ranks: { "nekomata-okayu": 27 } });
    const open = async (): Promise<void> => {
      row("猫又おかゆ")?.querySelector<HTMLButtonElement>(".rank-chip")?.click();
      await nextTick();
    };
    const press = async (text: string): Promise<void> => {
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent.trim() === text)
        ?.click();
      await nextTick();
    };
    await open();
    await press("キャンセル");
    expect(events).toEqual([]);
    await open();
    await press("未登録に戻す");
    expect(events).toEqual([["rank", "nekomata-okayu", null]]);
    // 未登録のホロメンで 0 のまま決定 → 何も出ない(0 を未登録の代わりにしない)
    row("ときのそら")?.querySelector<HTMLButtonElement>(".rank-chip")?.click();
    await nextTick();
    await press("決定");
    expect(events).toEqual([["rank", "nekomata-okayu", null]]);
  });
});
