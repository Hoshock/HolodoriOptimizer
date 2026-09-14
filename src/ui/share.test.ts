import { describe, expect, it } from "vite-plus/test";

import { SITE_URL, buildShareText, buildXIntentUrl, shareUnit } from "./share";
import type { ShareEnv } from "./share";

/** 結果の共有(2026-09-14)。共有するのは画面に出ている値だけで、URL は canonical なトップページに固定する */

const unit = { leaderLabel: "猫又おかゆ「テストカード」", unitScore: 123456.7 };

describe("共有文", () => {
  it("表示中の結果から作られ、試算であることを添える", () => {
    expect(buildShareText(unit)).toBe(
      [
        "ホロドリの所持カードから編成を全探索",
        "リーダー: 猫又おかゆ「テストカード」",
        "ユニットスコア: 123,457（試算）",
        "#ホロドリ",
      ].join("\n"),
    );
  });

  it("所持カードの一覧や保存内容のような個人のデータを含まない", () => {
    const text = buildShareText(unit);
    // 共有文に出てよいのはリーダーとユニットスコアだけ。保存キーやメンバー一覧が混ざっていないこと
    expect(text).not.toContain("holodori-optimizer");
    expect(text).not.toContain("localStorage");
    expect(text.split("\n")).toHaveLength(4);
  });

  it("URL は canonical なトップページ", () => {
    expect(SITE_URL).toBe("https://hoshock.github.io/HolodoriOptimizer/");
    const url = new URL(buildXIntentUrl(buildShareText(unit), SITE_URL));
    expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
    expect(url.searchParams.get("url")).toBe(SITE_URL);
    expect(url.searchParams.get("text")).toBe(buildShareText(unit));
  });
});

describe("共有の経路", () => {
  it("Web Share API が使えるときは共有シートを使う", async () => {
    const calls: { text: string; url: string }[] = [];
    const env: ShareEnv = {
      share: (data) => {
        calls.push(data);
        return Promise.resolve();
      },
      openUrl: () => true,
    };
    expect(await shareUnit(unit, env)).toBe("shared");
    expect(calls).toEqual([{ text: buildShareText(unit), url: SITE_URL }]);
  });

  it("共有シートを閉じたときは X を開かない", async () => {
    let opened = 0;
    const env: ShareEnv = {
      share: () => Promise.reject(new Error("AbortError")),
      openUrl: () => {
        opened += 1;
        return true;
      },
    };
    expect(await shareUnit(unit, env)).toBe("cancelled");
    expect(opened).toBe(0);
  });

  it("Web Share API がない環境では X の投稿画面を開く", async () => {
    const opened: string[] = [];
    const env: ShareEnv = {
      openUrl: (url) => {
        opened.push(url);
        return true;
      },
    };
    expect(await shareUnit(unit, env)).toBe("opened");
    expect(opened).toEqual([buildXIntentUrl(buildShareText(unit), SITE_URL)]);
  });

  it("別タブも開けない環境ではテキストをコピーする", async () => {
    const copied: string[] = [];
    const env: ShareEnv = {
      openUrl: () => false,
      writeText: (text) => {
        copied.push(text);
        return Promise.resolve();
      },
    };
    expect(await shareUnit(unit, env)).toBe("copied");
    expect(copied).toEqual([`${buildShareText(unit)}\n${SITE_URL}`]);
  });

  it("どれも使えなければ失敗を返す(黙って握りつぶさない)", async () => {
    expect(await shareUnit(unit, {})).toBe("failed");
  });
});
