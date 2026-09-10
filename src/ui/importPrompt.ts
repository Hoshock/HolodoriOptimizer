/**
 * 取り込み画面に載せる「手元の AI に渡すプロンプト」（2026-09-10 ユーザー指示
 * 「説明文が長い。コピーできるプロンプトをはれ」）。サイト側の説明文を増やす代わりに、
 * ユーザーはこれをコピーしてスクショと一緒にローカルの LLM へ渡す。
 *
 * 中身は `.claude/skills/structure-import/references/owned-members.md` の要点を
 * 自己完結させたもの（相手の AI はこのリポジトリを読めない）。スキーマを変えたら両方直す。
 */
export const OWNED_IMPORT_PROMPT = `添付したスクリーンショットは、スマホゲーム『hololive Dreams』（ホロドリ）で私が持っているカードの一覧です。写っているカードを下の JSON 形式にして出力してください。

ルール
- ★5 のカードだけを出す（★3・★4 は出さない）
- 1 枚のカードにつき 1 行。複数のスクショに写っているものはまとめて 1 行にする
- card はカード名（サブタイトル）、holomen はホロメン名。読めたとおりに書き、言い換えない
- bloom は開花段階（凸数）の 0〜5 の整数。読み取れないときは null（推測で埋めない）
- 読めなかったものは cards に入れず unreadable に理由を書く
- プレイヤー名・ID などの個人情報、カードのレベル・パラメータは出力しない
- 出力は JSON だけ。説明文は書かない

出力形式
{
  "format": "holodori-optimizer/import",
  "version": 1,
  "kind": "owned-members",
  "cards": [{ "card": "サクラBloom", "holomen": "さくらみこ", "bloom": 3 }],
  "unreadable": [{ "reason": "カード名が切れている", "hint": "3 枚目の右下" }]
}`;
