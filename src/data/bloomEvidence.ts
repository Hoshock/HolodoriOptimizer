export type SkillKey = "costumeSkill" | "passiveSkill" | "activeSkill" | "specialSkill";

export type BloomVariantEvidenceKind =
  /** ゲーム内の表示文言そのものを実機で記録した */
  | "observed-text"
  /** 数値・効果は実機で確認したが raw は最大側の文面へ数値を差し替えた再構成文 */
  | "observed-values-reconstructed-text"
  /**
   * 外部で抽出されたマスターデータ由来の文言・数値。実機目視ではない（権威順位は「外部解析」）。
   * 装飾タグ（[highlight] / [attribute=...]）は除去し、複数文の追加条件は DB 規約どおり読点で連結するが、
   * 日本語文言・条件・数値は変えない。出所は `master` で追跡する
   */
  | "extracted-master-text"
  | "recorded-unclassified";

/** 抽出マスターの出所（リポジトリ・コミット・使用ファイル・マスター側のカード ID） */
export interface MasterSource {
  repo: string;
  commit: string;
  files: readonly string[];
  masterCardId: string;
}

export interface BloomVariantEvidence {
  kind: BloomVariantEvidenceKind;
  observedAt?: string;
  note?: string;
  /** kind = extracted-master-text のとき必須 */
  master?: MasterSource;
}

/**
 * 2026-09-12 に外部で確認した抽出マスター（HolodoriDB/holodori-db-jpn-diff）。低開花スキル値の level 1 / 2 を
 * このコミットのカード・スキルレベル文言から転記した。実機観測ではないので `observed-*` と混同しない。
 * master の level 番号と画面の凸段階の対応はカード共通ではない（2026-09-13: そら / ぼたんの 0凸 Active は level 2 側の値）。
 * 実機 variant があればそちらを優先し、level 番号だけから未観測の凸値を確定扱いしない。
 */
export const MASTER_20260912 = {
  repo: "HolodoriDB/holodori-db-jpn-diff",
  commit: "f086e9093b07eaa47a102da307e7bfa58c3a9df6",
  cardFile: "LangCard_Jpn.json",
  activeFile: "LangGeneratedLiveActiveSkillLevel_Jpn.json",
  passiveFile: "LangGeneratedLivePassiveSkillLevel_Jpn.json",
  specialFile: "LangGeneratedLiveSpecialSkillLevel_Jpn.json",
} as const;

/**
 * 2026-09-12 に抽出マスターから入れ、2026-09-15 の全区間確認で実機と一致した variant。
 * 実機観測（`observed-text`）として扱いつつ、どのマスターから入れた値かも残す
 */
function masterConfirmed(
  skill: Exclude<SkillKey, "costumeSkill">,
  masterCardId: string,
  note?: string,
): BloomVariantEvidence {
  const levelFile =
    skill === "activeSkill"
      ? MASTER_20260912.activeFile
      : skill === "passiveSkill"
        ? MASTER_20260912.passiveFile
        : MASTER_20260912.specialFile;
  return {
    kind: "observed-text",
    observedAt: "2026-09-15",
    master: {
      repo: MASTER_20260912.repo,
      commit: MASTER_20260912.commit,
      files: [MASTER_20260912.cardFile, levelFile],
      masterCardId,
    },
    ...(note ? { note } : {}),
  };
}

/**
 * 2026-09-15 にユーザーが開発用の「開花文言」フォームで既定値を実機と突き合わせ、
 * 確認できないと報告しなかった区間を実機で確定と報告した（rechecked）。
 * 文面の再構成という出所そのものは変わらないので kind は上げない（docs/human/evidence-policy.md）
 */
const RECHECKED_20260915 =
  "2026-09-15 に開花文言フォームで実機と突き合わせ、この内容で確定と報告（rechecked）";

/** 2026-09-15 の全区間確認で、それまで記録がなかった強化前の区間を実機で埋めたもの */
const OBSERVED_20260915: BloomVariantEvidence = { kind: "observed-text", observedAt: "2026-09-15" };

