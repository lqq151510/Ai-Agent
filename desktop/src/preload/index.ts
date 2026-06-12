import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  backendStatus: () => ipcRenderer.invoke('backend:status'),
  backendRestart: () => ipcRenderer.invoke('backend:restart'),
  openBackendLogFile: () => ipcRenderer.invoke('backend:open-log-file'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  dataDir: () => ipcRenderer.invoke('app:data-dir'),
  openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),
  backendPort: () => ipcRenderer.invoke('backend:port'),
  cliExecute: (args: string[]) => ipcRenderer.invoke('cli:execute', args),
  cliInput: (input: string) => ipcRenderer.send('cli:input', input),
  onBackendStatusChanged: (callback: (status: any) => void) => {
    ipcRenderer.on('backend:status-changed', (_event, status) => callback(status));
  },
});
