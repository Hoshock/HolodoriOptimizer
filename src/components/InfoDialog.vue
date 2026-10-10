<script setup lang="ts">
import { computed } from "vue";

import { useModalChrome } from "../composables/useModalChrome";
import type { InfoTable, InfoTerms, InfoText } from "../ui/infoContent";

/**
 * 見出しの行の ⓘ(`InfoButton`)から開く中央のダイアログ(2026-10-08 ユーザー指示)。中身は 2 つの形のどちらか:
 * - `table`: 列が選択肢、行が違いの表(さがすの 3 択)。いま選んでいる選択肢の列見出しは選択の色
 * - `terms`: 名前と段落の組(結果のタブ・アカウント・発動頻度の選び方 — 言葉の意味が分かればよいもの)
 * - `text`: 段落だけ(リソースのシートの使い方)
 * 表と名前の組は、前に 1 段落(`lead`)を置ける。文は文ごとに改行せず段落で出す(2026-10-08 ユーザー指示「文ごとの改行だるい」)。
 * ほかは見出しと「閉じる」だけ
 */
const props = defineProps<{
  table?: InfoTable<string>;
  terms?: InfoTerms<string>;
  text?: InfoText;
  /** いま選んでいる選択肢(表の列の key) */
  current?: string;
}>();

const emit = defineEmits<{ close: [] }>();

/** 行見出しの列は一番長い行見出しが 1 行に収まる幅(残りは選択肢の列で中身の量に応じて分ける) */
const labelWidth = computed(
  () => `calc(${Math.max(0, ...(props.table?.rows ?? []).map((r) => r.label.length))}em + 8px)`,
);

const title = computed(() => props.table?.title ?? props.terms?.title ?? props.text?.title ?? "");

// 背景が見えるダイアログなのでスクロールロックはかけない(ConfirmDialog と同じ)
useModalChrome(() => emit("close"), { lockScroll: false });
</script>

<template>
  <!-- 外枠は .overlay と名付けない: 親の部品の scoped な .overlay がこのルート要素にも当たる(Vue は子のルートに親のスコープを付ける) -->
  <div class="info-overlay" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="info-title">
      <h3 id="info-title">{{ title }}</h3>
      <div class="scroll">
        <p v-if="props.table?.lead ?? props.terms?.lead" class="lead">
          {{ props.table?.lead ?? props.terms?.lead }}
        </p>
        <table v-if="props.table">
          <colgroup>
            <col :style="{ width: labelWidth }" />
          </colgroup>
          <thead>
            <tr>
              <td></td>
              <th
                v-for="c in props.table.columns"
                :key="c.key"
                scope="col"
                :class="{ current: c.key === props.current }"
                :aria-current="c.key === props.current ? 'true' : undefined"
              >
                {{ c.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in props.table.rows" :key="r.label">
              <th scope="row">{{ r.label }}</th>
              <td v-for="(cell, i) in r.cells" :key="i">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
        <dl v-if="props.terms">
          <div v-for="t in props.terms.terms" :key="t.key" class="term">
            <dt>{{ t.label }}</dt>
            <dd v-for="(paragraph, i) in t.paragraphs" :key="i">{{ paragraph }}</dd>
          </div>
        </dl>
        <div v-if="props.text" class="paragraphs">
          <p v-for="(paragraph, i) in props.text.paragraphs" :key="i">{{ paragraph }}</p>
        </div>
      </div>
      <button type="button" class="close" @click="emit('close')">閉じる</button>
    </div>
  </div>
</template>

<style scoped>
.info-overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px 12px;
  position: fixed;
  /* 背景のスクロールは止めるが、ピンチ(拡大の戻し)はブラウザへ譲る(ConfirmDialog と同じ) */
  touch-action: pinch-zoom;
  z-index: 11;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  display: grid;
  gap: 8px;
  grid-template-rows: auto minmax(0, 1fr) auto;
  max-height: 100%;
  max-width: 26rem;
  padding: 16px 12px;
  width: 100%;
}

h3 {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 4px;
}

/* 背の低い画面では表だけをスクロールする(見出しと「閉じる」は残す) */
.scroll {
  overflow-y: auto;
  overscroll-behavior: contain;
}

/*
 * 列の幅は中身の量で配る(auto)。「いまのまま」のように中身の短い列を等分で広く取ると、長い列が語の途中で折り返して読みにくい
 * (「ボード、コネク / ト」)。3 択の表は中身がそろっているので、ほぼ等分になる
 */
table {
  border-collapse: collapse;
  font-size: 12px;
  line-height: 1.45;
  table-layout: auto;
  width: 100%;
}

th,
td {
  border: 1px solid var(--line);
  padding: 6px 4px;
  text-align: left;
  vertical-align: top;
}

/* 見出し(選択肢の名前・行の名前)は折り返さない(`.claude/skills/ui-design/references/parts.md` の表のセル)。枡の中身は折り返してよい */
th {
  white-space: nowrap;
}

/* 左上の空きの枡は線も地も出さない */
thead td {
  border: none;
}

thead th {
  background: var(--bg);
  font-weight: 700;
  text-align: center;
  vertical-align: middle;
}

thead th.current {
  background: var(--selected);
  color: var(--selected-ink);
}

tbody th {
  background: var(--bg);
  color: var(--ink-2);
  font-weight: 700;
}

/* 名前と段落の組: 名前は太字の 1 行、段落はその下(本文と同じ 14px で読ませる)。前置きの段落・段落だけの形も同じ文字 */
dl {
  display: grid;
  gap: 14px;
  margin: 0;
}

.term {
  display: grid;
  gap: 2px;
}

dt {
  font-size: 14px;
  font-weight: 700;
}

dd {
  color: var(--ink);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

/* 段落を分けたときだけ、段落のあいだを少しあける */
dd + dd,
.paragraphs p + p {
  margin-top: 8px;
}

.lead {
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 12px;
}

.paragraphs p {
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.close {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  margin-top: 8px;
}
</style>
