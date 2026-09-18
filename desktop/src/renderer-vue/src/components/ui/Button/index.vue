<script lang="ts">
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'icon'
export type ButtonSize = 'sm' | 'md' | 'lg'
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ButtonSize
    loading?: boolean
    disabled?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
  },
)

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--text-inverse)] border border-transparent ' +
    'hover:bg-[var(--accent-hover)] focus:ring-2 focus:ring-[var(--accent)]/25',
  secondary:
    'bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] ' +
    'hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-transparent ' +
    'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
  danger:
    'bg-[var(--error)] text-[var(--text-inverse)] border border-transparent ' +
    'hover:opacity-90 focus:ring-2 focus:ring-[var(--error)]/25',
  link:
    'bg-transparent text-[var(--accent)] border border-transparent ' +
    'hover:underline underline-offset-2 px-0 py-0 h-auto',
  icon:
    'bg-transparent text-[var(--text-secondary)] border border-transparent ' +
    'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-[var(--radius-md)] gap-1.5',
  md: 'h-9 px-4 text-[13px] rounded-[var(--radius-lg)] gap-2',
  lg: 'h-11 px-5 text-sm rounded-[var(--radius-lg)] gap-2',
}

const iconSizeStyles: Record<ButtonSize, string> = {
  sm: 'h-7 w-7 p-0 text-xs rounded-[var(--radius-md)]',
  md: 'h-9 w-9 p-0 text-[13px] rounded-[var(--radius-lg)]',
  lg: 'h-11 w-11 p-0 text-sm rounded-[var(--radius-lg)]',
}

const isIcon = computed(() => props.variant === 'icon')

const base =
  'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-all duration-200 ' +
  'focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ' +
  'active:scale-[0.98]'

const classes = computed(() =>
  [
    base,
    variantStyles[props.variant],
    isIcon.value ? iconSizeStyles[props.size] : sizeStyles[props.size],
  ].join(' '),
)

const spinnerSize = computed(() => (isIcon.value ? 16 : 14))
const isDisabled = computed(() => props.disabled || props.loading)
</script>

<template>
  <button :class="classes" :disabled="isDisabled">
    <Loader2 v-if="loading" class="animate-spin" :size="spinnerSize" />
    <slot v-if="!loading || !isIcon" />
  </button>
</template>
