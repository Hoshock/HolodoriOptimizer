// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import BoardSheet from "./BoardSheet.vue";
import type { UnlockableAnchor, HolomenBoards } from "../data/boardState";
import { boardPointsForRank, nodeBoardPoints } from "../data/boardPoints";
import type { ConnectPlacements } from "../data/connect";

/**
 * ホロメンボードの画面(2026-10-04 ユーザー指示): ホロメンランクのボードPt の予算(未登録は制限なし)、コネクトマスの 3 状態
 * (未解放 / 解放済み・配置なし / 解放済み・配置あり)、コネクトを跨ぐ線の色、解除で配置が外れるときの確認
 */
interface Props {
  rank?: number | null;
  redNodes?: string[];
  nodes?: string[];
  connects?: UnlockableAnchor[];
  placements?: ConnectPlacements;
  preview?: boolean;
  baseline?: HolomenBoards;
  canUndo?: boolean;
  canRedo?: boolean;
}
const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
});
function mount(props: Props = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const changes: HolomenBoards[] = [];
  const history: string[] = [];
  const ranks: (number | null)[] = []; // ランクの入力はボード画面にはない(ピッカーの行だけ)。出ないことの確認用
  createApp({
    render: () =>
      h(BoardSheet, {
        holomenId: "nekomata-okayu",
        redNodes: props.redNodes ?? [],
        nodes: props.nodes ?? [],
        yellowNodes: [],
        greenNodes: [],
        ...(props.connects ? { connects: props.connects } : {}),
        ...(props.rank !== undefined ? { rank: props.rank } : {}),
        ...(props.placements ? { placements: props.placements } : {}),
        ...(props.preview ? { preview: true } : {}),
        ...(props.baseline ? { baseline: props.baseline } : {}),
        canUndo: props.canUndo ?? false,
        canRedo: props.canRedo ?? false,
        onChange: (_id: string, b: HolomenBoards) => changes.push(b),
        onUndo: () => history.push("undo"),
        onRedo: () => history.push("redo"),
        onRank: (_id: string, r: number | null) => ranks.push(r),
      }),
  }).mount(host);
  const node = (key: string): SVGGElement | null => host.querySelector(`.node[data-node="${key}"]`);
  const click = async (el: Element | null | undefined): Promise<void> => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
  };
  return { host, changes, history, ranks, node, click };
}
const anchors = (host: HTMLElement): Record<string, string> => {
  const out: Record<string, string> = {};
  host.querySelectorAll(".anchor").forEach((el) => {
    const label = el.getAttribute("aria-label") ?? "";
    const state = ["placed", "unlocked", "locked"].find((c) => el.classList.contains(c)) ?? "";
    out[label.split(":")[0] ?? label] = state;
  });
  return out;
};
const activeEdges = (host: HTMLElement): number => host.querySelectorAll(".edge.active").length;
const bodyText = (): string => document.body.textContent;

