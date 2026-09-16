import { describe, expect, it } from "vite-plus/test";

import { frequencyTone } from "./frequencyTone";

describe("発動頻度の案といまの状態の差", () => {
  it("同じなら達成、いまが少なければ不足、多ければ過剰", () => {
    expect(frequencyTone(8, 8)).toBe("met");
    expect(frequencyTone(12, 4)).toBe("short");
    expect(frequencyTone(4, 12)).toBe("over");
  });

  it("0% どうしも達成として扱う(案が「開けない」で、いまも開けていない)", () => {
    expect(frequencyTone(0, 0)).toBe("met");
    expect(frequencyTone(0, 4)).toBe("over");
    expect(frequencyTone(4, 0)).toBe("short");
  });

  it("コネクト増幅で割り切れない実効値も、丸め誤差では動かない", () => {
    expect(frequencyTone(8.5, 8.5 + 1e-12)).toBe("met");
    expect(frequencyTone(8.5, 8.6)).toBe("over");
    expect(frequencyTone(8.6, 8.5)).toBe("short");
  });
});
