// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import HolomenPicker from "./HolomenPicker.vue";
import type { BoardConnectMap } from "../storage/boardConnects";
import type { HolomenRankMap } from "../storage/holomenRank";

/**
 * ホロメンボードのホロメン一覧(2026-10-04 ユーザー指示): 各行に 名前 / Rank / 解放マス数。ランクは押して +/- ボタン(1 ずつと 10 ずつ。
 * 未登録は 30 から)で入れる(未登録は Rank --。「未登録に戻す」あり — 2026-10-06 ユーザー指示)。解放マス数は明示的に解放したコネクトマスも 1 マスとして数える
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

  it("名前を押すとボード画面へ(pick)。ランクを押すと +/- ダイアログ → 決定で rank を出す(登録済みは現在値から)", async () => {
    const { host, events, row } = mount({ ranks: { "nekomata-okayu": 27 } });
    row("猫又おかゆ")?.querySelector<HTMLButtonElement>(".row-main")?.click();
    expect(events).toEqual([["pick", "nekomata-okayu"]]);
    row("猫又おかゆ")?.querySelector<HTMLButtonElement>(".rank-chip")?.click();
    await nextTick();
    expect(host.textContent).toContain("猫又おかゆのホロメンランク");
    expect(host.textContent).toContain("未登録に戻す");
    expect(host.querySelector(".display .num")?.textContent).toBe("27");
    const press = async (text: string): Promise<void> => {
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent.trim() === text)
        ?.click();
      await nextTick();
    };
    await press("−10");
    await press("+1");
    await press("+1");
    expect(host.querySelector(".display .num")?.textContent).toBe("19");
    await press("決定");
    expect(events.at(-1)).toEqual(["rank", "nekomata-okayu", 19]);
  });

  it("未登録は 30 から始まる。「未登録に戻す」で null、キャンセルでは何も出ない", async () => {
    const { host, events, row } = mount({ ranks: { "nekomata-okayu": 27 } });
    const open = async (name: string): Promise<void> => {
      row(name)?.querySelector<HTMLButtonElement>(".rank-chip")?.click();
      await nextTick();
    };
    const press = async (text: string): Promise<void> => {
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent.trim() === text)
        ?.click();
      await nextTick();
    };
    await open("猫又おかゆ");
    await press("キャンセル");
    expect(events).toEqual([]);
    await open("猫又おかゆ");
    await press("未登録に戻す");
    expect(events).toEqual([["rank", "nekomata-okayu", null]]);
    // 未登録のホロメンはそのまま決定すると 30
    await open("ときのそら");
    expect(host.querySelector(".display .num")?.textContent).toBe("30");
    await press("決定");
    expect(events.at(-1)).toEqual(["rank", "tokino-sora", 30]);
  });
});

describe("ホロメンのピッカーの並び順", () => {
  const names = (host: HTMLElement): string[] =>
    [...host.querySelectorAll(".row .name")].map((e) => e.textContent.trim());
  const segText = (host: HTMLElement): string[] =>
    [...host.querySelectorAll(".sort-segment .seg")].map((e) =>
      e.textContent.replace(/\s+/g, " ").trim(),
    );
  const seg = (host: HTMLElement, label: string): HTMLButtonElement | undefined =>
    [...host.querySelectorAll<HTMLButtonElement>(".sort-segment .seg")].find((b) =>
      b.textContent.trim().startsWith(label),
    );

  it("並び順は 左から ホロメン順 / ランク順 / ボード開放順 の 3 つ。既定はボード開放順。ラベルは名前だけで、選択中だけ ▼ / ▲ を添える", () => {
    const { host } = mount();
    expect(segText(host)).toEqual(["ホロメン順", "ランク順", "ボード開放順 ▼"]);
    expect(seg(host, "ボード開放順")?.getAttribute("aria-checked")).toBe("true");
  });

  it("ランクは高い方から。未登録は最後で、同じランクはホロメン順（おかゆ → ころね）。もう一度押すと ▲ で低い方から(未登録はやはり最後)", async () => {
    const { host } = mount({
      ranks: { "nekomata-okayu": 27, "tokino-sora": 50, "inugami-korone": 27 },
    });
    seg(host, "ランク")?.click();
    await nextTick();
    expect(segText(host)[1]).toBe("ランク順 ▼");
    const top = names(host).slice(0, 3);
    expect(top).toEqual(["ときのそら", "猫又おかゆ", "戌神ころね"]);
    expect(names(host).at(-1)).not.toBe("ときのそら");
    seg(host, "ランク")?.click();
    await nextTick();
    expect(segText(host)[1]).toBe("ランク順 ▲");
    expect(names(host).slice(0, 3)).toEqual(["猫又おかゆ", "戌神ころね", "ときのそら"]);
    // 未登録のホロメンは逆順でも先頭に来ない
    expect(
      names(host)
        .slice(3)
        .every((n) => !["ときのそら", "猫又おかゆ", "戌神ころね"].includes(n)),
    ).toBe(true);
  });

  it("ホロメン順は表の先頭（そら・ロボ子・AZKi・みこ・すいせい）から。もう一度押すと ▼ で逆になる", async () => {
    const { host } = mount();
    seg(host, "ホロメン順")?.click();
    await nextTick();
    expect(segText(host)[0]).toBe("ホロメン順 ▲");
    const asc = names(host);
    expect(asc.slice(0, 5)).toEqual([
      "ときのそら",
      "ロボ子さん",
      "AZKi",
      "さくらみこ",
      "星街すいせい",
    ]);
    expect(asc.slice(-4)).toEqual(["音乃瀬奏", "一条莉々華", "儒烏風亭らでん", "轟はじめ"]);
    seg(host, "ホロメン順")?.click();
    await nextTick();
    expect(segText(host)[0]).toBe("ホロメン順 ▼");
    expect(names(host)).toEqual([...asc].reverse());
  });

  it("ボード開放順で同数のときはホロメン順", async () => {
    const { host } = mount({
      blue: { "inugami-korone": ["B-001"], "sakura-miko": ["B-001"], "ookami-mio": ["B-001"] },
    });
    // 並び順はモーダルを閉じても覚えるので、前のテストの選択に関わらず明示する
    if (seg(host, "ボード開放順")?.getAttribute("aria-checked") !== "true") {
      seg(host, "ボード開放順")?.click();
      await nextTick();
    }
    expect(segText(host)[2]).toBe("ボード開放順 ▼");
    expect(names(host).slice(0, 3)).toEqual(["さくらみこ", "大神ミオ", "戌神ころね"]);
  });
});
