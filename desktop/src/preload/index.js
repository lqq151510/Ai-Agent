"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    backendStatus: () => electron_1.ipcRenderer.invoke('backend:status'),
    backendRestart: () => electron_1.ipcRenderer.invoke('backend:restart'),
    appVersion: () => electron_1.ipcRenderer.invoke('app:version'),
    dataDir: () => electron_1.ipcRenderer.invoke('app:data-dir'),
    openDataDir: () => electron_1.ipcRenderer.invoke('app:open-data-dir'),
    cliExecute: (args) => electron_1.ipcRenderer.invoke('cli:execute', args),
    cliInput: (input) => electron_1.ipcRenderer.send('cli:input', input),
    onBackendStatusChanged: (callback) => {
        electron_1.ipcRenderer.on('backend:status-changed', (_event, status) => callback(status));
    },
});
