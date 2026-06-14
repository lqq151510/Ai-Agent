import { app, Tray, Menu, shell } from 'electron';
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
    const iconPath = path.join(getResourcePath(), 'icons', process.platform === 'win32' ? 'icon.ico' : 'iconTemplate.png');
    try {
      this.tray = new Tray(iconPath);
    } catch {
      return;
    }

    const contextMenu = Menu.buildFromTemplate([
      { label: '显示窗口', click: () => { this.windowManager.showAndFocus(); } },
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
    ]);

    this.tray.setToolTip('AI Agent');
    this.tray.setContextMenu(contextMenu);
    this.tray.on('click', () => { this.windowManager.showAndFocus(); });
  }
}
