import { CONNECT_EFFECTS } from "./connect";
import type { ConnectEffectDef, ConnectEffectId, ConnectLevel } from "./connect";
import type { CardRarity } from "./types";

/**
 * カード固有のコネクト効果(カード ID → 範囲の形と Lv1 / Lv2 の増幅 ‰ の組み合わせ `CONNECT_EFFECTS` の ID)。
 *
 * 2026-10-09 に抽出マスター HolodoriDB/holodori-db-jpn-diff(commit 6680c7c37a8a3b3d56d919df823dca318db0d802 の
 * Card.json / SkillTreeConnectEffect.json / SkillTreeConnectEffectExtent.json)から ★5 84 枚・★4 54 枚の全件を転記した
 * 【外部解析。実機未確認 — ADR-008 / ADR-022】。形の座標と ‰ の値そのものは既存の `CONNECT_EFFECTS` と全件一致したので、
 * ここはカードから既存の定義を引く対応表だけを持つ。**ホロメン単位ではなくカード単位**(同じホロメンの ★5 と ★4 で違う)。
 *
 * ボードに置くコネクト(`src/storage/connect.ts`。コネクトマスごとに形 × ‰)とは別の概念で、持っているコネクトは
 * 所持カードとこの表から導く(`src/storage/connectInventory.ts`)。レベル(0〜4凸 = Lv1、5凸 = Lv2)は `connectLevel` の暫定モデル
 */
export const CARD_CONNECT_EFFECTS = {
  "tokino-sora-01": "content-3-r5",
  "roboco-san-01": "center-1-r5",
  "aki-rosenthal-01": "leader-2-r5",
  "akai-haato-01": "leader-2-r5",
  "shirakami-fubuki-01": "leader-1-r5",
  "natsuiro-matsuri-01": "leader-1-r5",
  "nakiri-ayame-01": "leader-3-r5",
  "yuzuki-choco-01": "card-1-r5",
  "oozora-subaru-01": "card-1-r5",
  "azki-01": "card-2-r5",
  "ookami-mio-01": "center-1-r5",
  "sakura-miko-01": "center-1-r5",
  "nekomata-okayu-01": "leader-1-r5",
  "inugami-korone-01": "center-3-r5",
  "hoshimachi-suisei-01": "center-1-r5",
  "usada-pekora-01": "content-1-r5",
  "shiranui-flare-01": "content-1-r5",
  "shirogane-noel-01": "general-1-r5",
  "houshou-marine-01": "center-2-r5",
  "tsunomaki-watame-01": "leader-3-r5",
  "tokoyami-towa-01": "card-1-r5",
  "himemori-luna-01": "leader-2-r5",
  "yukihana-lamy-01": "card-3-r5",
  "momosuzu-nene-01": "content-2-r5",
  "shishiro-botan-01": "content-3-r5",
  "omaru-polka-01": "content-1-r5",
  "laplus-darknesss-01": "leader-3-r5",
  "takane-lui-01": "card-2-r5",
  "hakui-koyori-01": "card-2-r5",
  "kazama-iroha-01": "card-3-r5",
  "ayunda-risu-01": "card-4-r5",
  "moona-hoshinova-01": "general-1-r5",
  "airani-iofifteen-01": "card-4-r5",
  "kureiji-ollie-01": "center-3-r5",
  "anya-melfissa-01": "center-3-r5",
  "pavolia-reine-01": "content-2-r5",
  "vestia-zeta-01": "center-2-r5",
  "kaela-kovalskia-01": "center-3-r5",
  "kobo-kanaeru-01": "content-2-r5",
  "mori-calliope-01": "center-1-r5",
  "takanashi-kiara-01": "center-1-r5",
  "ninomae-inanis-01": "center-2-r5",
  "irys-01": "content-3-r5",
  "ouro-kronii-01": "card-4-r5",
  "hakos-baelz-01": "content-3-r5",
  "shiori-novella-01": "card-3-r5",
  "koseki-bijou-01": "center-3-r5",
  "nerissa-ravencroft-01": "general-1-r5",
  "fuwawa-abyssgard-01": "center-2-r5",
  "mococo-abyssgard-01": "card-1-r5",
  "otonose-kanade-01": "center-2-r5",
  "ichijou-ririka-01": "center-3-r5",
  "juufuutei-raden-01": "card-2-r5",
  "todoroki-hajime-01": "center-2-r5",
  "oozora-subaru-02": "leader-1-r5",
  "shiranui-flare-02": "card-1-r5",
  "shirogane-noel-02": "card-2-r5",
  "tsunomaki-watame-02": "center-5-r5",
  "otonose-kanade-02": "content-1-r5",
  "sakura-miko-02": "leader-3-r5",
  "hoshimachi-suisei-02": "content-3-r5",
  "nakiri-ayame-02": "card-1-r5",
  "himemori-luna-02": "center-5-r5",
  "kureiji-ollie-02": "card-4-r5",
  "mori-calliope-02": "content-1-r5",
  "ninomae-inanis-02": "content-2-r5",
  "shirakami-fubuki-02": "card-2-r5",
  "ookami-mio-02": "card-1-r5",
  "nekomata-okayu-02": "content-2-r5",
  "inugami-korone-02": "content-1-r5",
  "takane-lui-02": "center-5-r5",
  "fuwawa-abyssgard-02": "leader-2-r5",
  "mococo-abyssgard-02": "content-3-r5",
  "aki-rosenthal-02": "card-3-r5",
  "shiori-novella-02": "card-1-r5",
  "laplus-darknesss-02": "center-5-r5",
  "anya-melfissa-02": "card-2-r5",
  "houshou-marine-02": "card-3-r5",
  "hakui-koyori-02": "center-5-r5",
  "kobo-kanaeru-02": "leader-2-r5",
  "hakos-baelz-02": "card-2-r5",
  "yukihana-lamy-02": "content-2-r5",
  "omaru-polka-02": "center-5-r5",
  "ichijou-ririka-02": "leader-3-r5",
  "tokino-sora-star4-01": "content-3-r4",
  "roboco-san-star4-01": "content-4-r4",
  "aki-rosenthal-star4-01": "leader-2-r4",
  "akai-haato-star4-01": "center-4-r4",
  "shirakami-fubuki-star4-01": "content-3-r4",
  "natsuiro-matsuri-star4-01": "card-3-r4",
  "nakiri-ayame-star4-01": "content-3-r4",
  "yuzuki-choco-star4-01": "content-4-r4",
  "oozora-subaru-star4-01": "card-3-r4",
  "azki-star4-01": "leader-2-r4",
  "ookami-mio-star4-01": "content-4-r4",
  "sakura-miko-star4-01": "center-4-r4",
  "nekomata-okayu-star4-01": "center-4-r4",
  "inugami-korone-star4-01": "card-3-r4",
  "hoshimachi-suisei-star4-01": "leader-2-r4",
  "usada-pekora-star4-01": "center-4-r4",
  "shiranui-flare-star4-01": "leader-2-r4",
  "shirogane-noel-star4-01": "leader-2-r4",
  "houshou-marine-star4-01": "content-4-r4",
  "tsunomaki-watame-star4-01": "content-3-r4",
  "tokoyami-towa-star4-01": "content-4-r4",
  "himemori-luna-star4-01": "content-3-r4",
  "yukihana-lamy-star4-01": "center-4-r4",
  "momosuzu-nene-star4-01": "content-4-r4",
  "shishiro-botan-star4-01": "content-3-r4",
  "omaru-polka-star4-01": "content-3-r4",
  "laplus-darknesss-star4-01": "content-4-r4",
  "takane-lui-star4-01": "center-4-r4",
  "hakui-koyori-star4-01": "leader-2-r4",
  "kazama-iroha-star4-01": "center-4-r4",
  "ayunda-risu-star4-01": "leader-2-r4",
  "moona-hoshinova-star4-01": "leader-2-r4",
  "airani-iofifteen-star4-01": "content-4-r4",
  "kureiji-ollie-star4-01": "center-4-r4",
  "anya-melfissa-star4-01": "content-3-r4",
  "pavolia-reine-star4-01": "content-3-r4",
  "vestia-zeta-star4-01": "content-4-r4",
  "kaela-kovalskia-star4-01": "card-3-r4",
  "kobo-kanaeru-star4-01": "card-3-r4",
  "mori-calliope-star4-01": "card-3-r4",
  "takanashi-kiara-star4-01": "content-3-r4",
  "ninomae-inanis-star4-01": "center-4-r4",
  "irys-star4-01": "content-4-r4",
  "ouro-kronii-star4-01": "card-3-r4",
  "hakos-baelz-star4-01": "center-4-r4",
  "shiori-novella-star4-01": "content-4-r4",
  "koseki-bijou-star4-01": "content-3-r4",
  "nerissa-ravencroft-star4-01": "content-3-r4",
  "fuwawa-abyssgard-star4-01": "center-4-r4",
  "mococo-abyssgard-star4-01": "content-4-r4",
  "otonose-kanade-star4-01": "card-3-r4",
  "ichijou-ririka-star4-01": "center-4-r4",
  "juufuutei-raden-star4-01": "card-3-r4",
  "todoroki-hajime-star4-01": "leader-2-r4",
} as const satisfies Record<string, ConnectEffectId>;

