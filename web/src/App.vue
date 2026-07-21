<script setup lang="ts">
import { computed, ref } from 'vue';
import { Loader2, TriangleAlert } from 'lucide-vue-next';
import { compare, type CompareParams } from './api';
import type { BreakpointOutcome, CompareResponse } from './types';
import { isBreakpointError } from './types';
import TopBar from './components/TopBar.vue';
import CompareForm from './components/CompareForm.vue';
import BreakpointResult from './components/BreakpointResult.vue';
import RegistrationMark from './components/RegistrationMark.vue';

const loading = ref(false);
const errorMessage = ref('');
const result = ref<CompareResponse | null>(null);
const activeBreakpointIndex = ref(0);

const formRef = ref<InstanceType<typeof CompareForm> | null>(null);

async function onSubmit(params: CompareParams) {
  loading.value = true;
  errorMessage.value = '';
  result.value = null;
  try {
    result.value = await compare(params);
    activeBreakpointIndex.value = 0;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function triggerCompare() {
  formRef.value?.submit();
}

const activeBreakpoint = computed(() => result.value?.breakpoints[activeBreakpointIndex.value] ?? null);

function tabScorePct(bp: BreakpointOutcome): number | null {
  if (isBreakpointError(bp)) return null;
  return Math.round(bp.score * 100);
}

function tabScoreClass(pct: number | null): string {
  if (pct === null) return 'text-danger';
  if (pct >= 95) return 'text-accent';
  if (pct >= 85) return 'text-warning';
  return 'text-danger';
}
</script>

<template>
  <div class="min-h-dvh bg-bg text-fg">
    <TopBar :loading="loading" @compare="triggerCompare" />

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <p class="mb-5 max-w-2xl text-sm text-fg-subtle">
        Сравнение референс-дизайна и целевого сайта по брейкпоинтам — с per-side захватом/авторизацией и готовым промптом для Claude.
      </p>

      <CompareForm ref="formRef" :loading="loading" @submit="onSubmit" />

      <p
        v-if="errorMessage"
        class="mt-4 flex items-start gap-2 rounded-lg border border-danger-border bg-danger-soft p-4 text-sm text-danger"
      >
        <TriangleAlert :size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
        {{ errorMessage }}
      </p>

      <!-- Loading -->
      <div
        v-if="loading"
        class="mt-6 flex flex-col items-center gap-3 rounded-lg border border-border-hairline bg-surface/60 p-10 text-center shadow-soft-md"
      >
        <Loader2 :size="22" class="animate-spin text-accent" aria-hidden="true" />
        <p class="text-sm text-fg-subtle">Захватываю скриншоты и считаю различия — это может занять до минуты…</p>
      </div>

      <!-- Results -->
      <div v-else-if="result" class="mt-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-hairline bg-surface/60 p-4 shadow-soft-md">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-fg-faint">Среднее совпадение</p>
            <p class="font-mono text-2xl font-semibold" :class="tabScoreClass(Math.round(result.summary.avgScore * 100))">
              {{ Math.round(result.summary.avgScore * 100) }}%
            </p>
          </div>
          <p v-if="result.summary.worstBreakpoint !== null" class="text-sm text-fg-subtle">
            Худший брейкпоинт: <span class="font-mono text-fg-muted">{{ result.summary.worstBreakpoint }}px</span>
          </p>
        </div>

        <!-- Breakpoint tabs -->
        <div class="flex flex-wrap gap-1.5 border-b border-border-hairline pb-2">
          <button
            v-for="(bp, i) in result.breakpoints"
            :key="bp.breakpoint"
            type="button"
            class="inline-flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 font-mono text-sm transition-colors duration-fast ease-standard"
            :class="
              activeBreakpointIndex === i
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-subtle hover:text-fg-muted'
            "
            @click="activeBreakpointIndex = i"
          >
            {{ bp.breakpoint }}px
            <span v-if="!isBreakpointError(bp)" class="font-semibold" :class="tabScoreClass(tabScorePct(bp))">
              {{ tabScorePct(bp) }}%
            </span>
            <TriangleAlert v-else :size="12" class="text-danger" aria-hidden="true" />
          </button>
        </div>

        <BreakpointResult v-if="activeBreakpoint" :result="activeBreakpoint" :claude-prompt="result.claudePrompt" />
      </div>

      <!-- Empty state -->
      <div
        v-else
        class="mt-6 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-hairline bg-surface/30 p-12 text-center"
      >
        <RegistrationMark :size="32" class="text-fg-faint" />
        <p class="max-w-md text-sm text-fg-subtle">
          Вставьте референс и целевой сайт — покажу все расхождения и соберу промпт.
        </p>
      </div>
    </main>
  </div>
</template>
