# 未整理のルール候補（induction 記録先）

housekeep 時に必ず昇格・整理される。書き方は induction スキルを参照。

## Rules

（なし — 2026-09-05 の棚卸し 12 回目で `.claude/rules/ui-design.md` へ統合）

## Cases

- 2026-09-05・開花ステッパー: 「± を連打すると iPhone でズームされる。この連打ではズームされないように」→ 対策はダブルタップズームの抑止（`touch-action: manipulation`）で、ボタン全般に適用した。読み取れる好み: 連打・トグル操作でブラウザ既定のジェスチャ（ズーム・選択）が割り込むのは不具合として扱う（想定 glob: `src/**/*.{vue,css}` — ui-design.md 実装ノートの iOS Safari 項の隣）
