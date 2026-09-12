---
name: housekeep
description: リポジトリの知識を棚卸しし、重複・時系列ログ・古い仮説を除き、正典・再現資料・未解決へ整理する。ユーザーが棚卸しを指示したときに使う。
disable-model-invocation: true
version: 2026-09-12-01
---

# 棚卸し

目的はファイル数を減らすことではなく、**同じ問いに対する正典を一つにすること**。

## 分類

1. **現在の仕様・知識** → `docs/human/`、`.claude/rules/`、`.claude/skills/`
2. **再現に必要な観測** → `docs/human/repro/`
3. **設計判断** → `docs/adr/`
4. **現在も未解決** → `docs/ai/tmp/pending.md`
5. **未査定ルール候補** → `docs/ai/tmp/rules.md`（候補がある時だけ）
6. **単なる作業履歴** → Git 履歴・Issue に任せ、ドキュメントから削除

## 手順

1. 最新 main と `CLAUDE.md`、`docs/index.md`、対象の rules / skills / ADR を読む。
2. `docs/ai/tmp/rules.md` があれば候補を恒久の置き場へ昇格する。空なら削除する。
3. `docs/ai/tmp/pending.md` から解決済み項目を落とし、確定事項は対象別の正典へ移す。
4. `plan.md` / `progress.md` / `status.md` のような時系列ログがあれば、再現に必要な観測だけ `docs/human/repro/` へ抽出し、残りを削除する。
5. README / CLAUDE / docs index と実リポジトリのドリフトを直す。
6. 古い仮説を横断検索し、現在の正典と矛盾する記述を更新する。コード実装がまだ古い場合は「既知の実装ギャップ」として正典に明記し、Golden を変えない。
7. `docs/index.md` を、実在するドキュメントと役割に合わせる。
8. 変更内容を報告する。push はユーザーが明示した場合だけ行う。

## 禁止

- 「棚卸し N 回目」の履歴を文書に追記し続けること。
- 既に別ファイルが正典の情報を全文複製すること。
- モデルからの推定値を実機観測として再現資料へ書くこと。
- 未解決事項を「進捗を残したい」という理由だけで常設ログへ変えること。
