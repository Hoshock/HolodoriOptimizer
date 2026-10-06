import { describe, expect, it } from "vite-plus/test";

import {
  ACCOUNT_SCHEMA_VERSION,
  DEFAULT_ACCOUNT_BONUS,
  parseAccount,
  serializeAccount,
} from "./account";

describe("アカウント補正の保存形式", () => {
  it("v1(版番号つき)を読め、書き出しは v1 になる", () => {
    const account = { memoryPercent: 6, enhancementPercent: 2.96 };
    const raw = serializeAccount(account);
    expect(JSON.parse(raw)).toEqual({ version: ACCOUNT_SCHEMA_VERSION, ...account });
    expect(parseAccount(raw)).toEqual(account);
  });

  it("未保存・壊れたデータは既定値(メモリー 3.0%・強化ボーナス 2.00%)に戻し、封筒の中の不正値は 0 にする", () => {
    const defaults = { memoryPercent: 3, enhancementPercent: 2 };
    expect(DEFAULT_ACCOUNT_BONUS).toEqual(defaults);
    expect(parseAccount(null)).toEqual(defaults);
    expect(parseAccount("{oops")).toEqual(defaults);
    expect(parseAccount("[]")).toEqual(defaults);
    expect(parseAccount(JSON.stringify({ memoryPercent: "6", enhancementPercent: -1 }))).toEqual({
      memoryPercent: 0,
      enhancementPercent: 0,
    });
  });

  it("登録済みの 0 は 0 のまま読む(既定値で上書きしない)", () => {
    const raw = serializeAccount({ memoryPercent: 0, enhancementPercent: 0 });
    expect(parseAccount(raw)).toEqual({ memoryPercent: 0, enhancementPercent: 0 });
  });

  it("未知のフィールドは読み飛ばし、片方だけでも読める", () => {
    expect(parseAccount(JSON.stringify({ version: 9, memoryPercent: 5.8, future: true }))).toEqual({
      memoryPercent: 5.8,
      enhancementPercent: 0,
    });
  });
});
