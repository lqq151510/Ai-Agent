import * as os from 'os';
import * as fs from 'fs';
import * as pty from 'node-pty';

export class PtyManager {
  private ptyProcess: pty.IPty | null = null;
  private onDataCallback: ((data: string) => void) | null = null;
  private currentCwd: string | null = null;

  constructor() {}

  public spawn(cwd?: string) {
    const nextCwd = cwd && fs.existsSync(cwd) ? cwd : (process.env.HOME || process.cwd());
    if (this.ptyProcess) {
      if (this.currentCwd === nextCwd) {
        return;
      }
      this.kill();
    }

    // Default shell for Mac/Linux is bash/zsh, for Windows is powershell/cmd
    const shell = this.resolveShell();

    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: nextCwd,
      env: process.env as Record<string, string>,
    });
    this.currentCwd = nextCwd;

    this.ptyProcess.onData((data) => {
      if (this.onDataCallback) {
        this.onDataCallback(data);
      }
    });

    this.ptyProcess.onExit(() => {
      this.ptyProcess = null;
      this.currentCwd = null;
    });
  }

  public onData(callback: (data: string) => void) {
    this.onDataCallback = callback;
  }

  public write(data: string) {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  public resize(cols: number, rows: number) {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.resize(cols, rows);
      } catch (err) {
        console.error('Failed to resize pty:', err);
      }
    }
  }

  public kill() {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
      this.currentCwd = null;
    }
  }

  private resolveShell(): string {
    if (os.platform() === 'win32') {
      return process.env.COMSPEC || 'powershell.exe';
    }

    const candidates = [
      process.env.SHELL,
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh',
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return '/bin/sh';
  }
}
