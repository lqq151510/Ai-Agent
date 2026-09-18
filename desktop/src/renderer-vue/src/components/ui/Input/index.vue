<script lang="ts">
export type InputSize = 'sm' | 'md' | 'lg'
</script>

<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'

// Multi-root component (v-if / v-else): bind $attrs explicitly per branch,
// otherwise placeholder/type/value would never reach the inner <input>.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    inputSize?: InputSize
    error?: boolean
  }>(),
  {
    inputSize: 'md',
    error: false,
  },
)

const slots = useSlots()
const inputRef = ref<HTMLInputElement | null>(null)

const hasAffix = computed(() => Boolean(slots.prefix || slots.suffix))

const sizeStyles: Record<InputSize, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-9 px-3 text-[13px]',
  lg: 'h-11 px-4 text-sm',
}

const base =
  'w-full bg-[var(--surface-card)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] ' +
  'border rounded-[var(--radius-md)] outline-none transition-all duration-200 ' +
  'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 ' +
  'disabled:bg-[var(--surface-disabled)] disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed'

const errorClass = computed(() =>
  props.error
    ? 'border-[var(--border-error)] focus:border-[var(--border-error)] focus:ring-[var(--error)]/15'
    : 'border-[var(--border-default)] hover:border-[var(--border-hover)]',
)

const standaloneClasses = computed(() =>
  [base, sizeStyles[props.inputSize], errorClass.value].join(' '),
)

const wrapperClasses = computed(() =>
  [
    'inline-flex items-center w-full bg-[var(--surface-card)] border rounded-[var(--radius-md)]',
    'focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/15',
    props.error
      ? 'border-[var(--border-error)] focus-within:border-[var(--border-error)] focus-within:ring-[var(--error)]/15'
      : 'border-[var(--border-default)] hover:border-[var(--border-hover)]',
    sizeStyles[props.inputSize],
  ].join(' '),
)

const innerClasses =
  'flex-1 min-w-0 bg-transparent outline-none text-[var(--text-primary)] ' +
  'placeholder:text-[var(--text-tertiary)] disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed'

defineExpose({ inputRef, focus: () => inputRef.value?.focus() })
</script>

<template>
  <input v-if="!hasAffix" ref="inputRef" v-bind="$attrs" :class="standaloneClasses" />
  <div v-else :class="wrapperClasses">
    <span v-if="slots.prefix" class="inline-flex items-center text-[var(--text-secondary)] mr-2">
      <slot name="prefix" />
    </span>
    <input ref="inputRef" v-bind="$attrs" :class="innerClasses" />
    <span v-if="slots.suffix" class="inline-flex items-center text-[var(--text-secondary)] ml-2">
      <slot name="suffix" />
    </span>
  </div>
</template>
