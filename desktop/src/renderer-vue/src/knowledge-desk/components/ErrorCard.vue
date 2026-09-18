<script lang="ts">
export interface ErrorCardProps {
  title?: string
  description?: string
  error?: string | null
  onRetry?: () => void
  retryLabel?: string
}
</script>

<script setup lang="ts">
import { AlertTriangle, RefreshCw } from '@lucide/vue'
import { Button } from '../../components/ui'

withDefaults(defineProps<ErrorCardProps>(), {
  title: '出错了',
  description: '请求失败，请检查网络或后端服务状态后重试。',
  retryLabel: '重试',
})
</script>

<template>
  <div
    class="flex flex-col gap-3 rounded-lg border border-[var(--border-error)] bg-[var(--error-alpha-15)] p-5"
  >
    <div class="flex items-start gap-3">
      <div
        class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--error)]/10 text-[var(--error)]"
      >
        <AlertTriangle :size="18" />
      </div>
      <div class="min-w-0 flex-1">
        <strong class="block text-[15px] font-bold text-[var(--text-primary)]">{{ title }}</strong>
        <p class="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{{ description }}</p>
        <p
          v-if="error"
          class="mt-2 truncate rounded bg-[var(--error)]/10 px-2 py-1 font-mono text-xs text-[var(--error)]"
        >
          {{ error }}
        </p>
      </div>
    </div>
    <div v-if="onRetry" class="flex justify-end">
      <Button variant="secondary" @click="onRetry()">
        <RefreshCw :size="15" />
        {{ retryLabel }}
      </Button>
    </div>
  </div>
</template>
