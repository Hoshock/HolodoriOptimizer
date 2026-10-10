<script setup lang="ts">
import { computed } from "vue";

import { CONNECT_EXTENT_LABELS } from "../data/connect";
import type { ConnectAnchor } from "../data/connect";
import type { ConnectPlacement } from "../data/connect";
import type { ConnectSlot } from "../storage/connectInventory";
import { holomenName } from "../ui/labels";

/**
 * 持っている枚数を超えてコネクトを置こうとしたときの、持ってくる場所(2026-10-10 ユーザー指示「ボード上でコネクトおくとき、他で使われている
 * コネクトを外さないと置けない場合、どこから取ってくるかというのを指定しておけるようにしたい」「禁止まではしないがモーダルで警告を出す」)。
 * 倍率の行(`ConnectPermilPane`)の選んだ行がその場で広がり、その中に出る(同日「％選んだらそこの矩形が広がって他の%の候補は下に行って」)。
 * 同じ 形 × ％ を置いている場所の行(ホロメン名 +「青ボードから外す」。押すとそこから外してここへ置く)と、いちばん下に同じ形の行で
 * 「無視して置く」(持っている枚数を超えたまま置く)。説明の文は出さない(「不要な文章はなるべく書かない」。状況は aria-label へ)。
 * 所持カードが未登録のときも照合する(持っているコネクトは 0 枚 — 「いや照合する」)。未登録の一言は添えない(2026-10-10 ユーザー指示「所持カードが未登録ですは不要」)
 */
const props = defineProps<{
  placement: ConnectPlacement;
  /** 持っている枚数(0 なら持っていない) */
  owned: number;
  /** 同じ 形 × ％ を置いている場所(いまのコネクトマスを除く。並べる順) */
  sources: readonly ConnectSlot[];
}>();

const emit = defineEmits<{ take: [from: ConnectSlot]; place: [] }>();

/**
 * 行の右: どこから外すか(「青ボードから外す」)。押すとそこから外すことを言葉で示す(2026-10-10 ユーザー指示「外すという言葉をどこかにつけないと。
 * のコネクトは不要」— 「青ボードのコネクト」の「のコネクト」は言わなくても分かる)
 */
const FROM_LABELS: Readonly<Record<ConnectAnchor, string>> = {
  center: "中心から外す",
  leader: "赤ボードから外す",
  card: "青ボードから外す",
  content: "黄ボードから外す",
};

const percent = computed(() => `+${String(props.placement.permil / 10)}%`);
const message = computed(() => {
  if (props.owned > 0) {
    const owned = String(props.owned);
    // 持っている枚数より多く置いている(登録漏れなど)ときは、並ぶ場所の数と食い違わないように両方の数を言う
    if (props.sources.length > props.owned) {
      return `${percent.value} は ${owned} 枚持っていて、${String(props.sources.length)} か所に置いています。どこから外して持ってきますか？`;
    }
    const all = props.owned === 1 ? "持っている 1 枚を" : ` ${owned} 枚とも`;
    return `${percent.value} は${all}使っています。どこから外して持ってきますか？`;
  }
  return props.sources.length > 0
    ? `${percent.value} は持っていません。ほかに置いているところから外して持ってきますか？`
    : `${percent.value} は持っていません。`;
});
</script>

<template>
  <div
    class="take-pane"
    role="group"
    :aria-label="`${CONNECT_EXTENT_LABELS[props.placement.extent]} ${message}`"
  >
    <ul class="sources">
      <li v-for="s in props.sources" :key="`${s.holomenId}/${s.anchor}`">
        <button type="button" class="source" @click="emit('take', s)">
          <span class="name">{{ holomenName(s.holomenId) }}</span>
          <span class="anchor">{{ FROM_LABELS[s.anchor] }}</span>
        </button>
      </li>
      <!-- 持ってこずに置く: 場所の行と同じ扱いで、いちばん下 -->
      <li>
        <button type="button" class="source ignore" @click="emit('place')">
          <span class="name">無視して置く</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 広がった行の中: 場所の行を縦に */
.take-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.sources {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

/* 持ってくる場所: 押せる行(枠線つきの角丸)。名前は左、コネクトマスは右の淡色 */
.source {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  cursor: pointer;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-height: 48px;
  padding: 6px 14px;
  text-align: left;
  width: 100%;
}

.name {
  font-size: 15px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 無視して置く: 行の形は同じで、名前は淡く(持ってくる場所ではない) */
.ignore .name {
  color: var(--ink-2);
}

.anchor {
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
