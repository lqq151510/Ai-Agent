import { app } from 'electron';
import * as path from 'path';

export function getResourcePath(): string {
  const configured = process.env.DESKTOP_RESOURCE_ROOT;
  if (configured && configured.trim()) {
    return configured;
  }
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, '..', '..', '..', '..');
}

export function getJrePath(): string {
  const resourceRoot = getResourcePath();
  return path.join(resourceRoot, 'backend-jre', 'jre', 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
}

export function getBackendJarPath(): string {
  const resourceRoot = getResourcePath();
  return path.join(resourceRoot, 'backend-jre', 'backend.jar');
}

export function getCliEntryPath(): string {
  const resourceRoot = getResourcePath();
  return path.join(resourceRoot, 'backend-jre', 'ts-cli', 'dist', 'index.js');
}

export function getDataDir(): string {
  return path.join(app.getPath('userData'), 'data');
}

export function getBackendStartupTimeoutMs(): number {
  const raw = process.env.DESKTOP_BACKEND_READY_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}
