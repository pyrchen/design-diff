<script setup lang="ts">
import { Plus, Split, X } from 'lucide-vue-next';
import type { ElementDiffEntry } from '../types';

defineProps<{ entries: ElementDiffEntry[]; hoveredKey: string | null }>();
const emit = defineEmits<{ hover: [key: string | null] }>();

const statusLabel: Record<ElementDiffEntry['status'], string> = {
  matched: 'расхождение',
  missing: 'отсутствует',
  extra: 'лишний',
};
// Green = match, red = structural mismatch (missing/extra), amber = partial
// style/geometry divergence on an otherwise-matched element. Every badge
// also carries an icon + text label — color is never the only signal.
const statusClass: Record<ElementDiffEntry['status'], string> = {
  matched: 'border-warning-border bg-warning-soft text-warning',
  missing: 'border-danger-border bg-danger-soft text-danger',
  extra: 'border-danger-border bg-danger-soft text-danger',
};
const statusIcon = { matched: Split, missing: X, extra: Plus } as const;

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
</script>

<template>
  <div class="space-y-1.5">
    <div
      v-for="e in entries"
      :key="e.key"
      class="cursor-default rounded-md border border-border-hairline bg-bg/40 p-2.5 text-sm transition-colors duration-fast ease-standard"
      :class="hoveredKey === e.key ? 'border-accent-border bg-accent-soft/40' : ''"
      @mouseenter="emit('hover', e.key)"
      @mouseleave="emit('hover', null)"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="truncate font-mono text-xs text-fg-muted">{{ e.label }}</span>
        <span class="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium" :class="statusClass[e.status]">
          <component :is="statusIcon[e.status]" :size="11" aria-hidden="true" />
          {{ statusLabel[e.status] }}
        </span>
      </div>
      <p v-if="geometrySummary(e)" class="mt-1 font-mono text-[11px] text-fg-faint">Геометрия: {{ geometrySummary(e) }}</p>
      <ul v-if="e.styleDeltas.length > 0" class="mt-1 space-y-0.5">
        <li v-for="(s, i) in e.styleDeltas" :key="i" class="font-mono text-[11px] text-fg-faint">
          <span class="text-fg-faint">{{ s.prop }}:</span>
          <span class="text-danger">{{ s.target }}</span>
          <span class="text-fg-faint">→</span>
          <span class="text-accent">{{ s.reference }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
