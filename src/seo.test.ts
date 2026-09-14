import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

/**
 * 検索に出す側の取り決め(2026-09-14 ユーザー指示)を固定する。
 * 見るのはビルド前のソースだが、ここで確かめている部分(title / meta / JSON-LD / noscript / 本文)は
 * Vite が書き換えないのでビルド後の HTML にもそのまま出る。
 * 書き換わるのは script・link のパスだけで、そちらは `base` の設定(vite.config.ts)が受け持つ
 */

const SITE_URL = "https://hoshock.github.io/HolodoriOptimizer/";
const OG_IMAGE_URL = `${SITE_URL}og/holodori-optimizer.png`;
const BASE_PATH = "/HolodoriOptimizer/";

function repoFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

/** `<meta name="..." content="...">` / `<meta property="..." content="...">` を拾う(属性の順は問わない) */
function metaContent(html: string, key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]*(?:name|property)="${key}"[^>]*>|<meta[^>]*content="[^"]*"[^>]*(?:name|property)="${key}"[^>]*>`,
    "s",
  );
  const tag = pattern.exec(html)?.[0];
  return tag ? (/content="([^"]*)"/s.exec(tag)?.[1] ?? null) : null;
}

function linkHref(html: string, rel: string): string | null {
  const tag = new RegExp(`<link[^>]*rel="${rel}"[^>]*>`, "s").exec(html)?.[0];
  return tag ? (/href="([^"]*)"/s.exec(tag)?.[1] ?? null) : null;
}

function titleOf(html: string): string | null {
  return /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? null;
}

function headingCount(html: string, level: string): number {
  return html.match(new RegExp(`<${level}[\\s>]`, "g"))?.length ?? 0;
}

const indexHtml = repoFile("index.html");
const simulatorHtml = repoFile("guides/simulator/index.html");
const unitScoreHtml = repoFile("guides/unit-score/index.html");

describe("トップページのメタデータ", () => {
  it("title は変更しない", () => {
    expect(titleOf(indexHtml)).toBe("ホロドリ編成最適化・ユニットスコア計算｜非公式ツール");
  });

  it("description と og:description が編成シミュレーターであることを伝える", () => {
    const description = metaContent(indexHtml, "description");
    expect(description).toContain("編成シミュレーター");
    expect(description).toContain("全探索");
    // 1〜2 文(句点 2 つまで)
    expect((description?.match(/。/g) ?? []).length).toBeLessThanOrEqual(2);
    expect(metaContent(indexHtml, "og:description")).toContain("編成シミュレーター");
  });

  it("canonical と og:url がトップページの URL で揃っている", () => {
    expect(linkHref(indexHtml, "canonical")).toBe(SITE_URL);
    expect(metaContent(indexHtml, "og:url")).toBe(SITE_URL);
  });

  it("meta keywords は置かない", () => {
    expect(metaContent(indexHtml, "keywords")).toBeNull();
  });

  it("Google の所有権確認タグを残している", () => {
    expect(metaContent(indexHtml, "google-site-verification")).toBe(
      "d2O_LnX_jqilGkNNBVKWsS8fYKw2v_5S3N5p9y7nroM",
    );
  });

  it("JSON-LD が有効な JSON で、description と alternateName が本文と整合する", () => {
    const raw = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(indexHtml)?.[1];
    expect(raw).toBeTruthy();
    const data = JSON.parse(raw ?? "") as {
      "@type": string;
      url: string;
      description: string;
      alternateName: string[];
      aggregateRating?: unknown;
      review?: unknown;
    };
    expect(data["@type"]).toBe("WebApplication");
    expect(data.url).toBe(SITE_URL);
    expect(data.description).toContain("編成シミュレーター");
    expect(data.alternateName).toContain("HolodoriOptimizer");
    expect(data.alternateName).toContain("ホロドリ編成シミュレーター");
    // 架空の評価・レビューは置かない(rich result のためであっても)
    expect(data.aggregateRating).toBeUndefined();
    expect(data.review).toBeUndefined();
  });

  it("ビルド後の HTML だけでもページの目的が分かる(noscript の説明と解説ページへのリンク)", () => {
    expect(indexHtml).toContain("ホロドリの編成シミュレーターです。");
    expect(indexHtml).toContain("試算値");
    expect(indexHtml).toContain(`${BASE_PATH}guides/simulator/`);
    expect(indexHtml).toContain(`${BASE_PATH}guides/unit-score/`);
  });

  it("H1 は 1 つだけ", () => {
    expect(headingCount(indexHtml, "h1")).toBe(1);
    // 画面(Vue)側の H1 もヘッダの 1 つだけ
    expect(headingCount(repoFile("src/App.vue"), "h1")).toBe(1);
  });

  it("画面に「編成シミュレーター」を含む H2 の説明領域がある", () => {
    const about = repoFile("src/components/AboutSection.vue");
    // 見出しは折り返し位置を決めるために span で区切ってあるので、タグを外してから比べる
    const heading = /<h2[^>]*>(.*?)<\/h2>/s.exec(about)?.[1]?.replace(/<[^>]*>|\s/g, "");
    expect(heading).toBe("所持カードから最適編成を探す編成シミュレーター");
    expect(about).toContain("このツールでできること");
    // 検索用の隠しテキストを置かない
    expect(about).not.toContain("display: none");
    expect(about).not.toContain("display:none");
  });
});

