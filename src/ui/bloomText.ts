import { BLOOM_MAX, BLOOM_UPGRADE_STAGE, cardAtBloomWithProvenance } from "../data/bloom";
import type { BloomResolvedSource } from "../data/bloom";
import type { SkillKey } from "../data/bloomEvidence";
import type { Card } from "../data/types";

/**
 * 開発用の「開花文言」（カードごとに、開花段階ごとのスキル文言を実機を見ながら入れ直すための値）。
 * 2026-09-15 ユーザー指示「カードごとに開花ごとの文言を更新するための入力フォーム…既にDBに入っている
 * やつをデフォルトで入力しておくこと。間違ってる場合もあるので上書きできるようにしておくこと」。
 *
 * このファイルは localStorage も DOM も触らない（読み書きは `src/composables/useBloomText.ts`、
 * 画面は `src/components/BloomTextSheet.vue`）。**カードデータ（`src/data/cards.json`）は書き換えない** —
 * 入れた内容は共有用データとして出すだけで、データへの反映は根拠を確かめてからコミットで行う
 * （`docs/human/evidence-policy.md`）。
 */

/**
 * 開花段階ごとの文言を入れるスキル 4 種（画面の並び順）と、**そのスキルが強くなる開花段階**
 * （`BLOOM_UPGRADE_STAGE`。衣装スキルは段階で変わらないので null）。
 * どの段階で変わるかは決まっているので、欄は段階ごとではなく**変わらない区間ごと**に 1 つだけ出す
 * （2026-09-15 ユーザー指示「開花でどのスキルが強くなるかは決まってるので、こんなにフォームいらないはずでは」）
 */
export const BLOOM_TEXT_SKILLS = [
  // 並びは 衣装 → スペシャル → アクティブ → パッシブ（2026-09-15 ユーザー指示）。共有用データも同じ順
  { key: "costumeSkill", label: "衣装スキル", upgradeStage: null },
  { key: "specialSkill", label: "スペシャルスキル", upgradeStage: BLOOM_UPGRADE_STAGE.special },
  { key: "activeSkill", label: "アクティブスキル", upgradeStage: BLOOM_UPGRADE_STAGE.active },
  { key: "passiveSkill", label: "パッシブスキル", upgradeStage: BLOOM_UPGRADE_STAGE.passive },
] as const satisfies readonly { key: SkillKey; label: string; upgradeStage: number | null }[];

/** 開花段階（0凸〜最大） */
export const BLOOM_STAGES: readonly number[] = Array.from({ length: BLOOM_MAX + 1 }, (_, i) => i);

const rangeLabel = (blooms: readonly number[]): string => {
  const first = blooms[0] ?? 0;
  const last = blooms[blooms.length - 1] ?? first;
  return first === last ? `${first}凸` : `${first}〜${last}凸`;
};

/**
 * そのスキルの文言が変わらない区間（強化前 / 強化後）。保存と既定値の取得には区間の先頭の段階を使う。
 * 衣装スキルは段階で変わらないので 0〜最大の 1 区間だけ
 * （カードデータに衣装の `bloomVariants` が入ったらこの前提を見直す — いまは 1 件もない）
 */
export function bloomTextRangesOf(
  upgradeStage: number | null,
): { bloom: number; blooms: number[]; label: string }[] {
  if (upgradeStage === null) {
    const blooms = [...BLOOM_STAGES];
    return [{ bloom: 0, blooms, label: rangeLabel(blooms) }];
  }
  const before = BLOOM_STAGES.filter((b) => b < upgradeStage);
  const after = BLOOM_STAGES.filter((b) => b >= upgradeStage);
  return [
    { bloom: before[0] ?? 0, blooms: before, label: rangeLabel(before) },
    { bloom: after[0] ?? BLOOM_MAX, blooms: after, label: rangeLabel(after) },
  ];
}

