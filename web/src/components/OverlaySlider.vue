<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import RegistrationMark from './RegistrationMark.vue';

defineProps<{ refImg: string; targetImg: string }>();

const containerEl = ref<HTMLDivElement | null>(null);
const position = ref(50);
const dragging = ref(false);
const cursorPx = ref(0);

/** Keeps the readout chip's px value in sync with `position` (%) against the container's current rendered width. */
function syncCursorFromPosition() {
  const el = containerEl.value;
  if (!el) return;
  cursorPx.value = Math.round((position.value / 100) * el.getBoundingClientRect().width);
}

function setPositionFromClientX(clientX: number) {
  const el = containerEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const pct = ((clientX - rect.left) / rect.width) * 100;
  position.value = Math.min(100, Math.max(0, pct));
  cursorPx.value = Math.round(Math.min(rect.width, Math.max(0, clientX - rect.left)));
}

function onPointerDown(e: PointerEvent) {
  dragging.value = true;
  setPositionFromClientX(e.clientX);
  (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
}
function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  setPositionFromClientX(e.clientX);
}
function onPointerUp() {
  dragging.value = false;
}

function nudge(deltaPct: number) {
  position.value = Math.min(100, Math.max(0, position.value + deltaPct));
  syncCursorFromPosition();
}

// The container isn't laid out yet on the same tick the ref is bound, and
// its width can change on breakpoint-tab switches / window resize — keep
// the readout chip accurate in both cases instead of showing a stale 0px
// before the user's first drag.
onMounted(() => {
  requestAnimationFrame(syncCursorFromPosition);
  window.addEventListener('resize', syncCursorFromPosition);
});
onBeforeUnmount(() => window.removeEventListener('resize', syncCursorFromPosition));
</script>

<template>
  <div
    ref="containerEl"
    class="relative touch-none select-none overflow-hidden rounded-lg border border-border-hairline"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <img :src="targetImg" class="block w-full" draggable="false" alt="Целевой сайт" />
    <div class="absolute inset-0" :style="{ clipPath: `inset(0 ${100 - position}% 0 0)` }">
      <img :src="refImg" class="block w-full" draggable="false" alt="Референс" />
    </div>

    <!-- Registration scan line + ⊕ crosshair handle: the product's domain signature. -->
    <div class="pointer-events-none absolute inset-y-0 w-px bg-accent shadow-[0_0_8px_rgba(34,197,94,0.6)]" :style="{ left: position + '%' }">
      <div
        role="slider"
        tabindex="0"
        aria-label="Позиция сравнения референса и цели"
        :aria-valuenow="Math.round(position)"
        aria-valuemin="0"
        aria-valuemax="100"
        class="pointer-events-auto absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-accent-border bg-surface text-accent shadow-soft-lg transition-transform duration-fast ease-standard hover:scale-105"
        @keydown.left.prevent="nudge(-2)"
        @keydown.right.prevent="nudge(2)"
      >
        <RegistrationMark :size="20" />
      </div>
    </div>

    <!-- Live mono readout chip: cursor x (px) and split %. -->
    <div
      class="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border-hairline bg-bg/85 px-2.5 py-1 font-mono text-[11px] text-fg-muted backdrop-blur"
    >
      x={{ cursorPx }}px · {{ Math.round(position) }}%
    </div>

    <div class="pointer-events-none absolute left-2 top-2 rounded bg-bg/70 px-2 py-1 text-xs text-fg-muted backdrop-blur">Референс</div>
    <div class="pointer-events-none absolute right-2 top-2 rounded bg-bg/70 px-2 py-1 text-xs text-fg-muted backdrop-blur">Цель</div>
  </div>
</template>
