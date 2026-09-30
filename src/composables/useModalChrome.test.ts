// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { acquireModalChrome } from "./useModalChrome";

/**
 * iOS で開いた直後のシートの一部が描かれないままになる件の保険（2026-09-30 ユーザー報告）。
 * シートを開いたあと、オーバーレイを 1 フレームだけ別レイヤーにして戻す。見た目の状態（transform なし）は最後に必ず戻る
 */
describe("acquireModalChrome の描き直し", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("開いた直後にオーバーレイを translateZ(0) にし、次のフレームで外す", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "setTimeout"] });
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    document.body.append(overlay);

    const handle = acquireModalChrome(() => undefined);
    expect(overlay.style.transform).toBe("");
    await vi.advanceTimersByTimeAsync(40); // 2 フレーム分 → 載せる
    await vi.advanceTimersByTimeAsync(20); // 次のフレーム → 外す
    expect(overlay.style.transform).toBe("");
    await vi.advanceTimersByTimeAsync(400); // 300ms 後の 2 回目も、終われば外れている
    expect(overlay.style.transform).toBe("");
    handle.release();
  });

  it("載せている間は translateZ(0) になっている", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "setTimeout"] });
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    document.body.append(overlay);
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(overlay.style.transform));
    observer.observe(overlay, { attributes: true, attributeFilter: ["style"] });

    const handle = acquireModalChrome(() => undefined);
    await vi.advanceTimersByTimeAsync(400);
    await Promise.resolve();
    expect(seen).toContain("translateZ(0)");
    handle.release();
    observer.disconnect();
  });

  it("ロックしないダイアログでは触らない", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "setTimeout"] });
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    document.body.append(overlay);
    const handle = acquireModalChrome(() => undefined, { lockScroll: false });
    await vi.advanceTimersByTimeAsync(400);
    expect(overlay.getAttribute("style")).toBeNull();
    handle.release();
  });
});