/** いまのカードデータから出る、その区間の文言と出所 */
export interface BloomTextCell {
  /** 区間を代表する開花段階（区間の先頭。保存のキーにも使う） */
  bloom: number;
  /** 区間に入る開花段階 */
  blooms: number[];
  /** 画面と共有用データに出すラベル（"0凸" / "0〜3凸"） */
  label: string;
  /** データから出る文言（`cardAtBloomWithProvenance` の raw） */
  text: string;
  /** その文言がどこから来たか（記録のある variant か、最大側からの推定か） */
  source: BloomResolvedSource;
}

/** カード 1 枚ぶんの既定値（スキル 4 種 × 文言が変わらない区間） */
export type BloomTextDefaults = Record<SkillKey, BloomTextCell[]>;

export function bloomTextDefaultsOf(card: Card): BloomTextDefaults {
  const out = {} as BloomTextDefaults;
  for (const { key, upgradeStage } of BLOOM_TEXT_SKILLS) {
    out[key] = bloomTextRangesOf(upgradeStage).map((range) => {
      const { card: at, provenance } = cardAtBloomWithProvenance(card, range.bloom);
      return { ...range, text: at[key].raw, source: provenance[key].source };
    });
  }
  return out;
}

/**
 * 上書きした文言だけを持つ（カード ID → スキル → 開花段階 → 文言）。
 * 触っていない段階は持たないので、カードデータを直したら既定値がそのまま追随する
 */
export type BloomTextEdits = Record<string, Partial<Record<SkillKey, Record<string, string>>>>;

/** 入力中の状態。`visited` は開いたカード（編集していなくても「この内容で合っている」の記録として出す） */
export interface BloomTextState {
  visited: string[];
  edits: BloomTextEdits;
}

export const EMPTY_BLOOM_TEXT_STATE: BloomTextState = { visited: [], edits: {} };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const SKILL_KEYS: readonly SkillKey[] = BLOOM_TEXT_SKILLS.map((s) => s.key);

/** スキルごとの「保存してよい開花段階」= 区間の先頭。区間の途中の段階は欄がないので読み飛ばす */
const RANGE_BLOOMS = ((): Record<SkillKey, number[]> => {
  const out = {} as Record<SkillKey, number[]>;
  for (const { key, upgradeStage } of BLOOM_TEXT_SKILLS) {
    out[key] = bloomTextRangesOf(upgradeStage).map((r) => r.bloom);
  }
  return out;
})();

/**
 * 保存値の読み込み。開発用の入力なので過去形式の移行は持たず、知らない形・知らないスキル・
 * 段階の範囲外は読み飛ばして残りを読む（壊れていても入力の続きができるように）
 */
export function normalizeBloomTextState(value: unknown): BloomTextState {
  if (!isRecord(value)) return { visited: [], edits: {} };
  const visited: string[] = [];
  const rawVisited = value.visited;
  if (Array.isArray(rawVisited)) {
    for (const id of rawVisited) {
      if (typeof id === "string" && id !== "" && !visited.includes(id)) visited.push(id);
    }
  }
  const edits: BloomTextEdits = {};
  const rawEdits = value.edits;
  if (isRecord(rawEdits)) {
    for (const [cardId, perCard] of Object.entries(rawEdits)) {
      if (cardId === "" || !isRecord(perCard)) continue;
      const card: Partial<Record<SkillKey, Record<string, string>>> = {};
      for (const skill of SKILL_KEYS) {
        const perSkill = perCard[skill];
        if (!isRecord(perSkill)) continue;
        const cells: Record<string, string> = {};
        for (const [bloom, text] of Object.entries(perSkill)) {
          if (typeof text !== "string") continue;
          if (!RANGE_BLOOMS[skill].includes(Number(bloom))) continue;
          cells[bloom] = text;
        }
        if (Object.keys(cells).length > 0) card[skill] = cells;
      }
      if (Object.keys(card).length > 0) edits[cardId] = card;
    }
  }
  return { visited, edits };
}

/** その段階の入力値（上書きがあればそれ、なければデータの既定値） */
export function bloomTextValue(
  edits: BloomTextEdits,
  cardId: string,
  skill: SkillKey,
  bloom: number,
  fallback: string,
): string {
  return edits[cardId]?.[skill]?.[String(bloom)] ?? fallback;
}

