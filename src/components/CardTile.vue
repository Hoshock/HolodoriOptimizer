<script setup lang="ts">
import type { Card } from "../data/types";
import { formatScore, holomenName, TYPE_LABELS } from "../ui/labels";

const props = defineProps<{
  card: Card;
  /** 選択中(リーダー/固定枠)。枠線はカードのタイプ基準色 */
  selected?: boolean;
  /** 除外中(グレーアウト+ラベル) */
  excluded?: boolean;
  /** 選択不可(他枠と同一ホロメンなど) */
  disabled?: boolean;
  disabledReason?: string;
}>();

const emit = defineEmits<{ activate: [] }>();

function total(card: Card): number {
  return card.stats.performance + card.stats.technique + card.stats.sense;
}
</script>

<template>
  <button
    type="button"
    class="tile"
    :class="[`type-${props.card.type}`, { selected: props.selected, excluded: props.excluded }]"
    :disabled="props.disabled"
    :title="props.disabled ? props.disabledReason : undefined"
    :aria-pressed="props.selected || props.excluded"
    @click="emit('activate')"
  >
    <span class="holomen">{{ holomenName(props.card.holomenId) }}</span>
    <span class="card-name">{{ props.card.name }}</span>
    <span class="tile-foot">
      <span class="type-badge">{{ TYPE_LABELS[props.card.type] }}</span>
      <span class="total">{{ formatScore(total(props.card)) }}</span>
    </span>
    <span v-if="props.selected" class="check" aria-hidden="true">✓</span>
    <span v-if="props.excluded" class="excluded-label" aria-hidden="true">除外中</span>
  </button>
</template>

<style scoped>
/*
 * 等高タイル: 各行の高さを行数で固定する(1 行名 + 2 行カード名 + フッタ)。
 * -webkit-box や grid stretch に依存しないので、どのグリッドに置いても高さが揃う。
 * タイプ色はバッジと選択枠のみに使う(面のベタ塗り・ストライプ禁止)。
 */
.tile {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  cursor: pointer;
  display: block;
  padding: 10px 12px;
  position: relative;
  text-align: left;
  width: 100%;
}

.tile.selected {
  border-width: 2px;
  padding: 9px 11px;
}

.tile.type-cute.selected {
  border-color: var(--cute);
}

.tile.type-happy.selected {
  border-color: var(--happy);
}

.tile.type-pure.selected {
  border-color: var(--pure);
}

.tile:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.tile.excluded {
  background: var(--bg);
  filter: grayscale(1);
  opacity: 0.6;
}

.holomen {
  color: var(--ink);
  display: block;
  font-size: 14px;
  font-weight: 700;
  height: 1.4em;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-name {
  color: var(--ink-2);
  display: block;
  font-size: 12px;
  height: 3em; /* 1.5 行高 × 2 行ぶんで固定 */
  line-height: 1.5;
  margin-top: 2px;
  overflow: hidden;
}

.tile-foot {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-top: 4px;
}

.type-badge {
  border-radius: var(--r-s);
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  padding: 0 8px;
}

.type-cute .type-badge {
  background: var(--cute-tint);
  color: var(--cute-text);
}

.type-happy .type-badge {
  background: var(--happy-tint);
  color: var(--happy-text);
}

.type-pure .type-badge {
  background: var(--pure-tint);
  color: var(--pure-text);
}

.total {
  color: var(--ink-2);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.check {
  align-items: center;
  background: var(--ink);
  border-radius: 50%;
  color: #fff;
  display: flex;
  font-size: 12px;
  font-weight: 700;
  height: 20px;
  justify-content: center;
  position: absolute;
  right: 8px;
  top: 8px;
  width: 20px;
}

.excluded-label {
  background: var(--ink);
  border-radius: var(--r-s);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  padding: 0 8px;
  position: absolute;
  right: 8px;
  top: 8px;
}
</style>
