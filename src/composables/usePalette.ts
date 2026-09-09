import { ref } from "vue";

/**
 * 配色の上書き(管理用画面 — 2026-09-09 ユーザー指示「色を手元で確認したい」)。
 *
 * 既定の色は src/style.css の :root（モードごとのブロック）が正で、ここでは持たない —
 * 既定値は「そのモードのクラスを一時的に :root へ当てて算出値を読む」ことで取り出す
 * (二重管理を避けるため。読み取りは同じタスク内で元に戻すので画面には出ない)。
 * 上書きは :root のインライン変数（--bg / --chrome-head / --chrome-foot）で当てる。
 * localStorage のみに保存し、サーバへは送らない
 */

export const PALETTE_STORAGE_KEY = "holodori-optimizer:palette";

/** 配色を持つモード(src/style.css の :root ブロックと 1 対 1) */
export const PALETTE_MODES = ["light", "dark", "okayu", "okayu-dark"] as const;
export type PaletteMode = (typeof PALETTE_MODES)[number];

/** 操作バーの 1 行に 4 つ並べるので短くする */
export const PALETTE_MODE_LABELS: Record<PaletteMode, string> = {
  light: "ライト",
  dark: "ダーク",
  okayu: "おかゆ明",
  "okayu-dark": "おかゆ暗",
};

/** 上書きできる色。キーは CSS 変数の名前と対応する */
export interface PaletteColors {
  /** --bg（ページの地） */
  bg: string;
  /** --chrome-head（ページ・シートのヘッダ） */
  chromeHead: string;
  /** --chrome-foot（メインの注釈のフッタ・詳細シート下端の固定エリア） */
  chromeFoot: string;
}

export const PALETTE_KEYS: { key: keyof PaletteColors; cssVar: string; label: string }[] = [
  { key: "chromeHead", cssVar: "--chrome-head", label: "ヘッダ" },
  { key: "chromeFoot", cssVar: "--chrome-foot", label: "フッタ" },
  { key: "bg", cssVar: "--bg", label: "背景" },
];

/** モードごとの上書き(未設定のモード・キーは既定のまま) */
export type PaletteOverrides = Partial<Record<PaletteMode, Partial<PaletteColors>>>;

export function modeOf(dark: boolean, okayu: boolean): PaletteMode {
  if (okayu) return dark ? "okayu-dark" : "okayu";
  return dark ? "dark" : "light";
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** 保存文字列を解釈する。壊れた値・16 進 6 桁でない色は捨てる */
export function parsePalette(raw: string | null): PaletteOverrides {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const source = parsed as Record<string, unknown>;
  const out: PaletteOverrides = {};
  for (const mode of PALETTE_MODES) {
    const entry = source[mode];
    if (typeof entry !== "object" || entry === null) continue;
    const colors: Partial<PaletteColors> = {};
    for (const { key } of PALETTE_KEYS) {
      const value = (entry as Record<string, unknown>)[key];
      if (isHex(value)) colors[key] = value.toLowerCase();
    }
    if (Object.keys(colors).length > 0) out[mode] = colors;
  }
  return out;
}

export function serializePalette(overrides: PaletteOverrides): string {
  return JSON.stringify(overrides);
}

function load(): PaletteOverrides {
  try {
    return parsePalette(localStorage.getItem(PALETTE_STORAGE_KEY));
  } catch {
    return {};
  }
}

const overrides = ref<PaletteOverrides>(load());

function save(): void {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, serializePalette(overrides.value));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

/** rgb(...) でも #rrggbb でも 16 進 6 桁に正規化する(input[type=color] に渡せる形) */
export function toHex(value: string): string {
  const text = value.trim();
  if (isHex(text)) return text.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short)
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text);
  if (rgb) {
    const hex = [1, 2, 3].map((i) => Number(rgb[i]).toString(16).padStart(2, "0")).join("");
    return `#${hex}`;
  }
  return "#000000";
}

/** いま :root に当てている上書きを外す(既定値を読むときと、上書きなしに戻すとき) */
function clearInline(): void {
  for (const { cssVar } of PALETTE_KEYS) {
    document.documentElement.style.removeProperty(cssVar);
  }
}

/**
 * そのモードの既定色(style.css の値)を読む。モードのクラスを一時的に当てて算出値を取り、
 * 同じタスク内で元に戻す — 既定値を TypeScript 側に写して二重管理しないための読み取り
 */
export function defaultColorsOf(mode: PaletteMode): PaletteColors {
  const root = document.documentElement;
  const hadDark = root.classList.contains("dark-mode");
  const hadOkayu = root.classList.contains("okayu-mode");
  const inline = PALETTE_KEYS.map(({ cssVar }) => root.style.getPropertyValue(cssVar));
  clearInline();
  root.classList.toggle("dark-mode", mode === "dark" || mode === "okayu-dark");
  root.classList.toggle("okayu-mode", mode === "okayu" || mode === "okayu-dark");
  const computed = getComputedStyle(root);
  const read = (cssVar: string): string => toHex(computed.getPropertyValue(cssVar));
  const colors: PaletteColors = {
    bg: read("--bg"),
    chromeHead: read("--chrome-head"),
    chromeFoot: read("--chrome-foot"),
  };
  root.classList.toggle("dark-mode", hadDark);
  root.classList.toggle("okayu-mode", hadOkayu);
  PALETTE_KEYS.forEach(({ cssVar }, i) => {
    const value = inline[i];
    if (value !== undefined && value !== "") root.style.setProperty(cssVar, value);
  });
  return colors;
}

/** そのモードでいま使う色(上書きがあればそれ、なければ既定) */
export function colorsOf(mode: PaletteMode): PaletteColors {
  const base = defaultColorsOf(mode);
  const over = overrides.value[mode];
  return { ...base, ...over };
}

/** 現在のモードの上書きを :root へ当てる(上書きのないキーは既定のまま) */
export function applyPalette(mode: PaletteMode): void {
  clearInline();
  const over = overrides.value[mode];
  if (!over) return;
  for (const { key, cssVar } of PALETTE_KEYS) {
    const value = over[key];
    if (value !== undefined) document.documentElement.style.setProperty(cssVar, value);
  }
}

export function usePalette() {
  return {
    overrides,
    /** 1 色を上書きする(既定と同じ値なら上書きを外す) */
    setColor(mode: PaletteMode, key: keyof PaletteColors, value: string): void {
      const hex = toHex(value);
      const next: PaletteOverrides = { ...overrides.value };
      const colors = { ...next[mode] };
      if (hex === defaultColorsOf(mode)[key]) delete colors[key];
      else colors[key] = hex;
      if (Object.keys(colors).length > 0) next[mode] = colors;
      else delete next[mode];
      overrides.value = next;
      save();
    },
    /** そのモードの上書きを全部外して既定に戻す */
    reset(mode: PaletteMode): void {
      const next: PaletteOverrides = { ...overrides.value };
      delete next[mode];
      overrides.value = next;
      save();
    },
  };
}
