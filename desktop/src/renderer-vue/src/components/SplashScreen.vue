<script lang="ts">
export type BackendStatus = 'starting' | 'running' | 'stopped' | 'error'
export type BackendMode = 'managed' | 'attached'

export interface SplashScreenProps {
  status?: { status: BackendStatus; mode?: BackendMode } | null
  isReady?: boolean
}
</script>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Bot, Loader2 } from '@lucide/vue'

const props = defineProps<SplashScreenProps>()

const STATUS_MESSAGES: Record<BackendStatus, string> = {
  starting: '正在启动本地服务...',
  running: '服务已就绪',
  stopped: '服务未启动',
  error: '服务启动失败',
}

const version = ref('')

onMounted(() => {
  const api = (window as unknown as { electronAPI?: { appVersion?: () => Promise<string> } })
    .electronAPI
  if (!api?.appVersion) return
  api
    .appVersion()
    .then((v) => {
      version.value = v
    })
    .catch(() => {
      version.value = ''
    })
})

const backendStatus = computed<BackendStatus>(() => props.status?.status ?? 'starting')

const message = computed(() => {
  const current = backendStatus.value
  if (props.status?.mode === 'attached') {
    return {
      starting: '正在连接本机后端...',
      running: '已连接到本机后端',
      stopped: '已断开本机后端',
      error: '本机后端不可用',
    }[current]
  }
  return STATUS_MESSAGES[current] ?? '正在初始化...'
})
</script>

<template>
  <div :class="['splash-screen', isReady ? 'splash-screen--ready' : '']">
    <div class="splash-screen__card">
      <div class="splash-screen__logo">
        <Bot :size="48" :stroke-width="1.5" />
      </div>
      <h1 class="splash-screen__title">AI Agent</h1>
      <p class="splash-screen__version">v{{ version || '0.1.0' }}</p>
      <div class="splash-screen__status">
        <Loader2 :size="16" class="splash-screen__spinner" />
        <span>{{ message }}</span>
      </div>
    </div>
  </div>
</template>
