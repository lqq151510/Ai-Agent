<script lang="ts">
export interface DialogProps {
  open: boolean
}
</script>

<script setup lang="ts">
import { onUnmounted, provide, ref, watch } from 'vue'

const props = defineProps<DialogProps>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const panelRef = ref<HTMLDivElement | null>(null)

// Declared before the immediate watcher below so it is initialised first.
let originalOverflow = ''

function close() {
  emit('update:open', false)
}

provide('dialog-close', close)

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
  }
}

function handleBackdropClick(event: MouseEvent) {
  if (panelRef.value && !panelRef.value.contains(event.target as Node)) {
    close()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKeyDown)
      originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    } else {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = originalOverflow
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.body.style.overflow = originalOverflow
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      role="dialog"
      aria-modal="true"
      class="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center"
      @click="handleBackdropClick"
    >
      <div class="absolute inset-0 bg-black/40 backdrop-blur-[4px]" />
      <div
        ref="panelRef"
        :class="[
          'relative w-full max-w-lg max-h-[calc(100vh-80px)] overflow-auto',
          'bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[var(--radius-xl)]',
          'shadow-[var(--shadow-lg)] p-6 animate-[ui-fade-in_0.2s_ease-out]',
        ]"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>
