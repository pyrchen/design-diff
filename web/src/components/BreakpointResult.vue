<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BreakpointOutcome, BreakpointResult, ElementDiffEntry, StyleDiffCategory, StyleDiffEntry } from '../types';
import { isBreakpointError } from '../types';
import OverlaySlider from './OverlaySlider.vue';

const props = defineProps<{ result: BreakpointOutcome }>();

const viewMode = ref<'side' | 'overlay' | 'diff'>('side');
const hoveredElementKey = ref<string | null>(null);

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

const statusLabel: Record<ElementDiffEntry['status'], string> = {
  matched: 'изменён',
  missing: 'отсутствует',
  extra: 'лишний',
};
const statusClass: Record<ElementDiffEntry['status'], string> = {
  matched: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  missing: 'border-rose-500/30 bg-rose-500/15 text-rose-400',
  extra: 'border-sky-500/30 bg-sky-500/15 text-sky-400',
};

function geometrySummary(e: ElementDiffEntry): string | null {
  const g = e.geometryDelta;
  if (!g || !g.significant) return null;
  const parts: string[] = [];
  if (Math.abs(g.dx) > 3) parts.push(`x ${g.dx > 0 ? '+' : ''}${g.dx}px`);
  if (Math.abs(g.dy) > 3) parts.push(`y ${g.dy > 0 ? '+' : ''}${g.dy}px`);
  if (Math.abs(g.dw) > 3) parts.push(`w ${g.dw > 0 ? '+' : ''}${g.dw}px`);
  if (Math.abs(g.dh) > 3) parts.push(`h ${g.dh > 0 ? '+' : ''}${g.dh}px`);
  return parts.length > 0 ? parts.join(', ') : null;
}

// Element boxes are absolute document-pixel coordinates from the Playwright
// capture (deviceScaleFactor 1, so 1 CSS px = 1 PNG px). The thumbnail is
// displayed at CSS width 100%, which usually isn't the PNG's natural pixel
// size, so we convert to percentages of the natural image size (same
// approach as hotRegions) using the loaded <img>'s naturalWidth/Height.
const targetNaturalWidth = ref(0);
const targetNaturalHeight = ref(0);

function onTargetImgLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  targetNaturalWidth.value = img.naturalWidth;
  targetNaturalHeight.value = img.naturalHeight;
}

function boxStyle(box: { x: number; y: number; width: number; height: number } | undefined) {
  if (!box || !targetNaturalWidth.value || !targetNaturalHeight.value) return { display: 'none' };
  return {
    left: `${(box.x / targetNaturalWidth.value) * 100}%`,
    top: `${(box.y / targetNaturalHeight.value) * 100}%`,
    width: `${(box.width / targetNaturalWidth.value) * 100}%`,
    height: `${(box.height / targetNaturalHeight.value) * 100}%`,
    display: 'block',
  } as Record<string, string>;
}
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
            <p class="mb-1 text-xs uppercase tracking-wide text-slate-500">
              Цель — зоны различий ({{ ok.hotRegions.length }}) и изменённые элементы
            </p>
            <div class="relative">
              <img :src="ok.targetImg" class="block w-full rounded-lg border border-base-700" alt="Цель" @load="onTargetImgLoad" />
              <div
                v-for="(region, i) in ok.hotRegions"
                :key="'region-' + i"
                class="pointer-events-none absolute border-2 border-rose-500/80 bg-rose-500/20"
                :title="`Зона диффа: ${Math.round(region.areaPct * 10) / 10}% площади`"
                :style="{
                  left: region.xPct + '%',
                  top: region.yPct + '%',
                  width: region.wPct + '%',
                  height: region.hPct + '%',
                }"
              />
              <div
                v-for="e in ok.elementDiffs.filter((e) => e.targetBox)"
                :key="'elbox-' + e.key"
                class="pointer-events-none absolute border-2 transition"
                :class="hoveredElementKey === e.key ? 'border-indigo-400 bg-indigo-400/25' : 'border-transparent'"
                :style="boxStyle(e.targetBox)"
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

      <div v-if="ok.elementDiffs.length > 0" class="mt-5">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Расхождения по элементам ({{ ok.elementDiffs.length }})
        </p>
        <div class="max-h-80 space-y-2 overflow-y-auto pr-1">
          <div
            v-for="e in ok.elementDiffs"
            :key="e.key"
            class="rounded-lg border border-base-800 bg-base-950/60 p-3 text-sm transition"
            :class="hoveredElementKey === e.key ? 'border-indigo-500/50 bg-indigo-500/5' : ''"
            @mouseenter="hoveredElementKey = e.key"
            @mouseleave="hoveredElementKey = null"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-mono text-xs text-slate-300">{{ e.label }}</span>
              <span class="rounded-full border px-2 py-0.5 text-xs" :class="statusClass[e.status]">{{ statusLabel[e.status] }}</span>
            </div>
            <p v-if="geometrySummary(e)" class="mt-1 text-xs text-slate-500">Геометрия: {{ geometrySummary(e) }}</p>
            <ul v-if="e.styleDeltas.length > 0" class="mt-1 space-y-0.5">
              <li v-for="(s, i) in e.styleDeltas" :key="i" class="text-xs text-slate-400">
                <span class="text-slate-500">{{ s.prop }}:</span>
                <span class="font-mono text-rose-300">{{ s.target }}</span>
                <span class="text-slate-600">→</span>
                <span class="font-mono text-emerald-300">{{ s.reference }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div v-if="groupedStyleDiff.length > 0" class="mt-5 space-y-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Агрегированные расхождения страницы</p>
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
      <p v-else-if="ok.elementDiffs.length === 0" class="mt-5 text-sm text-slate-500">Структурированных расхождений нет.</p>
    </template>
  </div>
</template>
