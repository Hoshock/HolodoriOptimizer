<script setup lang="ts">
import { computed, ref } from "vue";

import CardPicker from "./CardPicker.vue";
import CloseButton from "./CloseButton.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import CopyButton from "./CopyButton.vue";
import { useBloomText } from "../composables/useBloomText";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById } from "../data";
import type { SkillKey } from "../data/bloomEvidence";
import type { BloomResolvedSource } from "../data/bloom";
import {
  BLOOM_TEXT_SKILLS,
  bloomTextDefaultsOf,
  bloomTextValue,
  buildBloomTextReport,
  withBloomTextEdit,
  withVisitedCard,
  withoutBloomTextCard,
  withoutBloomTextEdits,
} from "../ui/bloomText";
import { holomenName } from "../ui/labels";

/**
 * 開発用の「開花文言」（サイドメニューの折り畳み「開発用」、文言・配置の下 — 2026-09-15 ユーザー指示
 * 「カードごとに開花ごとの文言を更新するための入力フォームが欲しい。その上でそれを構造化して
 * ペーストする部分もほしい…複数のホロメンを連続して入れられるように工夫して。また既に DB に
 * 入っているやつをデフォルトで入力しておくこと。間違ってる場合もあるので上書きできるようにしておくこと」）。
 *
 * カードを選ぶ → 開花段階ごとの文言を実機を見ながら直す → 共有用データをコピーして渡す、の 3 つだけ。
 * **欄は開花段階ごとではなく「文言が変わらない区間」ごとに 1 つ**（どのスキルがどの段階で強くなるかは
 * 決まっているので、同じ文言を何度も打たせない — 2026-09-15 ユーザー指示）。
 * 入れた内容は **localStorage にだけ残り、カードデータは書き換えない**（データへの反映は根拠を
 * 確かめてからコミットで行う — `docs/human/evidence-policy.md`）。
 * 複数のカードは切り替えチップで行き来でき、共有用データには開いたカードが開いた順に全部入る。
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const { state, set } = useBloomText();

/** 開いているカード（最後に選んだもの。未選択なら入力欄は出さない） */
const currentId = ref<string | null>(state.value.visited.at(-1) ?? null);
const current = computed(() => (currentId.value ? (cardById.get(currentId.value) ?? null) : null));

const pickerOpen = ref(false);
function onPick(cardId: string): void {
  pickerOpen.value = false;
  currentId.value = cardId;
  set(withVisitedCard(state.value, cardId));
}

/** 入力済み（開いた）カードの切り替え。いまのカードデータで引けるものだけ出す */
const visitedCards = computed(() =>
  state.value.visited
    .map((id) => cardById.get(id))
    .filter((card) => card !== undefined)
    .map((card) => ({
      id: card.id,
      label: `${holomenName(card.holomenId)} ${card.name}`,
      edited: Object.keys(state.value.edits[card.id] ?? {}).length > 0,
    })),
);

/** 開いているカードの既定値（いまのカードデータから出る段階ごとの文言と出所） */
const defaults = computed(() => (current.value ? bloomTextDefaultsOf(current.value) : null));

function valueOf(skill: SkillKey, bloom: number, fallback: string): string {
  return currentId.value === null
    ? fallback
    : bloomTextValue(state.value.edits, currentId.value, skill, bloom, fallback);
}

function onInput(skill: SkillKey, bloom: number, fallback: string, event: Event): void {
  if (currentId.value === null) return;
  const text = (event.target as HTMLTextAreaElement).value;
  set(withBloomTextEdit(state.value, currentId.value, skill, bloom, text, fallback));
}

/** データに入っている文言の出所（記録があるか、最大側からの推定か）。最大側そのものには印を付けない */
const SOURCE_LABEL: Partial<Record<BloomResolvedSource, string>> = {
  "observed-variant": "実機",
  "reconstructed-observation": "実機再構成",
  "extracted-master-variant": "master",
  "recorded-variant-unclassified": "記録",
  "derived-from-max-confirmed-ratio": "換算",
  "estimated-from-max": "推定",
};

const editedCount = computed(() =>
  currentId.value === null
    ? 0
    : Object.values(state.value.edits[currentId.value] ?? {}).reduce(
        (sum, cells) => sum + Object.keys(cells).length,
        0,
      ),
);

/** 消す操作は 2 つとも確認を挟む（入れ直した文言は取り戻せない） */
const confirming = ref<"reset" | "remove" | null>(null);
function confirmed(): void {
  const id = currentId.value;
  const action = confirming.value;
  confirming.value = null;
  if (id === null || action === null) return;
  if (action === "reset") {
    set(withoutBloomTextEdits(state.value, id));
    return;
  }
  const next = withoutBloomTextCard(state.value, id);
  set(next);
  currentId.value = next.visited.at(-1) ?? null;
}

