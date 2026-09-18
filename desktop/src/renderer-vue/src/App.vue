<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import KnowledgeDeskApp from './knowledge-desk/KnowledgeDeskApp.vue'
import { Toaster } from './components/ui'
import SplashScreen from './components/SplashScreen.vue'
import type { BackendMode, BackendStatus } from './components/SplashScreen.vue'
import ErrorBoundary from './components/ErrorBoundary.vue'
import { ThemeProvider } from './components/theme'

type BackendStatusPayload = { status: BackendStatus; mode?: BackendMode }

interface DesktopElectronApi {
  backendStatus?: () => Promise<BackendStatusPayload>
  onBackendStatusChanged?: (callback: (status: BackendStatusPayload) => void) => (() => void) | void
  onShortcut?: (callback: (payload: { action: string }) => void) => () => void
  chat?: {
    createSession: (branch?: string) => Promise<unknown>
  }
}

const getElectronApi = () => (window as unknown as { electronAPI?: DesktopElectronApi }).electronAPI

const startsWithoutBackendBridge = import.meta.env.DEV && !getElectronApi()
const backendStatus = ref<BackendStatusPayload | null>(null)
const isBackendReady = ref(startsWithoutBackendBridge)
const showSplash = ref(true)

let unsubscribeBackend: (() => void) | void
let unsubscribeShortcut: (() => void) | void
let fallbackTimer: number | undefined
let splashTimer: number | undefined

function handleShortcut(payload: { action: string }) {
  // Broadcast the shortcut as a custom event so any layout can subscribe without a direct import.
  window.dispatchEvent(new CustomEvent('desktop:shortcut', { detail: payload }))

  // Sensible fallbacks for the current Knowledge Desk UI, without touching its internals.
  switch (payload.action) {
    case 'focus-search': {
      document.querySelector<HTMLElement>('.kd-command-search')?.click()
      break
    }
    case 'open-settings': {
      document.querySelector<HTMLElement>('.kd-user-card')?.click()
      break
    }
    case 'new-chat': {
      // Requires a backend session via IPC; wired for future layouts.
      getElectronApi()
        ?.chat?.createSession('main')
        .catch(() => {
          // Non-fatal if chat is not available in the current layout.
        })
      break
    }
    case 'focus-input': {
      const activeInput =
        document.querySelector<HTMLElement>('.kd-search-box input') ||
        document.querySelector<HTMLElement>('textarea') ||
        document.querySelector<HTMLElement>('input[type="text"]')
      activeInput?.focus()
      break
    }
  }
}

onMounted(() => {
  const api = getElectronApi()
  // A Vite-only preview has no Electron IPC bridge to report backend status.
  // Show the Knowledge Desk fallback immediately instead of trapping local UI work behind a splash.
  if (!api) return

  if (api.backendStatus) {
    api
      .backendStatus()
      .then((status) => {
        backendStatus.value = status
        if (status.status === 'running' || status.status === 'error') {
          isBackendReady.value = true
        }
      })
      .catch(() => {
        backendStatus.value = { status: 'starting' }
      })
  }

  unsubscribeBackend = api.onBackendStatusChanged?.((status) => {
    backendStatus.value = status
    if (status.status === 'running' || status.status === 'error') {
      isBackendReady.value = true
    }
  })

  // Safety fallback: never keep the splash visible for more than 30 seconds.
  fallbackTimer = window.setTimeout(() => {
    isBackendReady.value = true
  }, 30000)

  if (api.onShortcut) {
    unsubscribeShortcut = api.onShortcut(handleShortcut)
  }
})

// Fade out and unmount the splash screen once the backend is ready.
// `immediate` mirrors the React effect, which also ran on mount when the
// Vite-only preview starts with isBackendReady already true.
watch(
  isBackendReady,
  (ready) => {
    if (splashTimer !== undefined) window.clearTimeout(splashTimer)
    if (!ready) return
    splashTimer = window.setTimeout(() => {
      showSplash.value = false
    }, 600)
  },
  { immediate: true },
)

onUnmounted(() => {
  if (typeof unsubscribeBackend === 'function') unsubscribeBackend()
  if (typeof unsubscribeShortcut === 'function') unsubscribeShortcut()
  if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer)
  if (splashTimer !== undefined) window.clearTimeout(splashTimer)
})

// Declared as a method rather than inlined in the template: `window` is not part of
// the Vue template scope, so `:on-reset="() => window.location.reload()"` fails typecheck.
function handleAppReset() {
  window.location.reload()
}
</script>

<template>
  <ErrorBoundary
    title="应用异常"
    description="应用发生严重错误，请尝试恢复或重新加载。"
    :on-reset="handleAppReset"
  >
    <ThemeProvider default-theme="system">
      <KnowledgeDeskApp />
      <SplashScreen v-if="showSplash" :status="backendStatus" :is-ready="isBackendReady" />
      <Toaster position="top-right" />
    </ThemeProvider>
  </ErrorBoundary>
</template>
