import { app, Tray, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import { WindowManager } from './window-manager';
import { BackendManager } from './backend-manager';
import { getDataDir, getResourcePath } from './utils/env';

export class TrayManager {
  private tray: Tray | null = null;

  constructor(
    private windowManager: WindowManager,
    private backendManager: BackendManager
  ) {}

  public createTray() {
    const iconPath = path.join(getResourcePath(), 'icons', process.platform === 'win32' ? 'codejoy-icon.ico' : 'codejoy-icon-template.png');
    try {
      this.tray = new Tray(iconPath);
    } catch {
      return;
    }

    this.tray.setToolTip('AI Agent');

    // Click the tray icon to toggle the main window visibility.
    this.tray.on('click', () => {
      this.windowManager.toggleVisibility();
    });

    // Rebuild the context menu on right-click so labels reflect the current window state.
    this.tray.on('right-click', () => {
      this.tray?.setContextMenu(this.buildContextMenu());
    });

    this.tray.setContextMenu(this.buildContextMenu());
  }

  private buildContextMenu() {
    const mainWindow = this.windowManager.mainWindow;
    const isVisible = mainWindow?.isVisible() && !mainWindow.isMinimized();

    const template: MenuItemConstructorOptions[] = [
      isVisible
        ? { label: '隐藏主窗口', click: () => { mainWindow?.hide(); } }
        : { label: '显示主窗口', click: () => { this.windowManager.showAndFocus(); } },
      { label: '新建对话', click: () => { this.sendShortcut('new-chat'); } },
      { label: '设置', click: () => { this.sendShortcut('open-settings'); } },
      { type: 'separator' },
      { label: '打开数据目录', click: () => { shell.openPath(getDataDir()); } },
      { label: '打开运行日志', click: () => { shell.showItemInFolder(this.backendManager.getStatus().logPath); } },
      { type: 'separator' },
      {
        label: '重启后端',
        click: () => {
          this.backendManager.restart().catch((error) => {
            console.error('[desktop] backend restart failed', error);
          });
        },
      },
      { type: 'separator' },
      { label: '退出', click: () => { app.quit(); } },
    ];

    return Menu.buildFromTemplate(template);
  }

  private sendShortcut(action: string) {
    this.windowManager.showAndFocus();
    this.windowManager.mainWindow?.webContents.send('app:shortcut', { action });
  }
}
