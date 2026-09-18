import { inject } from 'vue'
import { themeKey, type ThemeContextValue } from './ThemeContext'

export function useTheme(): ThemeContextValue {
  const context = inject(themeKey)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export default useTheme
