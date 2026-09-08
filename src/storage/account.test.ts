import { describe, expect, it } from "vite-plus/test";

import { ACCOUNT_SCHEMA_VERSION, parseAccount, serializeAccount } from "./account";

describe("アカウント補正の保存形式", () => {
  it("v1(版番号つき)を読め、書き出しは v1 になる", () => {
    const account = { memoryPercent: 6, enhancementPercent: 2.96 };
    const raw = serializeAccount(account);
    expect(JSON.parse(raw)).toEqual({ version: ACCOUNT_SCHEMA_VERSION, ...account });
    expect(parseAccount(raw)).toEqual(account);
  });

  it("未保存・壊れたデータ・不正値は既定値(0%)に戻す", () => {
    expect(parseAccount(null)).toEqual({ memoryPercent: 0, enhancementPercent: 0 });
    expect(parseAccount("{oops")).toEqual({ memoryPercent: 0, enhancementPercent: 0 });
    expect(parseAccount("[]")).toEqual({ memoryPercent: 0, enhancementPercent: 0 });
    expect(parseAccount(JSON.stringify({ memoryPercent: "6", enhancementPercent: -1 }))).toEqual({
      memoryPercent: 0,
      enhancementPercent: 0,
    });
  });

  it("未知のフィールドは読み飛ばし、片方だけでも読める", () => {
    expect(parseAccount(JSON.stringify({ version: 9, memoryPercent: 5.8, future: true }))).toEqual({
      memoryPercent: 5.8,
      enhancementPercent: 0,
    });
  });
});
