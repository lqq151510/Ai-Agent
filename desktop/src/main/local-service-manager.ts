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
  private readonly token: string;

  constructor() {
    // 每次启动生成随机令牌，local-service 会校验请求头 Authorization: Bearer <token>
    this.token = crypto.randomBytes(32).toString('hex');
  }

  /**
   * Start the local-service HTTP server.
   * In development, runs via tsx against the source.
   * In production, runs compiled JS from resources.
   */
  public async start(): Promise<number> {
    if (this.process) {
      return this.port;
    }

    const entryPath = this.resolveEntryPath();
    console.log('[local-service] starting from:', entryPath);

    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        LOCAL_SERVICE_PORT: String(this.port),
        LOCAL_SERVICE_TOKEN: this.token,
        NODE_ENV: process.env.NODE_ENV || 'production',
      };

      this.process = fork(entryPath, [], {
        env,
        silent: true,
        execArgv: this.needsLoader(entryPath) ? ['--import', 'tsx/esm'] : [],
      });

      // Capture stdout/stderr for debugging
      this.process.stdout?.on('data', (data: Buffer) => {
        console.log('[local-service stdout]', data.toString().trim());
      });
      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('[local-service stderr]', data.toString().trim());
      });

      // Wait for ready signal
      const timeout = setTimeout(() => {
        reject(new Error('[local-service] timed out waiting for ready signal'));
      }, 10_000);

      this.process.on('message', (msg: any) => {
        if (msg?.type === 'ready') {
          this.port = msg.port ?? DEFAULT_PORT;
          this.ready = true;
          clearTimeout(timeout);
          console.log(`[local-service] ready on port ${this.port}`);
          resolve(this.port);
        }
      });

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        console.error('[local-service] process error:', err);
        reject(err);
      });

      this.process.on('exit', (code) => {
        console.warn(`[local-service] exited with code ${code}`);
        this.process = null;
        this.ready = false;
      });
    });
  }

  public stop() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
      this.ready = false;
    }
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
    if (!this.ready) {
      throw new Error('local-service is not ready');
    }
    const url = `http://127.0.0.1:${this.port}${pathname}`;
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    return fetch(url, { ...init, headers });
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

    throw new Error(`[local-service] Cannot find entry point. Tried:\n  ${prodPath}\n  ${devJsPath}\n  ${devTsPath}`);
  }

  private needsLoader(entryPath: string): boolean {
    return entryPath.endsWith('.ts');
  }
}
