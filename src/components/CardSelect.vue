<script setup lang="ts">
import { computed } from "vue";

import type { Card } from "../data/types";
import { cardLabel, sortCards } from "../ui/labels";

const props = defineProps<{
  /** 選択肢に出すカード */
  options: Card[];
  /** 「選択しない」を許すか(固定メンバー枠で使用) */
  allowEmpty?: boolean;
  emptyLabel?: string;
  id?: string;
}>();

const model = defineModel<string | null>({ required: true });

const sorted = computed(() => sortCards(props.options));
</script>

<template>
  <select :id="props.id" v-model="model" class="card-select">
    <option v-if="props.allowEmpty" :value="null">
      {{ props.emptyLabel ?? "(指定しない)" }}
    </option>
    <option v-for="card in sorted" :key="card.id" :value="card.id">
      {{ cardLabel(card) }}
    </option>
  </select>
</template>

<style scoped>
.card-select {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.95rem;
  max-width: 100%;
  padding: 0.45rem 0.5rem;
}
</style>
