import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const MAX_MANAGED_SOURCE_FOLDERS = 5;
const MAX_MANAGED_SOURCE_FILE_BYTES = 20 * 1024 * 1024;
const DEFAULT_STABILITY_DELAY_MS = 750;
const DEFAULT_SCAN_INTERVAL_MS = 5 * 60 * 1000;
const PRIVATE_STATE_VERSION = 1;
const OPAQUE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_SOURCE_FILE_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.pdf',
  '.txt',
  '.html',
  '.htm',
  '.docx',
  '.pptx',
]);

export type ManagedSourceAssetOrigin = 'picker' | 'watched_folder';
export type ManagedSourceFolderStatus = 'watching' | 'scanning' | 'disabled' | 'error';

export type ManagedSourceFolderCounts = {
  waiting: number;
  importing: number;
  imported: number;
  skipped: number;
  failed: number;
};

export type ManagedSourceFolderPublic = {
  id: string;
  label: string;
  enabled: boolean;
  status: ManagedSourceFolderStatus;
  lastScanAt?: string;
  counts?: ManagedSourceFolderCounts;
};

export type ManagedSourceFolderListResponse = {
  folders: ManagedSourceFolderPublic[];
};

export type ManagedSourceReadResult = {
  content: Buffer;
  size: number;
  modifiedAtMs: number;
};

export type ManagedSourceUploadRequest = {
  sourceAssetId: string;
  sourceAssetOrigin: ManagedSourceAssetOrigin;
  filename: string;
  mediaType: string;
  content: Buffer;
  title?: string;
};

export type ManagedSourceUploadResult = {
  outcome: 'imported' | 'skipped';
  item?: unknown;
};

export type ManagedSourceManagerOptions = {
  dataDirectory: string;
  readSourceFile: (sourcePath: string) => Promise<ManagedSourceReadResult>;
  uploadManagedSource: (request: ManagedSourceUploadRequest) => Promise<ManagedSourceUploadResult>;
  openPath?: (sourcePath: string) => Promise<string>;
  revealPath?: (sourcePath: string) => void;
  stabilityDelayMs?: number;
  scanIntervalMs?: number;
};

type SourceFileCursor = {
  size: number;
  modifiedAtMs: number;
  inode: number;
};

type ManagedSourceFolderPrivate = {
  id: string;
  label: string;
  directoryPath: string;
  enabled: boolean;
  status: ManagedSourceFolderStatus;
  lastScanAt?: string;
  counts: ManagedSourceFolderCounts;
  cursor: Record<string, SourceFileCursor>;
};

type ManagedSourceFolderState = {
  version: number;
  folders: ManagedSourceFolderPrivate[];
};

type ManagedAssetStatus = 'pending' | 'available';

type ManagedSourceAssetPrivate = {
  id: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  origin: ManagedSourceAssetOrigin;
  storageFileName: string;
  status: ManagedAssetStatus;
  createdAt: string;
};

type ManagedSourceAssetState = {
  version: number;
  assets: Record<string, ManagedSourceAssetPrivate>;
};

type ManagedSourcePendingUpload = {
  assetId: string;
  title?: string;
  folderId?: string;
  sourceName?: string;
  sourceCursor?: SourceFileCursor;
};

type ManagedSourcePendingState = {
  version: number;
  pending: ManagedSourcePendingUpload[];
};

type WatchedCandidate = {
  filename: string;
  content: Buffer;
  cursor: SourceFileCursor;
};

type StoredAsset = {
  asset: ManagedSourceAssetPrivate;
  pending: ManagedSourcePendingUpload;
};

function emptyCounts(): ManagedSourceFolderCounts {
  return { waiting: 0, importing: 0, imported: 0, skipped: 0, failed: 0 };
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_ID_PATTERN.test(value);
}

