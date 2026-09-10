/**
 * 取り込み画面に載せる「手元の AI に渡すプロンプト」（2026-09-10 ユーザー指示
 * 「説明文が長い。コピーできるプロンプトをはれ」）。ユーザーはこれをコピーして
 * スクショと一緒にローカルの LLM へ渡す。
 *
 * 指示は一切書き写さず `.claude/skills/structure-import/SKILL.md` を指すだけにする
 * （「skill 側にその指示を書いて次のスキルを実行してくださいでいいんじゃないの」— 2026-09-10）。
 * ただし**スクリーンショットを添付すること**だけは本文に書く — 暗黙だと分かりにくく、
 * 添付なしで送って「停止します」と返された（2026-09-10 ユーザー報告）。
 * 実行手順・出力の作法・取得に失敗したときの振る舞いはすべてスキル側の
 * 「URL で渡されたときの実行手順」に置く — プロンプトとスキルの二重管理をしない。
 * URL は raw を指す（HTML ページより取得・解析が確実で、リンク先も同じ形で辿れる）。
 */
const SKILL_RAW_URL =
  "https://raw.githubusercontent.com/Hoshock/HolodoriOptimizer/main/.claude/skills/structure-import/SKILL.md";

export const OWNED_IMPORT_PROMPT = `所持カードのスクリーンショットを添付します。次のスキルに従って取り込み用 JSON を作ってください。
${SKILL_RAW_URL}`;

/** 貼り付け欄のプレースホルダ。整形した形で置く（1 行に詰めると読めない — 2026-09-10 ユーザー指示） */
export const OWNED_IMPORT_PLACEHOLDER = `{
  "format": "holodori-optimizer/import",
  "version": 1,
  "kind": "owned-members",
  "cards": [
    {
      "card": "サクラBloom",
      "holomen": "さくらみこ",
      "bloom": 3
    }
  ]
}`;
