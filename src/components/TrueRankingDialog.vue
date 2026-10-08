<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { useModalChrome } from "../composables/useModalChrome";
import type { TrueRankingStatus } from "../composables/useTrueRanking";
import type { TrueRankingPhase } from "../engine/trueRanking";
import { RANKING_PHASES, rankingEstimate, remainingLabel } from "../ui/trueRanking";

/**
 * 「最適化順」の進み具合(2026-10-08 ユーザー指示「どのくらい時間かかるか、いまどれくらいかをかっこいいかんじかつわかりやすく、
 * クリックしたらモーダルで出す」)。中央のダイアログに、リング(中に全体の % と残り時間。経過時間・ここまでの最高値は「要らん」—
 * 同日ユーザー指示)と 3 つの段を出す。計算は探し直したときだけ止めるので「中止」は置かない(閉じても続く)。
 * 終わったら「並べ替える」、失敗したら「やり直す」。始める前(失敗のあと)は見積もりの分と「開始」。説明文は置かない
 */
const props = defineProps<{
  status: TrueRankingStatus;
  progress: { phase: TrueRankingPhase; done: number } | null;
  /** 段ごとの仕事の数(計算中) */
  workload: Readonly<Record<TrueRankingPhase, number>>;
  /** 始める前の見積もり用の仕事の数 */
  planned: Readonly<Record<TrueRankingPhase, number>> | null;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}>();

const emit = defineEmits<{ start: []; sort: []; close: [] }>();

useModalChrome(() => emit("close"), { lockScroll: false });

const PHASE_LABELS: Record<TrueRankingPhase, string> = {
  proxy: "見込みのボード",
  search: "候補の絞り込み",
  optimize: "最適化",
};

/** 経過時間と残り時間を 1 秒ごとに更新する */
const now = ref(Date.now());
const timer = setInterval(() => {
  now.value = Date.now();
}, 1000);
onUnmounted(() => {
  clearInterval(timer);
});
watch(
  () => props.status,
  () => {
    now.value = Date.now();
  },
);

const elapsedMs = computed(() =>
  props.startedAt === null ? 0 : (props.finishedAt ?? now.value) - props.startedAt,
);
const estimate = computed(() => {
  if (props.status === "done") return { fraction: 1, remainingMs: 0 };
  if (props.status === "idle")
    return rankingEstimate({
      workload: props.planned ?? props.workload,
      phase: null,
      done: 0,
      elapsedMs: 0,
    });
  return rankingEstimate({
    workload: props.workload,
    phase: props.progress?.phase ?? null,
    done: props.progress?.done ?? 0,
    elapsedMs: elapsedMs.value,
  });
});
const percent = computed(() => Math.floor(estimate.value.fraction * 100));

/** いまの段の小さなリング(半径 8。その段の済んだ割合) */
const MINI = 2 * Math.PI * 8;
/** リング(半径 70、線幅 10) */
const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const dashOffset = computed(() => CIRCUMFERENCE * (1 - estimate.value.fraction));

type StepState = "done" | "current" | "waiting";
/** 段の状態。見込みのボードを使い回すとき(仕事が 0)は済んだ扱い */
const steps = computed(() => {
  const current = props.progress?.phase ?? null;
  const currentIndex = current === null ? -1 : RANKING_PHASES.indexOf(current);
  const workload = props.status === "idle" ? (props.planned ?? props.workload) : props.workload;
  return RANKING_PHASES.map((phase, i) => {
    const total = workload[phase];
    let state: StepState = "waiting";
    if (props.status === "done" || i < currentIndex || total === 0) state = "done";
    else if (i === currentIndex && props.status === "running") state = "current";
    const done =
      state === "done"
        ? total
        : state === "current"
          ? Math.min(props.progress?.done ?? 0, total)
          : 0;
    return { phase, label: PHASE_LABELS[phase], state, done, total };
  });
});

