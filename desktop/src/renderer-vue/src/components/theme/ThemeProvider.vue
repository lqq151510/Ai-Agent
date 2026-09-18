<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import {
  themeKey,
  type ResolvedTheme,
  type Theme,
  type ThemeContextValue,
} from './ThemeContext'

const props = withDefaults(
  defineProps<{
    defaultTheme?: Theme
    enableSystem?: boolean
  }>(),
  {
    defaultTheme: 'system',
    enableSystem: true,
  },
)

const STORAGE_KEY = 'ai-agent-theme'

function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value
    }
  } catch {
    // localStorage may be unavailable in some environments
  }
  return null
}

function storeTheme(next: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // ignore
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyClass(resolved: ResolvedTheme) {
  const root = document.documentElement
  const body = document.body
  if (resolved === 'dark') {
    root.classList.add('dark')
    body.classList.add('dark')
  } else {
    root.classList.remove('dark')
    body.classList.remove('dark')
  }
}

const theme = ref<Theme>(getStoredTheme() ?? props.defaultTheme)
const systemTheme = ref<ResolvedTheme>(getSystemTheme())

const resolvedTheme = computed<ResolvedTheme>(() => {
  if (theme.value === 'system' && props.enableSystem) return systemTheme.value
  return theme.value === 'dark' ? 'dark' : 'light'
})

function setTheme(next: Theme) {
  theme.value = next
  storeTheme(next)
}

// Apply the theme class to <html>/<body> whenever the resolved theme changes.
watch(resolvedTheme, (next) => applyClass(next), { immediate: true })

let media: MediaQueryList | null = null
let unsubscribeNative: (() => void) | void

function handleMediaChange(event: MediaQueryListEvent) {
  systemTheme.value = event.matches ? 'dark' : 'light'
}

onMounted(() => {
  media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', handleMediaChange)

  // Optional: sync with Electron nativeTheme if the main process exposes it.
  const electronAPI = (
    window as unknown as {
      electronAPI?: {
        on?: (channel: string, callback: (value: string) => void) => (() => void) | void
      }
    }
  ).electronAPI

  unsubscribeNative = electronAPI?.on?.('native-theme-updated', (nativeTheme) => {
    if (nativeTheme === 'dark' || nativeTheme === 'light') {
      systemTheme.value = nativeTheme
    }
  })
})

onUnmounted(() => {
  media?.removeEventListener('change', handleMediaChange)
  if (typeof unsubscribeNative === 'function') unsubscribeNative()
})

provide(themeKey, {
  theme,
  resolvedTheme,
  systemTheme,
  setTheme,
} satisfies ThemeContextValue)
</script>

<template>
  <slot />
</template>