function isWithinOrEqual(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isDirectChild(candidate: string, root: string): boolean {
  return path.dirname(candidate) === root;
}

function isHiddenName(name: string): boolean {
  return name.startsWith('.');
}

function supportedSourceFile(name: string): boolean {
  return SUPPORTED_SOURCE_FILE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function mediaTypeForSourceFile(name: string): string {
  const extension = path.extname(name).toLowerCase();
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.md' || extension === '.markdown') return 'text/markdown';
  if (extension === '.html' || extension === '.htm') return 'text/html';
  if (extension === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (extension === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  return 'text/plain';
}

function safeDisplayName(value: string): string {
  const basename = path.basename(value).trim();
  return basename || 'untitled';
}

/**
 * Main-process-only store for original Knowledge Desk documents.
 *
 * Absolute paths, source cursors, stored file names, and failures from the
 * filesystem never leave this class. The renderer only receives the public
 * folder DTO below and opaque asset IDs are only accepted for open/reveal.
 */
export class KnowledgeSourceManager {
  private readonly privateRoot: string;
  private readonly managedAssetsDirectory: string;
  private readonly stagingDirectory: string;
  private readonly folderStatePath: string;
  private readonly assetStatePath: string;
  private readonly pendingStatePath: string;
  private readonly stabilityDelayMs: number;
  private readonly scanIntervalMs: number;
  private folders: ManagedSourceFolderPrivate[] = [];
  private assets: Record<string, ManagedSourceAssetPrivate> = {};
  private pending: ManagedSourcePendingUpload[] = [];
  private readonly watchers = new Map<string, fs.FSWatcher>();
  private readonly scanPromises = new Map<string, Promise<void>>();
  private readonly scanDebounces = new Map<string, ReturnType<typeof setTimeout>>();
  private importQueue: Promise<void> = Promise.resolve();
  private privateWriteQueue: Promise<void> = Promise.resolve();
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(private readonly options: ManagedSourceManagerOptions) {
    this.privateRoot = path.resolve(options.dataDirectory, 'knowledge-sources');
    this.managedAssetsDirectory = path.join(this.privateRoot, 'assets');
    this.stagingDirectory = path.join(this.privateRoot, 'staging');
    this.folderStatePath = path.join(this.privateRoot, 'folders.json');
    this.assetStatePath = path.join(this.privateRoot, 'assets.json');
    this.pendingStatePath = path.join(this.privateRoot, 'pending.json');
    this.stabilityDelayMs = Math.max(0, options.stabilityDelayMs ?? DEFAULT_STABILITY_DELAY_MS);
    this.scanIntervalMs = Math.max(1_000, options.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS);
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.ensurePrivateLayout();
    await this.loadPrivateState();
    await this.removeStaleStagingFiles();
    this.initialized = true;

    await this.recoverPendingUploads();
    for (const folder of this.folders) {
      if (folder.enabled) {
        await this.startWatcher(folder);
        this.scheduleFolderScan(folder.id, 0);
      }
    }
    this.scanInterval = setInterval(() => {
      for (const folder of this.folders) {
        if (folder.enabled) this.scheduleFolderScan(folder.id, 0);
      }
    }, this.scanIntervalMs);
    this.scanInterval.unref?.();
  }

  public dispose(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    for (const timer of this.scanDebounces.values()) clearTimeout(timer);
    this.scanDebounces.clear();
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
    this.scanPromises.clear();
  }

  public listManagedSourceFolders(): ManagedSourceFolderListResponse {
    return {
      folders: this.folders.map((folder) => ({
        id: folder.id,
        label: folder.label,
        enabled: folder.enabled,
        status: folder.status,
        ...(folder.lastScanAt ? { lastScanAt: folder.lastScanAt } : {}),
        counts: { ...folder.counts },
      })),
    };
  }

  public async addManagedSourceFolder(
    selectFolder: () => Promise<string | null>,
  ): Promise<{ canceled: boolean; added: boolean }> {
    this.assertInitialized();
    const selectedPath = await selectFolder();
    if (!selectedPath) return { canceled: true, added: false };

    let directoryPath: string;
    try {
      directoryPath = await this.resolvePermittedFolder(selectedPath);
    } catch {
      throw new Error('该资料目录不可用，请选择非隐藏的普通目录。');
    }

    if (this.folders.some((folder) => folder.directoryPath === directoryPath)) {
      throw new Error('该资料目录已添加。');
    }
    if (this.folders.length >= MAX_MANAGED_SOURCE_FOLDERS) {
      throw new Error(`最多可添加 ${MAX_MANAGED_SOURCE_FOLDERS} 个自动收集目录。`);
    }

    const folder: ManagedSourceFolderPrivate = {
      id: randomUUID(),
      label: safeDisplayName(directoryPath),
      directoryPath,
      enabled: true,
      status: 'watching',
      counts: emptyCounts(),
      cursor: {},
    };
    this.folders.push(folder);
    await this.persistFolderState();
    await this.startWatcher(folder);
    this.scheduleFolderScan(folder.id, 0);
    return { canceled: false, added: true };
  }

  public async setManagedSourceFolderEnabled(
    folderId: unknown,
    enabled: unknown,
  ): Promise<{ updated: boolean }> {
    this.assertInitialized();
    if (!isOpaqueId(folderId) || typeof enabled !== 'boolean') {
      throw new Error('资料目录设置无效。');
    }
    const folder = this.folders.find((item) => item.id === folderId);
    if (!folder) return { updated: false };

    folder.enabled = enabled;
    if (!enabled) {
      folder.status = 'disabled';
      this.stopWatcher(folder.id);
      await this.persistFolderState();
      return { updated: true };
    }

    folder.status = 'watching';
    await this.persistFolderState();
    await this.startWatcher(folder);
    this.scheduleFolderScan(folder.id, 0);
    return { updated: true };
  }

  public async scanManagedSourceFolder(folderId: unknown): Promise<{ scanned: boolean }> {
    this.assertInitialized();
    if (!isOpaqueId(folderId)) throw new Error('资料目录无效。');
    const folder = this.folders.find((item) => item.id === folderId);
    if (!folder || !folder.enabled) return { scanned: false };
    await this.scanFolder(folder.id);
    return { scanned: true };
  }

  public async removeManagedSourceFolder(folderId: unknown): Promise<{ removed: boolean }> {
    this.assertInitialized();
    if (!isOpaqueId(folderId)) throw new Error('资料目录无效。');
    const index = this.folders.findIndex((item) => item.id === folderId);
    if (index < 0) return { removed: false };
    this.stopWatcher(folderId);
    const debounce = this.scanDebounces.get(folderId);
    if (debounce) clearTimeout(debounce);
    this.scanDebounces.delete(folderId);
    this.folders.splice(index, 1);
    await this.persistFolderState();
    // Deliberately do not touch the source directory or any managed originals.
    return { removed: true };
  }

  public async openManagedSourceAsset(
    assetId: unknown,
    reveal = false,
  ): Promise<{ opened: boolean }> {
    this.assertInitialized();
    if (!isOpaqueId(assetId)) return { opened: false };
    const asset = this.assets[assetId];
    if (!asset || asset.status !== 'available') return { opened: false };

    const assetPath = this.managedAssetPath(asset);
    try {
      const metadata = await fs.promises.lstat(assetPath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) return { opened: false };
      if (reveal) {
        this.options.revealPath?.(assetPath);
        return { opened: Boolean(this.options.revealPath) };
      }
      if (!this.options.openPath) return { opened: false };
      const result = await this.options.openPath(assetPath);
      return { opened: result === '' };
    } catch {
      return { opened: false };
    }
  }

  public async ingestPickerContent(input: {
    filename: string;
    content: Buffer;
    title?: string;
  }): Promise<ManagedSourceUploadResult> {
    this.assertInitialized();
    const stored = await this.storeAsset({
      filename: input.filename,
      content: input.content,
      origin: 'picker',
      title: input.title,
    });
    return this.uploadStoredAsset(stored.asset, stored.pending);
  }

  private assertInitialized(): void {
    if (!this.initialized) throw new Error('资料源正在初始化，请稍后重试。');
  }

  private async ensurePrivateLayout(): Promise<void> {
    await fs.promises.mkdir(this.privateRoot, { recursive: true, mode: 0o700 });
    await fs.promises.mkdir(this.managedAssetsDirectory, { recursive: true, mode: 0o700 });
    await fs.promises.mkdir(this.stagingDirectory, { recursive: true, mode: 0o700 });
    await Promise.all([
      fs.promises.chmod(this.privateRoot, 0o700),
      fs.promises.chmod(this.managedAssetsDirectory, 0o700),
      fs.promises.chmod(this.stagingDirectory, 0o700),
    ]);
  }

  private async loadPrivateState(): Promise<void> {
    const [folderState, assetState, pendingState] = await Promise.all([
      this.readPrivateJson<ManagedSourceFolderState>(this.folderStatePath, { version: PRIVATE_STATE_VERSION, folders: [] }),
      this.readPrivateJson<ManagedSourceAssetState>(this.assetStatePath, { version: PRIVATE_STATE_VERSION, assets: {} }),
      this.readPrivateJson<ManagedSourcePendingState>(this.pendingStatePath, { version: PRIVATE_STATE_VERSION, pending: [] }),
    ]);

    this.folders = this.parseFolders(folderState);
    this.assets = this.parseAssets(assetState);
    this.pending = this.parsePending(pendingState);
  }

  private parseFolders(state: ManagedSourceFolderState): ManagedSourceFolderPrivate[] {
    if (!state || state.version !== PRIVATE_STATE_VERSION || !Array.isArray(state.folders)) return [];
    return state.folders.flatMap((folder) => {
      if (!folder || !isOpaqueId(folder.id) || typeof folder.label !== 'string' || typeof folder.directoryPath !== 'string') {
        return [];
      }
      if (!['watching', 'scanning', 'disabled', 'error'].includes(folder.status) || typeof folder.enabled !== 'boolean') {
        return [];
      }
      const counts = folder.counts && typeof folder.counts === 'object'
        ? folder.counts as ManagedSourceFolderCounts
        : emptyCounts();
      const cursor = folder.cursor && typeof folder.cursor === 'object'
        ? folder.cursor as Record<string, SourceFileCursor>
        : {};
      return [{
        id: folder.id,
        label: safeDisplayName(folder.label),
        directoryPath: path.resolve(folder.directoryPath),
        enabled: folder.enabled,
        status: folder.enabled ? 'watching' : 'disabled',
        ...(typeof folder.lastScanAt === 'string' ? { lastScanAt: folder.lastScanAt } : {}),
        counts: this.normalizedCounts(counts),
        cursor: this.normalizedCursor(cursor),
      }];
    });
  }

  private parseAssets(state: ManagedSourceAssetState): Record<string, ManagedSourceAssetPrivate> {
    if (!state || state.version !== PRIVATE_STATE_VERSION || !state.assets || typeof state.assets !== 'object') return {};
    const parsed: Record<string, ManagedSourceAssetPrivate> = {};
    for (const [assetId, asset] of Object.entries(state.assets)) {
      if (!isOpaqueId(assetId) || !asset || typeof asset !== 'object') continue;
      const candidate = asset as ManagedSourceAssetPrivate;
      if (
        !isOpaqueId(candidate.id)
        || candidate.id !== assetId
        || typeof candidate.originalFilename !== 'string'
        || typeof candidate.mediaType !== 'string'
        || !Number.isSafeInteger(candidate.byteSize)
        || candidate.byteSize <= 0
        || !['picker', 'watched_folder'].includes(candidate.origin)
        || !/^[0-9a-f-]+\.bin$/i.test(candidate.storageFileName)
        || !['pending', 'available'].includes(candidate.status)
        || typeof candidate.createdAt !== 'string'
      ) continue;
      parsed[assetId] = {
        ...candidate,
        originalFilename: safeDisplayName(candidate.originalFilename),
      };
    }
    return parsed;
  }

  private parsePending(state: ManagedSourcePendingState): ManagedSourcePendingUpload[] {
    if (!state || state.version !== PRIVATE_STATE_VERSION || !Array.isArray(state.pending)) return [];
    return state.pending.flatMap((pending) => {
      if (!pending || !isOpaqueId(pending.assetId)) return [];
      if (pending.folderId !== undefined && !isOpaqueId(pending.folderId)) return [];
      if (pending.sourceName !== undefined && typeof pending.sourceName !== 'string') return [];
      if (pending.title !== undefined && typeof pending.title !== 'string') return [];
      return [{
        assetId: pending.assetId,
        ...(pending.title ? { title: pending.title } : {}),
        ...(pending.folderId ? { folderId: pending.folderId } : {}),
        ...(pending.sourceName ? { sourceName: safeDisplayName(pending.sourceName) } : {}),
        ...(pending.sourceCursor ? { sourceCursor: this.normalizedCursor({ value: pending.sourceCursor }).value } : {}),
      }];
    });
  }

  private normalizedCounts(value: ManagedSourceFolderCounts): ManagedSourceFolderCounts {
    const number = (candidate: unknown): number => (
      typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
        ? Math.floor(candidate)
        : 0
    );
    return {
      waiting: number(value.waiting),
      importing: number(value.importing),
      imported: number(value.imported),
      skipped: number(value.skipped),
      failed: number(value.failed),
    };
  }

  private normalizedCursor(value: Record<string, SourceFileCursor>): Record<string, SourceFileCursor> {
    const parsed: Record<string, SourceFileCursor> = {};
    for (const [name, cursor] of Object.entries(value)) {
      if (!name || isHiddenName(name) || !cursor || typeof cursor !== 'object') continue;
      if (
        typeof cursor.size !== 'number'
        || typeof cursor.modifiedAtMs !== 'number'
        || typeof cursor.inode !== 'number'
        || cursor.size < 0
      ) continue;
      parsed[safeDisplayName(name)] = {
        size: cursor.size,
        modifiedAtMs: cursor.modifiedAtMs,
        inode: cursor.inode,
      };
    }
    return parsed;
  }

  private async readPrivateJson<T>(filePath: string, fallback: T): Promise<T> {
    let handle: fs.promises.FileHandle | null = null;
    try {
      handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const before = await handle.stat();
      if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > 4 * 1024 * 1024) {
        return fallback;
      }
      const content = Buffer.allocUnsafe(before.size);
      const { bytesRead } = await handle.read(content, 0, content.length, 0);
      const after = await handle.stat();
      if (bytesRead !== before.size || after.size !== before.size) return fallback;
      return JSON.parse(content.toString('utf8')) as T;
    } catch {
      return fallback;
    } finally {
      await handle?.close();
    }
  }

  private async persistFolderState(): Promise<void> {
    await this.writePrivateJson(this.folderStatePath, {
      version: PRIVATE_STATE_VERSION,
      folders: this.folders,
    });
  }

  private async persistAssetState(): Promise<void> {
    await this.writePrivateJson(this.assetStatePath, {
      version: PRIVATE_STATE_VERSION,
      assets: this.assets,
    });
  }

  private async persistPendingState(): Promise<void> {
    await this.writePrivateJson(this.pendingStatePath, {
      version: PRIVATE_STATE_VERSION,
      pending: this.pending,
    });
  }

  private async writePrivateJson(filePath: string, value: unknown): Promise<void> {
    const content = JSON.stringify(value);
    const write = this.privateWriteQueue.then(() => this.writePrivateJsonContent(filePath, content));
    this.privateWriteQueue = write.catch(() => undefined);
    return write;
  }

  private async writePrivateJsonContent(filePath: string, content: string): Promise<void> {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await fs.promises.chmod(temporaryPath, 0o600);
      await fs.promises.rename(temporaryPath, filePath);
      await fs.promises.chmod(filePath, 0o600);
    } catch (error) {
      await fs.promises.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private async removeStaleStagingFiles(): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(this.stagingDirectory, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile() || entry.isSymbolicLink()) return;
      const candidate = path.resolve(this.stagingDirectory, entry.name);
      if (!isDirectChild(candidate, this.stagingDirectory)) return;
      await fs.promises.unlink(candidate).catch(() => undefined);
    }));
  }

  private async resolvePermittedFolder(selectedPath: string): Promise<string> {
    const requestedPath = path.resolve(selectedPath);
    const initial = await fs.promises.lstat(requestedPath);
    if (!initial.isDirectory() || initial.isSymbolicLink() || isHiddenName(path.basename(requestedPath))) {
      throw new Error('invalid directory');
    }
    const resolvedPath = await fs.promises.realpath(requestedPath);
    const resolved = path.resolve(resolvedPath);
    const verified = await fs.promises.lstat(resolved);
    if (!verified.isDirectory() || verified.isSymbolicLink() || isHiddenName(path.basename(resolved))) {
      throw new Error('invalid directory');
    }
    const dataDirectory = path.resolve(this.options.dataDirectory);
    if (isWithinOrEqual(resolved, dataDirectory)) {
      throw new Error('private directory');
    }
    return resolved;
  }

  private async startWatcher(folder: ManagedSourceFolderPrivate): Promise<void> {
    this.stopWatcher(folder.id);
    if (!folder.enabled) return;
    try {
      folder.directoryPath = await this.resolvePermittedFolder(folder.directoryPath);
      const watcher = fs.watch(folder.directoryPath, { persistent: false }, () => {
        // fs.watch is only a hint; scans always enumerate the directory afresh.
        this.scheduleFolderScan(folder.id, this.stabilityDelayMs);
      });
      watcher.on('error', () => {
        const current = this.folders.find((item) => item.id === folder.id);
        if (!current) return;
        current.status = 'error';
        void this.persistFolderState().catch(() => undefined);
      });
      this.watchers.set(folder.id, watcher);
      folder.status = 'watching';
    } catch {
      folder.status = 'error';
    }
    await this.persistFolderState();
  }

  private stopWatcher(folderId: string): void {
    const watcher = this.watchers.get(folderId);
    if (watcher) watcher.close();
    this.watchers.delete(folderId);
  }

  private scheduleFolderScan(folderId: string, delay: number): void {
    const existing = this.scanDebounces.get(folderId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.scanDebounces.delete(folderId);
      void this.scanFolder(folderId).catch(() => undefined);
    }, Math.max(0, delay));
    timer.unref?.();
    this.scanDebounces.set(folderId, timer);
  }

  private async scanFolder(folderId: string): Promise<void> {
    const current = this.scanPromises.get(folderId);
    if (current) return current;
    const scan = this.performFolderScan(folderId).finally(() => this.scanPromises.delete(folderId));
    this.scanPromises.set(folderId, scan);
    return scan;
  }

  private async performFolderScan(folderId: string): Promise<void> {
    const folder = this.folders.find((item) => item.id === folderId);
    if (!folder || !folder.enabled) return;
    folder.status = 'scanning';
    await this.persistFolderState();
    try {
      const directoryPath = await this.resolvePermittedFolder(folder.directoryPath);
      if (directoryPath !== folder.directoryPath) {
        folder.directoryPath = directoryPath;
      }
      const entries = await fs.promises.readdir(folder.directoryPath, { withFileTypes: true });
      const work: Promise<void>[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || entry.isSymbolicLink() || isHiddenName(entry.name) || !supportedSourceFile(entry.name)) {
          continue;
        }
        const knownCursor = folder.cursor[entry.name];
        if (knownCursor) {
          const stillSame = await this.matchesCurrentCursor(folder, entry.name, knownCursor);
          if (stillSame) continue;
        }
        folder.counts.waiting += 1;
        work.push(this.enqueueCandidate(folder.id, entry.name));
      }
      await Promise.all(work);
      folder.lastScanAt = new Date().toISOString();
      folder.status = folder.enabled && this.watchers.has(folder.id) ? 'watching' : (folder.enabled ? 'error' : 'disabled');
    } catch {
      folder.status = 'error';
    }
    await this.persistFolderState();
  }

  private async matchesCurrentCursor(
    folder: ManagedSourceFolderPrivate,
    name: string,
    cursor: SourceFileCursor,
  ): Promise<boolean> {
    try {
      const candidate = path.resolve(folder.directoryPath, name);
      if (!isDirectChild(candidate, folder.directoryPath)) return false;
      const metadata = await fs.promises.lstat(candidate);
      if (!metadata.isFile() || metadata.isSymbolicLink()) return false;
      return metadata.size === cursor.size
        && metadata.mtimeMs === cursor.modifiedAtMs
        && metadata.ino === cursor.inode;
    } catch {
      return false;
    }
  }

  private enqueueCandidate(folderId: string, name: string): Promise<void> {
    const task = this.importQueue.then(() => this.processWatchedCandidate(folderId, name));
    this.importQueue = task.catch(() => undefined);
    return task;
  }

  private async processWatchedCandidate(folderId: string, name: string): Promise<void> {
    const folder = this.folders.find((item) => item.id === folderId);
    if (!folder || !folder.enabled) return;
    folder.counts.waiting = Math.max(0, folder.counts.waiting - 1);
    folder.counts.importing += 1;
    try {
      const candidate = await this.readStableWatchedCandidate(folder, name);
      if (!candidate) return;

      const existingPending = this.pending.find((pending) => (
        pending.folderId === folder.id
        && pending.sourceName === candidate.filename
        && pending.sourceCursor
        && this.sameCursor(pending.sourceCursor, candidate.cursor)
      ));
      if (existingPending) {
        const asset = this.assets[existingPending.assetId];
        if (asset) {
          const recovered = await this.uploadStoredAsset(asset, existingPending);
          this.recordCandidateOutcome(folder, candidate, recovered.outcome);
          return;
        }
      }

      const stored = await this.storeAsset({
        filename: candidate.filename,
        content: candidate.content,
        origin: 'watched_folder',
        folderId: folder.id,
        sourceCursor: candidate.cursor,
      });
      const result = await this.uploadStoredAsset(stored.asset, stored.pending);
      this.recordCandidateOutcome(folder, candidate, result.outcome);
    } catch {
      folder.counts.failed += 1;
    } finally {
      folder.counts.importing = Math.max(0, folder.counts.importing - 1);
      await this.persistFolderState().catch(() => undefined);
    }
  }

  private recordCandidateOutcome(
    folder: ManagedSourceFolderPrivate,
    candidate: WatchedCandidate,
    outcome: ManagedSourceUploadResult['outcome'],
  ): void {
    folder.cursor[candidate.filename] = candidate.cursor;
    if (outcome === 'skipped') folder.counts.skipped += 1;
    else folder.counts.imported += 1;
  }

  private async readStableWatchedCandidate(
    folder: ManagedSourceFolderPrivate,
    name: string,
  ): Promise<WatchedCandidate | null> {
    if (isHiddenName(name) || !supportedSourceFile(name)) return null;
    const requestedPath = path.resolve(folder.directoryPath, name);
    if (!isDirectChild(requestedPath, folder.directoryPath)) return null;
    const beforeLink = await fs.promises.lstat(requestedPath);
    if (!beforeLink.isFile() || beforeLink.isSymbolicLink() || beforeLink.size <= 0 || beforeLink.size > MAX_MANAGED_SOURCE_FILE_BYTES) {
      return null;
    }
    const sourcePath = path.resolve(await fs.promises.realpath(requestedPath));
    if (!isDirectChild(sourcePath, folder.directoryPath)) return null;
    const before = await fs.promises.stat(sourcePath);
    if (!before.isFile() || before.size <= 0 || before.size > MAX_MANAGED_SOURCE_FILE_BYTES) return null;
    if (this.stabilityDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.stabilityDelayMs));
    }
    const afterLink = await fs.promises.lstat(requestedPath);
    const after = await fs.promises.stat(sourcePath);
    if (
      !afterLink.isFile()
      || afterLink.isSymbolicLink()
      || !after.isFile()
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ino !== after.ino
    ) return null;

    const result = await this.options.readSourceFile(sourcePath);
    if (
      !Buffer.isBuffer(result.content)
      || result.size !== after.size
      || result.modifiedAtMs !== after.mtimeMs
      || result.content.length !== after.size
      || result.size <= 0
      || result.size > MAX_MANAGED_SOURCE_FILE_BYTES
    ) {
      throw new Error('source changed');
    }
    const final = await fs.promises.stat(sourcePath);
    if (final.size !== after.size || final.mtimeMs !== after.mtimeMs || final.ino !== after.ino) {
      throw new Error('source changed');
    }
    return {
      filename: safeDisplayName(name),
      content: result.content,
      cursor: { size: after.size, modifiedAtMs: after.mtimeMs, inode: after.ino },
    };
  }

  private async storeAsset(input: {
    filename: string;
    content: Buffer;
    origin: ManagedSourceAssetOrigin;
    title?: string;
    folderId?: string;
    sourceCursor?: SourceFileCursor;
  }): Promise<StoredAsset> {
    const filename = safeDisplayName(input.filename);
    if (!supportedSourceFile(filename) || !Buffer.isBuffer(input.content) || input.content.length <= 0) {
      throw new Error('仅支持非空的 Markdown、PDF、TXT、HTML、DOCX 或 PPTX 文件。');
    }
    if (input.content.length > MAX_MANAGED_SOURCE_FILE_BYTES) {
      throw new Error('单个文件超过 20 MB 上限。');
    }
    const assetId = randomUUID();
    const asset: ManagedSourceAssetPrivate = {
      id: assetId,
      originalFilename: filename,
      mediaType: mediaTypeForSourceFile(filename),
      byteSize: input.content.length,
      origin: input.origin,
      storageFileName: `${assetId}.bin`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const pending: ManagedSourcePendingUpload = {
      assetId,
      ...(typeof input.title === 'string' && input.title.trim() ? { title: input.title.trim() } : {}),
      ...(input.folderId ? { folderId: input.folderId } : {}),
      ...(input.folderId ? { sourceName: filename } : {}),
      ...(input.sourceCursor ? { sourceCursor: input.sourceCursor } : {}),
    };
    this.assets[assetId] = asset;
    this.pending.push(pending);
    await Promise.all([this.persistAssetState(), this.persistPendingState()]);

    const stagingPath = path.join(this.stagingDirectory, `${assetId}.partial`);
    const assetPath = this.managedAssetPath(asset);
    try {
      await fs.promises.writeFile(stagingPath, input.content, { mode: 0o600, flag: 'wx' });
      await fs.promises.chmod(stagingPath, 0o600);
      const staged = await fs.promises.lstat(stagingPath);
      if (!staged.isFile() || staged.isSymbolicLink() || staged.size !== input.content.length) {
        throw new Error('staging failed');
      }
      // rename is atomic because staging and assets live on the same private volume.
      await fs.promises.rename(stagingPath, assetPath);
      await fs.promises.chmod(assetPath, 0o600);
      return { asset, pending };
    } catch {
      await fs.promises.unlink(stagingPath).catch(() => undefined);
      throw new Error('无法安全保存原件，请稍后重试。');
    }
  }

  private managedAssetPath(asset: ManagedSourceAssetPrivate): string {
    const candidate = path.resolve(this.managedAssetsDirectory, asset.storageFileName);
    if (!isDirectChild(candidate, this.managedAssetsDirectory)) {
      throw new Error('invalid managed asset');
    }
    return candidate;
  }

  private async uploadStoredAsset(
    asset: ManagedSourceAssetPrivate,
    pending: ManagedSourcePendingUpload,
  ): Promise<ManagedSourceUploadResult> {
    try {
      const content = await this.readManagedAsset(asset);
      const result = await this.options.uploadManagedSource({
        sourceAssetId: asset.id,
        sourceAssetOrigin: asset.origin,
        filename: asset.originalFilename,
        mediaType: asset.mediaType,
        content,
        ...(pending.title ? { title: pending.title } : {}),
      });
      if (result.outcome === 'skipped') {
        await this.discardAsset(asset.id);
        return result;
      }
      asset.status = 'available';
      this.pending = this.pending.filter((item) => item.assetId !== asset.id);
      await Promise.all([this.persistAssetState(), this.persistPendingState()]);
      return result;
    } catch (error) {
      asset.status = 'pending';
      if (!this.pending.some((item) => item.assetId === asset.id)) this.pending.push(pending);
      await Promise.all([this.persistAssetState(), this.persistPendingState()]).catch(() => undefined);
      if (error instanceof Error && error.message === 'managed asset missing') {
        await this.discardAsset(asset.id).catch(() => undefined);
      }
      throw new Error('资料导入失败，请稍后重试。');
    }
  }

  private async readManagedAsset(asset: ManagedSourceAssetPrivate): Promise<Buffer> {
    const assetPath = this.managedAssetPath(asset);
    let handle: fs.promises.FileHandle | null = null;
    try {
      handle = await fs.promises.open(assetPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const before = await handle.stat();
      if (!before.isFile() || before.size !== asset.byteSize || before.size <= 0 || before.size > MAX_MANAGED_SOURCE_FILE_BYTES) {
        throw new Error('managed asset missing');
      }
      const content = Buffer.allocUnsafe(before.size);
      let offset = 0;
      while (offset < content.length) {
        const { bytesRead } = await handle.read(content, offset, content.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      const after = await handle.stat();
      if (offset !== before.size || after.size !== before.size) throw new Error('managed asset missing');
      return content;
    } catch (error) {
      if (error instanceof Error && error.message === 'managed asset missing') throw error;
      throw new Error('managed asset missing');
    } finally {
      await handle?.close();
    }
  }

  private async discardAsset(assetId: string): Promise<void> {
    const asset = this.assets[assetId];
    if (asset) {
      const assetPath = this.managedAssetPath(asset);
      await fs.promises.unlink(assetPath).catch(() => undefined);
    }
    delete this.assets[assetId];
    this.pending = this.pending.filter((item) => item.assetId !== assetId);
    await Promise.all([this.persistAssetState(), this.persistPendingState()]);
  }

  private async recoverPendingUploads(): Promise<void> {
    for (const pending of [...this.pending]) {
      const asset = this.assets[pending.assetId];
      if (!asset) {
        this.pending = this.pending.filter((item) => item.assetId !== pending.assetId);
        continue;
      }
      try {
        await this.uploadStoredAsset(asset, pending);
      } catch {
        // Keep the opaque journal entry for the next app start. No source path is retained here.
      }
    }
    await Promise.all([this.persistAssetState(), this.persistPendingState()]);
  }

  private sameCursor(left: SourceFileCursor, right: SourceFileCursor): boolean {
    return left.size === right.size && left.modifiedAtMs === right.modifiedAtMs && left.inode === right.inode;
  }
}