export const CARD_CONNECT_PROVENANCE = {
  repo: "HolodoriDB/holodori-db-jpn-diff",
  commit: "6680c7c37a8a3b3d56d919df823dca318db0d802",
  asOf: "2026-10-09",
  evidence: "extracted-master",
} as const;

/** そのカードのコネクト効果の ID(未収録なら null。いまは全カード収録) */
export function connectEffectIdOfCard(cardId: string): ConnectEffectId | null {
  return Object.hasOwn(CARD_CONNECT_EFFECTS, cardId)
    ? CARD_CONNECT_EFFECTS[cardId as keyof typeof CARD_CONNECT_EFFECTS]
    : null;
}

/** そのカードのコネクト効果(範囲の形と [Lv1, Lv2] の ‰)。未収録なら null */
export function connectEffectOfCard(cardId: string): ConnectEffectDef | null {
  const id = connectEffectIdOfCard(cardId);
  return id === null ? null : CONNECT_EFFECTS[id];
}

/** コネクト効果の ID の末尾のレアリティ(r4 / r5) */
export function connectEffectRarity(id: ConnectEffectId): CardRarity {
  return id.endsWith("-r4") ? 4 : 5;
}

/** そのレベルの増幅 ‰ */
export function cardConnectPermil(cardId: string, level: ConnectLevel): number | null {
  const def = connectEffectOfCard(cardId);
  return def === null ? null : def.permil[level - 1];
}
