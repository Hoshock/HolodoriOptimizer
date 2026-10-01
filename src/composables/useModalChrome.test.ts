// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { acquireModalChrome } from "./useModalChrome";

/**
 * シートを開いた直後にオーバーレイのレイヤーを触らない（2026-10-01 ユーザー報告「結果詳細に移る時一瞬チラつく」）。
 * iOS の描画の取りこぼしの保険として `.overlay` を一瞬 translateZ(0) にしていたのが、中の常時レイヤーを作り直させていた
 */
describe("acquireModalChrome は開いた直後にオーバーレイを触らない", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("ロックするシートでも、開いたあとオーバーレイの style は変わらない", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "setTimeout"] });
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    document.body.append(overlay);
    const changes: string[] = [];
    const observer = new MutationObserver(() => changes.push(overlay.getAttribute("style") ?? ""));
    observer.observe(overlay, { attributes: true, attributeFilter: ["style"] });

    const handle = acquireModalChrome(() => undefined);
    await vi.advanceTimersByTimeAsync(400); // 2 フレーム後も 300ms 後も
    await Promise.resolve();
    expect(changes).toEqual([]);
    expect(overlay.getAttribute("style")).toBeNull();
    handle.release();
    observer.disconnect();
  });

  it("ロックしないダイアログでも触らない", async () => {
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
