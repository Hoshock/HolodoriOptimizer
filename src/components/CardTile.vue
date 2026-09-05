<script setup lang="ts">
import SkillIcon from "./SkillIcon.vue";
import { BLOOM_MAX } from "../data/bloom";
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
  /** 開花段階のステッパーを右上に出す(所持ピッカーの登録済みカード) */
  bloomControl?: boolean;
  /** 開花段階(ステッパーの現在値) */
  bloom?: number;
}>();

const emit = defineEmits<{ activate: []; bloomChange: [delta: number] }>();

/** タイル自体が button のため、内側の操作は span[role=button] で受ける(ネスト不可) */
function stepBloom(delta: number): void {
  const next = (props.bloom ?? 0) + delta;
  if (next < 0 || next > BLOOM_MAX) return;
  emit("bloomChange", delta);
}
</script>

<template>
  <!--
    1 行 1 枚のタイル。タイプはタイプ淡色の面で表し、普段は枠線を見せない
    (透明ボーダーで寸法を確保し、選択時のみタイプ基準色の太枠を出す)。
  -->
  <button
    type="button"
    class="tile"
    :class="[
      `type-${props.card.type}`,
      {
        selected: props.selected,
        excluded: props.excluded,
        'has-bloom': props.bloomControl && props.selected,
      },
    ]"
    :disabled="props.disabled"
    :title="props.disabled ? props.disabledReason : undefined"
    :aria-pressed="props.selected || props.excluded"
    @click="emit('activate')"
  >
    <span class="holomen">{{ holomenName(props.card.holomenId) }}</span>
    <span class="card-name">{{ props.card.name }}</span>
    <span v-if="props.bloomControl && props.selected" class="bloom-control" @click.stop>
      <span
        role="button"
        :tabindex="(props.bloom ?? 0) <= 0 ? -1 : 0"
        class="bloom-step"
        :aria-disabled="(props.bloom ?? 0) <= 0"
        aria-label="開花を下げる"
        @click="stepBloom(-1)"
        @keydown.enter.prevent="stepBloom(-1)"
        @keydown.space.prevent="stepBloom(-1)"
      >
        −
      </span>
      <SkillIcon kind="bloom" :count="props.bloom ?? 0" :label="`開花${props.bloom ?? 0}`" />
      <span
        role="button"
        :tabindex="(props.bloom ?? 0) >= 5 ? -1 : 0"
        class="bloom-step"
        :aria-disabled="(props.bloom ?? 0) >= 5"
        aria-label="開花を上げる"
        @click="stepBloom(1)"
        @keydown.enter.prevent="stepBloom(1)"
        @keydown.space.prevent="stepBloom(1)"
      >
        ＋
      </span>
    </span>
    <span class="skills">
      <template v-if="props.skillView === 'costume'">
        <span class="skill-row">
          <SkillIcon kind="costume" label="衣装" />
          <span class="skill-text">{{ props.card.costumeSkill.raw }}</span>
        </span>
      </template>
      <template v-else>
        <span class="skill-row">
          <SkillIcon kind="sp" label="SP" />
          <span class="skill-text">{{ props.card.specialSkill.raw }}</span>
        </span>
        <span class="skill-row">
          <SkillIcon kind="active" label="アクティブ" />
          <span class="skill-text">{{ props.card.activeSkill.raw }}</span>
        </span>
        <span class="skill-row">
          <SkillIcon kind="passive" label="パッシブ" />
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
  line-height: 20px;
  overflow: hidden;
  padding-right: 56px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-name {
  color: var(--ink-2);
  display: block;
  font-size: 12px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 名前ブロックと効果の間はタイルの上下 padding(9px)と同じにして、下端の余白と対称にする(2026-09-05) */
.skills {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 9px;
}

/*
 * スキル 1 件 = 常に 2 行ぶんの固定高(原文は基本 2 行に収まる。1 行のときは縦中央)。
 * 内容量でタイルの高さを変えず、3 行にも動かしもしない(2026-09-05 ユーザー指示)。
 * 行同士の隙間は 2px に詰める。バッジは列として行の全高を占有し、折り返した本文が下に食い込まない。
 * この部品はピッカーとメイン画面(UnitSlot)で共用し、幅・高さを一致させる
 */
.skill-row {
  align-items: center; /* アイコンと本文を 2 行ぶんの真ん中に置く */
  display: flex;
  gap: 8px;
  height: 36px;
}

/* 本文は内容ぶんの高さ(1〜2 行)、収まらない例外は省略記号。英数字トークン手前の早折れを防ぐため break-all */
.skill-text {
  -webkit-box-orient: vertical;
  color: var(--ink);
  display: -webkit-box;
  flex: 1;
  font-size: 12px;
  -webkit-line-clamp: 2;
  line-height: 18px;
  min-width: 0;
  overflow: hidden;
  word-break: break-all;
}

/* 開花段階のステッパー: 名前 2 行ぶんの右側に絶対配置し、登録の有無でタイル寸法を変えない */
.bloom-control {
  align-items: center;
  display: flex;
  gap: 4px;
  position: absolute;
  right: 8px;
  top: 8px;
}

/* タイル(button)の内側のため span[role=button]。押下面はアイコンと同じ正円 */
.bloom-step {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  height: 28px;
  justify-content: center;
  user-select: none; /* 連打で記号を選択状態にしない */
  width: 28px;
}

/* 上下限では押下アクション(タップフィードバック)ごと無効にする */
.bloom-step[aria-disabled="true"] {
  cursor: default;
  opacity: 0.35;
  pointer-events: none;
}

/* ステッパーぶん名前・カード名の右を空ける(重なり防止) */
.tile.has-bloom .holomen,
.tile.has-bloom .card-name {
  padding-right: 104px;
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
