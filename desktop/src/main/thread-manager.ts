import * as path from 'path';
import * as fs from 'fs';
import { getDataDir } from './utils/env';
import { WorktreeManager, WorktreeMode } from './worktree-manager';
import { PtyPool } from './pty-pool';
import { GitManager } from './git-manager';

// --------------- Types ---------------

export type ThreadStatus = 'idle' | 'running' | 'blocked' | 'error' | 'done';
export type ThreadMode = 'local' | 'worktree';

export type BackendSessionRef = {
  id: string;
  title: string;
};

export type Thread = {
  id: string;
  name: string;
  status: ThreadStatus;
  mode: ThreadMode;
  projectPath: string;
  worktreePath: string | null;
  backendSession: BackendSessionRef | null;
  terminalId: string | null;
  branch: string;
  createdAt: number;
  updatedAt: number;
};

export type ThreadSummary = {
  id: string;
  name: string;
  status: ThreadStatus;
  mode: ThreadMode;
  branch: string;
  projectName: string;
  updatedAt: number;
};

type ThreadCreateOptions = {
  name: string;
  projectPath: string;
  mode?: ThreadMode;
  backendSession?: BackendSessionRef;
};

type ThreadPersistData = {
  threads: Record<string, Omit<Thread, 'terminalId'>>; // terminal is runtime-only
  activeThreadId: string | null;
};

// --------------- Event ---------------

export type ThreadEventCallback = (thread: Thread) => void;

// --------------- ThreadManager ---------------

/**
 * Manages multiple agent threads. Each thread can be:
 * - local mode  → works directly in the project directory
 * - worktree mode → creates an isolated git worktree at
 *   <dataDir>/worktrees/<project-hash>/<thread-id>/ on branch codex/<name>
 *
 * Each thread is associated with:
 * - A backend Session (for chat history)
 * - A PTY terminal (for command execution)
 * - An optional worktree (for file isolation)
 */
export class ThreadManager {
  private threadsDir: string;
  private threads = new Map<string, Thread>();
  private activeThreadId: string | null = null;

  private worktreeManager: WorktreeManager;
  private ptyPool: PtyPool;
  private gitManager: GitManager;

  private listeners = new Set<ThreadEventCallback>();

  constructor(ptyPool: PtyPool, gitManager: GitManager) {
    this.threadsDir = path.join(getDataDir(), 'threads');
    fs.mkdirSync(this.threadsDir, { recursive: true });
    this.worktreeManager = new WorktreeManager();
    this.ptyPool = ptyPool;
    this.gitManager = gitManager;
    this.loadAll();
  }

  // ---- Public API ----

  /**
   * Create a new thread. In worktree mode, automatically creates a git worktree.
   */
  public async createThread(options: ThreadCreateOptions): Promise<Thread> {
    const { name, projectPath, mode: reqMode, backendSession } = options;
    const mode: ThreadMode = reqMode ?? 'worktree';
    const id = this.generateId();
    const branch = mode === 'worktree'
      ? WorktreeManager.threadBranchName(name, id)
      : 'main';

    // 1. Optionally create git worktree
    let worktreePath: string | null = null;
    if (mode === 'worktree') {
      try {
        const wt = await this.worktreeManager.create(projectPath, branch, id);
        if (wt) {
          worktreePath = wt.path;
        } else {
          console.warn('[thread] worktree creation returned null, falling back to local');
        }
      } catch (err) {
        console.warn('[thread] worktree creation failed, falling back to local:', err);
      }
    }

    // 2. Determine the working directory for the terminal
    const terminalCwd = worktreePath || projectPath;

    // 3. Spawn a PTY for this thread
    let terminalId: string | null = null;
    try {
      terminalId = this.ptyPool.spawn(id, terminalCwd, name);
    } catch (err) {
      console.warn('[thread] PTY spawn failed:', err);
    }

    // 4. Build the thread object
    const now = Date.now();
    const thread: Thread = {
      id,
      name,
      status: 'idle',
      mode,
      projectPath,
      worktreePath,
      backendSession: backendSession ?? null,
      terminalId,
      branch,
      createdAt: now,
      updatedAt: now,
    };

    this.threads.set(id, thread);
    this.activeThreadId = id;
    this.persistAll();
    this.emit(thread);
    console.log(`[thread] created ${id} ("${name}") mode=${mode} branch=${branch}`);

    return thread;
  }

