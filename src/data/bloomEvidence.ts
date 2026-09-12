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
  // --- 2026-09-13 ユーザー実機再確認（カード詳細画面の 0凸 Active。raw は報告文の表記のまま） ---
  // 2026-09-12 に抽出マスター（HolodoriDB/holodori-db-jpn-diff f086e90、LangGeneratedLiveActiveSkillLevel level=1）を
  // 0凸として入れていたが、そら（master level 1 = 85 / 実機 0凸 = 100）とぼたん（master level 1 = 50→105 / 実機 0凸 = 60→125）で
  // 実機と食い違い、アキ / スバル / フレアは一致した。master の level 番号と画面の凸段階をカード共通で一律対応させる
  // 解釈は棄却し、実機 variant を優先する（docs/human/card-data-provenance.md）。master の値そのものは変えない
  "tokino-sora-01:activeSkill:0": {
    kind: "observed-text",
    observedAt: "2026-09-13",
    note: "抽出マスター level 1 は 85（不一致）。level ↔ 凸の一律対応を証拠にしない",
  },
  "aki-rosenthal-01:activeSkill:0": {
    kind: "observed-text",
    observedAt: "2026-09-13",
    note: "抽出マスター level 1（50 / ライフ600以上で95）と一致",
  },
  "oozora-subaru-01:activeSkill:0": {
    kind: "observed-text",
    observedAt: "2026-09-13",
    note: "抽出マスター level 1（95）と一致",
  },
  "shiranui-flare-01:activeSkill:0": {
    kind: "observed-text",
    observedAt: "2026-09-13",
    note: "抽出マスター level 1（50 / 40コンボ以上で100）と一致",
  },
  "shishiro-botan-01:activeSkill:0": {
    kind: "observed-text",
    observedAt: "2026-09-13",
    note: "抽出マスター level 1 は 50 / ハッピー2人以上で105（不一致）。level ↔ 凸の一律対応を証拠にしない",
  },
  // --- 2026-09-12 抽出マスター level 1（0〜3凸 Passive、0〜2凸 SP）。恒常マリン 1凸の 9% は実機原文でも確認済み ---
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
