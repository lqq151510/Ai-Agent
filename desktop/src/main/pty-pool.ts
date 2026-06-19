import * as os from 'os';
import * as fs from 'fs';
import * as pty from 'node-pty';

// --------------- Types ---------------

export type PtyDataCallback = (data: string) => void;

export type PtyInstance = {
  id: string;
  process: pty.IPty;
  cwd: string;
  threadId: string;
  label: string;
};

// --------------- PtyPool ---------------

/**
 * Manages multiple PTY (pseudo-terminal) instances, one per thread.
 *
 * Replaces the singleton PtyManager with a keyed pool so each thread
 * gets its own shell session with independent cwd, history, and env.
 */
export class PtyPool {
  private instances = new Map<string, PtyInstance>();
  private dataCallbacks = new Map<string, PtyDataCallback>();

  constructor() {}

  // ---- Lifecycle ----

  /**
   * Spawn a new PTY for a thread. If one already exists for the same threadId,
   * it is killed and replaced (allows re-spawning if the worktree moved).
   */
  public spawn(threadId: string, cwd: string, label?: string): string {
    const existing = this.findByThreadId(threadId);
    if (existing) {
      if (existing.cwd === cwd) {
        return existing.id; // already has the right terminal
      }
      this.kill(existing.id);
    }

    const shell = this.resolveShell();

    // Capture Node.js process.env before any local `process` var shadows it
    const nodeEnv = process.env as Record<string, string>;
    const nodeHome = process.env.HOME || process.cwd();
    const terminalId = `pty-${threadId}-${Date.now()}`;

    const shellProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: cwd && fs.existsSync(cwd) ? cwd : nodeHome,
      env: nodeEnv,
    });

    const instance: PtyInstance = {
      id: terminalId,
      process: shellProcess,
      cwd,
      threadId,
      label: label || threadId,
    };

    this.instances.set(terminalId, instance);

    shellProcess.onData((data: string) => {
      const cb = this.dataCallbacks.get(terminalId);
      if (cb) cb(data);
    });

    shellProcess.onExit(() => {
      this.instances.delete(terminalId);
      this.dataCallbacks.delete(terminalId);
    });

    console.log(`[pty] spawned ${terminalId} for thread ${threadId} @ ${cwd}`);
    return terminalId;
  }

  /**
   * Kill a specific terminal.
   */
  public kill(terminalId: string): void {
    const inst = this.instances.get(terminalId);
    if (!inst) return;
    try {
      inst.process.kill();
    } catch {
      // already dead
    }
    this.instances.delete(terminalId);
    this.dataCallbacks.delete(terminalId);
    console.log(`[pty] killed ${terminalId}`);
  }

  /**
   * Kill all terminals (called on app quit).
   */
  public killAll(): void {
    for (const [id] of this.instances) {
      this.kill(id);
    }
  }

  // ---- I/O ----

  /**
   * Write data to a specific terminal's stdin.
   */
  public write(terminalId: string, data: string): void {
    const inst = this.instances.get(terminalId);
    if (inst) {
      inst.process.write(data);
    }
  }

  /**
   * Resize a specific terminal.
   */
  public resize(terminalId: string, cols: number, rows: number): void {
    const inst = this.instances.get(terminalId);
    if (inst) {
      try {
        inst.process.resize(cols, rows);
      } catch {
        // ignore resize errors on dead terminals
      }
    }
  }

  /**
   * Register a data callback for a terminal. Each terminal has at most one.
   */
  public onData(terminalId: string, callback: PtyDataCallback): void {
    this.dataCallbacks.set(terminalId, callback);
  }

  // ---- Queries ----

  /**
   * Get instance by terminal id.
   */
  public get(terminalId: string): PtyInstance | undefined {
    return this.instances.get(terminalId);
  }

  /**
   * Find a terminal by its thread id. Returns the most recent match.
   */
  public findByThreadId(threadId: string): PtyInstance | undefined {
    // Iterate in insertion order and keep overwriting to get the latest
    let found: PtyInstance | undefined;
    for (const inst of this.instances.values()) {
      if (inst.threadId === threadId) {
        found = inst;
      }
    }
    return found;
  }

  /**
   * List all active terminals.
   */
  public list(): PtyInstance[] {
    return Array.from(this.instances.values());
  }

  // ---- Private ----

  private resolveShell(): string {
    if (os.platform() === 'win32') {
      return process.env.COMSPEC || 'powershell.exe';
    }

    const candidates = [
      process.env.SHELL,
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh',
    ].filter((v): v is string => Boolean(v));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    return '/bin/sh';
  }
}
