<script lang="ts">
export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'
</script>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    side?: TooltipSide
    delay?: number
  }>(),
  {
    side: 'top',
    delay: 200,
  },
)

const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const sideClasses: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

function show() {
  timer = setTimeout(() => {
    visible.value = true
  }, props.delay)
}

function hide() {
  if (timer) clearTimeout(timer)
  timer = null
  visible.value = false
}

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <span
    class="relative inline-flex cursor-help"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
    <span
      v-if="visible"
      role="tooltip"
      :class="[
        'absolute z-[var(--z-tooltip)] pointer-events-none',
        'px-2 py-1 rounded-[var(--radius-md)] text-[11px] font-medium whitespace-nowrap',
        'bg-[var(--text-primary)] text-[var(--text-inverse)] shadow-[var(--shadow-md)]',
        'transition-opacity duration-150',
        sideClasses[side],
      ]"
    >
      <slot name="content" />
    </span>
  </span>
</template>