describe("ホロメンランクとボードPt", () => {
  it("未登録は「Rank 未登録」と使用Pt だけ(制限なしなので解放できる)", async () => {
    const { host, changes, node, click } = mount({ redNodes: ["R-001"] });
    expect(host.querySelector(".pts")?.textContent.trim()).toBe("1 Pt"); // 制限なしは使用Pt だけ(R-001 = 1 Pt)
    expect(host.querySelector(".rank-row")).toBeNull(); // Rank・ptの枠は撤廃(名前の行の右端にポイントだけ)
    expect(host.querySelector(".who-row .pts")).not.toBeNull();
    await click(node("red:R-002"));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.red).toContain("R-002");
  });

  it("登録済みは Rank と「使用 / 予算 Pt」だけを出す(残りは出さない。ランク 5 = 9 Pt。R-001 = 1 Pt)", () => {
    const { host } = mount({ rank: 5, redNodes: ["R-001"] });
    const text = host.querySelector(".pts")?.textContent.trim() ?? "";
    expect(text).toContain("1 / 9 Pt");
    expect(text).not.toContain("残り");
  });

  it("残りPt が足りない解放は何も変えず、知らせを出す(途中までは開けない)", async () => {
    // ランク 2 = 2 Pt。R-001(1 Pt)は開けられるが、R-002(2 Pt)は残り 1 Pt で拒否
    const { changes, node, click } = mount({ rank: 2, redNodes: ["R-001"] });
    await click(node("red:R-002"));
    expect(changes).toEqual([]);
    expect(bodyText()).toContain("ボードPt が足りません");
    expect(bodyText()).toContain("あと 1 Pt 必要");
  });

  it("残りPt ちょうどなら解放できる(ランク 2 で R-001 を開ける = 1 Pt、R-002 は経路ごと 3 Pt で不足)", async () => {
    const { changes, node, click } = mount({ rank: 2 });
    await click(node("red:R-001"));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.red).toEqual(["R-001"]);
  });

  it("予算を超えている登録は削除せずに超過を表示する。新規の解放はできず、解除はできる", async () => {
    const red = ["R-001", "R-002", "R-005", "R-006", "R-007", "R-008"];
    const spent = red.reduce((sum, id) => sum + (nodeBoardPoints(id) ?? 0), 0);
    const over = spent - boardPointsForRank(3);
    expect(over).toBeGreaterThan(0);
    const { host, changes, node, click } = mount({ rank: 3, redNodes: red });
    expect(over).toBeGreaterThan(0);
    expect(host.querySelector(".pts")?.textContent).toContain(`${String(spent)} / 4 Pt`);
    expect(host.querySelector(".pts.over")).not.toBeNull();
    await click(node("red:R-003"));
    expect(changes).toEqual([]);
    expect(bodyText()).toContain("超過しています");
    // 解除はできる(切り離される先も一緒に)
    document.body.querySelector<HTMLButtonElement>(".dialog .close")?.click();
    await nextTick();
    await click(node("red:R-008"));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.red).not.toContain("R-008");
  });

  it("Pt を押してもランクは変えられない(押せる要素ではなく、ダイアログも開かない)", async () => {
    const { host, ranks, click } = mount({ rank: 27 });
    const pts = host.querySelector(".pts");
    expect(pts?.tagName).toBe("P");
    expect(host.querySelector("button.pts")).toBeNull();
    await click(pts);
    expect(document.body.querySelector(".dialog")).toBeNull();
    expect(ranks).toEqual([]);
  });
});

