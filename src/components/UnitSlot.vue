<script setup lang="ts">
import CardTile from "./CardTile.vue";
import type { Card } from "../data/types";
import { holomenName } from "../ui/labels";

/**
 * メイン画面のリーダー / メンバー枠。充填時はピッカーと同じ CardTile を置き(部品を共用して見た目と高さを一致させる)、
 * 空のときは同寸の点線プレースホルダに 1 行の指示を出す。寸法は空・充填・解除で 1px も変えない
 */
const props = defineProps<{
  /** 枠の識別名(アクセシビリティ用。画面には表示しない) */
  label: string;
  /** leader: 衣装スキル 1 行 / member: SP・アクティブ・パッシブの 3 行 */
  variant: "leader" | "member";
  card: Card | null;
  /** 空のときに中央へ出す 1 行の指示 */
  emptyText: string;
  /** 充填時に ✕(選択解除)ボタンを出すか */
  clearable?: boolean;
  /** 操作不可(順序制約などで今は選べない枠)。寸法は変えず薄く表示する */
  disabled?: boolean;
}>();

const emit = defineEmits<{ activate: []; clear: [] }>();
</script>

<template>
  <div
    class="unit-slot"
    :class="[`variant-${props.variant}`, { disabled: props.disabled }]"
    role="group"
    :aria-label="props.card ? `${props.label}: ${holomenName(props.card.holomenId)}` : props.label"
  >
    <CardTile
      v-if="props.card"
      :card="props.card"
      :skill-view="props.variant === 'leader' ? 'costume' : 'member'"
      :disabled="props.disabled"
      @activate="emit('activate')"
    />
    <button
      v-else
      type="button"
      class="empty-slot"
      :disabled="props.disabled"
      @click="emit('activate')"
    >
      <span class="empty-msg">{{ props.emptyText }}</span>
    </button>
    <button
      v-if="props.card && props.clearable"
      type="button"
      class="slot-clear"
      :aria-label="`${props.label}の選択を解除`"
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

/*
 * 空プレースホルダの高さ = CardTile の実高(padding 9×2 + border 3×2 + 名前 20 + カード名 16 + 9 + スキル行 36×n + 隙間 2×(n-1))。
 * CardTile 側の寸法を変えたらここも合わせる(playwright の boundingBox で確認)
 */
.empty-slot {
  align-items: center;
  background: var(--bg);
  border: 1px dashed var(--line);
  border-radius: var(--r-m);
  cursor: pointer;
  display: flex;
  justify-content: center;
  width: 100%;
}

.variant-leader .empty-slot {
  height: 105px;
}

.variant-member .empty-slot {
  height: 181px;
}

.empty-slot:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.empty-msg {
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
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
