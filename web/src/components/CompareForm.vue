<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CompareParams } from '../api';

defineProps<{ loading: boolean }>();
const emit = defineEmits<{ submit: [params: CompareParams] }>();

const sourceType = ref<'url' | 'image'>('url');
const referenceUrl = ref('');
const targetUrl = ref('');
const fullPage = ref(false);
const imageFile = ref<File | null>(null);
const isDragging = ref(false);
const fileInputEl = ref<HTMLInputElement | null>(null);

const presets = [1440, 1024, 768, 390];
const activePresets = ref<Record<number, boolean>>({ 1440: true, 1024: true, 768: true, 390: true });
const customWidths = ref<number[]>([]);
const customWidthInput = ref('');

const errorMessage = ref('');

function togglePreset(bp: number) {
  activePresets.value[bp] = !activePresets.value[bp];
}

function addCustomWidth() {
  const n = Number(customWidthInput.value);
  if (!Number.isFinite(n) || n < 200 || n > 4000) return;
  if (!customWidths.value.includes(n)) {
    customWidths.value.push(n);
    customWidths.value.sort((a, b) => b - a);
  }
  customWidthInput.value = '';
}

function removeCustomWidth(bp: number) {
  customWidths.value = customWidths.value.filter((w) => w !== bp);
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  imageFile.value = input.files?.[0] ?? null;
}

function onDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) imageFile.value = file;
}

const selectedBreakpoints = computed(() =>
  [...presets.filter((p) => activePresets.value[p]), ...customWidths.value].sort((a, b) => b - a),
);

function handleSubmit() {
  errorMessage.value = '';
  if (selectedBreakpoints.value.length === 0) {
    errorMessage.value = 'Выберите хотя бы один брейкпоинт.';
    return;
  }
  if (!targetUrl.value.trim()) {
    errorMessage.value = 'Укажите URL целевого сайта.';
    return;
  }
  if (sourceType.value === 'url' && !referenceUrl.value.trim()) {
    errorMessage.value = 'Укажите URL референса или переключитесь на загрузку изображения.';
    return;
  }
  if (sourceType.value === 'image' && !imageFile.value) {
    errorMessage.value = 'Загрузите изображение референса.';
    return;
  }

  emit('submit', {
    referenceType: sourceType.value,
    referenceUrl: sourceType.value === 'url' ? referenceUrl.value.trim() : undefined,
    targetUrl: targetUrl.value.trim(),
    breakpoints: selectedBreakpoints.value,
    fullPage: fullPage.value,
    image: sourceType.value === 'image' ? imageFile.value : null,
  });
}
</script>

<template>
  <form class="rounded-xl border border-base-700 bg-base-900 p-6" @submit.prevent="handleSubmit">
    <div class="mb-5 flex gap-2">
      <button
        type="button"
        class="rounded-md px-4 py-2 text-sm font-medium transition"
        :class="sourceType === 'url' ? 'bg-indigo-500 text-white' : 'bg-base-800 text-slate-300 hover:bg-base-700'"
        @click="sourceType = 'url'"
      >
        Референс — URL
      </button>
      <button
        type="button"
        class="rounded-md px-4 py-2 text-sm font-medium transition"
        :class="sourceType === 'image' ? 'bg-indigo-500 text-white' : 'bg-base-800 text-slate-300 hover:bg-base-700'"
        @click="sourceType = 'image'"
      >
        Референс — изображение
      </button>
    </div>

    <div v-if="sourceType === 'url'" class="mb-4">
      <label class="mb-1 block text-sm text-slate-400">URL референса</label>
      <input
        v-model="referenceUrl"
        type="text"
        placeholder="https://example.com"
        class="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />
    </div>
    <div v-else class="mb-4">
      <label class="mb-1 block text-sm text-slate-400">Изображение референса (макет)</label>
      <div
        class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition"
        :class="isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-base-700 bg-base-950 text-slate-400'"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
        @click="fileInputEl?.click()"
      >
        <template v-if="imageFile">
          <p class="text-slate-200">{{ imageFile.name }}</p>
          <p class="mt-1 text-xs text-slate-500">Нажмите или перетащите, чтобы заменить</p>
        </template>
        <template v-else>
          <p>Перетащите изображение сюда или нажмите, чтобы выбрать файл</p>
          <p class="mt-1 text-xs text-slate-500">PNG или JPG</p>
        </template>
        <input ref="fileInputEl" type="file" accept="image/png,image/jpeg" class="hidden" @change="onFileChange" />
      </div>
    </div>

    <div class="mb-4">
      <label class="mb-1 block text-sm text-slate-400">URL целевого сайта</label>
      <input
        v-model="targetUrl"
        type="text"
        placeholder="https://example.com"
        class="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />
    </div>

    <div class="mb-4">
      <label class="mb-2 block text-sm text-slate-400">Брейкпоинты</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="p in presets"
          :key="p"
          type="button"
          class="rounded-full border px-3 py-1.5 text-sm transition"
          :class="
            activePresets[p]
              ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
              : 'border-base-700 bg-base-950 text-slate-400 hover:border-base-600'
          "
          @click="togglePreset(p)"
        >
          {{ p }}px
        </button>
        <button
          v-for="w in customWidths"
          :key="'custom-' + w"
          type="button"
          class="rounded-full border border-indigo-500 bg-indigo-500/15 px-3 py-1.5 text-sm text-indigo-300"
          @click="removeCustomWidth(w)"
        >
          {{ w }}px ×
        </button>
      </div>
      <div class="mt-2 flex gap-2">
        <input
          v-model="customWidthInput"
          type="number"
          min="200"
          max="4000"
          placeholder="своя ширина, px"
          class="w-40 rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          @keydown.enter.prevent="addCustomWidth"
        />
        <button type="button" class="rounded-lg bg-base-800 px-3 py-1.5 text-sm hover:bg-base-700" @click="addCustomWidth">
          Добавить
        </button>
      </div>
    </div>

    <div class="mb-5 flex items-center gap-3">
      <button
        type="button"
        role="switch"
        :aria-checked="fullPage"
        class="relative h-6 w-11 rounded-full transition"
        :class="fullPage ? 'bg-indigo-500' : 'bg-base-700'"
        @click="fullPage = !fullPage"
      >
        <span class="absolute top-0.5 h-5 w-5 rounded-full bg-white transition" :class="fullPage ? 'left-5' : 'left-0.5'" />
      </button>
      <span class="text-sm text-slate-300">Полная страница (fullPage)</span>
    </div>

    <p v-if="errorMessage" class="mb-3 text-sm text-rose-400">{{ errorMessage }}</p>

    <button
      type="submit"
      :disabled="loading"
      class="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {{ loading ? 'Сравниваю…' : 'Сравнить' }}
    </button>
  </form>
</template>
