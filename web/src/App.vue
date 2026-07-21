<script setup lang="ts">
import { ref } from 'vue';
import { compare, type CompareParams } from './api';
import type { CompareResponse } from './types';
import CompareForm from './components/CompareForm.vue';
import BreakpointResult from './components/BreakpointResult.vue';
import PromptPanel from './components/PromptPanel.vue';

const loading = ref(false);
const errorMessage = ref('');
const result = ref<CompareResponse | null>(null);

async function onSubmit(params: CompareParams) {
  loading.value = true;
  errorMessage.value = '';
  result.value = null;
  try {
    result.value = await compare(params);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10">
    <header class="mb-8">
      <h1 class="text-2xl font-bold text-slate-100">design-diff</h1>
      <p class="mt-1 text-sm text-slate-400">
        Сравнение референс-дизайна и целевого сайта по брейкпоинтам — с готовым промптом для Claude.
      </p>
    </header>

    <CompareForm :loading="loading" @submit="onSubmit" />

    <p v-if="errorMessage" class="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
      {{ errorMessage }}
    </p>

    <div v-if="result" class="mt-8 space-y-6">
      <div class="rounded-xl border border-base-700 bg-base-900 p-5">
        <h2 class="text-lg font-semibold">Сводка</h2>
        <p class="mt-1 text-sm text-slate-400">
          Среднее совпадение: <span class="font-mono text-slate-200">{{ Math.round(result.summary.avgScore * 100) }}%</span>
          <template v-if="result.summary.worstBreakpoint !== null">
            · худший брейкпоинт: <span class="font-mono text-slate-200">{{ result.summary.worstBreakpoint }}px</span>
          </template>
        </p>
      </div>

      <BreakpointResult v-for="bp in result.breakpoints" :key="bp.breakpoint" :result="bp" />

      <PromptPanel :prompt="result.claudePrompt" />
    </div>

    <div v-else-if="loading" class="mt-8 rounded-xl border border-base-700 bg-base-900 p-8 text-center text-sm text-slate-400">
      Захватываю скриншоты и считаю различия — это может занять до минуты…
    </div>
  </div>
</template>
