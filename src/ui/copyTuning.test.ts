import { describe, expect, it } from "vite-plus/test";

import {
  buildTuningReport,
  changedKeysOf,
  DEFAULT_COPY_TUNING,
  GUIDE_LINK_PATHS,
  linesOf,
  normalizeCopyTuning,
} from "./copyTuning";
import type { CopyTuning } from "./copyTuning";

/**
 * 開発用の「文言・配置」で扱う値（2026-09-14）。既定値がそのまま本番の文言なので、
 * 既定と、壊れた保存値の読み方と、共有用データの形を固定する
 */

const env = { viewport: { width: 390, height: 844 }, dark: false, okayu: false };

describe("既定の文言", () => {
  it("見出しは改行で折り返し位置を持ち、つなげると本番の見出しになる", () => {
    expect(linesOf(DEFAULT_COPY_TUNING.heading).join("")).toBe(
      "所持カードから最適編成を探す編成シミュレーター",
    );
  });

  it("できることは 7 項目で、最後に試算値であることを書く", () => {
    const features = linesOf(DEFAULT_COPY_TUNING.features);
    expect(features).toHaveLength(7);
    expect(features.at(-1)).toContain("試算値");
  });

  it("解説ページのリンクはラベルと行き先の数が合っている", () => {
    expect(linesOf(DEFAULT_COPY_TUNING.linkLabels)).toHaveLength(GUIDE_LINK_PATHS.length);
  });

  it("既定では変更なし", () => {
    expect(changedKeysOf(DEFAULT_COPY_TUNING)).toEqual([]);
  });
});

describe("保存値の読み込み", () => {
  it("欠けている項目は既定で埋める", () => {
    expect(normalizeCopyTuning({ lead: "短い説明" })).toEqual({
      ...DEFAULT_COPY_TUNING,
      lead: "短い説明",
    });
  });

  it("壊れた値・知らない位置・知らない項目は既定へ戻す", () => {
    expect(normalizeCopyTuning({ placement: "middle", lead: 42, unknown: "x" })).toEqual(
      DEFAULT_COPY_TUNING,
    );
    expect(normalizeCopyTuning(null)).toEqual(DEFAULT_COPY_TUNING);
    expect(normalizeCopyTuning("こわれている")).toEqual(DEFAULT_COPY_TUNING);
  });

  it("位置は 3 つのうちのどれかだけ受け付ける", () => {
    expect(normalizeCopyTuning({ placement: "top" }).placement).toBe("top");
    expect(normalizeCopyTuning({ placement: "hidden" }).placement).toBe("hidden");
  });
});

describe("共有用データ", () => {
  const tuned: CopyTuning = {
    ...DEFAULT_COPY_TUNING,
    placement: "top",
    heading: " 編成を探す \n シミュレーター ",
    features: "ひとつめ\n\nふたつめ\n",
    notes: " 見出しが長い ",
  };

  it("有効な JSON で、触った項目が分かる", () => {
    const data = JSON.parse(buildTuningReport(tuned, env)) as {
      kind: string;
      version: number;
      changed: string[];
      about: {
        placement: string;
        heading: string[];
        features: string[];
        links: { label: string; path: string }[];
      };
      share: { lead: string; tag: string };
      notes: string;
      viewport: { width: number; height: number };
      modes: { dark: boolean; okayu: boolean };
    };
    expect(data.kind).toBe("holodori-optimizer/ui-copy");
    expect(data.version).toBe(1);
    expect(data.changed).toEqual(["placement", "heading", "features", "notes"]);
    expect(data.about.placement).toBe("top");
    // 前後の空白と空行は落として配列にする
    expect(data.about.heading).toEqual(["編成を探す", "シミュレーター"]);
    expect(data.about.features).toEqual(["ひとつめ", "ふたつめ"]);
    expect(data.about.links.map((link) => link.path)).toEqual([...GUIDE_LINK_PATHS]);
    expect(data.share).toEqual({
      lead: DEFAULT_COPY_TUNING.shareLead,
      tag: DEFAULT_COPY_TUNING.shareTag,
    });
    expect(data.notes).toBe("見出しが長い");
    expect(data.viewport).toEqual({ width: 390, height: 844 });
    expect(data.modes).toEqual({ dark: false, okayu: false });
  });

  it("個人のデータは入れない(文言と画面の条件だけ)", () => {
    const data = JSON.parse(buildTuningReport(tuned, env)) as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual([
      "about",
      "changed",
      "kind",
      "modes",
      "notes",
      "share",
      "version",
      "viewport",
    ]);
    const text = buildTuningReport(tuned, env);
    expect(text).not.toContain("holodori-optimizer:");
    expect(text).not.toContain("owned");
  });
});
