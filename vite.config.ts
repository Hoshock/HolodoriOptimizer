import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig, lazyPlugins } from "vite-plus";

const entry = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages のプロジェクトサイト配下で配信するため
  base: "/HolodoriOptimizer/",
  build: {
    /*
     * MPA。トップ（Vue アプリ）と、検索から入ってくる人向けの静的な解説ページ 2 枚を別々の HTML として出す
     * （2026-09-14）。ルータを入れず HTML を足すだけにしてあるので、`/guides/simulator/` への直リンクや
     * リロードでも 404 にならない（GitHub Pages がそのままファイルを返す）
     */
    rollupOptions: {
      input: {
        index: entry("index.html"),
        guideSimulator: entry("guides/simulator/index.html"),
        guideUnitScore: entry("guides/unit-score/index.html"),
      },
    },
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  plugins: lazyPlugins(() => [vue()]),
  test: {
    /*
     * 既定は node。サイドメニューのようにマウントして操作を確かめるテストだけ、ファイル先頭の
     * `// @vitest-environment happy-dom` で DOM を要求する（ブラウザモードは CI にブラウザがないので使わない）
     */
    include: ["src/**/*.test.ts"],
  },
});