describe("コネクトマスの 3 状態と線の色", () => {
  const placed: ConnectPlacements = { card: { extent: "card-3", permil: 1600 } };

  it("未解放 / 解放済み・配置なし / 解放済み・配置あり を区別する(中心は常に解放済み)", () => {
    const { host } = mount({ connects: ["card", "content"], placements: placed });
    const states = anchors(host);
    expect(states["赤ボードのコネクト"]).toBe("locked");
    expect(states["青ボードのコネクト"]).toBe("placed");
    expect(states["黄ボードのコネクト"]).toBe("unlocked");
    expect(states["中心のコネクト"]).toBe("unlocked");
  });

  it("未解放のコネクトを跨いで線が有効色になってはいけない(解放すると手前の線が有効になる)", () => {
    const before = ["B-001", "B-002", "B-005", "B-006", "B-007", "B-008"];
    const locked = activeEdges(mount({ nodes: before, connects: [] }).host);
    const unlocked = activeEdges(mount({ nodes: before, connects: ["card"] }).host);
    expect(unlocked).toBe(locked + 1); // 手前のマス B-008 とコネクトの間の線
    // コネクトが未解放のまま先のマスが登録されていても(不整合)、コネクトから先の線は有効色にならない
    const beyond = activeEdges(mount({ nodes: [...before, "B-023"], connects: [] }).host);
    expect(beyond).toBe(locked);
  });

  it("コネクトの手前までのマスの解放では、コネクトは解放済みにならない(説明は「未解放(解放に 1 Pt)」)", async () => {
    const { host, changes, node, click } = mount({});
    await click(node("blue:B-008"));
    expect(changes[0]?.connects).toEqual([]);
    expect(changes[0]?.blue).toContain("B-008");
    expect(anchors(host)["青ボードのコネクト"]).toBe("locked");
  });

  it("コネクトの先のマスを開けると、途中のコネクトも解放される", async () => {
    const { changes, node, click } = mount({});
    await click(node("blue:B-023"));
    expect(changes[0]?.connects).toEqual(["card"]);
    expect(changes[0]?.blue).toContain("B-023");
  });

  it("戻る / 進むは受け側の履歴に任せる(押せるかは props、押すと undo / redo を出す — コネクトの付け外しもまとめて戻すため)", async () => {
    const off = mount({});
    const btn = (host: HTMLElement, label: string) =>
      host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(btn(off.host, "1 つ前に戻る")?.disabled).toBe(true);
    expect(btn(off.host, "1 つ先に進む")?.disabled).toBe(true);
    const on = mount({ canUndo: true, canRedo: true });
    await on.click(btn(on.host, "1 つ前に戻る"));
    await on.click(btn(on.host, "1 つ先に進む"));
    expect(on.history).toEqual(["undo", "redo"]);
  });

  it("配置のあるコネクトが外れる解除も確認を挟まずにすぐ変える(戻るで配置ごと戻せる — 2026-10-10)", async () => {
    const nodes = ["B-001", "B-002", "B-005", "B-006", "B-007", "B-008", "B-023"];
    const { changes, node, click } = mount({ nodes, connects: ["card"], placements: placed });
    await click(node("blue:B-005")); // 手前のマスを外すとコネクトと先も外れる
    expect(bodyText()).not.toContain("解除しますか");
    expect(changes).toHaveLength(1);
    expect(changes[0]?.connects).toEqual([]);
  });

  it("「すべて解放」はランクの予算内のときだけ。足りなければ途中まで開けず何も変えない(「すべて解除」は常にできる)", async () => {
    const { host, changes, click } = mount({ rank: 5 });
    const bulk = (text: string): HTMLButtonElement | undefined =>
      [...host.querySelectorAll<HTMLButtonElement>(".bulk-row button")].find(
        (b) => b.textContent.trim() === text,
      );
    await click(bulk("すべて解放"));
    expect(changes).toEqual([]);
    expect(bodyText()).toContain("ボードPt が足りません");
    document.body.querySelector<HTMLButtonElement>(".dialog .close")?.click();
    await nextTick();
    await click(bulk("すべて解除"));
    // 何も解放していないので変更なし(エラーも出ない)
    expect(changes).toEqual([]);
  });

  it("ランク未登録なら「すべて解放」は従来どおり全部(通常マス 150 + コネクト 3 = 153)", async () => {
    const { host, changes, click } = mount({});
    await click(
      [...host.querySelectorAll<HTMLButtonElement>(".bulk-row button")].find(
        (b) => b.textContent.trim() === "すべて解放",
      ),
    );
    const b = changes[0];
    expect(
      (b?.red.length ?? 0) +
        (b?.blue.length ?? 0) +
        (b?.yellow.length ?? 0) +
        (b?.green.length ?? 0),
    ).toBe(150);
    expect(b?.connects).toEqual(["leader", "card", "content"]);
  });
});

describe("見るだけの表示(組み直しプランの推奨を図で確かめる)", () => {
  const baseline: HolomenBoards = {
    red: [],
    blue: ["B-001", "B-002"],
    yellow: [],
    green: [],
    connects: [],
  };

  it("追加するマスは点滅、解除するマスは斜線。操作(解放・ランク・すべて解放)は出さない", async () => {
    // 推奨: B-001 は残し、B-002 は解除、B-005 は追加
    const { host, changes, node, click } = mount({
      preview: true,
      baseline,
      nodes: ["B-001", "B-005"],
    });
    expect(host.querySelector(".pts")).toBeNull();
    expect(host.querySelector(".bulk-row")).toBeNull();
    expect(host.querySelector(".mode-segment")).toBeNull();
    // 追加 = そのマスの色が点滅(.diff-added)、解除 = 丸の右上から左下への斜線。注釈(凡例)は出さない
    expect(node("blue:B-005")?.classList.contains("diff-added")).toBe(true);
    expect(node("blue:B-002")?.classList.contains("diff-removed")).toBe(true);
    expect(node("blue:B-002")?.querySelector("line.diff-slash")).not.toBeNull();
    expect(node("blue:B-001")?.className).not.toContain("diff-");
    expect(host.querySelectorAll(".diff-added")).toHaveLength(1);
    expect(host.querySelectorAll(".diff-slash")).toHaveLength(1);
    expect(host.querySelector(".diff-legend")).toBeNull();
    // タップは説明だけ(状態は変わらない)
    await click(node("blue:B-001"));
    expect(changes).toEqual([]);
    expect(host.querySelector(".describe-box")?.textContent).toContain("Pt");
  });
});
