import { app, globalShortcut } from 'electron';
import { BackendManager } from './backend-manager';
import { CliManager } from './cli-manager';
import { WindowManager } from './window-manager';
import { TrayManager } from './tray-manager';
import { IpcRegistry } from './ipc-registry';
import { findFreePort } from './utils/network';
import { getDataDir, getJrePath, getBackendJarPath, getBackendStartupTimeoutMs } from './utils/env';

// Unhandled Promise Rejection Handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('[desktop] Unhandled Rejection at:', promise, 'reason:', reason);
  // Avoid crashing the main process on backend startup timeout or similar async errors
});

process.on('uncaughtException', (error) => {
  console.error('[desktop] Uncaught Exception:', error);
});

const DESKTOP_PORT = 18080;
let activePort = DESKTOP_PORT;
let backendManager: BackendManager;
let cliManager: CliManager;
let windowManager: WindowManager;
let trayManager: TrayManager;
let ipcRegistry: IpcRegistry;

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (backendManager && backendManager.getStatus().status !== 'stopped') {
    event.preventDefault();
    try {
      await backendManager.stop();
    } catch (err) {
      console.error('[desktop] Error stopping backend:', err);
    }
    if (cliManager) {
      cliManager.killAll();
    }
    app.exit(0);
  } else if (cliManager) {
    cliManager.killAll();
  }
});

app.on('activate', () => {
  if (windowManager && !windowManager.mainWindow) {
    windowManager.createMainWindow();
    windowManager.loadContent();
  }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (windowManager) {
      windowManager.showAndFocus();
    }
  });

  app.whenReady().then(async () => {
    try {
      app.dock?.hide();

      globalShortcut.register('CommandOrControl+Shift+Space', () => {
        windowManager?.toggleVisibility();
      });

      try {
        activePort = await findFreePort(DESKTOP_PORT, DESKTOP_PORT + 10);
      } catch (error) {
        console.warn('[desktop] Failed to find free port, falling back to default', error);
      }

      const dataDir = getDataDir();
      const jrePath = getJrePath();
      const jarPath = getBackendJarPath();

      backendManager = new BackendManager(jrePath, jarPath, dataDir, activePort, {
        startupTimeoutMs: getBackendStartupTimeoutMs(),
      });
      cliManager = new CliManager();
      windowManager = new WindowManager();
      trayManager = new TrayManager(windowManager, backendManager);
      ipcRegistry = new IpcRegistry(backendManager, cliManager, () => activePort);

      ipcRegistry.setupIpc();
      windowManager.createMainWindow();
      trayManager.createTray();
      windowManager.loadContent();

      backendManager.onStatusChange((status) => {
        const win = windowManager.mainWindow;
        if (win && !win.isDestroyed()) {
          win.webContents.send('backend:status-changed', status);
        }
      });

      await backendManager.start();

      windowManager.mainWindow?.webContents.on('did-finish-load', () => {
        windowManager.mainWindow?.webContents.send('backend:status-changed', backendManager.getStatus());
      });

    } catch (err) {
      console.error('[desktop] Critical error during app initialization:', err);
    }
  }).catch((err) => {
    console.error('[desktop] Failed in app.whenReady:', err);
  });
}

export { backendManager, getDataDir, activePort as DESKTOP_PORT };
