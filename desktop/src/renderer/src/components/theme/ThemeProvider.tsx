import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeContext, type ResolvedTheme, type Theme, type ThemeContextValue } from './ThemeContext';

const STORAGE_KEY = 'ai-agent-theme';

function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value;
    }
  } catch {
    // localStorage may be unavailable in some environments
  }
  return null;
}

function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  const body = document.body;
  if (resolved === 'dark') {
    root.classList.add('dark');
    body.classList.add('dark');
  } else {
    root.classList.remove('dark');
    body.classList.remove('dark');
  }
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  enableSystem?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  enableSystem = true,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return getStoredTheme() ?? defaultTheme;
  });
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (theme === 'system' && enableSystem) return systemTheme;
    return theme === 'dark' ? 'dark' : 'light';
  }, [theme, systemTheme, enableSystem]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    storeTheme(next);
  }, []);

  // Apply theme class to document root whenever resolved theme changes.
  useEffect(() => {
    applyClass(resolvedTheme);
  }, [resolvedTheme]);

  // Listen for system theme changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  // Optional: sync with Electron nativeTheme if the main process exposes it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const electronAPI = (window as unknown as {
      electronAPI?: {
        on?: (channel: string, callback: (value: string) => void) => (() => void) | void;
      };
    }).electronAPI;

    const unsubscribe = electronAPI?.on?.('native-theme-updated', (nativeTheme) => {
      if (nativeTheme === 'dark' || nativeTheme === 'light') {
        setSystemTheme(nativeTheme);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const value: ThemeContextValue = {
    theme,
    resolvedTheme,
    setTheme,
    systemTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export default ThemeProvider;
