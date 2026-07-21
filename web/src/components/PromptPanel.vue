<script setup lang="ts">
import { ref } from 'vue';

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
  <div class="sticky bottom-4 rounded-xl border border-base-700 bg-base-900 p-5 shadow-xl">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-lg font-semibold">Промпт для Claude</h3>
      <div class="flex gap-2">
        <button type="button" class="rounded-md bg-base-800 px-3 py-1.5 text-sm hover:bg-base-700" @click="downloadMd">
          Сохранить .md
        </button>
        <button
          type="button"
          class="rounded-md bg-indigo-500 px-3 py-1.5 text-sm text-white hover:bg-indigo-400"
          @click="copyToClipboard"
        >
          {{ copied ? 'Скопировано' : 'Скопировать' }}
        </button>
      </div>
    </div>
    <textarea
      readonly
      class="h-64 w-full resize-y rounded-lg border border-base-700 bg-base-950 p-3 font-mono text-xs text-slate-300"
      :value="prompt"
    />
  </div>
</template>
