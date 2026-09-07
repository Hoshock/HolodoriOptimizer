# 未整理のルール候補（induction 記録先）

housekeep 時に必ず昇格・整理される。書き方は induction スキルを参照。

## Rules

（なし — 2026-09-07 の棚卸し 17 回目で `.claude/rules/game-facts.md`（新設）/ `ui-design.md` へ統合）

## Cases

- 2026-09-08 メイン画面のメンバー枠: 同じ形の枠が縦に 5 つ並ぶのは「長い」→ 1 枠ずつの横スクロール（scroll-snap）に。下に現在位置「n / 5」と左右の三角、端の三角はグレーアウト（disabled で隠さない）。続けて「パネル上での左右スワイプでも動かせるように」→ 枠の上だけでなくパネル全体（見出し・ナビ）のスワイプとマウスドラッグでも送る。続けて「結果も縦じゃなくて同じく左右に一つずつ」→ 結果一覧も同じ部品（`PageCarousel.vue`）で 1 件ずつ。読み取れる好み: 縦の一覧より 1 件ずつのページ送り（想定 glob: `src/components/OptimizerPanel.vue`, `src/components/ResultList.vue`）読み取れる好み: 同種の大きな部品を縦に並べない、ページ送りには現在位置と端を明示する（想定 glob: `src/components/OptimizerPanel.vue`）
