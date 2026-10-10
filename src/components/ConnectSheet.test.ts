// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import ConnectSheet from "./ConnectSheet.vue";
import { connectPermilCandidates } from "../data/connect";
import type { ConnectPlacement, ConnectPlacements } from "../data/connect";
import type { ConnectInventoryEntry, ConnectSlot } from "../storage/connectInventory";

/**
 * コネクトの入力は自由入力でなく候補からの選択（2026-10-02 ユーザー指示）。
 * 形をタップすると、その形で取りうる倍率が選択肢に出て、選ぶとそのまま確定する。
 * 保存済みの値が候補にない（自由入力だった過去の値）ときは、選択肢へ添えて選択中にする
 */
function mount(
  placement: ConnectPlacement | null,
  options: {
    inventory?: ConnectInventoryEntry[];
    allPlacements?: Record<string, ConnectPlacements>;
    cardsUnregistered?: boolean;
  } = {},
): {
  host: HTMLElement;
  submitted: ConnectPlacement[];
  moved: [ConnectPlacement, ConnectSlot][];
  unmount: () => void;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const submitted: ConnectPlacement[] = [];
  const moved: [ConnectPlacement, ConnectSlot][] = [];
  const app = createApp({
    render: () =>
      h(ConnectSheet, {
        holomenId: "nekomata-okayu",
        anchor: "card",
        color: "blue",
        placement,
        allPlacements: options.allPlacements ?? {},
        // 既定はどの候補も 1 枚ずつ持っている(残りがあるので警告は出ない)
        inventory: options.inventory ?? OWN_ALL,
        cardsUnregistered: options.cardsUnregistered ?? false,
        onSubmit: (p: ConnectPlacement) => submitted.push(p),
        onMove: (p: ConnectPlacement, from: ConnectSlot) => moved.push([p, from]),
      }),
  });
  app.mount(host);
  return {
    host,
    submitted,
    moved,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

/** 候補の表示（数値はデータ側の候補から取る — 外部情報由来の値をテストへ書き写さない） */
const label = (permil: number): string => `+${String(permil / 10)}%`;
const CARD_3 = connectPermilCandidates("card-3");
const CONTENT_3 = connectPermilCandidates("content-3");
const OWN_ALL: ConnectInventoryEntry[] = [
  ...CARD_3.map((permil) => ({ extent: "card-3" as const, permil, count: 1 })),
  ...CONTENT_3.map((permil) => ({ extent: "content-3" as const, permil, count: 1 })),
];

/** 候補のボタンの倍率(下の行の「残り n」は除く) */
const percentOf = (b: HTMLButtonElement): string =>
  b.querySelector(".seg-percent")?.textContent?.trim() ?? "";
const choicesOf = (host: HTMLElement): string[] =>
  [...host.querySelectorAll<HTMLButtonElement>('[role="radiogroup"] [role="radio"]')].map(
    percentOf,
  );

describe("コネクトの倍率は候補から選ぶ", () => {
  it("形をタップすると候補だけが並び、数字を打つ欄（テンキー・入力欄）は出ない", async () => {
    const { host, unmount } = mount(null);
    host.querySelector<HTMLButtonElement>('button.shape[aria-label="右へ 3"]')?.click();
    await nextTick();
    expect(choicesOf(host)).toEqual(CARD_3.map(label));
    expect(host.querySelector("input")).toBeNull();
    expect(host.textContent).not.toContain("決定");
    unmount();
  });

  it("候補を選ぶとその形と倍率で確定し、ダイアログは閉じる", async () => {
    const { host, submitted, unmount } = mount(null);
    host.querySelector<HTMLButtonElement>('button.shape[aria-label="右へ 3"]')?.click();
    await nextTick();
    const second = CARD_3[1] as number;
    const pick = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (b) => percentOf(b) === label(second),
    );
    pick?.click();
    await nextTick();
    expect(submitted).toEqual([{ extent: "card-3", permil: second }]);
    unmount();
  });

  it("入れてある形と倍率は選択中で出る（同じ形を開き直したとき）", async () => {
    const last = CARD_3[CARD_3.length - 1] as number;
    const { host, unmount } = mount({ extent: "card-3", permil: last });
    host.querySelector<HTMLButtonElement>('button.shape[aria-label="右へ 3"]')?.click();
    await nextTick();
    const checked = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .filter((b) => b.getAttribute("aria-checked") === "true")
      .map(percentOf);
    expect(checked).toEqual([label(last)]);
    unmount();
  });

  it("保存済みの値が候補にないとき、その値を選択肢へ添えて選択中にする（開いただけでは値が変わらない）", async () => {
    const { host, submitted, unmount } = mount({ extent: "card-3", permil: 1234 });
    host.querySelector<HTMLButtonElement>('button.shape[aria-label="右へ 3"]')?.click();
    await nextTick();
    expect(choicesOf(host)).toEqual([...CARD_3.map(label), "+123.4%"]);
    const checked = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .filter((b) => b.getAttribute("aria-checked") === "true")
      .map(percentOf);
    expect(checked).toEqual(["+123.4%"]);
    expect(submitted).toEqual([]);
    unmount();
  });

  it("別の形のタイルを開いたときは、入れてある形の値を選択中にしない", async () => {
    const { host, unmount } = mount({ extent: "card-3", permil: CARD_3[0] as number });
    host.querySelector<HTMLButtonElement>('button.shape[aria-label="左へ 3"]')?.click();
    await nextTick();
    expect(choicesOf(host)).toEqual(CONTENT_3.map(label));
    const checked = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].filter(
      (b) => b.getAttribute("aria-checked") === "true",
    );
    expect(checked).toEqual([]);
    unmount();
  });
});

