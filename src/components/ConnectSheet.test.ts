// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import ConnectSheet from "./ConnectSheet.vue";
import { connectPermilCandidates } from "../data/connect";
import type { ConnectPlacement } from "../data/connect";

/**
 * コネクトの入力は自由入力でなく候補からの選択（2026-10-02 ユーザー指示）。
 * 形をタップすると、その形で取りうる倍率が選択肢に出て、選ぶとそのまま確定する。
 * 保存済みの値が候補にない（自由入力だった過去の値）ときは、選択肢へ添えて選択中にする
 */
function mount(placement: ConnectPlacement | null): {
  host: HTMLElement;
  submitted: ConnectPlacement[];
  unmount: () => void;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const submitted: ConnectPlacement[] = [];
  const app = createApp({
    render: () =>
      h(ConnectSheet, {
        holomenId: "nekomata-okayu",
        anchor: "card",
        color: "blue",
        placement,
        allPlacements: {},
        onSubmit: (p: ConnectPlacement) => submitted.push(p),
      }),
  });
  app.mount(host);
  return {
    host,
    submitted,
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

const choicesOf = (host: HTMLElement): string[] =>
  [...host.querySelectorAll<HTMLButtonElement>('[role="radiogroup"] [role="radio"]')].map(
    (b) => b.textContent?.trim() ?? "",
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
      (b) => b.textContent?.trim() === label(second),
    );
    pick?.click();
    await nextTick();
    expect(submitted).toEqual([{ extent: "card-3", permil: second }]);
    expect(host.querySelector('[role="radiogroup"]')).toBeNull();
    unmount();
  });

  it("入れてある形と倍率は選択中で出る（同じ形を開き直したとき）", async () => {
    const last = CARD_3[CARD_3.length - 1] as number;
    const { host, unmount } = mount({ extent: "card-3", permil: last });
    host.querySelector<HTMLButtonElement>('button.shape[aria-label="右へ 3"]')?.click();
    await nextTick();
    const checked = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .filter((b) => b.getAttribute("aria-checked") === "true")
      .map((b) => b.textContent?.trim());
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
      .map((b) => b.textContent?.trim());
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
