import { fork, ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

const DEFAULT_PORT = 8765;

export class LocalServiceManager {
  private process: ChildProcess | null = null;
  private port: number = DEFAULT_PORT;
  private ready: boolean = false;
  private workspaceRoot: string | null = null;
  private readonly token: string;
  private operation: Promise<void> = Promise.resolve();

  constructor() {
    // 每次启动生成随机令牌，local-service 会校验请求头 Authorization: Bearer <token>
    this.token = crypto.randomBytes(32).toString('hex');
  }

  /**
   * Start the local-service HTTP server.
   * In development, runs via tsx against the source.
   * In production, runs compiled JS from resources.
   */
  public async start(workspaceRoot: string): Promise<number> {
    return this.enqueue(async () => {
      await this.startInternal(workspaceRoot);
      return this.port;
    });
  }

  public async ensureWorkspace(workspaceRoot: string): Promise<void> {
    await this.enqueue(() => this.startInternal(workspaceRoot));
  }

  public getWorkspaceRoot(): string | null {
    return this.workspaceRoot;
  }

  public async fetchForWorkspace(workspaceRoot: string, pathname: string, init?: RequestInit): Promise<Response> {
    return this.enqueue(async () => {
      await this.startInternal(workspaceRoot);
      return this.fetchReady(pathname, init);
    });
  }

  private async startInternal(workspaceRoot: string): Promise<void> {
    const canonicalRoot = fs.realpathSync(workspaceRoot);
    if (!fs.statSync(canonicalRoot).isDirectory()) {
      throw new Error('[local-service] workspace root must be a directory');
    }
    if (this.process && this.workspaceRoot === canonicalRoot) {
      if (this.ready) return;
    }
    if (this.process) await this.stopInternal();

    const entryPath = this.resolveEntryPath();
    console.log('[local-service] starting from:', entryPath);

    await new Promise<void>((resolve, reject) => {
      const env = {
        ...process.env,
        LOCAL_SERVICE_PORT: String(this.port),
        LOCAL_SERVICE_TOKEN: this.token,
        LOCAL_SERVICE_WORKSPACE_ROOT: canonicalRoot,
        NODE_ENV: process.env.NODE_ENV || 'production',
      };

      const child = fork(entryPath, [], {
        env,
        silent: true,
        execArgv: this.needsLoader(entryPath) ? ['--import', 'tsx/esm'] : [],
      });
      this.process = child;

      // Capture stdout/stderr for debugging
      child.stdout?.on('data', (data: Buffer) => {
        console.log('[local-service stdout]', data.toString().trim());
      });
      child.stderr?.on('data', (data: Buffer) => {
        console.error('[local-service stderr]', data.toString().trim());
      });

      // Wait for ready signal
      const timeout = setTimeout(() => {
        void this.stopChild(child).finally(() => {
          reject(new Error('[local-service] timed out waiting for ready signal'));
        });
      }, 10_000);

      child.on('message', (msg: any) => {
        if (msg?.type === 'ready') {
           this.port = msg.port ?? DEFAULT_PORT;
           this.ready = true;
           this.workspaceRoot = canonicalRoot;
           clearTimeout(timeout);
          console.log(`[local-service] ready on port ${this.port}`);
           resolve();
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        void this.stopChild(child).finally(() => reject(new Error('[local-service] process failed to start')));
      });

      child.on('exit', (code) => {
        console.warn(`[local-service] exited with code ${code}`);
        if (this.process === child) {
          this.process = null;
          this.ready = false;
          this.workspaceRoot = null;
        }
      });
    });
  }

  public async stop(): Promise<void> {
    await this.enqueue(() => this.stopInternal());
  }

  public getPort(): number {
    return this.port;
  }

  public getToken(): string {
    return this.token;
  }

  public isReady(): boolean {
    return this.ready;
  }

  /**
   * Unified authenticated fetch for local-service endpoints.
   * All callers must use this method instead of building URLs/headers manually.
   */
  public async fetch(pathname: string, init?: RequestInit): Promise<Response> {
    return this.fetchReady(pathname, init);
  }

  private async fetchReady(pathname: string, init?: RequestInit): Promise<Response> {
    if (!this.ready) {
      throw new Error('local-service is not ready');
    }
    const url = `http://127.0.0.1:${this.port}${pathname}`;
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    return fetch(url, { ...init, headers });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  private async stopInternal(): Promise<void> {
    const child = this.process;
    if (!child) {
      this.ready = false;
      this.workspaceRoot = null;
      return;
    }
    this.process = null;
    this.ready = false;
    this.workspaceRoot = null;
    await this.stopChild(child);
  }

  private stopChild(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(killTimeout);
        resolve();
      };
      const killTimeout = setTimeout(() => child.kill('SIGKILL'), 2_000);
      child.once('exit', finish);
      child.kill('SIGTERM');
    });
  }

  private resolveEntryPath(): string {
    // Production: copied with backend-jre extraResources.
    const prodPath = path.join(process.resourcesPath ?? '', 'backend-jre', 'local-service', 'dist', 'index.js');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }

    // Development: find local-service from project root
    const devJsPath = path.join(app.getAppPath(), '..', 'local-service', 'dist', 'index.js');
    if (fs.existsSync(devJsPath)) {
      return devJsPath;
    }

    const devTsPath = path.join(app.getAppPath(), '..', 'local-service', 'src', 'index.ts');
    if (fs.existsSync(devTsPath)) {
      return devTsPath;
    }

    throw new Error('[local-service] Cannot find entry point');
  }

  private needsLoader(entryPath: string): boolean {
    return entryPath.endsWith('.ts');
  }
}
