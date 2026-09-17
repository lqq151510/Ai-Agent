import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { DesktopSecrets } from './utils/secrets';
import type { LocalBackendEndpoint } from './utils/local-backend-endpoint';

export type BackendStatus = 'starting' | 'running' | 'stopped' | 'error';
export type BackendMode = 'managed' | 'attached';

export type BackendStatusSnapshot = {
  status: BackendStatus;
  mode: BackendMode;
  port: number;
  pid: number | null;
  dataDir: string;
  healthUrl: string;
  logPath: string;
  logs: string;
  startedAt: string | null;
  lastReadyAt: string | null;
  lastExitAt: string | null;
  lastExitCode: number | null;
  lastError: string | null;
  restartCount: number;
  startupTimeoutMs: number;
};

type BackendManagerOptions = {
  startupTimeoutMs?: number;
  healthCheckIntervalMs?: number;
  logTailSize?: number;
  secrets?: DesktopSecrets;
  attachedBackend?: LocalBackendEndpoint;
};

export class BackendManager {
  private process: ChildProcess | null = null;
  private status: BackendStatus = 'stopped';
  private readonly jrePath: string;
  private readonly jarPath: string;
  private readonly dataDir: string;
  private readonly port: number;
  private readonly logPath: string;
  private readonly baseUrl: string;
  private readonly healthUrl: string;
  private readonly mode: BackendMode;
  private readonly startupTimeoutMs: number;
  private readonly healthCheckIntervalMs: number;
  private readonly maxLogSize: number;
  private readonly secrets: DesktopSecrets | undefined;
  private logBuffer: string[] = [];
  private startedAt: string | null = null;
  private lastReadyAt: string | null = null;
  private lastExitAt: string | null = null;
  private lastExitCode: number | null = null;
  private lastError: string | null = null;
  private restartCount = 0;
  private readonly listeners = new Set<(status: BackendStatusSnapshot) => void>();

  constructor(jrePath: string, jarPath: string, dataDir: string, port: number, options: BackendManagerOptions) {
    this.jrePath = jrePath;
    this.jarPath = jarPath;
    this.dataDir = dataDir;
    this.port = port;
    if (options.attachedBackend && options.attachedBackend.port !== port) {
      throw new Error('Attached backend port must match the active desktop port');
    }
    this.mode = options.attachedBackend ? 'attached' : 'managed';
    this.baseUrl = options.attachedBackend?.baseUrl ?? `http://127.0.0.1:${this.port}`;
    this.logPath = path.join(this.dataDir, 'logs', 'desktop-runtime.log');
    this.healthUrl = `${this.baseUrl}/api/v1/system/health/ready`;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 60_000;
    this.healthCheckIntervalMs = options.healthCheckIntervalMs ?? 1_000;
    this.maxLogSize = options.logTailSize ?? 500;
    this.secrets = options.secrets;
  }