/**
 * 持っている枚数と見比べる(2026-10-10 ユーザー指示「ボード上でコネクトおくとき、他で使われているコネクトを外さないと置けない場合、
 * どこから取ってくるかというのを指定しておけるようにしたい」「禁止まではしないがモーダルで警告を出す」「(未登録でも)照合する」)
 */
describe("持っている枚数を超えて置くときは警告して、持ってくる場所を選ばせる", () => {
  const [low, mid] = CARD_3 as [number, number];
  const pickRight3 = async (host: HTMLElement, permil: number): Promise<void> => {
    host.querySelector<HTMLButtonElement>('button.shape[aria-label="右へ 3"]')?.click();
    await nextTick();
    [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((b) => percentOf(b) === label(permil))
      ?.click();
    await nextTick();
  };
  const restsOf = (host: HTMLElement): string[] =>
    [...host.querySelectorAll(".seg-rest")].map((e) => e.textContent?.trim() ?? "");
  const dialogOf = (host: HTMLElement): HTMLElement | null =>
    host.querySelector("[data-view='permil'] .take-pane");
  /** 中身の切り替えのアニメーションが済むまで待つ */
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 50));
  // ★ 2 枚(mid)を フブキ の青と ミオ の中心に置いている
  const twoUsed = {
    inventory: [{ extent: "card-3" as const, permil: mid, count: 2 }],
    allPlacements: {
      "shirakami-fubuki": { card: { extent: "card-3" as const, permil: mid } },
      "ookami-mio": { center: { extent: "card-3" as const, permil: mid } },
    },
  };

  it("倍率の候補の下に残り(持っている枚数 − ほかに置いている数)を出す", async () => {
    const { host, unmount } = mount(null, {
      inventory: [
        { extent: "card-3", permil: mid, count: 2 },
        { extent: "card-3", permil: low, count: 1 },
      ],
      allPlacements: twoUsed.allPlacements,
    });
    host.querySelector<HTMLButtonElement>('button.shape[aria-label="右へ 3"]')?.click();
    await nextTick();
    expect(restsOf(host)).toEqual(CARD_3.map((p) => (p === low ? "残り 1" : "残り 0")));
    unmount();
  });

  it("残りがあればそのまま置き、警告は出さない", async () => {
    const { host, submitted, unmount } = mount(null, { inventory: OWN_ALL });
    await pickRight3(host, mid);
    expect(dialogOf(host)).toBeNull();
    expect(submitted).toEqual([{ extent: "card-3", permil: mid }]);
    unmount();
  });

  it("全部使っている倍率を選ぶと、置いている場所が並び、選んだ場所から外してここへ置く", async () => {
    const { host, submitted, moved, unmount } = mount(null, twoUsed);
    await pickRight3(host, mid);
    const dialog = dialogOf(host);
    // 説明の文は画面に出さず(「不要な文章はなるべく書かない」)、状況は読み上げ用のラベルへ
    expect(dialog?.getAttribute("aria-label")).toContain("2 枚とも使っています");
    // 選んだ行がその場で広がる
    expect(host.querySelector(`.row-box.open[data-permil="${String(mid)}"]`)).not.toBeNull();
    expect(submitted).toEqual([]);
    const sources = [
      ...(dialog?.querySelectorAll<HTMLButtonElement>(".source:not(.ignore)") ?? []),
    ];
    expect(sources.map((b) => b.querySelector(".anchor")?.textContent?.trim())).toEqual([
      "中心から外す",
      "青ボードから外す",
    ]);
    sources[1]?.click();
    await nextTick();
    expect(moved).toEqual([
      [
        { extent: "card-3", permil: mid },
        { holomenId: "shirakami-fubuki", anchor: "card" },
      ],
    ]);
    unmount();
  });

  it("持っている枚数より多く置いているときは、持っている枚数と置いている場所の数を両方言う", async () => {
    const { host, unmount } = mount(null, {
      inventory: [{ extent: "card-3", permil: mid, count: 1 }],
      allPlacements: twoUsed.allPlacements,
    });
    await pickRight3(host, mid);
    const dialog = dialogOf(host);
    expect(dialog?.getAttribute("aria-label")).toContain("1 枚持っていて、2 か所に置いています");
    expect(dialog?.querySelectorAll(".source:not(.ignore)").length).toBe(2);
    unmount();
  });

  it("いちばん下の「無視して置く」は超えたまま置き(禁止しない)、戻るは広げた行だけを閉じる", async () => {
    const placeAnyway = mount(null, twoUsed);
    await pickRight3(placeAnyway.host, mid);
    const rows = [...placeAnyway.host.querySelectorAll<HTMLButtonElement>(".take-pane .source")];
    // 場所の行と同じ形で、いちばん下に並ぶ。キャンセルは置かない(右上の ✕ と戻るがある)
    expect(rows.at(-1)?.textContent?.trim()).toBe("無視して置く");
    expect(placeAnyway.host.querySelector(".take-pane")?.textContent).not.toContain("キャンセル");
    rows.at(-1)?.click();
    await nextTick();
    expect(placeAnyway.submitted).toEqual([{ extent: "card-3", permil: mid }]);
    expect(placeAnyway.moved).toEqual([]);
    placeAnyway.unmount();

    const back = mount(null, twoUsed);
    await pickRight3(back.host, mid);
    back.host.querySelector<HTMLButtonElement>("button.back")?.click();
    await settle();
    expect(back.submitted).toEqual([]);
    expect(back.moved).toEqual([]);
    expect(back.host.querySelector(".row-box.open")).toBeNull();
    // 図形と倍率の候補はそのまま
    expect(back.host.querySelector("[data-view='permil'] [role='radiogroup']")).not.toBeNull();
    back.unmount();
  });

  it("自分のコネクトマスに置いている分は数えない(入れてあるものを選び直しても警告しない)", async () => {
    const { host, submitted, unmount } = mount(
      { extent: "card-3", permil: mid },
      {
        inventory: [{ extent: "card-3", permil: mid, count: 1 }],
        allPlacements: { "nekomata-okayu": { card: { extent: "card-3", permil: mid } } },
      },
    );
    await pickRight3(host, mid);
    expect(dialogOf(host)).toBeNull();
    expect(submitted).toEqual([{ extent: "card-3", permil: mid }]);
    unmount();
  });

  it("所持カードが未登録でも見比べる(持っていない扱いで警告し、未登録と添える)", async () => {
    const { host, submitted, unmount } = mount(null, { inventory: [], cardsUnregistered: true });
    await pickRight3(host, mid);
    const dialog = dialogOf(host);
    expect(dialog?.getAttribute("aria-label")).toContain("は持っていません。");
    expect(dialog?.textContent).toContain("所持カードが未登録です");
    expect(dialog?.querySelectorAll(".source:not(.ignore)").length).toBe(0);
    expect(submitted).toEqual([]);
    unmount();
  });
});