/**
 * 上書きを 1 マスぶん書き換えた状態を返す（既定値と同じ文字列に戻したら上書きを消す —
 * 「触ったマス」を実際に変えたマスだけにして、共有用データの `edited` を信用できるようにする）
 */
export function withBloomTextEdit(
  state: BloomTextState,
  cardId: string,
  skill: SkillKey,
  bloom: number,
  text: string,
  fallback: string,
): BloomTextState {
  const edits: BloomTextEdits = { ...state.edits };
  const card: Partial<Record<SkillKey, Record<string, string>>> = { ...edits[cardId] };
  const cells: Record<string, string> = { ...card[skill] };
  if (text === fallback) delete cells[String(bloom)];
  else cells[String(bloom)] = text;
  if (Object.keys(cells).length > 0) card[skill] = cells;
  else delete card[skill];
  if (Object.keys(card).length > 0) edits[cardId] = card;
  else delete edits[cardId];
  const visited = state.visited.includes(cardId) ? state.visited : [...state.visited, cardId];
  return { visited, edits };
}

/** そのカードの上書きを全部捨てる（既定値へ戻す）。開いた記録は残す */
export function withoutBloomTextEdits(state: BloomTextState, cardId: string): BloomTextState {
  if (state.edits[cardId] === undefined) return state;
  const edits = { ...state.edits };
  delete edits[cardId];
  return { visited: state.visited, edits };
}

/** 開いたカードとして記録する（並びは開いた順） */
export function withVisitedCard(state: BloomTextState, cardId: string): BloomTextState {
  if (state.visited.includes(cardId)) return state;
  return { visited: [...state.visited, cardId], edits: state.edits };
}

/** 開いた記録ごと捨てる（そのカードを一覧から外す） */
export function withoutBloomTextCard(state: BloomTextState, cardId: string): BloomTextState {
  const edits = { ...state.edits };
  delete edits[cardId];
  return { visited: state.visited.filter((id) => id !== cardId), edits };
}

/** 共有用データの 1 マス。`edited` が付いた行だけが実機で入れ直した文言 */
interface ReportCell {
  /** その文言が当てはまる開花段階（区間まるごと） */
  blooms: number[];
  label: string;
  text: string;
  source: BloomResolvedSource;
  edited?: true;
  /** 上書きしたときだけ、いまのデータに入っている文言 */
  current?: string;
}

export interface BloomTextReportCard {
  cardId: string;
  holomenId: string;
  holomen: string;
  card: string;
  editedCount: number;
  skills: Record<SkillKey, ReportCell[]>;
}

export const BLOOM_TEXT_REPORT_KIND = "holodori-optimizer/bloom-text";
export const BLOOM_TEXT_REPORT_VERSION = 1;

/**
 * 共有用データ。開いたカードを開いた順に並べ、段階ごとの文言・出所・上書きしたかを出す。
 * 上書きしていないカードも「この内容で合っている」の記録として入れる
 */
export function buildBloomTextReport(
  state: BloomTextState,
  resolve: (cardId: string) => { card: Card; holomen: string } | null,
): string {
  const cards: BloomTextReportCard[] = [];
  for (const cardId of state.visited) {
    const found = resolve(cardId);
    if (!found) continue;
    const defaults = bloomTextDefaultsOf(found.card);
    const skills = {} as Record<SkillKey, ReportCell[]>;
    let editedCount = 0;
    for (const { key } of BLOOM_TEXT_SKILLS) {
      skills[key] = defaults[key].map((cell) => {
        const text = bloomTextValue(state.edits, cardId, key, cell.bloom, cell.text);
        const common = { blooms: cell.blooms, label: cell.label, source: cell.source };
        if (text === cell.text) return { ...common, text };
        editedCount += 1;
        return { ...common, text, edited: true as const, current: cell.text };
      });
    }
    cards.push({
      cardId,
      holomenId: found.card.holomenId,
      holomen: found.holomen,
      card: found.card.name,
      editedCount,
      skills,
    });
  }
  return JSON.stringify(
    { kind: BLOOM_TEXT_REPORT_KIND, version: BLOOM_TEXT_REPORT_VERSION, cards },
    null,
    2,
  );
}