describe("OGP 画像", () => {
  it("絶対 URL で、寸法と代替テキストを添える", () => {
    expect(metaContent(indexHtml, "og:image")).toBe(OG_IMAGE_URL);
    expect(metaContent(indexHtml, "og:image")?.startsWith("https://")).toBe(true);
    expect(metaContent(indexHtml, "og:image:width")).toBe("1200");
    expect(metaContent(indexHtml, "og:image:height")).toBe("630");
    expect(metaContent(indexHtml, "og:image:alt")).toBeTruthy();
    expect(metaContent(indexHtml, "twitter:card")).toBe("summary_large_image");
    expect(metaContent(indexHtml, "twitter:image")).toBe(OG_IMAGE_URL);
  });

  it("実体が 1200×630 の PNG として置かれている", () => {
    const png = readFileSync(new URL("../public/og/holodori-optimizer.png", import.meta.url));
    expect([...png.subarray(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});

describe("解説ページ", () => {
  const pages = [
    { name: "guides/simulator", html: simulatorHtml, slug: "simulator" },
    { name: "guides/unit-score", html: unitScoreHtml, slug: "unit-score" },
  ];

  it("ビルドの入力に入っている(出力に index.html として出る)", () => {
    const config = repoFile("vite.config.ts");
    expect(config).toContain('entry("guides/simulator/index.html")');
    expect(config).toContain('entry("guides/unit-score/index.html")');
  });

  for (const page of pages) {
    it(`${page.name} は固有の title・description・canonical・OGP を持つ`, () => {
      expect(titleOf(page.html)).toBeTruthy();
      expect(titleOf(page.html)).not.toBe(titleOf(indexHtml));
      expect(metaContent(page.html, "description")).toBeTruthy();
      expect(metaContent(page.html, "description")).not.toBe(metaContent(indexHtml, "description"));
      expect(linkHref(page.html, "canonical")).toBe(`${SITE_URL}guides/${page.slug}/`);
      expect(metaContent(page.html, "og:url")).toBe(`${SITE_URL}guides/${page.slug}/`);
      expect(metaContent(page.html, "og:image")).toBe(OG_IMAGE_URL);
      expect(headingCount(page.html, "h1")).toBe(1);
    });

    it(`${page.name} のリンクと CSS は GitHub Pages のサブパス配下で成立する`, () => {
      // ページ内リンクは base つきの絶対パスで書く(サブディレクトリからの相対リンクにしない)
      const hrefs = [...page.html.matchAll(/<a[^>]*href="([^"]*)"/g)].map((m) => m[1] ?? "");
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href.startsWith(BASE_PATH) || href.startsWith("https://")).toBe(true);
      }
      // CSS は Vite が base つきに書き換える入口(/src/…)を通す
      expect(page.html).toContain('<link rel="stylesheet" href="/src/guide.css" />');
    });

    it(`${page.name} からトップの編成シミュレーターへ戻れる`, () => {
      expect(page.html).toContain(`href="${BASE_PATH}"`);
      expect(page.html).toContain("編成シミュレーターを開く");
    });
  }

  it("2 ページは別の内容(見出しの使い回しではない)", () => {
    expect(titleOf(simulatorHtml)).not.toBe(titleOf(unitScoreHtml));
    expect(simulatorHtml).toContain("使い方");
    expect(unitScoreHtml).toContain("ユニットスコア ＝ 総合力 ×（1 ＋ スコアボーナス）× 約 2.037");
    // 未確定の部分を断定しない
    expect(unitScoreHtml).toContain("まだ確定していません");
    expect(unitScoreHtml).toContain("試算");
  });

  it("相互にリンクしている", () => {
    expect(simulatorHtml).toContain(`${BASE_PATH}guides/unit-score/`);
    expect(unitScoreHtml).toContain(`${BASE_PATH}guides/simulator/`);
  });
});

describe("sitemap と robots", () => {
  it("3 つの URL が入っていて、正確に保てない lastmod は置かない", () => {
    const sitemap = repoFile("public/sitemap.xml");
    const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      SITE_URL,
      `${SITE_URL}guides/simulator/`,
      `${SITE_URL}guides/unit-score/`,
    ]);
    expect(sitemap).not.toContain("<lastmod>");
  });

  it("robots.txt が sitemap を指している", () => {
    expect(repoFile("public/robots.txt")).toContain(`Sitemap: ${SITE_URL}sitemap.xml`);
  });
});