const EVIDENCE: Readonly<Record<string, BloomVariantEvidence>> = {
  "usada-pekora-01:passiveSkill:1": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
  },
  "usada-pekora-01:specialSkill:1": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
  },
  "inugami-korone-02:passiveSkill:2": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
  },
  "inugami-korone-02:specialSkill:2": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
  },
  "shirakami-fubuki-02:activeSkill:0": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
    note: `2026-09-13 にカード詳細画面で再確認（rechecked）: 35秒ごとに中確率で13秒間スコアが95%UP。数値は一致。raw は最大側の文面に合わせた「秒毎に」で、実機表記は「秒ごとに」なので observed-text へは上げない。${RECHECKED_20260915}`,
  },
  "shirakami-fubuki-02:passiveSkill:0": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
    note: `2026-09-13 にカード詳細画面で再確認（rechecked）: キュートタイプ2人のスコアサポート効果8%。文言・数値とも一致。${RECHECKED_20260915}`,
  },
  "shirakami-fubuki-02:specialSkill:0": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
    note: RECHECKED_20260915,
  },
  "ookami-mio-02:passiveSkill:1": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
    note: RECHECKED_20260915,
  },
  "ookami-mio-02:specialSkill:1": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
    note: RECHECKED_20260915,
  },
  "shirogane-noel-02:activeSkill:0": { kind: "observed-text", observedAt: "2026-09-11" },
  "shirogane-noel-02:passiveSkill:0": { kind: "observed-text", observedAt: "2026-09-11" },
  "shirogane-noel-02:specialSkill:0": { kind: "observed-text", observedAt: "2026-09-11" },
  "sakura-miko-02:specialSkill:1": {
    kind: "observed-text",
    observedAt: "2026-09-08",
    note: RECHECKED_20260915,
  },
  "houshou-marine-01:specialSkill:1": { kind: "observed-text", observedAt: "2026-09-08" },
  "fuwawa-abyssgard-02:activeSkill:0": { kind: "observed-text", observedAt: "2026-09-08" },
  "fuwawa-abyssgard-02:specialSkill:0": { kind: "observed-text", observedAt: "2026-09-08" },
  "nekomata-okayu-01:specialSkill:1": {
    kind: "observed-text",
    observedAt: "2026-09-08",
    note: RECHECKED_20260915,
  },
  "fuwawa-abyssgard-02:passiveSkill:0": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-12",
  },
  "sakura-miko-02:passiveSkill:1": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-12",
    note: RECHECKED_20260915,
  },
  // --- 2026-09-13 ユーザー実機再確認（カード詳細画面の 0凸 Active） ---
  // 2026-09-12 に抽出マスター（HolodoriDB/holodori-db-jpn-diff f086e90、LangGeneratedLiveActiveSkillLevel level=1）を
  // 0凸として入れていたが、アキ / スバル / フレアは実機と一致した（そら / ぼたんの 0凸 Active は 2026-09-15 の
  // 全区間確認で「未確認」へ取り下げたので、いまは variant がない）。master の level 番号と画面の凸段階を
  // カード共通で一律対応させる解釈は採らない（docs/human/card-data-provenance.md）
  "aki-rosenthal-01:activeSkill:0": {
    kind: "observed-text",
    observedAt: "2026-09-13",
    note: "抽出マスター level 1（50 / ライフ600以上で95）と一致。raw の「ごとに」は 2026-09-15 に「毎に」へそろえた（スバル / フレアの実機表記に合わせた推測で、数値・条件は変えていない）",
  },
  "oozora-subaru-01:activeSkill:0": {
    kind: "observed-text",
    observedAt: "2026-09-13",
    note: `抽出マスター level 1（95）と一致。${RECHECKED_20260915}（raw の「ごとに」は実機表記の「毎に」へ直した）`,
  },
  "shiranui-flare-01:activeSkill:0": {
    kind: "observed-text",
    observedAt: "2026-09-13",
    note: `抽出マスター level 1（50 / 40コンボ以上で100）と一致。${RECHECKED_20260915}（raw の「ごとに」は実機表記の「毎に」へ直した）`,
  },
  // --- 2026-09-15 ユーザー実機観測（開花文言フォーム。0〜3凸 のパッシブ） ---
  "nekomata-okayu-01:passiveSkill:0": {
    kind: "observed-text",
    observedAt: "2026-09-15",
    note: "強化前（0〜3凸）は テクニック 30%UP。4凸以降の 41%UP は最大側レコード",
  },
  // --- 2026-09-15 ユーザー実機観測（開花文言フォーム 第 2 弾。強化前の区間を実機で埋めた 22 件） ---
  "shirogane-noel-01:specialSkill:0": OBSERVED_20260915,
  "shirogane-noel-01:activeSkill:0": OBSERVED_20260915,
  "shirogane-noel-01:passiveSkill:0": OBSERVED_20260915,
  "ookami-mio-01:specialSkill:0": OBSERVED_20260915,
  "ookami-mio-01:passiveSkill:0": OBSERVED_20260915,
  "shiranui-flare-01:specialSkill:0": OBSERVED_20260915,
  "shiranui-flare-01:passiveSkill:0": OBSERVED_20260915,
  "omaru-polka-01:specialSkill:0": OBSERVED_20260915,
  "omaru-polka-01:activeSkill:0": OBSERVED_20260915,
  "omaru-polka-01:passiveSkill:0": OBSERVED_20260915,
  "mococo-abyssgard-01:specialSkill:0": OBSERVED_20260915,
  "mococo-abyssgard-01:activeSkill:0": OBSERVED_20260915,
  "mococo-abyssgard-01:passiveSkill:0": OBSERVED_20260915,
  "tokino-sora-01:specialSkill:0": OBSERVED_20260915,
  "tokino-sora-01:passiveSkill:0": OBSERVED_20260915,
  "roboco-san-01:specialSkill:0": OBSERVED_20260915,
  "roboco-san-01:activeSkill:0": OBSERVED_20260915,
  "roboco-san-01:passiveSkill:0": OBSERVED_20260915,
  "oozora-subaru-01:specialSkill:0": OBSERVED_20260915,
  "oozora-subaru-01:passiveSkill:0": OBSERVED_20260915,
  "shishiro-botan-01:specialSkill:0": OBSERVED_20260915,
  "shishiro-botan-01:passiveSkill:0": OBSERVED_20260915,
  // --- 2026-09-12 に抽出マスター level 1 から入れた 4 件は、2026-09-15 の全区間確認で実機と一致した ---
  // master の値は実機で裏が取れたことになるが、level 番号と凸段階の一律対応はここからも主張しない
  "houshou-marine-01:passiveSkill:0": masterConfirmed("passiveSkill", "card-00023-5-uniq-0019-00"),
  "inugami-korone-01:passiveSkill:0": masterConfirmed("passiveSkill", "card-00017-5-uniq-0015-00"),
  "shirakami-fubuki-01:passiveSkill:0": masterConfirmed(
    "passiveSkill",
    "card-00006-5-uniq-0007-00",
  ),
  "shirakami-fubuki-01:specialSkill:0": masterConfirmed(
    "specialSkill",
    "card-00006-5-uniq-0007-00",
  ),
};

