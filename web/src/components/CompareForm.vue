<script setup lang="ts">
import { computed, ref } from 'vue';
import { Figma, Image as ImageIcon, Layers, Link2, Monitor, Plus, Target as TargetIcon, TriangleAlert, Upload } from 'lucide-vue-next';
import type { CompareParams } from '../api';
import { buildCaptureOptions, cloneCaptureFormState, createCaptureFormState, type CaptureFormState } from '../composables/captureForm';
import CaptureAuthPanel from './CaptureAuthPanel.vue';

defineProps<{ loading: boolean }>();
const emit = defineEmits<{ submit: [params: CompareParams] }>();

const sourceType = ref<'url' | 'image' | 'figma'>('url');
const referenceUrl = ref('');
const figmaUrl = ref('');
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

// Job 1: independent per-side capture + auth state.
const referenceCapture = ref<CaptureFormState>(createCaptureFormState());
const targetCapture = ref<CaptureFormState>(createCaptureFormState());

function copyReferenceToTarget() {
  targetCapture.value = cloneCaptureFormState(referenceCapture.value);
  targetCapture.value.open = true;
}
function copyTargetToReference() {
  referenceCapture.value = cloneCaptureFormState(targetCapture.value);
  referenceCapture.value.open = true;
}

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
    errorMessage.value = 'Укажите URL референса или переключитесь на другой источник.';
    return;
  }
  if (sourceType.value === 'image' && !imageFile.value) {
    errorMessage.value = 'Загрузите изображение референса.';
    return;
  }
  if (sourceType.value === 'figma' && !figmaUrl.value.trim()) {
    errorMessage.value = 'Укажите ссылку на Figma-файл (frame).';
    return;
  }

  emit('submit', {
    referenceType: sourceType.value,
    referenceUrl: sourceType.value === 'url' ? referenceUrl.value.trim() : undefined,
    figmaUrl: sourceType.value === 'figma' ? figmaUrl.value.trim() : undefined,
    targetUrl: targetUrl.value.trim(),
    breakpoints: selectedBreakpoints.value,
    fullPage: fullPage.value,
    image: sourceType.value === 'image' ? imageFile.value : null,
    referenceCapture: sourceType.value === 'url' ? buildCaptureOptions(referenceCapture.value) : undefined,
    targetCapture: buildCaptureOptions(targetCapture.value),
  });
}

defineExpose({ submit: handleSubmit });

const inputClass =
  'w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent';
