<script setup lang="ts">
import { Loader2, Play } from 'lucide-vue-next';
import RegistrationMark from './RegistrationMark.vue';

defineProps<{ loading: boolean }>();
const emit = defineEmits<{ compare: [] }>();
</script>

<template>
  <header
    class="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border-hairline bg-bg/90 px-4 py-3 backdrop-blur sm:px-6"
  >
    <div class="flex items-center gap-2 text-fg">
      <RegistrationMark :size="22" class="text-accent" />
      <span class="font-mono text-base font-semibold tracking-tight">design-diff</span>
    </div>

    <button
      type="button"
      :disabled="loading"
      class="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-on shadow-soft-md transition-all duration-base ease-standard hover:bg-accent-hover hover:shadow-soft-lg active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
      @click="emit('compare')"
    >
      <Loader2 v-if="loading" :size="16" class="animate-spin" aria-hidden="true" />
      <Play v-else :size="16" aria-hidden="true" />
      {{ loading ? 'Сравниваю…' : 'Сравнить' }}
    </button>
  </header>
</template>
