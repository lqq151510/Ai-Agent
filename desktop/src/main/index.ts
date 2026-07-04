import { app, globalShortcut, Notification } from 'electron';
import { BackendManager } from './backend-manager';
import { CliManager } from './cli-manager';
import { WindowManager } from './window-manager';
import { TrayManager } from './tray-manager';
import { PtyPool } from './pty-pool';
import { IpcRegistry } from './ipc-registry';
import { WorkspaceManager } from './workspace-manager';
import { GitManager } from './git-manager';
import { ChatManager } from './chat-manager';
import { LocalServiceManager } from './local-service-manager';
import { ThreadManager } from './thread-manager';
import { ToolExecutionBridge } from './tool-execution-bridge';
import { ApprovalEngine, type ApprovalMode } from './approval-engine';
import { SkillManager } from './skill-manager';
import { ComputerUseManager } from './computer-use-manager';
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
let ptyPool: PtyPool;
let ipcRegistry: IpcRegistry;
let workspaceManager: WorkspaceManager;
let gitManager: GitManager;
let chatManager: ChatManager;
let localServiceManager: LocalServiceManager;
let threadManager: ThreadManager;
let toolBridge: ToolExecutionBridge;
let approvalEngine: ApprovalEngine;
let skillManager: SkillManager;
let computerUseManager: ComputerUseManager;
let approvalMode: ApprovalMode = 'auto-edit';

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
    if (ptyPool) ptyPool.killAll();
    if (localServiceManager) localServiceManager.stop();
    app.exit(0);
  } else if (cliManager) {
    cliManager.killAll();
    if (ptyPool) ptyPool.killAll();
    if (localServiceManager) localServiceManager.stop();
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
      if (process.platform === 'darwin') {
        if (app.dock?.isVisible()) {
          app.dock.bounce('informational');
        } else if (Notification.isSupported()) {
          try {
            new Notification({ title: 'AI Agent', body: '已切换到运行中的窗口' }).show();
          } catch (err) {
            console.error('[desktop] Failed to show second-instance notification:', err);
          }
        }
      }
    }
  });

  app.whenReady().then(async () => {
    try {
      app.dock?.hide();

      globalShortcut.register('CommandOrControl+Shift+Space', () => {
        windowManager?.toggleVisibility();
      });

      globalShortcut.register('CommandOrControl+Shift+N', () => {
        windowManager?.showAndFocus();
        windowManager?.mainWindow?.webContents.send('app:shortcut', { action: 'new-chat' });
      });

      globalShortcut.register('CommandOrControl+K', () => {
        windowManager?.showAndFocus();
        windowManager?.mainWindow?.webContents.send('app:shortcut', { action: 'focus-search' });
      });

      globalShortcut.register('CommandOrControl+,', () => {
        windowManager?.showAndFocus();
        windowManager?.mainWindow?.webContents.send('app:shortcut', { action: 'open-settings' });
      });

      globalShortcut.register('CommandOrControl+Shift+F', () => {
        windowManager?.showAndFocus();
        windowManager?.mainWindow?.webContents.send('app:shortcut', { action: 'focus-input' });
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
      ptyPool = new PtyPool();
      windowManager = new WindowManager();
      workspaceManager = new WorkspaceManager();
      gitManager = new GitManager();
      chatManager = new ChatManager();
      localServiceManager = new LocalServiceManager();
      threadManager = new ThreadManager(ptyPool, gitManager);
      approvalEngine = new ApprovalEngine();
      skillManager = new SkillManager();
      computerUseManager = new ComputerUseManager();
      toolBridge = new ToolExecutionBridge(
        ptyPool,
        approvalEngine,
        () => localServiceManager.isReady() ? localServiceManager.getPort() : 8765,
        () => activePort,
        () => ipcRegistry.getDesktopAccessToken(),
        () => approvalMode,
        computerUseManager,
      );

      trayManager = new TrayManager(windowManager, backendManager);
      ipcRegistry = new IpcRegistry(
        backendManager, cliManager, ptyPool,
        workspaceManager, gitManager, chatManager,
        localServiceManager,
        () => activePort,
        threadManager,
        toolBridge,
        approvalEngine,
        () => windowManager.mainWindow,
        skillManager,
        computerUseManager,
        (mode) => { approvalMode = mode; },
        () => approvalMode,
      );

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

      // Push thread events to renderer when they change
      threadManager.onThreadEvent((thread) => {
        const win = windowManager.mainWindow;
        if (win && !win.isDestroyed()) {
          win.webContents.send('thread:event', thread);
        }
      });

      // Start local-service (non-blocking — best effort)
      localServiceManager.start().catch(err => {
        console.warn('[desktop] local-service failed to start (non-fatal):', err);
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

export { backendManager, localServiceManager, getDataDir, activePort as DESKTOP_PORT };
