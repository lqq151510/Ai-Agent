import { app, BrowserWindow, ipcMain, Menu, Tray, shell } from 'electron';
import * as path from 'path';
import * as net from 'net';
import { BackendManager } from './backend-manager';
import { CliManager } from './cli-manager';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backendManager: BackendManager;
let cliManager: CliManager;
const isDev = !app.isPackaged;

const DESKTOP_PORT = 18080;
let activePort = DESKTOP_PORT;
let isQuitting = false;

function checkPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(startPort: number, endPort: number): Promise<number> {
  for (let port = startPort; port <= endPort; port++) {
    const free = await checkPortFree(port);
    if (free) {
      return port;
    }
  }
  throw new Error(`No free port found in range ${startPort}-${endPort}`);
}

function getBackendStartupTimeoutMs(): number {
  const raw = process.env.DESKTOP_BACKEND_READY_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

function getResourcePath(): string {
  return process.resourcesPath || path.join(__dirname, '..');
}

function getJrePath(): string {
  const resourceRoot = getResourcePath();
  return path.join(resourceRoot, 'backend-jre', 'jre', 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
}

function getBackendJarPath(): string {
  const resourceRoot = getResourcePath();
  return path.join(resourceRoot, 'backend-jre', 'backend.jar');
}

function getCliEntryPath(): string {
  const resourceRoot = getResourcePath();
  return path.join(resourceRoot, 'backend-jre', 'ts-cli', 'dist', 'index.js');
}

function getDataDir(): string {
  return path.join(app.getPath('userData'), 'data');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'AI Agent',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show();
  });

  return mainWindow;
}

function createTray() {
  const iconPath = path.join(getResourcePath(), 'icons', process.platform === 'win32' ? 'icon.ico' : 'iconTemplate.png');
  try {
    tray = new Tray(iconPath);
  } catch {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { mainWindow?.show(); } },
    { label: '打开数据目录', click: () => { shell.openPath(getDataDir()); } },
    { label: '打开运行日志', click: () => { shell.showItemInFolder(backendManager.getStatus().logPath); } },
    { type: 'separator' },
    {
      label: '重启后端',
      click: () => {
        void backendManager.restart().catch((error) => {
          console.error('[desktop] backend restart failed', error);
        });
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit(); } },
  ]);

  tray.setToolTip('AI Agent');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow?.show(); });
}

function setupIpc() {
  ipcMain.handle('backend:status', () => backendManager.getStatus());
  ipcMain.handle('backend:restart', () => backendManager.restart());
  ipcMain.handle('backend:open-log-file', () => shell.showItemInFolder(backendManager.getStatus().logPath));
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:data-dir', () => getDataDir());
  ipcMain.handle('app:open-data-dir', () => {
    shell.openPath(getDataDir());
  });
  ipcMain.handle('backend:port', () => activePort);
  ipcMain.handle('cli:execute', (_event, args: string[]) => {
    return cliManager.execute(getCliEntryPath(), args);
  });
  ipcMain.on('cli:input', (_event, input: string) => {
    cliManager.sendInput(input);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  if (backendManager) {
    await backendManager.stop();
  }
  if (cliManager) {
    cliManager.killAll();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const dataDir = getDataDir();
    const jrePath = getJrePath();
    const jarPath = getBackendJarPath();

    try {
      activePort = await findFreePort(DESKTOP_PORT, DESKTOP_PORT + 10);
    } catch (error) {
      console.warn('[desktop] Failed to find free port, falling back to default', error);
    }

    backendManager = new BackendManager(jrePath, jarPath, dataDir, activePort, {
      startupTimeoutMs: getBackendStartupTimeoutMs(),
    });
    cliManager = new CliManager();

    setupIpc();
    createMainWindow();
    createTray();
    backendManager.onStatusChange((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend:status-changed', status);
      }
    });

    if (isDev) {
      mainWindow!.loadURL('http://localhost:5173');
      mainWindow!.webContents.openDevTools();
    } else {
      mainWindow!.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    }

    try {
      await backendManager.start();
    } catch (error) {
      console.error('[desktop] backend startup failed', error);
    }

    mainWindow!.webContents.on('did-finish-load', () => {
      mainWindow!.webContents.send('backend:status-changed', backendManager.getStatus());
    });
  });
}

export { mainWindow, backendManager, getDataDir, activePort as DESKTOP_PORT };