/**
 * モーダルの上にモーダルを重ねず、1 つのモーダルの中身を切り替える(2026-10-10 ユーザー指示「モーダルの上にモーダルってキモい」
 * 「図形選択したらそれが拡大されて％選べるようになる」「シームレスにアニメーション入れて」)
 */
describe("コネクト効果のモーダルの中身の切り替え", () => {
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 50));
  const dialogs = (host: HTMLElement): number => host.querySelectorAll("[role='dialog']").length;

  it("形を押すと同じモーダルの中で倍率に切り替わる(ダイアログは 1 つのまま)", async () => {
    const { host, unmount } = mount(null);
    host.querySelector<HTMLButtonElement>('button.shape[aria-label="右へ 3"]')?.click();
    await nextTick();
    expect(dialogs(host)).toBe(1);
    expect(host.querySelector("[data-view='permil'] [role='radiogroup']")).not.toBeNull();
    expect(host.querySelector(".grid-view")?.classList.contains("away")).toBe(true);
    // 拡大する図形(.hero)の位置は実際のレイアウトから測るので、レイアウトを持たないテスト環境では確かめない
    unmount();
  });

  it("戻るで形の一覧へ戻る", async () => {
    const { host, unmount } = mount(null);
    host.querySelector<HTMLButtonElement>('button.shape[aria-label="右へ 3"]')?.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>("button.back")?.click();
    await settle();
    expect(host.querySelector(".grid-view")?.classList.contains("away")).toBe(false);
    expect(host.querySelector("[data-view='permil']")).toBeNull();
    expect(host.querySelector("button.back")).toBeNull();
    unmount();
  });

  it("一覧も同じモーダルの中で切り替わる", async () => {
    const { host, unmount } = mount(null, {
      allPlacements: {
        "shirakami-fubuki": { card: { extent: "card-3", permil: CARD_3[0] as number } },
      },
    });
    host.querySelector<HTMLButtonElement>("button.list-button")?.click();
    await nextTick();
    expect(dialogs(host)).toBe(1);
    expect(host.querySelector("[data-view='list'] table")).not.toBeNull();
    unmount();
  });
});
