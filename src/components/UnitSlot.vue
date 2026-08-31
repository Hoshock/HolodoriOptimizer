<script setup lang="ts">
import type { Card } from "../data/types";
import { formatScore, holomenName, TYPE_LABELS } from "../ui/labels";

const props = defineProps<{
  /** 枠の名前(リーダー / メンバー 1 など)。空でも表示され続ける */
  label: string;
  /** leader: 衣装スキル 1 行 / member: SP・アクティブ・パッシブの 3 行 */
  variant: "leader" | "member";
  card: Card | null;
  /** 空にしたときの案内(強調行) */
  emptyTitle: string;
  /** 空にしたときの案内(補足行) */
  emptySub: string;
}>();

const emit = defineEmits<{ activate: []; clear: [] }>();

function total(card: Card): number {
  return card.stats.performance + card.stats.technique + card.stats.sense;
}
</script>

<template>
  <!--
    空・充填のどちらでも枠の寸法を 1px も変えないため、内部の各行を固定高にする。
    行構成(head / name / skills)は両状態で常に描画し、中身だけ差し替える。
  -->
  <div class="unit-slot" :class="[`variant-${props.variant}`, { filled: props.card !== null }]">
    <button type="button" class="slot-body" @click="emit('activate')">
      <span class="slot-head">
        <span class="slot-label">{{ props.label }}</span>
        <template v-if="props.card">
          <span class="type-badge" :class="`type-${props.card.type}`">
            {{ TYPE_LABELS[props.card.type] }}
          </span>
          <span class="holomen">{{ holomenName(props.card.holomenId) }}</span>
        </template>
        <span v-else class="empty-flag">未選択</span>
      </span>
      <span class="name-row">
        <span class="card-name">{{ props.card?.name }}</span>
        <span v-if="props.card" class="total">合計 {{ formatScore(total(props.card)) }}</span>
      </span>
      <span class="skills">
        <template v-if="props.card">
          <template v-if="props.variant === 'leader'">
            <span class="skill-row">
              <span class="skill-tag">衣装</span>{{ props.card.costumeSkill.raw }}
            </span>
          </template>
          <template v-else>
            <span class="skill-row">
              <span class="skill-tag">SP</span>{{ props.card.specialSkill.raw }}
            </span>
            <span class="skill-row">
              <span class="skill-tag">アクティブ</span>{{ props.card.activeSkill.raw }}
            </span>
            <span class="skill-row">
              <span class="skill-tag">パッシブ</span>{{ props.card.passiveSkill.raw }}
            </span>
          </template>
        </template>
        <span v-else class="empty-msg">
          <span class="empty-title">{{ props.emptyTitle }}</span>
          <span class="empty-sub">{{ props.emptySub }}</span>
        </span>
      </span>
    </button>
    <button
      v-if="props.card && props.variant === 'member'"
      type="button"
      class="slot-clear"
      :aria-label="`${props.label}の固定を解除`"
      @click="emit('clear')"
    >
      ✕
    </button>
  </div>
</template>

<style scoped>
.unit-slot {
  position: relative;
  width: 100%;
}

.slot-body {
  background: var(--bg);
  border: 1px dashed var(--line);
  border-radius: var(--r-m);
  cursor: pointer;
  display: block;
  padding: 12px;
  text-align: left;
  width: 100%;
}

.filled .slot-body {
  background: var(--surface);
  border-style: solid;
}

/* head 行: 固定高 24px。メンバー枠は ✕ ボタンと重ならないよう常に右を空ける */
.slot-head {
  align-items: center;
  display: flex;
  gap: 8px;
  height: 24px;
  overflow: hidden;
}

.variant-member .slot-head {
  padding-right: 32px;
}

.slot-label {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  padding: 0 8px;
}

.filled .slot-label {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}

.type-badge {
  border-radius: var(--r-s);
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  padding: 0 8px;
}

.type-badge.type-cute {
  background: var(--cute-tint);
  color: var(--cute-text);
}

.type-badge.type-happy {
  background: var(--happy-tint);
  color: var(--happy-text);
}

.type-badge.type-pure {
  background: var(--pure-tint);
  color: var(--pure-text);
}

.holomen {
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-flag {
  color: var(--ink-2);
  font-size: 12px;
}

/* name 行: 固定高 20px(カード名 ellipsis + 合計値) */
.name-row {
  align-items: baseline;
  display: flex;
  gap: 8px;
  height: 20px;
  justify-content: space-between;
  margin-top: 2px;
  overflow: hidden;
}

.card-name {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.total {
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 20px;
}

/* skills 領域: variant ごとに固定高(leader 1 行 / member 3 行)。空でも同じ高さを保つ */
.skills {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  overflow: hidden;
}

.variant-leader .skills {
  height: 36px;
}

.variant-member .skills {
  height: 120px;
}

/* スキル 1 件 = 2 行ぶんの固定高(あふれは隠す) */
.skill-row {
  color: var(--ink);
  display: block;
  font-size: 12px;
  height: 36px;
  line-height: 18px;
  overflow: hidden;
}

.skill-tag {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink-2);
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  margin-right: 6px;
  min-width: 4.5em;
  padding: 0 6px;
  text-align: center;
}

.empty-msg {
  align-items: center;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  justify-content: center;
}

.empty-title {
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 700;
}

.empty-sub {
  color: var(--ink-2);
  font-size: 11px;
}

.slot-clear {
  align-items: center;
  background: var(--ink);
  border: 2px solid var(--surface);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  font-size: 11px;
  height: 28px;
  justify-content: center;
  position: absolute;
  right: 8px;
  top: 8px;
  width: 28px;
}
</style>
