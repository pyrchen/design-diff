<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ refImg: string; targetImg: string }>();

const containerEl = ref<HTMLDivElement | null>(null);
const position = ref(50);
const dragging = ref(false);

function setPositionFromClientX(clientX: number) {
  const el = containerEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const pct = ((clientX - rect.left) / rect.width) * 100;
  position.value = Math.min(100, Math.max(0, pct));
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
</script>

<template>
  <div
    ref="containerEl"
    class="relative touch-none select-none overflow-hidden rounded-lg border border-base-700"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <img :src="targetImg" class="block w-full" draggable="false" alt="Целевой сайт" />
    <div class="absolute inset-0" :style="{ clipPath: `inset(0 ${100 - position}% 0 0)` }">
      <img :src="refImg" class="block w-full" draggable="false" alt="Референс" />
    </div>
    <div class="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90" :style="{ left: position + '%' }">
      <div
        class="pointer-events-auto absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-xs font-bold text-base-950 shadow-lg"
      >
        ↔
      </div>
    </div>
    <div class="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">Референс</div>
    <div class="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">Цель</div>
  </div>
</template>
