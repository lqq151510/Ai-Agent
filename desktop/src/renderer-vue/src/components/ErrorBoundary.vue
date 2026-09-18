<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'
import { AlertTriangle, RefreshCw, RotateCcw } from '@lucide/vue'

const props = defineProps<{
  onReset?: () => void
  title?: string
  description?: string
  showDetails?: boolean
}>()

const hasError = ref(false)
const error = ref<Error | null>(null)

onErrorCaptured((err) => {
  hasError.value = true
  error.value = err instanceof Error ? err : new Error(String(err))
  // Console-only, mirroring the React original: never expose internals to the user.
  console.error('ErrorBoundary caught an error:', err)
  // Stop propagation so the failure cannot escalate to a blank window.
  return false
})

function handleRetry() {
  props.onReset?.()
  hasError.value = false
  error.value = null
}

function handleReload() {
  window.location.reload()
}
</script>

<template>
  <slot v-if="!hasError" />
  <slot v-else name="fallback">
    <div class="kd-error-boundary" role="alert">
      <div class="kd-error-boundary__icon">
        <AlertTriangle :size="36" />
      </div>
      <h2>{{ title ?? '出错了' }}</h2>
      <p>{{ description ?? '页面发生异常，请尝试恢复或重新加载应用。' }}</p>
      <pre v-if="showDetails && error" class="kd-error-boundary__details">{{ error.message }}</pre>
      <div class="kd-error-boundary__actions">
        <button class="kd-action-button" type="button" @click="handleRetry">
          <RefreshCw :size="15" />
          重试
        </button>
        <button
          class="kd-action-button kd-action-button--primary"
          type="button"
          @click="handleReload"
        >
          <RotateCcw :size="15" />
          重新加载应用
        </button>
      </div>
    </div>
  </slot>
</template>
