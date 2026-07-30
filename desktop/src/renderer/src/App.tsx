import { useEffect, useState } from 'react';
import KnowledgeDeskApp from './knowledge-desk/KnowledgeDeskApp';
import { Toaster } from './components/ui';
import { SplashScreen, type BackendStatus } from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/theme';

type BackendStatusPayload = { status: BackendStatus };

interface DesktopElectronApi {
  backendStatus?: () => Promise<BackendStatusPayload>;
  onBackendStatusChanged?: (callback: (status: BackendStatusPayload) => void) => (() => void) | void;
  onShortcut?: (callback: (payload: { action: string }) => void) => () => void;
  chat?: {
    createSession: (branch?: string) => Promise<unknown>;
  };
}

const getElectronApi = () =>
  (window as unknown as { electronAPI?: DesktopElectronApi }).electronAPI;

export const App = () => {
  const startsWithoutBackendBridge = import.meta.env.DEV && !getElectronApi();
  const [backendStatus, setBackendStatus] = useState<BackendStatusPayload | null>(null);
  const [isBackendReady, setIsBackendReady] = useState(startsWithoutBackendBridge);
  const [showSplash, setShowSplash] = useState(true);

  // Track backend readiness so the splash screen can hide once the local service is connectable.
  useEffect(() => {
    const api = getElectronApi();
    if (!api) {
      // A Vite-only preview has no Electron IPC bridge to report backend status.
      // Show the Knowledge Desk fallback immediately instead of trapping local UI work behind a splash screen.
      return;
    }

    if (api.backendStatus) {
      api
        .backendStatus()
        .then((status) => {
          setBackendStatus(status);
          if (status.status === 'running' || status.status === 'error') {
            setIsBackendReady(true);
          }
        })
        .catch(() => {
          setBackendStatus({ status: 'starting' });
        });
    }

    const unsubscribe = api.onBackendStatusChanged?.((status) => {
      setBackendStatus(status);
      if (status.status === 'running' || status.status === 'error') {
        setIsBackendReady(true);
      }
    });

    // Safety fallback: never keep the splash visible for more than 30 seconds.
    const fallbackTimer = window.setTimeout(() => setIsBackendReady(true), 30000);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  // Fade out and unmount the splash screen once the backend is ready.
  useEffect(() => {
    if (!isBackendReady) return;
    const timer = window.setTimeout(() => setShowSplash(false), 600);
    return () => window.clearTimeout(timer);
  }, [isBackendReady]);

  // Handle global shortcuts pushed from the main process.
  useEffect(() => {
    const api = getElectronApi();
    if (!api?.onShortcut) return;

    const unsubscribe = api.onShortcut((payload: { action: string }) => {
      // Broadcast the shortcut as a custom event so any layout can subscribe without a direct import.
      window.dispatchEvent(new CustomEvent('desktop:shortcut', { detail: payload }));

      // Provide sensible fallbacks for the current Knowledge Desk UI without touching its internals.
      switch (payload.action) {
        case 'focus-search': {
          const searchButton = document.querySelector<HTMLElement>('.kd-command-search');
          searchButton?.click();
          break;
        }
        case 'open-settings': {
          const settingsButton = document.querySelector<HTMLElement>('.kd-user-card');
          settingsButton?.click();
          break;
        }
        case 'new-chat': {
          // Create a backend session via IPC; the Knowledge Desk UI does not expose a chat surface,
          // so this shortcut is wired for future layouts and broadcasts a custom event.
          api.chat?.createSession('main').catch(() => {
            // Non-fatal if chat is not available in the current layout.
          });
          break;
        }
        case 'focus-input': {
          const activeInput =
            document.querySelector<HTMLElement>('.kd-search-box input') ||
            document.querySelector<HTMLElement>('textarea') ||
            document.querySelector<HTMLElement>('input[type="text"]');
          activeInput?.focus();
          break;
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <ErrorBoundary
      description="应用发生严重错误，请尝试恢复或重新加载。"
      onReset={() => window.location.reload()}
      title="应用异常"
    >
      <ThemeProvider defaultTheme="system">
        <KnowledgeDeskApp />
        {showSplash && <SplashScreen status={backendStatus} isReady={isBackendReady} />}
        <Toaster position="top-right" />
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
