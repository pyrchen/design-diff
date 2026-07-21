<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BreakpointOutcome, BreakpointResult, StyleDiffCategory, StyleDiffEntry } from '../types';
import { isBreakpointError } from '../types';
import OverlaySlider from './OverlaySlider.vue';

const props = defineProps<{ result: BreakpointOutcome }>();

const viewMode = ref<'side' | 'overlay' | 'diff'>('side');

const ok = computed<BreakpointResult | null>(() => (isBreakpointError(props.result) ? null : props.result));

const scorePct = computed(() => (ok.value ? Math.round(ok.value.score * 100) : 0));

const scoreClass = computed(() => {
  const p = scorePct.value;
  if (p >= 95) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (p >= 85) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
});

const categoryLabels: Record<StyleDiffCategory, string> = {
  color: 'Цвета',
  typography: 'Типографика',
  spacing: 'Отступы',
  layout: 'Layout',
};
const categoryOrder: StyleDiffCategory[] = ['color', 'typography', 'spacing', 'layout'];

const groupedStyleDiff = computed<[StyleDiffCategory, StyleDiffEntry[]][]>(() => {
  if (!ok.value) return [];
  const groups = new Map<StyleDiffCategory, StyleDiffEntry[]>();
  for (const entry of ok.value.styleDiff) {
    if (!groups.has(entry.category)) groups.set(entry.category, []);
    groups.get(entry.category)!.push(entry);
  }
  return categoryOrder.filter((c) => groups.has(c)).map((c) => [c, groups.get(c)!]);
});
</script>

<template>
  <div class="rounded-xl border border-base-700 bg-base-900 p-5">
    <template v-if="isBreakpointError(result)">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">{{ result.breakpoint }}px</h3>
        <span class="rounded-full border border-rose-500/30 bg-rose-500/15 px-3 py-1 text-sm text-rose-400">ошибка</span>
      </div>
      <p class="mt-3 text-sm text-slate-400">{{ result.error }}</p>
    </template>
    <template v-else-if="ok">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="text-lg font-semibold">{{ ok.breakpoint }}px</h3>
        <span class="rounded-full border px-3 py-1 text-sm font-medium" :class="scoreClass">{{ scorePct }}% совпадение</span>
      </div>

      <div class="mt-4 flex gap-2">
        <button
          v-for="mode in (['side', 'overlay', 'diff'] as const)"
          :key="mode"
          type="button"
          class="rounded-md px-3 py-1.5 text-sm transition"
          :class="viewMode === mode ? 'bg-indigo-500 text-white' : 'bg-base-800 text-slate-300 hover:bg-base-700'"
          @click="viewMode = mode"
        >
          {{ mode === 'side' ? 'Side-by-side' : mode === 'overlay' ? 'Overlay' : 'Diff' }}
        </button>
      </div>

      <div class="mt-4">
        <div v-if="viewMode === 'side'" class="grid grid-cols-2 gap-3">
          <div>
            <p class="mb-1 text-xs uppercase tracking-wide text-slate-500">Референс</p>
            <img :src="ok.refImg" class="w-full rounded-lg border border-base-700" alt="Референс" />
          </div>
          <div>
            <p class="mb-1 text-xs uppercase tracking-wide text-slate-500">Цель</p>
            <div class="relative">
              <img :src="ok.targetImg" class="block w-full rounded-lg border border-base-700" alt="Цель" />
              <div
                v-for="(region, i) in ok.hotRegions"
                :key="i"
                class="pointer-events-none absolute border-2 border-rose-500/80 bg-rose-500/20"
                :style="{
                  left: region.xPct + '%',
                  top: region.yPct + '%',
                  width: region.wPct + '%',
                  height: region.hPct + '%',
                }"
              />
            </div>
          </div>
        </div>

        <div v-else-if="viewMode === 'overlay'">
          <OverlaySlider :ref-img="ok.refImg" :target-img="ok.targetImg" />
        </div>

        <div v-else>
          <img :src="ok.diffImg" class="w-full rounded-lg border border-base-700" alt="Diff" />
        </div>
      </div>

      <div v-if="groupedStyleDiff.length > 0" class="mt-5 space-y-3">
        <div v-for="[category, entries] in groupedStyleDiff" :key="category">
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{{ categoryLabels[category] }}</p>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="(entry, i) in entries" :key="i" class="border-t border-base-800">
                <td class="py-1.5 pr-3 text-slate-400">{{ entry.label }}</td>
                <td class="py-1.5 pr-3 font-mono text-rose-300">{{ entry.target }}</td>
                <td class="py-1.5 text-slate-500">←</td>
                <td class="py-1.5 pl-3 font-mono text-emerald-300">{{ entry.reference }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p v-else class="mt-5 text-sm text-slate-500">Структурированных расхождений стилей нет.</p>
    </template>
  </div>
</template>