const report = computed(() =>
  buildBloomTextReport(state.value, (cardId) => {
    const card = cardById.get(cardId);
    return card ? { card, holomen: holomenName(card.holomenId) } : null;
  }),
);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="開花文言">
      <header class="sheet-head">
        <h3>開花文言</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <button type="button" class="secondary" @click="pickerOpen = true">カードを選ぶ</button>

        <!-- 入力済みのカード。押すと切り替わる（複数のホロメンを続けて入れるための行き来） -->
        <div
          v-if="visitedCards.length > 0"
          class="chips"
          role="group"
          aria-label="入力済みのカード"
        >
          <button
            v-for="item in visitedCards"
            :key="item.id"
            type="button"
            class="chip"
            role="radio"
            :aria-checked="item.id === currentId"
            :class="{ 'chip-active': item.id === currentId, 'chip-edited': item.edited }"
            @click="currentId = item.id"
          >
            {{ item.label }}
          </button>
        </div>

        <template v-if="current && defaults">
          <div class="card-head">
            <!-- ホロメン名が主で、カード名は下に小さく添える（一覧・結果詳細と同じ隣接の形） -->
            <span class="card-label">
              <span class="card-name">{{ holomenName(current.holomenId) }}</span>
              <span class="card-sub">{{ current.name }}</span>
            </span>
            <span class="card-actions">
              <button
                v-if="editedCount > 0"
                type="button"
                class="mini"
                @click="confirming = 'reset'"
              >
                もどす{{ editedCount }}
              </button>
              <button type="button" class="mini" @click="confirming = 'remove'">外す</button>
            </span>
          </div>

          <section v-for="skill in BLOOM_TEXT_SKILLS" :key="skill.key" class="skill">
            <h4>{{ skill.label }}</h4>
            <div v-for="cell in defaults[skill.key]" :key="cell.bloom" class="row">
              <span class="stage">
                {{ cell.label }}
                <span v-if="SOURCE_LABEL[cell.source]" class="source">{{
                  SOURCE_LABEL[cell.source]
                }}</span>
              </span>
              <textarea
                class="text"
                rows="2"
                spellcheck="false"
                :aria-label="`${skill.label} ${cell.label}`"
                :class="{ edited: valueOf(skill.key, cell.bloom, cell.text) !== cell.text }"
                :value="valueOf(skill.key, cell.bloom, cell.text)"
                @input="onInput(skill.key, cell.bloom, cell.text, $event)"
              ></textarea>
            </div>
          </section>
        </template>

        <div class="box">
          <div class="box-head">
            <span>開花文言の構造化データ</span>
            <CopyButton :text="report" />
          </div>
          <textarea
            class="json"
            readonly
            spellcheck="false"
            aria-label="開花文言の構造化データ"
            :value="report"
          ></textarea>
        </div>
      </div>
    </div>

    <CardPicker
      v-if="pickerOpen"
      title="カード"
      mode="pick"
      skill-view="member"
      memory-key="bloom-text"
      :selected-id="currentId"
      @pick="onPick"
      @close="pickerOpen = false"
    />

    <ConfirmDialog
      v-if="confirming"
      :message="confirming === 'reset' ? '入れた文言を捨てますか？' : 'このカードを外しますか？'"
      confirm-label="捨てる"
      @confirm="confirmed"
      @cancel="confirming = null"
    />
  </div>
</template>

<style scoped>
/* 器はデータの取り込み・出力と同じ（モバイルはフルスクリーン、広い画面では中央のダイアログ） */
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 10;
}

.sheet {
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  width: 100%;
}

@media (min-width: 48rem) {
  .overlay {
    align-items: center;
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  .sheet {
    border-radius: var(--r-m);
    height: min(85dvh, 46rem);
    max-width: 46rem;
  }
}

.sheet-head {
  align-items: center;
  background: var(--chrome-head);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  justify-content: space-between;
  padding: 16px;
}

.sheet-head h3 {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
  margin: 0;
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

/* カードを選ぶ（内訳シートの全幅 secondary ボタンと同寸法） */
.secondary {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  width: 100%;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 切り替えチップ（ピッカーの絞り込みチップと同形。文言を入れたものは太字） */
.chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 12px;
  max-width: 100%;
  overflow: hidden;
  padding: 6px 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-edited {
  font-weight: 700;
}

.chip-active {
  background: var(--selected);
  border-color: var(--selected);
  color: var(--selected-ink);
}

.card-head {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.card-label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.card-name {
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* カード名は一覧と同じくホロメン名に隣接させ、小さく淡く添える */
.card-sub {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 14px;
  margin-top: -1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-actions {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}

.mini {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  height: 28px;
  padding: 0 10px;
}

.skill {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skill h4 {
  font-size: 15px;
  margin: 0;
}

/* 区間のラベル（固定幅）+ 文言の欄。ラベルの幅をそろえて欄の左端を 1 本の線にする */
.row {
  align-items: start;
  display: grid;
  gap: 8px;
  grid-template-columns: 5rem 1fr;
}

.stage {
  color: var(--ink-2);
  display: flex;
  flex-direction: column;
  font-size: 12px;
  font-weight: 600;
  padding-top: 6px;
}

/* データの出所（記録があるか、最大側からの推定か）。入れ直す優先順位の目印 */
.source {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.8;
}

.text {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  min-width: 0;
  padding: 6px 8px;
  resize: vertical;
  width: 100%;
}

/* 入れ直した欄は枠で分かるようにする（共有用データの edited と同じもの） */
.text.edited {
  border-color: var(--selected);
}

.box {
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.box-head {
  align-items: center;
  background: var(--bg);
  display: flex;
  font-size: 13px;
  font-weight: 700;
  gap: 8px;
  justify-content: space-between;
  padding: 6px 8px 6px 12px;
}

.json {
  background: var(--surface);
  border: none;
  color: var(--ink);
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  height: 12rem;
  line-height: 1.5;
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 8px 12px;
  resize: none;
  white-space: pre;
  width: 100%;
}
</style>
