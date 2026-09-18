<script setup lang="ts">
import ErrorBoundary from '../../components/ErrorBoundary.vue'

defineProps<{
  label: string
  onReset: () => void
}>()
</script>

<template>
  <ErrorBoundary
    :title="`${label}加载失败`"
    :description="`${label}页面发生异常，已隔离显示，不影响其他页面。`"
    :on-reset="onReset"
    show-details
  >
    <slot />
  </ErrorBoundary>
</template>
