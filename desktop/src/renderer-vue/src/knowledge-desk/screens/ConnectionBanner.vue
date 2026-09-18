<script lang="ts">
export interface ConnectionBannerProps {
  error?: string
  isLoading: boolean
  isDegraded?: boolean
  onRetry: () => void
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, RefreshCw } from '@lucide/vue'

const props = defineProps<ConnectionBannerProps>()

const bannerClass = computed(() =>
  `kd-connection-banner${props.isDegraded ? ' kd-connection-banner--degraded' : ''}`,
)
</script>

<template>
  <div :class="bannerClass" role="alert">
    <div class="kd-connection-banner__icon">
      <AlertTriangle :size="18" />
    </div>
    <div>
      <strong>{{ isDegraded ? '部分服务异常' : '后端连接异常，当前显示预览数据' }}</strong>
      <span>{{
        error ||
          (isDegraded
            ? '某些模块加载失败。请检查服务状态后重试。'
            : '本机数据库可能未启动，或登录凭证暂不可用。请检查服务状态后重试。')
      }}</span>
    </div>
    <button type="button" :disabled="isLoading" @click="onRetry()">
      <RefreshCw :size="15" />
      {{ isLoading ? '重试中' : isDegraded ? '重试失败接口' : '重新连接' }}
    </button>
  </div>
</template>
