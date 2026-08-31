<script setup lang="ts">
import type { Card } from "../data/types";
import { formatScore, holomenName, TYPE_LABELS } from "../ui/labels";

const props = defineProps<{
  card: Card;
  /** 選択中(リーダー/固定枠)の強調 */
  selected?: boolean;
  /** 除外中(グレーアウト+✕) */
  excluded?: boolean;
  /** 選択不可(他枠と同一ホロメンなど) */
  disabled?: boolean;
  /** 不可の理由(title 表示) */
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
    <span class="tile-head">
      <span class="holomen">{{ holomenName(props.card.holomenId) }}</span>
      <span class="type-chip">{{ TYPE_LABELS[props.card.type] }}</span>
    </span>
    <span class="card-name">{{ props.card.name }}</span>
    <span class="total">トータル {{ formatScore(total(props.card)) }}</span>
    <span v-if="props.excluded" class="excluded-mark" aria-hidden="true">✕ 除外中</span>
  </button>
</template>

<style scoped>
.tile {
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.55rem 0.65rem;
  position: relative;
  text-align: left;
  transition:
    transform 0.08s,
    box-shadow 0.08s,
    border-color 0.08s;
  width: 100%;
}

.tile:hover:not(:disabled) {
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}

.tile:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

/* タイプ色は左ボーダーとチップで示す(面の塗りは控えめに) */
.tile.type-cute {
  border-left: 6px solid var(--cute);
}

.tile.type-happy {
  border-left: 6px solid var(--happy);
}

.tile.type-pure {
  border-left: 6px solid var(--pure);
}

.tile.selected {
  border-color: var(--primary-strong);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.tile.excluded {
  background: var(--surface-2);
  opacity: 0.55;
}

.tile-head {
  align-items: center;
  display: flex;
  gap: 0.4rem;
  justify-content: space-between;
}

.holomen {
  font-size: 0.95rem;
  font-weight: 700;
}

.type-chip {
  border-radius: 999px;
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.05rem 0.5rem;
}

.type-cute .type-chip {
  background: var(--cute-soft);
  color: var(--cute);
}

.type-happy .type-chip {
  background: var(--happy-soft);
  color: var(--happy);
}

.type-pure .type-chip {
  background: var(--pure-soft);
  color: var(--pure);
}

.card-name {
  color: var(--text-muted);
  font-size: 0.75rem;
  line-height: 1.4;
}

.total {
  color: var(--text-muted);
  font-size: 0.7rem;
}

.excluded-mark {
  background: var(--text);
  border-radius: 999px;
  color: var(--bg);
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.1rem 0.6rem;
  position: absolute;
  right: 0.5rem;
  top: 0.5rem;
}
</style>