const panelClass = 'rounded-lg border border-border-hairline bg-surface/60 p-4 shadow-soft-md';
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <!-- Two symmetric peer panels: Reference and Target — the core comparison. -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section :class="panelClass">
        <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
          <Layers :size="15" class="text-fg-faint" aria-hidden="true" />
          Референс
        </h2>

        <div class="mb-3 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            class="flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors duration-fast ease-standard"
            :class="
              sourceType === 'url'
                ? 'border-accent-border bg-accent-soft text-accent'
                : 'border-border-hairline bg-transparent text-fg-subtle hover:border-border hover:text-fg-muted'
            "
            @click="sourceType = 'url'"
          >
            <Link2 :size="13" aria-hidden="true" />
            URL
          </button>
          <button
            type="button"
            class="flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors duration-fast ease-standard"
            :class="
              sourceType === 'image'
                ? 'border-accent-border bg-accent-soft text-accent'
                : 'border-border-hairline bg-transparent text-fg-subtle hover:border-border hover:text-fg-muted'
            "
            @click="sourceType = 'image'"
          >
            <ImageIcon :size="13" aria-hidden="true" />
            Изображение
          </button>
          <button
            type="button"
            class="flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors duration-fast ease-standard"
            :class="
              sourceType === 'figma'
                ? 'border-accent-border bg-accent-soft text-accent'
                : 'border-border-hairline bg-transparent text-fg-subtle hover:border-border hover:text-fg-muted'
            "
            @click="sourceType = 'figma'"
          >
            <Figma :size="13" aria-hidden="true" />
            Figma
          </button>
        </div>

        <div v-if="sourceType === 'url'" class="mb-3">
          <input v-model="referenceUrl" type="text" placeholder="https://example.com" :class="inputClass" />
        </div>
        <div v-else-if="sourceType === 'image'" class="mb-3">
          <div
            class="flex flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-7 text-center text-sm transition-colors duration-base ease-standard"
            :class="isDragging ? 'border-accent bg-accent-soft' : 'border-border-hairline bg-bg/40 text-fg-subtle'"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onDrop"
            @click="fileInputEl?.click()"
          >
            <Upload :size="18" class="mb-1.5 text-fg-faint" aria-hidden="true" />
            <template v-if="imageFile">
              <p class="text-fg">{{ imageFile.name }}</p>
              <p class="mt-1 text-xs text-fg-faint">Нажмите или перетащите, чтобы заменить</p>
            </template>
            <template v-else>
              <p>Перетащите изображение сюда или нажмите, чтобы выбрать файл</p>
              <p class="mt-1 text-xs text-fg-faint">PNG или JPG</p>
            </template>
            <input ref="fileInputEl" type="file" accept="image/png,image/jpeg" class="hidden" @change="onFileChange" />
          </div>
        </div>
        <div v-else class="mb-3">
          <input
            v-model="figmaUrl"
            type="text"
            placeholder="https://www.figma.com/design/&lt;fileKey&gt;/Name?node-id=1-2"
            :class="inputClass"
          />
          <p class="mt-1.5 text-xs text-fg-faint">
            В идеале ссылка должна содержать <code>?node-id=...</code>. Токен читается из локального <code>.env</code>
            (<code>FIGMA_TOKEN</code>).
          </p>
        </div>

        <CaptureAuthPanel
          v-if="sourceType === 'url'"
          v-model="referenceCapture"
          label="референса"
          @copy-to-other="copyReferenceToTarget"
        />
      </section>

      <section :class="panelClass">
        <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
          <TargetIcon :size="15" class="text-fg-faint" aria-hidden="true" />
          Целевой сайт
        </h2>

        <!-- spacer to keep the source-type row height symmetric with the Reference panel -->
        <div class="mb-3 hidden grid-cols-3 gap-1.5 lg:grid" aria-hidden="true">
          <div class="rounded-md border border-transparent px-2 py-2 text-xs opacity-0">—</div>
        </div>

        <div class="mb-3">
          <input v-model="targetUrl" type="text" placeholder="https://example.com" :class="inputClass" />
        </div>

        <CaptureAuthPanel v-model="targetCapture" label="целевого сайта" @copy-to-other="copyTargetToReference" />
      </section>
    </div>

    <!-- Breakpoints + capture mode, shared across both sides. -->
    <div :class="[panelClass, 'mt-4']">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <label class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">
            <Monitor :size="13" aria-hidden="true" />
            Брейкпоинты
          </label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="p in presets"
              :key="p"
              type="button"
              class="rounded-full border px-3 py-1.5 font-mono text-sm transition-colors duration-fast ease-standard"
              :class="
                activePresets[p]
                  ? 'border-accent-border bg-accent-soft text-accent'
                  : 'border-border-hairline bg-transparent text-fg-subtle hover:border-border hover:text-fg-muted'
              "
              @click="togglePreset(p)"
            >
              {{ p }}px
            </button>
            <button
              v-for="w in customWidths"
              :key="'custom-' + w"
              type="button"
              class="rounded-full border border-accent-border bg-accent-soft px-3 py-1.5 font-mono text-sm text-accent"
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
              class="w-36 rounded-md border border-border-hairline bg-surface px-3 py-1.5 font-mono text-sm text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
              @keydown.enter.prevent="addCustomWidth"
            />
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-md border border-border-hairline px-3 py-1.5 text-sm text-fg-subtle transition-colors duration-fast ease-standard hover:border-border hover:text-fg-muted"
              @click="addCustomWidth"
            >
              <Plus :size="14" aria-hidden="true" />
              Добавить
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2.5">
          <button
            type="button"
            role="switch"
            :aria-checked="fullPage"
            class="relative h-6 w-11 rounded-full transition-colors duration-base ease-standard"
            :class="fullPage ? 'bg-accent' : 'bg-elevated'"
            @click="fullPage = !fullPage"
          >
            <span
              class="absolute top-0.5 h-5 w-5 rounded-full bg-fg transition-all duration-base ease-standard"
              :class="fullPage ? 'left-5' : 'left-0.5'"
            />
          </button>
          <span class="text-sm text-fg-muted">Полная страница (fullPage)</span>
        </div>
      </div>
    </div>

    <p
      v-if="errorMessage"
      class="mt-3 flex items-center gap-2 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      <TriangleAlert :size="15" class="shrink-0" aria-hidden="true" />
      {{ errorMessage }}
    </p>

    <!-- Submit is reachable here too (not only via the sticky top-bar CTA). -->
    <button
      type="submit"
      :disabled="loading"
      class="mt-4 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-on shadow-soft-md transition-all duration-base ease-standard hover:bg-accent-hover hover:shadow-soft-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none lg:hidden"
    >
      {{ loading ? 'Сравниваю…' : 'Сравнить' }}
    </button>
  </form>
</template>