const number = (n: number): string => n.toLocaleString("ja-JP");
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="最適化順">
      <h3>最適化順</h3>
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 160 160" aria-hidden="true">
          <circle class="track" cx="80" cy="80" :r="RADIUS" />
          <circle
            class="bar"
            :class="{ running: props.status === 'running' }"
            cx="80"
            cy="80"
            :r="RADIUS"
            :stroke-dasharray="CIRCUMFERENCE"
            :stroke-dashoffset="dashOffset"
          />
        </svg>
        <div class="center">
          <template v-if="props.status === 'idle'">
            <span class="big"
              >{{ Math.max(1, Math.round(estimate.remainingMs / 60_000)) }}<small>分</small></span
            >
          </template>
          <template v-else>
            <span class="big">{{ percent }}<small>%</small></span>
            <span v-if="props.status === 'running'" class="sub">
              残り {{ remainingLabel(estimate.remainingMs) }}
            </span>
            <span v-else-if="props.status === 'done'" class="sub">完了</span>
            <span v-else class="sub error-text">中断</span>
          </template>
        </div>
      </div>

      <ol class="steps">
        <li v-for="step in steps" :key="step.phase" :class="step.state">
          <span class="mark" aria-hidden="true">
            <svg v-if="step.state === 'done'" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="9" />
              <path d="M5.5 10.5l3 3 6-6.5" />
            </svg>
            <svg v-else-if="step.state === 'current'" class="mini" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="8" />
              <circle
                class="mini-bar"
                cx="10"
                cy="10"
                r="8"
                :stroke-dasharray="MINI"
                :stroke-dashoffset="MINI * (1 - (step.total > 0 ? step.done / step.total : 0))"
              />
            </svg>
            <svg v-else viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" /></svg>
          </span>
          <span class="step-label">{{ step.label }}</span>
          <span class="step-count">
            <template v-if="step.total > 0 && props.status !== 'idle'">
              {{ number(step.done) }} / {{ number(step.total) }}
            </template>
          </span>
        </li>
      </ol>

      <p v-if="props.status === 'error' && props.error" class="error-text message">
        {{ props.error }}
      </p>

      <div class="actions">
        <template v-if="props.status === 'idle'">
          <button type="button" class="cancel" @click="emit('close')">キャンセル</button>
          <button type="button" class="confirm" @click="emit('start')">開始</button>
        </template>
        <button
          v-else-if="props.status === 'running'"
          type="button"
          class="cancel wide"
          @click="emit('close')"
        >
          閉じる
        </button>
        <template v-else-if="props.status === 'done'">
          <button type="button" class="cancel" @click="emit('close')">閉じる</button>
          <button type="button" class="confirm" @click="emit('sort')">並べ替える</button>
        </template>
        <template v-else>
          <button type="button" class="cancel" @click="emit('close')">閉じる</button>
          <button type="button" class="confirm" @click="emit('start')">やり直す</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  /* 背景のスクロールは止めるが、ピンチ(拡大の戻し)はブラウザへ譲る(ConfirmDialog と同じ) */
  touch-action: pinch-zoom;
  z-index: 11;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  max-width: 20rem;
  padding: 16px;
  width: 100%;
}

h3 {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
}

.ring-wrap {
  height: 168px;
  margin: 12px auto 8px;
  position: relative;
  width: 168px;
}

.ring {
  height: 100%;
  transform: rotate(-90deg);
  width: 100%;
}

.ring circle {
  fill: none;
  stroke-width: 10;
}

.ring .track {
  stroke: var(--line);
}

/* 始点は北(12 時)で時計回りに伸ばす(2026-10-08 ユーザー指示)。丸い端は始点の手前へはみ出すので平らにする */
.ring .bar {
  stroke: var(--action);
  stroke-linecap: butt;
  transition: stroke-dashoffset 0.6s ease;
}

.center {
  align-items: center;
  display: flex;
  flex-direction: column;
  inset: 0;
  justify-content: center;
  position: absolute;
}

.big {
  font-size: 36px;
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  line-height: 1;
}

.big small {
  font-size: 16px;
  font-weight: 700;
  margin-left: 2px;
}

.sub {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 700;
  margin-top: 6px;
}

.steps {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
}

.steps li {
  align-items: center;
  display: grid;
  font-size: 13px;
  font-weight: 600;
  gap: 8px;
  grid-template-columns: 20px 1fr auto;
}

.steps li.waiting {
  color: var(--ink-2);
}

.mark {
  display: flex;
  height: 20px;
  width: 20px;
}

.mark svg {
  height: 20px;
  width: 20px;
}

.mark circle {
  fill: none;
  stroke: var(--line);
  stroke-width: 1.5;
}

.done .mark circle {
  fill: var(--action);
  stroke: var(--action);
}

.mark path {
  fill: none;
  stroke: #fff;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

/* いまの段の小さなリング: 大きいリングと同じく北を始点に時計回り */
.mark .mini {
  transform: rotate(-90deg);
}

.mark .mini circle {
  stroke-width: 2.5;
}

.mark .mini .mini-bar {
  stroke: var(--action);
  transition: stroke-dashoffset 0.6s ease;
}

.step-count {
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.message {
  font-size: 13px;
  font-weight: 600;
  margin: -8px 0 16px;
}

.error-text {
  color: var(--error);
}

.actions {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
}

.actions button {
  border-radius: var(--r-m);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  height: 44px;
  padding: 0 8px;
}

.wide {
  grid-column: 1 / -1;
}

.cancel {
  background: var(--surface);
  border: 1px solid var(--line);
}

.confirm {
  background: var(--action);
  border: none;
  color: #fff;
}
</style>
