---
paths:
  - "src/data/**"
  - "src/engine/**"
  - "docs/human/**"
  - "docs/ai/tmp/pending.md"
  - ".claude/skills/parameter-calculation/**"
---

# 証拠と provenance の必須ルール

詳細は `docs/human/evidence-policy.md` を正典とする。

- 実機報告を最優先するが、単発報告を無誤謬とみなさない。`reported` / `rechecked` / `cross-checked` を区別する。
- Golden の数値をモデル都合で変更しない。入力条件が怪しい場合は観測を削除せず「要再確認」に落とす。
- カード仕様を述べる前に **card ID / holomen ID / role / bloom / provenance** を確認する。
- `cards.json` の検索断片や隣接オブジェクトだけでカードを帰属しない。ランタイム正典は `src/data/index.ts` の `cards`。
- `bloomVariants.raw` を無条件に「ゲーム内原文」と呼ばない。`src/data/bloomEvidence.ts` を確認する。
- `cardAtBloom()` の値を実測と呼ばない。必要なら `cardAtBloomWithProvenance()` を使い、`estimated-from-max` を明示する。
- リーダー衣装とメンバーパッシブを取り違えない。
- 同時に複数のカード、Lv、開花、タイプ、スキルが変わった比較を「○○だけをOFFにした実験」と呼ばない。
- コードコメントが `docs/human/` の正典と矛盾する場合、コードコメントを根拠に一般化しない。まずコメントを更新する。