/**
 * 2026-09-15 のユーザー実機確認（開発用の「開花文言」フォーム）を通したカード。
 * ここにあるカードは**全区間が「確認済 or 未確認」で確定している**。
 *
 * 載っていないカードは、カード効果の文言が入っていても**この確認をまだ通していない**（= 取り込み元レコードのまま）。
 * 開花文言フォームのピッカーはここにあるカードを外して、まだのカードだけを出す
 * （2026-09-15 ユーザー指示「既にカード効果が書かれているが本確認がまだのやつを明示的に表したい」）
 */
export const BLOOM_TEXT_VERIFIED_CARD_IDS: readonly string[] = [
  // 第 1 弾（5 枚）
  "sakura-miko-02",
  "shirakami-fubuki-02",
  "ookami-mio-02",
  "nekomata-okayu-01",
  "nekomata-okayu-02",
  // 第 2 弾（16 枚）
  "inugami-korone-02",
  "usada-pekora-01",
  "shirogane-noel-01",
  "shirogane-noel-02",
  "houshou-marine-01",
  "fuwawa-abyssgard-02",
  "shirakami-fubuki-01",
  "ookami-mio-01",
  "inugami-korone-01",
  "shiranui-flare-01",
  "omaru-polka-01",
  "mococo-abyssgard-01",
  "tokino-sora-01",
  "roboco-san-01",
  "oozora-subaru-01",
  "shishiro-botan-01",
];

const VERIFIED = new Set(BLOOM_TEXT_VERIFIED_CARD_IDS);

/** そのカードが 2026-09-15 の実機確認を通っているか（通っていなければ文言は取り込み元レコードのまま） */
export function isBloomTextVerified(cardId: string): boolean {
  return VERIFIED.has(cardId);
}

export function bloomVariantEvidenceOf(
  cardId: string,
  skill: SkillKey,
  bloom: number,
): BloomVariantEvidence {
  return EVIDENCE[`${cardId}:${skill}:${String(bloom)}`] ?? { kind: "recorded-unclassified" };
}
