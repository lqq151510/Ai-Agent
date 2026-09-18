import type { ComputedRef, InjectionKey, Ref } from 'vue'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export interface ThemeContextValue {
  theme: Ref<Theme>
  resolvedTheme: ComputedRef<ResolvedTheme>
  systemTheme: Ref<ResolvedTheme>
  setTheme: (theme: Theme) => void
}

export const themeKey: InjectionKey<ThemeContextValue> = Symbol('theme')
