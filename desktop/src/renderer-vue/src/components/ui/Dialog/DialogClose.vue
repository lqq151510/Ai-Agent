<script setup lang="ts">
import { inject } from 'vue'
import { X } from '@lucide/vue'

// The parent Dialog provides its close handler; fall back to a no-op when the
// close control is rendered outside a Dialog subtree.
const close = inject<() => void>('dialog-close', () => {})
</script>

<template>
  <button
    type="button"
    aria-label="关闭"
    class="absolute top-4 right-4 inline-flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
    @click="close()"
  >
    <slot><X :size="18" /></slot>
  </button>
</template>
