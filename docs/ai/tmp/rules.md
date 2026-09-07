# 未整理のルール候補（induction 記録先）

housekeep 時に必ず昇格・整理される。書き方は induction スキルを参照。

## Rules

（なし — 2026-09-07 の棚卸し 17 回目で `.claude/rules/game-facts.md`（新設）/ `ui-design.md` へ統合）

## Cases

- 2026-09-08 メイン画面のメンバー枠: 同じ形の枠が縦に 5 つ並ぶのは「長い」→ 1 枠ずつの横スクロール（scroll-snap）に。下に現在位置「n / 5」と左右の三角、端の三角はグレーアウト（disabled で隠さない）。読み取れる好み: 同種の大きな部品を縦に並べない、ページ送りには現在位置と端を明示する（想定 glob: `src/components/OptimizerPanel.vue`）