  onStatusChange(listener: (status: BackendStatusSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    if (this.status === 'starting' || this.status === 'running') {
      return;
    }

    if (this.mode === 'attached') {
      await this.connectAttachedBackend();
      return;
    }

    const secrets = this.secrets;
    if (!secrets) {
      const message = 'Managed backend requires desktop runtime secrets';
      this.lastError = message;
      this.setStatus('error');
      throw new Error(message);
    }

    this.prepareStart(`Starting managed backend on port ${this.port}`);

    const args = [
      '-jar', this.jarPath,
      '--spring.profiles.active=desktop',
      `--server.port=${this.port}`,
      '--server.address=127.0.0.1',
      `--app.data-dir=${this.dataDir}`,
    ];

    this.process = spawn(this.jrePath, args, {
      // Finder and `open` do not guarantee a writable process working directory.
      // The backend still has a relative Logback file appender, so anchor it in
      // the Desktop runtime directory instead of inheriting `/` from the launcher.
      cwd: this.dataDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SPRING_OUTPUT_ANSI_ENABLED: 'never',
        APP_DESKTOP_MODE: 'true',
        JWT_SECRET: secrets.jwtSecret,
        SECURITY_DB_ENCRYPTION_KEY: secrets.dbEncryptionKey,
      },
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.appendLog('stdout', data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.appendLog('stderr', data.toString());
    });

    this.process.on('close', (code) => {
      this.lastExitCode = code ?? null;
      this.lastExitAt = new Date().toISOString();
      this.appendLog('system', `Backend process exited with code ${code ?? 'null'}`);
      this.process = null;
      if (this.status !== 'stopped') {
        this.setStatus(code === 0 ? 'stopped' : 'error');
      } else {
        this.emitStatusChange();
      }
    });

    this.process.on('error', (err) => {
      this.lastError = err.message;
      this.lastExitAt = new Date().toISOString();
      this.appendLog('system', `Backend process error: ${err.message}`);
      this.process = null;
      this.setStatus('error');
    });

    try {
      await this.waitForReady(this.startupTimeoutMs);
      this.lastReadyAt = new Date().toISOString();
      this.appendLog('system', `Backend ready: ${this.healthUrl}`);
      this.setStatus('running');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      this.appendLog('system', `Backend failed to start: ${message}`);
      await this.stopProcess('SIGKILL');
      this.setStatus('error');
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.mode === 'attached') {
      if (this.status !== 'stopped') {
        this.ensureRuntimeDirs();
        this.appendLog('system', 'Detached from externally managed backend without stopping it');
      }
      this.setStatus('stopped');
      return;
    }

    if (!this.process) {
      this.setStatus('stopped');
      return;
    }

    this.appendLog('system', 'Stopping backend process');
    this.setStatus('stopped');
    await this.stopProcess('SIGTERM');
  }

  async restart(): Promise<void> {
    this.restartCount += 1;
    this.ensureRuntimeDirs();
    this.appendLog('system', `Restart requested (#${this.restartCount})`);
    if (this.mode === 'attached') {
      await this.connectAttachedBackend();
      return;
    }
    await this.stop();
    await this.start();
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getStatus(): BackendStatusSnapshot {
    return {
      status: this.status,
      mode: this.mode,
      port: this.port,
      pid: this.process?.pid ?? null,
      dataDir: this.dataDir,
      healthUrl: this.healthUrl,
      logPath: this.logPath,
      logs: this.logBuffer.join(''),
      startedAt: this.startedAt,
      lastReadyAt: this.lastReadyAt,
      lastExitAt: this.lastExitAt,
      lastExitCode: this.lastExitCode,
      lastError: this.lastError,
      restartCount: this.restartCount,
      startupTimeoutMs: this.startupTimeoutMs,
    };
  }

  private async connectAttachedBackend(): Promise<void> {
    this.prepareStart(`Connecting to externally managed backend at ${this.baseUrl}`);
    try {
      await this.waitForReady(this.startupTimeoutMs);
      this.lastReadyAt = new Date().toISOString();
      this.appendLog('system', `Attached backend ready: ${this.healthUrl}`);
      this.setStatus('running');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      this.appendLog('system', `Attached backend did not become ready: ${message}`);
      this.setStatus('error');
      throw error;
    }
  }

  private prepareStart(message: string) {
    this.ensureRuntimeDirs();
    this.setStatus('starting');
    this.logBuffer = [];
    this.lastError = null;
    this.lastExitCode = null;
    this.lastExitAt = null;
    this.startedAt = new Date().toISOString();
    this.appendLog('system', message);
  }

  private ensureRuntimeDirs() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
  }

  private setStatus(nextStatus: BackendStatus) {
    this.status = nextStatus;
    this.emitStatusChange();
  }

  private emitStatusChange() {
    const snapshot = this.getStatus();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async waitForReady(timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const ready = await this.checkHealth(this.healthUrl);
      if (ready) {
        return;
      }
      await this.sleep(this.healthCheckIntervalMs);
    }
    throw new Error(`Backend did not become ready within ${timeoutMs}ms`);
  }

  private checkHealth(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3_000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private appendLog(source: 'stdout' | 'stderr' | 'system', text: string) {
    const entries = text
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => `[${new Date().toISOString()}] [${source}] ${line}`);
    if (entries.length === 0) {
      return;
    }

    this.logBuffer.push(...entries.map((line) => `${line}\n`));
    if (this.logBuffer.length > this.maxLogSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxLogSize);
    }
    fs.appendFileSync(this.logPath, `${entries.join('\n')}\n`, 'utf8');
    this.emitStatusChange();
  }

  private stopProcess(signal: NodeJS.Signals): Promise<void> {
    const child = this.process;
    if (!child) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
      }, 10_000);

      child.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });

      child.kill(signal);
    });
  }
}
