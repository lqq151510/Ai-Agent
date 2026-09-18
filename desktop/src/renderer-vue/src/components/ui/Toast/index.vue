<script lang="ts">
export type ToastPosition = 'top-right' | 'bottom-right'
</script>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from '@lucide/vue'
import { dismiss, subscribeToasts, type ToastItem, type ToastType } from './toastStore'

const props = withDefaults(defineProps<{ position?: ToastPosition }>(), {
  position: 'top-right',
})

const items = ref<ToastItem[]>([])
const unsubscribe = subscribeToasts((next) => {
  items.value = next
})
onUnmounted(() => unsubscribe())

const icons: Record<ToastType, unknown> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const iconClasses: Record<ToastType, string> = {
  success: 'text-[var(--success)]',
  error: 'text-[var(--error)]',
  warning: 'text-[var(--warning)]',
  info: 'text-[var(--accent)]',
}

const typeStyles: Record<ToastType, string> = {
  success: 'bg-[var(--success-alpha-8)] border-[var(--success-alpha-20)]',
  error: 'bg-[var(--error-alpha-8)] border-[var(--error-alpha-20)]',
  warning: 'bg-[var(--warning-alpha-5)] border-[var(--warning-alpha-15)]',
  info: 'bg-[var(--accent-alpha-8)] border-[var(--accent-alpha-20)]',
}

const positionClass = computed(() =>
  props.position === 'top-right' ? 'top-4 right-4 flex-col' : 'bottom-4 right-4 flex-col-reverse',
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="items.length > 0"
      :class="['fixed z-[var(--z-toast)] flex gap-2 pointer-events-none', positionClass]"
      aria-live="polite"
      aria-atomic="true"
    >
      <div v-for="item in items" :key="item.id" class="pointer-events-auto">
        <div
          role="alert"
          :class="[
            'flex items-start gap-3 w-80 p-4 rounded-[var(--radius-lg)] border shadow-[var(--shadow-md)]',
            'animate-[ui-slide-in-right_0.2s_ease-out]',
            typeStyles[item.type],
          ]"
        >
          <span class="mt-0.5 shrink-0">
            <component :is="icons[item.type]" :size="18" :class="iconClasses[item.type]" />
          </span>
          <div class="flex-1 min-w-0">
            <p v-if="item.title" class="text-[13px] font-semibold text-[var(--text-primary)]">
              {{ item.title }}
            </p>
            <p
              :class="[
                'text-[13px] leading-relaxed text-[var(--text-secondary)]',
                item.title ? 'mt-0.5' : '',
              ]"
            >
              {{ item.message }}
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭通知"
            class="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-black/5 hover:text-[var(--text-primary)] transition-colors"
            @click="dismiss(item.id)"
          >
            <X :size="14" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
