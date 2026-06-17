import * as os from 'os';
import * as pty from 'node-pty';

export class PtyManager {
  private ptyProcess: pty.IPty | null = null;
  private onDataCallback: ((data: string) => void) | null = null;

  constructor() {}

  public spawn() {
    if (this.ptyProcess) return;

    // Default shell for Mac/Linux is bash/zsh, for Windows is powershell/cmd
    const shell = process.env[os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'] || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash');

    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || process.cwd(),
      env: process.env as Record<string, string>,
    });

    this.ptyProcess.onData((data) => {
      if (this.onDataCallback) {
        this.onDataCallback(data);
      }
    });

    this.ptyProcess.onExit(() => {
      this.ptyProcess = null;
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
    }
  }
}
