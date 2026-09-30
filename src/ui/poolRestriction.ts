import type { PoolMode } from "../storage/selection";

/**
 * さがすのオプション「除外 / 選択」(2026-09-30 ユーザー指示)を、エンジンへ渡す役割別の除外リストに直す。
 *
 * - 除外: 選んだカードを候補から外す(従来どおり)
 * - 選択: 選んだカードの**中だけ**からおまかせで探す = 選んでいないカードを候補から外す。
 *   選んだカードが 1 枚もない(または所持外・未知のカードだけ)のときは絞らない — 0 件になる設定を作らない
 *
 * エンジンは役割別の「除外」しか持たないので、選択はその補集合で表す(エンジン側に別の経路を作らない)。
 * 自分で指定したリーダー・固定したメンバーにはエンジンが除外を適用しないので、ここでも外さない。
 * `alwaysAllowed`(おかゆモードのおかゆん・リーダーをホロメンで指定したときのそのホロメンのカード)は、
 * 選択の外でも候補に残す — 明示の指定を選択の絞り込みで打ち消さない
 */
export interface RoleRestrictionInput {
  mode: PoolMode;
  excludedIds: readonly string[];
  selectedIds: readonly string[];
  /** 現在のカードデータにある全カード ID */
  allCardIds: readonly string[];
  /** 所持カードから探すときの所持 ID の集合(全カードなら null) */
  poolIds: ReadonlySet<string> | null;
  /** 選択の外でも候補に残すカード */
  alwaysAllowed?: ReadonlySet<string>;
}

/** 選択のうち、いま探索に効いているカード(既知で、所持カードから探すときは所持の中のもの) */
export function effectiveSelectedIds(
  selectedIds: readonly string[],
  allCardIds: readonly string[],
  poolIds: ReadonlySet<string> | null,
): string[] {
  const known = new Set(allCardIds);
  return selectedIds.filter((id) => known.has(id) && (poolIds === null || poolIds.has(id)));
}

/** 役割別の除外としてエンジンへ渡すカード ID */
export function roleExclusions(input: RoleRestrictionInput): string[] {
  if (input.mode === "exclude") return [...input.excludedIds];
  const selected = new Set(
    effectiveSelectedIds(input.selectedIds, input.allCardIds, input.poolIds),
  );
  if (selected.size === 0) return [];
  const allowed = input.alwaysAllowed ?? new Set<string>();
  return input.allCardIds.filter((id) => !selected.has(id) && !allowed.has(id));
}
