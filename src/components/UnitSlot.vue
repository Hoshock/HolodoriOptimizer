<script setup lang="ts">
import type { Card } from "../data/types";
import { holomenName } from "../ui/labels";

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
  <!--
    空・充填のどちらでも枠の寸法を変えないため、variant ごとに高さを固定する。
    充填時はタイプ色の淡背景+基準色の枠で表し、タイプ名のテキストは置かない。
  -->
  <div class="unit-slot" :class="`variant-${props.variant}`">
    <button
      type="button"
      class="slot-body"
      :class="props.card ? `filled type-${props.card.type}` : 'empty'"
      :aria-label="
        props.card ? `${props.label}: ${holomenName(props.card.holomenId)}` : props.label
      "
      :disabled="props.disabled"
      @click="emit('activate')"
    >
      <template v-if="props.card">
        <span class="holomen">{{ holomenName(props.card.holomenId) }}</span>
        <span class="card-name">{{ props.card.name }}</span>
        <span class="skills">
          <template v-if="props.variant === 'leader'">
            <span class="skill-row">
              <span class="skill-tag">衣装</span>
              <span class="skill-text">{{ props.card.costumeSkill.raw }}</span>
            </span>
          </template>
          <template v-else>
            <span class="skill-row">
              <span class="skill-tag">SP</span>
              <span class="skill-text">{{ props.card.specialSkill.raw }}</span>
            </span>
            <span class="skill-row">
              <span class="skill-tag">アクティブ</span>
              <span class="skill-text">{{ props.card.activeSkill.raw }}</span>
            </span>
            <span class="skill-row">
              <span class="skill-tag">パッシブ</span>
              <span class="skill-text">{{ props.card.passiveSkill.raw }}</span>
            </span>
          </template>
        </span>
      </template>
      <span v-else class="empty-msg">{{ props.emptyText }}</span>
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
 * 高さは variant で固定(空・充填で共通)。内訳は各行の固定高の合計。
 * 枠線は空の点線のみ(充填時は透明ボーダーで寸法を揃え、面の色だけで表す)
 */
.slot-body {
  border: 1px solid transparent;
  border-radius: var(--r-m);
  cursor: pointer;
  display: block;
  overflow: hidden;
  padding: 12px;
  text-align: left;
  width: 100%;
}

.variant-leader .slot-body {
  height: 112px;
}

.variant-member .slot-body {
  height: 196px;
}

.slot-body:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.slot-body.empty {
  align-items: center;
  background: var(--bg);
  border-color: var(--line);
  border-style: dashed;
  display: flex;
  justify-content: center;
}

.empty-msg {
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
}

/* 充填時: タイプの淡色を面に使う(タイプ名の文字・枠線は置かない) */
.slot-body.type-cute {
  background: var(--cute-tint);
}

.slot-body.type-happy {
  background: var(--happy-tint);
}

.slot-body.type-pure {
  background: var(--pure-tint);
}

.holomen {
  color: var(--ink);
  display: block;
  font-size: 17px;
  font-weight: 700;
  height: 24px;
  line-height: 24px;
  overflow: hidden;
  padding-right: 28px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-name {
  color: var(--ink-2);
  display: block;
  font-size: 12px;
  height: 18px;
  line-height: 18px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* スキル領域の高さは固定(空・充填の寸法一致)。各行が常に 2 行ぶんを占有して埋める */
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

/*
 * スキル 1 件 = 常に 2 行ぶんの固定高(1 行のときは下を 1 行空ける)。
 * バッジは列として行の全高を占有し、折り返した本文がバッジの下に食い込まない
 */
.skill-row {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  height: 36px;
}

.skill-tag {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  height: 18px;
  line-height: 16px;
  text-align: center;
  width: 5.5em;
}

.skill-text {
  -webkit-box-orient: vertical;
  color: var(--ink);
  display: -webkit-box;
  flex: 1;
  font-size: 12px;
  height: 36px;
  -webkit-line-clamp: 2;
  line-height: 18px;
  min-width: 0;
  overflow: hidden;
  word-break: break-all;
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
