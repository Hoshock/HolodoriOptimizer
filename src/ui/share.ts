import { formatScore } from "./labels";

/**
 * 結果の共有（2026-09-14 ユーザー指示）。共有するのは画面に出ている値だけ —
 * 所持カードの一覧や localStorage の中身は渡さない。URL は canonical なトップページに固定する
 * （個別の結果を復元する URL は持たせない）
 */
export const SITE_URL = "https://hoshock.github.io/HolodoriOptimizer/";

export interface ShareUnit {
  /** リーダーの表示名（ホロメン名「カード名」。結果詳細に出ているもの） */
  leaderLabel: string;
  /** 表示中のユニットスコア（試算値） */
  unitScore: number;
}

/** 共有する本文。試算値であることを必ず添える（ゲーム内の確定値のように書かない） */
export function buildShareText(unit: ShareUnit): string {
  return [
    "ホロドリの所持カードから編成を全探索",
    `リーダー: ${unit.leaderLabel}`,
    `ユニットスコア: ${formatScore(unit.unitScore)}（試算）`,
    "#ホロドリ",
  ].join("\n");
}

/** X の投稿画面。本文と URL は intent 側が別々に扱うのでクエリで分けて渡す */
export function buildXIntentUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text, url });
  return `https://x.com/intent/post?${params.toString()}`;
}

/** 共有に使えるブラウザの機能。テストから差し替えられるように引数で受ける */
export interface ShareEnv {
  /** Web Share API（navigator.share）。使えない環境では undefined */
  share?: (data: { text: string; url: string }) => Promise<void>;
  /** X の投稿画面を別タブで開く（window.open） */
  openUrl?: (url: string) => boolean;
  /** クリップボードへの書き込み（navigator.clipboard.writeText） */
  writeText?: (text: string) => Promise<void>;
}

export type ShareOutcome = "shared" | "opened" | "copied" | "cancelled" | "failed";

/**
 * 共有シート → X の投稿画面 → テキストのコピー の順に試す。
 * 共有シートをユーザーが閉じたときは何もしない（"cancelled"）— 続けて X を開くと押していない操作になる
 */
export async function shareUnit(unit: ShareUnit, env: ShareEnv): Promise<ShareOutcome> {
  const text = buildShareText(unit);
  if (env.share) {
    try {
      await env.share({ text, url: SITE_URL });
      return "shared";
    } catch {
      // ユーザーが閉じた場合も例外になるので、ここでは後続へ進まない
      return "cancelled";
    }
  }
  if (env.openUrl?.(buildXIntentUrl(text, SITE_URL)) === true) return "opened";
  if (env.writeText) {
    try {
      await env.writeText(`${text}\n${SITE_URL}`);
      return "copied";
    } catch {
      return "failed";
    }
  }
  return "failed";
}
