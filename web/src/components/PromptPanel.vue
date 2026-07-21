<script setup lang="ts">
import { ref } from 'vue';
import { Check, Copy, Download } from 'lucide-vue-next';

const props = defineProps<{ prompt: string }>();

const copied = ref(false);

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(props.prompt);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // shortcut: no manual-select fallback if Clipboard API is unavailable
  }
}

function downloadMd() {
  const blob = new Blob([props.prompt], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'design-diff-prompt.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="rounded-lg border border-border-hairline bg-surface p-4 shadow-soft-xl">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-fg">Промпт для Claude</h3>
      <div class="flex gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border-hairline px-3 py-1.5 text-sm text-fg-subtle transition-colors duration-fast ease-standard hover:border-border hover:text-fg-muted"
          @click="downloadMd"
        >
          <Download :size="14" aria-hidden="true" />
          Сохранить .md
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-on transition-colors duration-fast ease-standard hover:bg-accent-hover"
          @click="copyToClipboard"
        >
          <Check v-if="copied" :size="14" aria-hidden="true" />
          <Copy v-else :size="14" aria-hidden="true" />
          {{ copied ? 'Скопировано' : 'Скопировать' }}
        </button>
      </div>
    </div>
    <textarea
      readonly
      class="h-56 w-full resize-y rounded-md border border-border-hairline bg-bg p-3 font-mono text-xs text-fg-muted outline-none focus:border-accent"
      :value="prompt"
    />
  </div>
</template>