  /**
   * Remove a thread: kill its terminal, remove its worktree, delete persisted data.
   */
  public async removeThread(id: string): Promise<void> {
    const thread = this.threads.get(id);
    if (!thread) return;

    // 1. Kill terminal
    if (thread.terminalId) {
      this.ptyPool.kill(thread.terminalId);
    }

    // 2. Remove worktree
    if (thread.worktreePath) {
      await this.worktreeManager.remove(thread.projectPath, thread.worktreePath).catch(err => {
        console.warn('[thread] worktree removal failed:', err);
      });
    }

    // 3. Remove persisted file
    const filePath = path.join(this.threadsDir, `${id}.json`);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // already gone
    }

    this.threads.delete(id);
    if (this.activeThreadId === id) {
      // Switch to the next available thread or null
      const remaining = Array.from(this.threads.keys());
      this.activeThreadId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }

    console.log(`[thread] removed ${id}`);
  }

  /**
   * Get a thread by id.
   */
  public getThread(id: string): Thread | undefined {
    return this.threads.get(id);
  }

  /**
   * Get all threads as a list, most recently updated first.
   */
  public listThreads(): Thread[] {
    return Array.from(this.threads.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get summaries for the UI sidebar.
   */
  public listThreadSummaries(): ThreadSummary[] {
    return this.listThreads().map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      mode: t.mode,
      branch: t.branch,
      projectName: t.projectPath.split('/').pop() || t.projectPath,
      updatedAt: t.updatedAt,
    }));
  }

  /**
   * Get the currently active thread.
   */
  public getActiveThread(): Thread | undefined {
    if (!this.activeThreadId) return undefined;
    return this.threads.get(this.activeThreadId);
  }

  /**
   * Switch the active thread. Returns true on success.
   */
  public switchThread(id: string): boolean {
    if (!this.threads.has(id)) return false;
    this.activeThreadId = id;
    this.persistAll();
    const thread = this.threads.get(id)!;
    this.emit(thread);
    return true;
  }

  /**
   * Update thread status.
   */
  public setThreadStatus(id: string, status: ThreadStatus): void {
    const thread = this.threads.get(id);
    if (!thread) return;
    thread.status = status;
    thread.updatedAt = Date.now();
    this.persistAll();
    this.emit(thread);
  }

  /**
   * Update the backend session reference for a thread.
   */
  public setBackendSession(id: string, session: BackendSessionRef): void {
    const thread = this.threads.get(id);
    if (!thread) return;
    thread.backendSession = session;
    thread.updatedAt = Date.now();
    this.persistAll();
  }

  /**
   * Update thread name.
   */
  public renameThread(id: string, name: string): void {
    const thread = this.threads.get(id);
    if (!thread) return;
    thread.name = name;
    thread.updatedAt = Date.now();
    this.persistAll();
    this.emit(thread);
  }

  /**
   * Register a listener for thread state changes.
   */
  public onThreadEvent(callback: ThreadEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // ---- Persistence ----

  private generateId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `thr-${id}`;
  }

  private threadFilePath(id: string): string {
    return path.join(this.threadsDir, `${id}.json`);
  }

  private persistAll(): void {
    for (const thread of this.threads.values()) {
      try {
        // Persist everything except terminalId (runtime-only)
        const { terminalId: _t, ...persistable } = thread;
        fs.writeFileSync(this.threadFilePath(thread.id), JSON.stringify(persistable, null, 2));
      } catch (err) {
        console.error(`[thread] failed to persist ${thread.id}:`, err);
      }
    }

    // Persist active thread id separately
    try {
      fs.writeFileSync(
        path.join(this.threadsDir, '_active.json'),
        JSON.stringify({ activeThreadId: this.activeThreadId }),
      );
    } catch {
      // ignore
    }
  }

  private loadAll(): void {
    try {
      // Load active thread id
      const activePath = path.join(this.threadsDir, '_active.json');
      if (fs.existsSync(activePath)) {
        const data = JSON.parse(fs.readFileSync(activePath, 'utf8')) as { activeThreadId: string | null };
        this.activeThreadId = data.activeThreadId;
      }
    } catch {
      // ignore
    }

    try {
      const files = fs.readdirSync(this.threadsDir);
      for (const file of files) {
        if (!file.endsWith('.json') || file.startsWith('_')) continue;
        try {
          const data = fs.readFileSync(path.join(this.threadsDir, file), 'utf8');
          const thread = JSON.parse(data) as Thread;
          // terminalId is runtime-only — will be recreated on demand
          thread.terminalId = null;
          this.threads.set(thread.id, thread);
        } catch {
          // skip corrupt files
        }
      }
    } catch {
      // threads dir might not exist yet
    }

    console.log(`[thread] loaded ${this.threads.size} thread(s) from disk`);
  }

  private emit(thread: Thread): void {
    for (const cb of this.listeners) {
      try { cb(thread); } catch { /* guard */ }
    }
  }
}
