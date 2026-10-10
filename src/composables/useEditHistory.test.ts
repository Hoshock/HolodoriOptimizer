import { describe, expect, it } from "vite-plus/test";

import { useEditHistory } from "./useEditHistory";

describe("useEditHistory", () => {
  const setup = () => {
    let state = { nodes: [] as string[], placed: {} as Record<string, number> };
    const h = useEditHistory(
      () => state,
      (s) => {
        state = s;
      },
    );
    return { h, get: () => state, set: (s: typeof state) => (state = s) };
  };

  it("変えた操作だけ積み、戻る・進むで写しへ戻す", () => {
    const { h, get, set } = setup();
    expect(h.canUndo.value).toBe(false);
    h.change(() => set({ nodes: ["a"], placed: {} }));
    h.change(() => set({ nodes: ["a"], placed: { center: 1400 } }));
    expect(h.canUndo.value).toBe(true);
    h.undo();
    expect(get()).toEqual({ nodes: ["a"], placed: {} });
    expect(h.canRedo.value).toBe(true);
    h.redo();
    expect(get()).toEqual({ nodes: ["a"], placed: { center: 1400 } });
    h.undo();
    h.undo();
    expect(get()).toEqual({ nodes: [], placed: {} });
    expect(h.canUndo.value).toBe(false);
  });

  it("何も変わらない操作は積まない", () => {
    const { h, set } = setup();
    h.change(() => set({ nodes: [], placed: {} }));
    expect(h.canUndo.value).toBe(false);
  });

  it("戻ったあとに別の操作をすると先の履歴は捨てる", () => {
    const { h, set } = setup();
    h.change(() => set({ nodes: ["a"], placed: {} }));
    h.undo();
    h.change(() => set({ nodes: ["b"], placed: {} }));
    expect(h.canRedo.value).toBe(false);
  });

  it("clear で両方とも空にする", () => {
    const { h, set } = setup();
    h.change(() => set({ nodes: ["a"], placed: {} }));
    h.undo();
    h.clear();
    expect(h.canUndo.value).toBe(false);
    expect(h.canRedo.value).toBe(false);
  });
});
