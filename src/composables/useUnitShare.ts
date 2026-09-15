import { onUnmounted, ref } from "vue";

import { useCopyTuning } from "./useCopyTuning";
import { shareUnit } from "../ui/share";

/**
 * 編成の共有（2026-09-14 ユーザー指示）。渡すのは画面に出ている 2 つの値（リーダーと表示中のユニットスコア）と
 * トップページの URL だけで、所持カードの一覧や保存内容は渡さない。共有シートが使えない環境では X の
 * 投稿画面を開き、それも塞がれていたらテキストをコピーする（`src/ui/share.ts`）。
 *
 * 結果詳細とお気に入りのユニット詳細の両方から同じ形で共有できるようにするための共通部品
 * （2026-09-15 ユーザー指示「ユニットのページに共有ボタンがない」）
 */
export function useUnitShare(): {
  copied: import("vue").Ref<boolean>;
  share: (leaderLabel: string, unitScore: number) => Promise<void>;
} {
  const copied = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  // 共有文の言い回しは開発用の「文言・配置」で試せる
  const { tuning } = useCopyTuning();

  async function share(leaderLabel: string, unitScore: number): Promise<void> {
    const outcome = await shareUnit(
      { leaderLabel, unitScore },
      {
        share:
          typeof navigator !== "undefined" && "share" in navigator
            ? (data) => navigator.share(data)
            : undefined,
        openUrl: (url) => window.open(url, "_blank", "noopener,noreferrer") !== null,
        writeText:
          typeof navigator !== "undefined" && "clipboard" in navigator
            ? (text) => navigator.clipboard.writeText(text)
            : undefined,
      },
      { lead: tuning.value.shareLead, tag: tuning.value.shareTag },
    );
    // コピーへ落ちたときだけ、押した結果が見えないので 2 秒だけ印を変える(CopyButton と同じ 2 秒)
    if (outcome !== "copied") return;
    copied.value = true;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      copied.value = false;
    }, 2000);
  }

  onUnmounted(() => {
    if (timer !== null) clearTimeout(timer);
  });

  return { copied, share };
}
