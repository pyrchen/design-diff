<script setup lang="ts">
// The product's domain signature: a registration/crosshair mark (⊕), used as
// the wordmark, as the Overlay Inspector's scan-line handle, and in empty
// states. Plain inline SVG (no emoji, no icon font) — colors via currentColor
// so callers control it with text-* classes.
withDefaults(defineProps<{ size?: number }>(), { size: 20 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    class="shrink-0"
  >
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.5" />
    <path d="M12 1.5V6.5M12 17.5V22.5M1.5 12H6.5M17.5 12H22.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    <circle cx="12" cy="12" r="1.75" fill="currentColor" />
  </svg>
</template>
