import { app, BrowserWindow } from 'electron';
import * as path from 'path';

export class WindowManager {
  public mainWindow: BrowserWindow | null = null;
  private isQuitting = false;
  private readonly isDev = !app.isPackaged;

  constructor() {
    app.on('before-quit', () => {
      this.isQuitting = true;
    });
  }

  public createMainWindow(): BrowserWindow {
    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      title: 'AI Agent',
      show: false,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 16, y: 16 },
      transparent: true,
      hasShadow: true,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.mainWindow.on('close', (event) => {
      if (process.platform === 'darwin' && !this.isQuitting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow!.show();
    });

    return this.mainWindow;
  }

  public loadContent() {
    if (!this.mainWindow) return;

    if (this.isDev) {
      const rendererUrl = process.env.DESKTOP_RENDERER_URL || 'http://localhost:5173';
      this.mainWindow.loadURL(rendererUrl);
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
    }
    
    if (this.isDev) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  public showAndFocus() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  public toggleVisibility() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.mainWindow.hide();
      } else {
        this.showAndFocus();
      }
    }
  }
}
