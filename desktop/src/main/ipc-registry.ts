import { app, ipcMain, shell } from 'electron';
import { BackendManager } from './backend-manager';
import { CliManager } from './cli-manager';
import { getDataDir, getCliEntryPath } from './utils/env';

export class IpcRegistry {
  constructor(
    private backendManager: BackendManager,
    private cliManager: CliManager,
    private getActivePort: () => number
  ) {}

  public setupIpc() {
    ipcMain.handle('backend:status', () => this.backendManager.getStatus());
    ipcMain.handle('backend:restart', () => this.backendManager.restart());
    ipcMain.handle('backend:open-log-file', () => shell.showItemInFolder(this.backendManager.getStatus().logPath));
    
    ipcMain.handle('app:version', () => app.getVersion());
    ipcMain.handle('app:data-dir', () => getDataDir());
    ipcMain.handle('app:open-data-dir', () => {
      shell.openPath(getDataDir());
    });
    
    ipcMain.handle('backend:port', () => this.getActivePort());
    
    ipcMain.handle('cli:execute', (_event, args: string[]) => {
      return this.cliManager.execute(getCliEntryPath(), args);
    });
    
    ipcMain.on('cli:input', (_event, input: string) => {
      this.cliManager.sendInput(input);
    });
  }
}
