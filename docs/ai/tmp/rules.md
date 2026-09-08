# 未整理のルール候補（induction 記録先）

housekeep 時に必ず昇格・整理される。書き方は induction スキルを参照。

## Rules

- **ボード効果の割合はゲーム内どおり小数第 1 位まで（+4.0%、+20.0%、+0.5%）で、全色で揃える。整数の「+4%」「+20%」を混在させない**（2026-09-08「小数第一位で .0% までつけること。他の色のボード効果も表記揺れしてるので直す」— 赤の効果候補表で指摘。青の発動率 / 発動頻度・黄のホロワーク報酬が整数表記だった。実装は `formatBoardPercent` / `formatBoardPermil`（`src/data/boardGraph.ts`）。想定 glob: `src/components/BoardSheet.vue`, `src/data/*Board.ts`, `.claude/skills/parameter-calculation/**`）

## Cases

（なし — 2026-09-08 の棚卸し 19 回目で `.claude/rules/ui-design.md`（自動遷移は瞬時・内訳表の丸め誤差の寄せ先）へ統合）
