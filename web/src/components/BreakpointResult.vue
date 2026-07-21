<script setup lang="ts">
import { computed, ref } from 'vue';
import { Columns2, Crosshair, Layers, TriangleAlert } from 'lucide-vue-next';
import type { BreakpointOutcome, BreakpointResult, StyleDiffCategory, StyleDiffEntry } from '../types';
import { isBreakpointError } from '../types';
import OverlaySlider from './OverlaySlider.vue';
import ElementDiffList from './ElementDiffList.vue';
import PromptPanel from './PromptPanel.vue';

const props = defineProps<{ result: BreakpointOutcome; claudePrompt: string }>();

const viewMode = ref<'side' | 'overlay' | 'diff'>('side');
const hoveredElementKey = ref<string | null>(null);

const ok = computed<BreakpointResult | null>(() => (isBreakpointError(props.result) ? null : props.result));

const scorePct = computed(() => (ok.value ? Math.round(ok.value.score * 100) : 0));

// Score colors: green >=95%, amber 85-95%, red <85% — always paired with the
// numeric % text itself, so color is never the only signal.
const scoreClass = computed(() => {
  const p = scorePct.value;
  if (p >= 95) return 'bg-accent-soft text-accent border-accent-border';
  if (p >= 85) return 'bg-warning-soft text-warning border-warning-border';
  return 'bg-danger-soft text-danger border-danger-border';
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

const modes = [
  { value: 'side' as const, label: 'Рядом', icon: Columns2 },
  { value: 'overlay' as const, label: 'Наложение', icon: Crosshair },
  { value: 'diff' as const, label: 'Diff', icon: Layers },
];
</script>

<template>
  <div class="rounded-lg border border-border-hairline bg-surface/60 p-4 shadow-soft-md">
    <template v-if="isBreakpointError(result)">
      <div class="flex items-center justify-between gap-3">
        <h3 class="font-mono text-base font-semibold text-fg">{{ result.breakpoint }}px</h3>
        <span class="inline-flex items-center gap-1.5 rounded-full border border-danger-border bg-danger-soft px-3 py-1 text-sm text-danger">
          <TriangleAlert :size="14" aria-hidden="true" />
          ошибка захвата
        </span>
      </div>
      <p class="mt-3 text-sm text-fg-subtle">{{ result.error }}</p>
      <div class="mt-5">
        <PromptPanel :prompt="claudePrompt" />
      </div>
    </template>

    <template v-else-if="ok">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="font-mono text-base font-semibold text-fg">{{ ok.breakpoint }}px</h3>
        <span class="rounded-full border px-3 py-1 font-mono text-lg font-semibold" :class="scoreClass">{{ scorePct }}%</span>
      </div>

      <div class="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <!-- Dominant inspector -->
        <div class="min-w-0">
          <div class="mb-3 inline-flex rounded-md border border-border-hairline bg-bg/40 p-0.5">
            <button
              v-for="mode in modes"
              :key="mode.value"
              type="button"
              class="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors duration-fast ease-standard"
              :class="viewMode === mode.value ? 'bg-accent text-accent-on' : 'text-fg-subtle hover:text-fg-muted'"
              @click="viewMode = mode.value"
            >
              <component :is="mode.icon" :size="14" aria-hidden="true" />
              {{ mode.label }}
            </button>
          </div>

          <div v-if="viewMode === 'side'" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Референс</p>
              <img :src="ok.refImg" class="w-full rounded-md border border-border-hairline" alt="Референс" />
            </div>
            <div>
              <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">
                Цель — зоны различий ({{ ok.hotRegions.length }})
              </p>
              <div class="relative">
                <img
                  :src="ok.targetImg"
                  class="block w-full rounded-md border border-border-hairline"
                  alt="Цель"
                  @load="onTargetImgLoad"
                />
                <div
                  v-for="(region, i) in ok.hotRegions"
                  :key="'region-' + i"
                  class="pointer-events-none absolute border-2 border-danger/80 bg-danger/15"
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
                  class="pointer-events-none absolute border-2 transition-colors duration-fast ease-standard"
                  :class="hoveredElementKey === e.key ? 'border-accent bg-accent/20' : 'border-transparent'"
                  :style="boxStyle(e.targetBox)"
                />
              </div>
            </div>
          </div>

          <div v-else-if="viewMode === 'overlay'">
            <OverlaySlider :ref-img="ok.refImg" :target-img="ok.targetImg" />
          </div>

          <div v-else>
            <img :src="ok.diffImg" class="w-full rounded-md border border-border-hairline" alt="Diff" />
          </div>
        </div>

        <!-- Right rail: element diffs + aggregated style diff -->
        <div class="min-w-0 space-y-5">
          <div v-if="ok.elementDiffs.length > 0">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">
              Расхождения по элементам ({{ ok.elementDiffs.length }})
            </p>
            <div class="max-h-96 overflow-y-auto pr-1">
              <ElementDiffList :entries="ok.elementDiffs" :hovered-key="hoveredElementKey" @hover="(k) => (hoveredElementKey = k)" />
            </div>
          </div>

          <div v-if="groupedStyleDiff.length > 0" class="space-y-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-fg-faint">Агрегированные расхождения страницы</p>
            <div v-for="[category, entries] in groupedStyleDiff" :key="category">
              <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">{{ categoryLabels[category] }}</p>
              <table class="w-full text-sm">
                <tbody>
                  <tr v-for="(entry, i) in entries" :key="i" class="border-t border-border-hairline">
                    <td class="py-1.5 pr-3 text-fg-subtle">{{ entry.label }}</td>
                    <td class="py-1.5 pr-3 font-mono text-xs text-danger">{{ entry.target }}</td>
                    <td class="py-1.5 text-fg-faint">←</td>
                    <td class="py-1.5 pl-3 font-mono text-xs text-accent">{{ entry.reference }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p v-if="ok.elementDiffs.length === 0 && groupedStyleDiff.length === 0" class="text-sm text-fg-faint">
            Структурированных расхождений нет.
          </p>

          <!-- Sticky within this column only — never overlaps the dominant
               inspector (separate grid column) or content above it, since it
               sticks relative to its own column's scroll extent. -->
          <div class="sticky top-20">
            <PromptPanel :prompt="claudePrompt" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
