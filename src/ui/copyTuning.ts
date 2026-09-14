/**
 * 画面の文言と配置を実機で試すための値（2026-09-14 ユーザー指示「実機で確認したいのと調整したいので、
 * 文言や配置をいじれる開発用サブメニューを追加して」）。
 *
 * 既定値がそのまま本番の文言で、開発用の「文言・配置」（`CopyTunePanel.vue`）で上書きすると
 * 画面がその場で変わる。上書きはそのブラウザの localStorage にだけ残り、既定値（このファイル）は
 * 書き換えない — 決まった文言はここへ反映してコミットする。
 *
 * このファイルは localStorage も DOM も触らない（読み書きは `src/composables/useCopyTuning.ts`）。
 */

/** 説明セクションをどこに出すか */
export type AboutPlacement = "bottom" | "top" | "hidden";

export const ABOUT_PLACEMENTS: readonly { value: AboutPlacement; label: string }[] = [
  { value: "bottom", label: "下" },
  { value: "top", label: "上" },
  { value: "hidden", label: "出さない" },
];

export interface CopyTuning {
  /** 説明セクションの位置（bottom = 結果の下、top = ステップの前、hidden = 出さない） */
  placement: AboutPlacement;
  /** 説明セクションの見出し。**改行が折り返しの位置**（行ごとにまとまりとして出す） */
  heading: string;
  /** 見出しの下の説明文 */
  lead: string;
  /** できることの小見出し */
  featuresTitle: string;
  /** できること。1 行 1 項目 */
  features: string;
  /** 解説ページへのリンクのラベル。1 行 1 つで、並びは GUIDE_LINK_PATHS と同じ */
  linkLabels: string;
  /** 共有文の 1 行目 */
  shareLead: string;
  /** 共有文の最後に付けるタグ */
  shareTag: string;
  /** 画面には出さない自由記述（共有用データにだけ入れる。気づいたことのメモ用） */
  notes: string;
}

/** 解説ページの位置。ラベルだけ調整できるように、行き先はここで固定する */
export const GUIDE_LINK_PATHS: readonly string[] = ["guides/simulator/", "guides/unit-score/"];

export const DEFAULT_COPY_TUNING: CopyTuning = {
  placement: "bottom",
  heading: "所持カードから最適編成を探す\n編成シミュレーター",
  lead: "ホロドリの編成シミュレーターです。所持カード・開花・ホロメンボード・コネクト・イベントメモリー・メンバー強化ボーナス・楽曲条件を反映し、組める編成を全探索。ユニットスコアやスキル効果をシミュレーションして比較できます。",
  featuresTitle: "このツールでできること",
  features: [
    "所持カードから編成候補を全探索する",
    "リーダーとメンバー5人を評価する",
    "開花、衣装スキル、パッシブスキルを反映する",
    "ホロメンボードとコネクトを反映する",
    "イベントメモリーとメンバー強化ボーナスを反映する",
    "楽曲条件を指定できる",
    "表示値は非公式の試算値である",
  ].join("\n"),
  linkLabels: "編成シミュレーターの使い方\nユニットスコア計算と内訳",
  shareLead: "ホロドリの所持カードから編成を全探索",
  shareTag: "#ホロドリ",
  notes: "",
};

/** 複数行の欄を配列にする（前後の空白と空行は落とす） */
export function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function isPlacement(value: unknown): value is AboutPlacement {
  return value === "bottom" || value === "top" || value === "hidden";
}

/**
 * 保存されていた値を現在の形へ均す。開発用の調整値なので、壊れている項目は
 * 既定へ戻すだけでよい（真偽値・列挙だけの設定キーと同じ扱い — .claude/rules/storage-compat.md）
 */
export function normalizeCopyTuning(stored: unknown): CopyTuning {
  const source =
    typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const next = { ...DEFAULT_COPY_TUNING };
  for (const key of Object.keys(DEFAULT_COPY_TUNING) as (keyof CopyTuning)[]) {
    const value = source[key];
    if (key === "placement") {
      if (isPlacement(value)) next.placement = value;
      continue;
    }
    if (typeof value === "string") next[key] = value;
  }
  return next;
}

/** 既定と違う項目（共有用データで、どこを触ったかが一目で分かるように） */
export function changedKeysOf(tuning: CopyTuning): (keyof CopyTuning)[] {
  return (Object.keys(DEFAULT_COPY_TUNING) as (keyof CopyTuning)[]).filter(
    (key) => tuning[key] !== DEFAULT_COPY_TUNING[key],
  );
}

/** 共有用データに添える、そのとき見ていた画面の条件 */
export interface CopyTuningEnv {
  /** 表示領域（px）。狭い画面での見え方の話を受け取れるように */
  viewport: { width: number; height: number };
  dark: boolean;
  okayu: boolean;
}

/**
 * 調整結果をそのまま渡せる構造化データ。入るのはこの画面で編集した文言と、見ていた画面の条件だけで、
 * 所持カードや保存内容のような個人のデータは入れない
 */
export function buildTuningReport(tuning: CopyTuning, env: CopyTuningEnv): string {
  const labels = linesOf(tuning.linkLabels);
  return `${JSON.stringify(
    {
      kind: "holodori-optimizer/ui-copy",
      version: 1,
      changed: changedKeysOf(tuning),
      about: {
        placement: tuning.placement,
        heading: linesOf(tuning.heading),
        lead: tuning.lead.trim(),
        featuresTitle: tuning.featuresTitle.trim(),
        features: linesOf(tuning.features),
        links: GUIDE_LINK_PATHS.map((path, index) => ({
          label: labels[index] ?? "",
          path,
        })),
      },
      share: { lead: tuning.shareLead.trim(), tag: tuning.shareTag.trim() },
      notes: tuning.notes.trim(),
      viewport: env.viewport,
      modes: { dark: env.dark, okayu: env.okayu },
    },
    null,
    2,
  )}\n`;
}
