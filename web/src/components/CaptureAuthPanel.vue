<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown, Copy, Lock, Plus, Trash2, Unlock } from 'lucide-vue-next';
import { hasAuthConfigured, type AuthMethod, type CaptureFormState } from '../composables/captureForm';

const props = defineProps<{ label: string }>();
const model = defineModel<CaptureFormState>({ required: true });
const emit = defineEmits<{ 'copy-to-other': [] }>();

const authed = computed(() => hasAuthConfigured(model.value));

const methods: { value: AuthMethod; label: string }[] = [
  { value: 'none', label: 'Без авторизации' },
  { value: 'cookie', label: 'Cookie' },
  { value: 'bearer', label: 'Заголовок (Bearer)' },
  { value: 'basic', label: 'Basic' },
];

function addCookie() {
  model.value.cookies.push({ name: '', value: '', domain: '', path: '' });
}
function removeCookie(i: number) {
  model.value.cookies.splice(i, 1);
}
function addHeader() {
  model.value.bearerHeaders.push({ name: '', value: '' });
}
function removeHeader(i: number) {
  model.value.bearerHeaders.splice(i, 1);
}
</script>

<template>
  <div class="rounded-md border border-border-hairline bg-bg/40">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors duration-fast ease-standard hover:bg-elevated/40"
      :aria-expanded="model.open"
      @click="model.open = !model.open"
    >
      <span class="flex items-center gap-2 text-sm font-medium text-fg-muted">
        <component
          :is="authed ? Lock : Unlock"
          :size="14"
          :class="authed ? 'text-accent' : 'text-fg-faint'"
          aria-hidden="true"
        />
        Захват и авторизация
        <span
          v-if="authed"
          class="rounded-full border border-accent-border bg-accent-soft px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-accent"
        >
          Авторизовано
        </span>
      </span>
      <ChevronDown
        :size="16"
        class="text-fg-faint transition-transform duration-base ease-standard"
        :class="{ 'rotate-180': model.open }"
        aria-hidden="true"
      />
    </button>

    <div v-if="model.open" class="space-y-4 border-t border-border-hairline px-3 py-4">
      <!-- Auth method -->
      <div>
        <div class="mb-2 flex items-center justify-between">
          <label class="text-xs font-semibold uppercase tracking-wide text-fg-faint">Способ авторизации</label>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded text-xs text-fg-subtle transition-colors duration-fast ease-standard hover:text-accent"
            @click="emit('copy-to-other')"
          >
            <Copy :size="12" aria-hidden="true" />
            Скопировать в другую сторону
          </button>
        </div>
        <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <button
            v-for="m in methods"
            :key="m.value"
            type="button"
            class="rounded-md border px-2 py-1.5 text-xs font-medium transition-colors duration-fast ease-standard"
            :class="
              model.authMethod === m.value
                ? 'border-accent-border bg-accent-soft text-accent'
                : 'border-border-hairline bg-transparent text-fg-subtle hover:border-border hover:text-fg-muted'
            "
            @click="model.authMethod = m.value"
          >
            {{ m.label }}
          </button>
        </div>
      </div>

      <!-- Cookie method -->
      <div v-if="model.authMethod === 'cookie'" class="space-y-2">
        <div v-for="(c, i) in model.cookies" :key="i" class="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <input
            v-model="c.name"
            type="text"
            placeholder="имя"
            class="min-w-0 rounded border border-border-hairline bg-surface px-2 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
          />
          <input
            v-model="c.value"
            type="text"
            placeholder="значение"
            class="min-w-0 rounded border border-border-hairline bg-surface px-2 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
          />
          <input
            v-model="c.domain"
            type="text"
            placeholder="домен (опц.)"
            class="col-span-1 min-w-0 rounded border border-border-hairline bg-surface px-2 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent sm:col-span-1"
          />
          <input
            v-model="c.path"
            type="text"
            placeholder="путь (опц.)"
            class="hidden min-w-0 rounded border border-border-hairline bg-surface px-2 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent sm:block"
          />
          <button
            type="button"
            class="flex items-center justify-center rounded border border-border-hairline px-2 text-fg-faint transition-colors duration-fast ease-standard hover:border-danger-border hover:text-danger"
            aria-label="Удалить cookie"
            @click="removeCookie(i)"
          >
            <Trash2 :size="14" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded text-xs font-medium text-accent transition-colors duration-fast ease-standard hover:text-accent-hover"
          @click="addCookie"
        >
          <Plus :size="13" aria-hidden="true" />
          Добавить cookie
        </button>
        <p class="text-[11px] text-fg-faint">
          Домен не обязателен — если не указан, будет взят из URL {{ label.toLowerCase() }}.
        </p>
      </div>

      <!-- Bearer method -->
      <div v-else-if="model.authMethod === 'bearer'" class="space-y-2">
        <div>
          <label class="mb-1 block text-xs text-fg-subtle">Токен</label>
          <input
            v-model="model.bearerToken"
            type="password"
            autocomplete="off"
            placeholder="eyJhbGciOi..."
            class="w-full rounded border border-border-hairline bg-surface px-2.5 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
          />
          <p class="mt-1 text-[11px] text-fg-faint">Отправится как заголовок <code>Authorization: Bearer &lt;токен&gt;</code>.</p>
        </div>
        <div v-for="(h, i) in model.bearerHeaders" :key="i" class="grid grid-cols-[1fr_1fr_auto] gap-1.5">
          <input
            v-model="h.name"
            type="text"
            placeholder="доп. заголовок"
            class="min-w-0 rounded border border-border-hairline bg-surface px-2 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
          />
          <input
            v-model="h.value"
            type="text"
            placeholder="значение"
            class="min-w-0 rounded border border-border-hairline bg-surface px-2 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
          />
          <button
            type="button"
            class="flex items-center justify-center rounded border border-border-hairline px-2 text-fg-faint transition-colors duration-fast ease-standard hover:border-danger-border hover:text-danger"
            aria-label="Удалить заголовок"
            @click="removeHeader(i)"
          >
            <Trash2 :size="14" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded text-xs font-medium text-accent transition-colors duration-fast ease-standard hover:text-accent-hover"
          @click="addHeader"
        >
          <Plus :size="13" aria-hidden="true" />
          Добавить заголовок
        </button>
      </div>

      <!-- Basic method -->
      <div v-else-if="model.authMethod === 'basic'" class="grid grid-cols-2 gap-2">
        <div>
          <label class="mb-1 block text-xs text-fg-subtle">Логин</label>
          <input
            v-model="model.basicUsername"
            type="text"
            autocomplete="off"
            class="w-full rounded border border-border-hairline bg-surface px-2.5 py-1.5 text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-fg-subtle">Пароль</label>
          <input
            v-model="model.basicPassword"
            type="password"
            autocomplete="off"
            class="w-full rounded border border-border-hairline bg-surface px-2.5 py-1.5 text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
          />
        </div>
      </div>

      <div class="border-t border-border-hairline pt-3">
        <label class="mb-1 block text-xs text-fg-subtle">Скрыть перед снимком (селекторы, через запятую/строку)</label>
        <textarea
          v-model="model.hideSelectors"
          rows="2"
          placeholder="#cookie-banner, .chat-widget"
          class="w-full rounded border border-border-hairline bg-surface px-2.5 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs text-fg-subtle">Кликнуть перед снимком, если есть (например «Принять cookies»)</label>
        <textarea
          v-model="model.dismissSelectors"
          rows="2"
          placeholder="#accept-cookies, .modal-close"
          class="w-full rounded border border-border-hairline bg-surface px-2.5 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
        />
      </div>

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label class="mb-1 block text-xs text-fg-subtle">Ожидание загрузки</label>
          <select
            v-model="model.waitUntil"
            class="w-full rounded border border-border-hairline bg-surface px-2.5 py-1.5 text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
          >
            <option value="networkidle">networkidle</option>
            <option value="load">load</option>
            <option value="domcontentloaded">domcontentloaded</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-xs text-fg-subtle">Доп. пауза, мс</label>
          <input
            v-model.number="model.waitMs"
            type="number"
            min="0"
            max="60000"
            class="w-full rounded border border-border-hairline bg-surface px-2.5 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-fg-subtle">Ждать селектор (опц.)</label>
          <input
            v-model="model.waitForSelector"
            type="text"
            placeholder=".hero-loaded"
            class="w-full rounded border border-border-hairline bg-surface px-2.5 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
          />
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <button
          type="button"
          role="switch"
          :aria-checked="model.freezeAnimations"
          class="relative h-5 w-9 rounded-full transition-colors duration-base ease-standard"
          :class="model.freezeAnimations ? 'bg-accent' : 'bg-elevated'"
          @click="model.freezeAnimations = !model.freezeAnimations"
        >
          <span
            class="absolute top-0.5 h-4 w-4 rounded-full bg-fg transition-all duration-base ease-standard"
            :class="model.freezeAnimations ? 'left-[18px]' : 'left-0.5'"
          />
        </button>
        <span class="text-xs text-fg-subtle">Замораживать анимации перед снимком</span>
      </div>

      <div>
        <label class="mb-1 block text-xs text-fg-subtle">Снимать только один блок (CSS-селектор, опц.)</label>
        <input
          v-model="model.clipSelector"
          type="text"
          placeholder=".hero, #pricing-table"
          class="w-full rounded border border-border-hairline bg-surface px-2.5 py-1.5 font-mono text-xs text-fg outline-none transition-colors duration-fast ease-standard focus:border-accent"
        />
      </div>

      <p class="text-[11px] text-fg-faint">
        Авторизация применяется только к «{{ label }}» — значения остаются локально и никуда, кроме указанного URL, не отправляются.
      </p>
    </div>
  </div>
</template>
