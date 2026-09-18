<script lang="ts">
export interface TextareaProps {
  autoResize?: boolean
  error?: boolean
  minRows?: number
  maxRows?: number
}
</script>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<TextareaProps>(), {
  autoResize: false,
  error: false,
  minRows: 2,
})

const LINE_HEIGHT = 20

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const autoHeight = ref<number | undefined>(undefined)

function resize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const min = (props.minRows ?? 2) * LINE_HEIGHT
  const max = props.maxRows ? props.maxRows * LINE_HEIGHT : Infinity
  const next = Math.min(Math.max(el.scrollHeight, min), max)
  el.style.height = `${next}px`
  autoHeight.value = next
}

onMounted(() => {
  if (props.autoResize) resize()
})

watch(
  () => [props.autoResize, props.minRows, props.maxRows],
  () => {
    if (props.autoResize) resize()
  },
)

const base =
  'w-full bg-[var(--surface-card)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] ' +
  'border rounded-[var(--radius-md)] px-3 py-2 text-[13px] leading-5 outline-none transition-all duration-200 ' +
  'resize-none ' +
  'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 ' +
  'disabled:bg-[var(--surface-disabled)] disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed'

const errorClass = computed(() =>
  props.error
    ? 'border-[var(--border-error)] focus:border-[var(--border-error)] focus:ring-[var(--error)]/15'
    : 'border-[var(--border-default)] hover:border-[var(--border-hover)]',
)

const classes = computed(() => [base, errorClass.value].join(' '))

const computedStyle = computed<Record<string, string | number | undefined>>(() => ({
  minHeight: props.autoResize ? (props.minRows ?? 2) * LINE_HEIGHT : undefined,
  height: props.autoResize ? autoHeight.value : undefined,
}))

const rows = computed(() => (props.autoResize ? undefined : (props.minRows ?? 2)))

defineExpose({ textareaRef, focus: () => textareaRef.value?.focus(), resize })
</script>

<template>
  <textarea
    ref="textareaRef"
    :class="classes"
    :style="computedStyle"
    :rows="rows"
    @input="autoResize && resize()"
  />
</template>
