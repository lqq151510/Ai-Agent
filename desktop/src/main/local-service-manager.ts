import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

const DEFAULT_PORT = 8765;

export class LocalServiceManager {
  private process: ChildProcess | null = null;
  private port: number = DEFAULT_PORT;
  private ready: boolean = false;

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

  public isReady(): boolean {
    return this.ready;
  }

  private resolveEntryPath(): string {
    // Production: packed inside app.asar resources
    const prodPath = path.join(process.resourcesPath ?? '', 'local-service', 'dist', 'index.js');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }

    // Development: find local-service from project root
    const devTsPath = path.join(app.getAppPath(), '..', '..', 'local-service', 'src', 'index.ts');
    if (fs.existsSync(devTsPath)) {
      return devTsPath;
    }

    const devJsPath = path.join(app.getAppPath(), '..', '..', 'local-service', 'dist', 'index.js');
    if (fs.existsSync(devJsPath)) {
      return devJsPath;
    }

    throw new Error(`[local-service] Cannot find entry point. Tried:\n  ${prodPath}\n  ${devTsPath}\n  ${devJsPath}`);
  }

  private needsLoader(entryPath: string): boolean {
    return entryPath.endsWith('.ts');
  }
}
