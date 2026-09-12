export type SkillKey = "costumeSkill" | "passiveSkill" | "activeSkill" | "specialSkill";

export type BloomVariantEvidenceKind =
  | "observed-text"
  | "observed-values-reconstructed-text"
  | "recorded-unclassified";

export interface BloomVariantEvidence {
  kind: BloomVariantEvidenceKind;
  observedAt?: string;
  note?: string;
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
};

export function bloomVariantEvidenceOf(
  cardId: string,
  skill: SkillKey,
  bloom: number,
): BloomVariantEvidence {
  return EVIDENCE[`${cardId}:${skill}:${String(bloom)}`] ?? { kind: "recorded-unclassified" };
}
