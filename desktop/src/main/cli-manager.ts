import { spawn, ChildProcess } from 'child_process';

export class CliManager {
  private activeProcess: ChildProcess | null = null;

  execute(
    cliEntryPath: string,
    args: string[],
    runtimeEnv: NodeJS.ProcessEnv = {},
  ): Promise<{ exitCode: number; output: string }> {
    if (this.activeProcess) {
      return Promise.resolve({ exitCode: 1, output: 'Another CLI command is already running' });
    }

    return new Promise((resolve) => {
      this.activeProcess = spawn(process.execPath, [cliEntryPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...runtimeEnv,
          ELECTRON_RUN_AS_NODE: '1',
        },
      });

      let output = '';

      this.activeProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      this.activeProcess.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      this.activeProcess.on('close', (code) => {
        this.activeProcess = null;
        resolve({ exitCode: code ?? 1, output });
      });

      this.activeProcess.on('error', (err) => {
        this.activeProcess = null;
        resolve({ exitCode: 1, output: err.message });
      });
    });
  }

  sendInput(input: string) {
    if (this.activeProcess?.stdin?.writable) {
      this.activeProcess.stdin.write(input + '\n');
    }
  }

  killAll() {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
    }
  }
}
