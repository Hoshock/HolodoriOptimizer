export type SkillKey = "costumeSkill" | "passiveSkill" | "activeSkill" | "specialSkill";

export type BloomVariantEvidenceKind =
  /** ゲーム内の表示文言そのものを実機で記録した */
  | "observed-text"
  /** 数値・効果は実機で確認したが raw は最大側の文面へ数値を差し替えた再構成文 */
  | "observed-values-reconstructed-text"
  /**
   * 外部で抽出されたマスターデータ由来の文言・数値。実機目視ではない（権威順位は「外部解析」）。
   * 装飾タグ（[highlight] / [attribute=...]）は除去し、複数文の追加条件は DB 規約どおり括弧で連結するが、
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
 * 2026-09-12 に外部で確認した抽出マスター（HolodoriDB/holodori-db-jpn-diff）。低開花スキル値の Lv1 / Lv2 を
 * このコミットのカード・スキルレベル文言から転記した。実機観測ではないので `observed-*` と混同しない。
 */
export const MASTER_20260912 = {
  repo: "HolodoriDB/holodori-db-jpn-diff",
  commit: "f086e9093b07eaa47a102da307e7bfa58c3a9df6",
  cardFile: "LangCard_Jpn.json",
  activeFile: "LangGeneratedLiveActiveSkillLevel_Jpn.json",
  passiveFile: "LangGeneratedLivePassiveSkillLevel_Jpn.json",
  specialFile: "LangGeneratedLiveSpecialSkillLevel_Jpn.json",
} as const;

function master(
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
    kind: "extracted-master-text",
    master: {
      repo: MASTER_20260912.repo,
      commit: MASTER_20260912.commit,
      files: [MASTER_20260912.cardFile, levelFile],
      masterCardId,
    },
    ...(note ? { note } : {}),
  };
}

const JOINED_CONDITION = "マスターでは追加条件が別文。DB 規約どおり括弧で連結（文言・数値は不変）";

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
  },
  "shirakami-fubuki-02:passiveSkill:0": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
  },
  "shirakami-fubuki-02:specialSkill:0": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
  },
  "ookami-mio-02:passiveSkill:1": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
  },
  "ookami-mio-02:specialSkill:1": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-08",
  },
  "shirogane-noel-02:activeSkill:0": { kind: "observed-text", observedAt: "2026-09-11" },
  "shirogane-noel-02:passiveSkill:0": { kind: "observed-text", observedAt: "2026-09-11" },
  "shirogane-noel-02:specialSkill:0": { kind: "observed-text", observedAt: "2026-09-11" },
  "sakura-miko-02:specialSkill:1": { kind: "observed-text", observedAt: "2026-09-08" },
  "houshou-marine-01:specialSkill:1": { kind: "observed-text", observedAt: "2026-09-08" },
  "fuwawa-abyssgard-02:activeSkill:0": { kind: "observed-text", observedAt: "2026-09-08" },
  "fuwawa-abyssgard-02:specialSkill:0": { kind: "observed-text", observedAt: "2026-09-08" },
  "nekomata-okayu-01:specialSkill:1": { kind: "observed-text", observedAt: "2026-09-08" },
  "fuwawa-abyssgard-02:passiveSkill:0": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-12",
  },
  "sakura-miko-02:passiveSkill:1": {
    kind: "observed-values-reconstructed-text",
    observedAt: "2026-09-12",
  },
  // --- 2026-09-12 抽出マスター Lv1（0凸 Active、0〜3凸 Passive、0〜2凸 SP）。Lv2 は最大側レコードと一致を確認 ---
  "tokino-sora-01:activeSkill:0": master("activeSkill", "card-00001-5-uniq-0000-00"),
  "aki-rosenthal-01:activeSkill:0": master(
    "activeSkill",
    "card-00004-5-uniq-0005-00",
    JOINED_CONDITION,
  ),
  "oozora-subaru-01:activeSkill:0": master("activeSkill", "card-00012-5-uniq-0012-00"),
  "shiranui-flare-01:activeSkill:0": master(
    "activeSkill",
    "card-00021-5-uniq-0017-00",
    JOINED_CONDITION,
  ),
  "shishiro-botan-01:activeSkill:0": master(
    "activeSkill",
    "card-00032-5-uniq-0026-00",
    JOINED_CONDITION,
  ),
  "houshou-marine-01:passiveSkill:0": master("passiveSkill", "card-00023-5-uniq-0019-00"),
  "inugami-korone-01:passiveSkill:0": master("passiveSkill", "card-00017-5-uniq-0015-00"),
  "shirakami-fubuki-01:passiveSkill:0": master("passiveSkill", "card-00006-5-uniq-0007-00"),
  "shirakami-fubuki-01:specialSkill:0": master("specialSkill", "card-00006-5-uniq-0007-00"),
};

export function bloomVariantEvidenceOf(
  cardId: string,
  skill: SkillKey,
  bloom: number,
): BloomVariantEvidence {
  return EVIDENCE[`${cardId}:${skill}:${String(bloom)}`] ?? { kind: "recorded-unclassified" };
}
