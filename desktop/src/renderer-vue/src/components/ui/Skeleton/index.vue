<script lang="ts">
export type SkeletonVariant = 'circle' | 'rect' | 'text'
</script>

<script setup lang="ts">
import { computed } from 'vue'

// Multi-root component (v-if / v-else): attrs are NOT inherited automatically,
// so each branch binds $attrs explicitly. Without this, callers' `class`
// (e.g. <Skeleton class="mb-4 h-5 w-1/3" />) would be dropped.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    variant?: SkeletonVariant
    width?: number | string
    height?: number | string
    lines?: number
  }>(),
  {
    variant: 'rect',
    lines: 1,
  },
)

const base = 'bg-[var(--surface-hover)] animate-pulse'

const lineCount = computed(() => props.lines ?? 1)

const dimensionStyle = computed<Record<string, string | number | undefined>>(() => ({
  width: props.width ?? (props.variant === 'text' ? '100%' : undefined),
  height: props.height ?? (props.variant === 'text' ? 12 : undefined),
  borderRadius:
    props.variant === 'circle'
      ? '50%'
      : props.variant === 'text'
        ? 'var(--radius-sm)'
        : 'var(--radius-md)',
}))

const showMultiLine = computed(() => props.variant === 'text' && lineCount.value > 1)

const lineStyles = computed<Record<string, string | number | undefined>[]>(() =>
  Array.from({ length: lineCount.value }, (_, i) => ({
    ...dimensionStyle.value,
    width: props.width ?? (i === lineCount.value - 1 ? '75%' : '100%'),
  })),
)
</script>

<template>
  <div v-if="showMultiLine" v-bind="$attrs" class="flex flex-col gap-2">
    <div v-for="(lineStyle, i) in lineStyles" :key="i" :class="base" :style="lineStyle" />
  </div>
  <div v-else v-bind="$attrs" :class="base" :style="dimensionStyle" />
</template>
