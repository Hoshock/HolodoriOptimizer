<script setup lang="ts">
import type { Card } from "../data/types";
import { holomenName } from "../ui/labels";

const props = defineProps<{
  card: Card;
  /** costume: 衣装スキル 1 行(リーダー選択) / member: SP・アクティブ・パッシブ(メンバー・除外) */
  skillView: "costume" | "member";
  /** 選択中(ピッカーで現在選ばれている 1 枚)。太枠で示す */
  selected?: boolean;
  /** 除外中(グレーアウト+ラベル) */
  excluded?: boolean;
  /** 選択不可(他枠と同一ホロメンなど) */
  disabled?: boolean;
  disabledReason?: string;
}>();

const emit = defineEmits<{ activate: [] }>();
</script>

<template>
  <!--
    1 行 1 枚のタイル。タイプはタイプ淡色の面で表し、普段は枠線を見せない
    (透明ボーダーで寸法を確保し、選択時のみタイプ基準色の太枠を出す)。
  -->
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
    <span class="skills">
      <template v-if="props.skillView === 'costume'">
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
    <span v-if="props.excluded" class="excluded-label" aria-hidden="true">除外中</span>
  </button>
</template>

<style scoped>
.tile {
  border: 3px solid transparent;
  border-radius: var(--r-m);
  cursor: pointer;
  display: block;
  padding: 9px 10px;
  position: relative;
  text-align: left;
  width: 100%;
}

.tile.type-cute {
  background: var(--cute-tint);
}

.tile.type-happy {
  background: var(--happy-tint);
}

.tile.type-pure {
  background: var(--pure-tint);
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
  font-size: 15px;
  font-weight: 700;
  line-height: 22px;
  overflow: hidden;
  padding-right: 56px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-name {
  color: var(--ink-2);
  display: block;
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skills {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
}

/*
 * スキル 1 件 = 常に 2 行ぶんの固定高(1 行のときは下を 1 行空ける)。
 * バッジは列として行の全高を占有し、折り返した本文がバッジの下に食い込まない
 */
.skill-row {
  display: flex;
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
