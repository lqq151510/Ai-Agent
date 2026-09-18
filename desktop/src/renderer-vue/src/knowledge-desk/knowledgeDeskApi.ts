export type KnowledgeSourceType = 'web' | 'pdf' | 'markdown' | 'paste' | 'snippet';
export type KnowledgeStatus = 'pending' | 'processing' | 'done' | 'failed' | 'archived';

export type KnowledgeItem = {
  id: string;
  title: string;
  source: string;
  type: KnowledgeSourceType;
  time: string;
  summary: string;
  rawContent?: string;
  cleanedContent?: string;
  tags: string[];
  status?: KnowledgeStatus;
  sourceAsset?: KnowledgeSourceAsset;
};

export type KnowledgeItemPage = {
  items: KnowledgeItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type KnowledgeIngestionJob = {
  id: string;
  knowledgeItemId: string;
  jobType: 'import' | 'organize' | 'reprocess' | 'unknown';
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'unknown';
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string | null;
};

export type KnowledgeListStatus = 'inbox' | 'processing' | 'ready' | 'failed' | 'archived';

export type ListKnowledgeItemsParams = {
  statuses?: KnowledgeListStatus[];
  tag?: string;
  sourceType?: 'web' | 'pdf' | 'markdown' | 'snippet';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type ListIngestionJobsParams = {
  knowledgeItemId: string;
  limit?: number;
};

export type LocalFileBatchCandidateVerdict = 'ready' | 'duplicate_existing' | 'duplicate_in_batch' | 'invalid';

export type LocalFileBatchCandidate = {
  candidateId: string;
  name: string;
  size: number;
  verdict: LocalFileBatchCandidateVerdict;
  reason?: string;
};

export type LocalFileBatchPreflight = {
  canceled: boolean;
  batchId?: string;
  candidates: LocalFileBatchCandidate[];
};

export type LocalFileBatchCommitResult = {
  imported: Array<{ candidateId: string; name: string }>;
  skipped: Array<{ candidateId: string; name: string; reason: string }>;
  failed: Array<{ candidateId: string; name: string; reason: string }>;
};

export type KnowledgeSourceAsset = {
  id: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  origin: 'picker' | 'watched_folder' | 'unknown';
  availability: 'pending' | 'available' | 'missing' | 'unknown';
};

export type ManagedSourceFolderCounts = {
  waiting: number;
  importing: number;
  imported: number;
  skipped: number;
  failed: number;
};

export type ManagedSourceFolder = {
  id: string;
  label: string;
  enabled: boolean;
  status: 'watching' | 'paused' | 'scanning' | 'error' | 'unknown';
  lastScanAt?: string | null;
  counts: ManagedSourceFolderCounts;
};

export type SearchKnowledgeItemsParams = {
  query?: string;
  tag?: string;
  sourceType?: 'web' | 'pdf' | 'markdown' | 'snippet';
  status?: 'inbox' | 'processing' | 'ready' | 'failed' | 'archived';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type ModelProvider = {
  id: string;
  providerType: string;
  provider: string;
  baseUrl: string;
  keyState: string;
  model: string;
  state: 'connected' | 'testing' | 'local' | 'failed';
  enabled: boolean;
  isDefault: boolean;
  lastCheckStatus?: string | null;
  lastCheckMessage?: string | null;
};

export type LocalAssistantSession = {
  id: string;
  title: string;
  model: string;
  updatedAt?: string;
};

export type LocalAssistantSessionPage = {
  sessions: LocalAssistantSession[];
  nextPage: number | null;
};

export type LocalAssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  pending?: boolean;
};

export type LocalAssistantStreamEvent = {
  requestId: string;
  sessionId: string;
  type: 'started' | 'chunk' | 'done' | 'error';
  chunk?: string;
  reply?: string;
  message?: string;
};

export type SendLocalAssistantMessageResult = {
  requestId: string;
  sessionId: string;
  isNewSession: boolean;
};

export type SettingsProfile = {
  displayName: string;
  email: string;
  organizeMode: string;
  privacyMode: string;
  defaultModelSourceId?: string | null;
  summaryModelSourceId?: string | null;
  taggingModelSourceId?: string | null;
};

export type StorageSummary = {
  totalItems: number;
  inboxItems: number;
  readyItems: number;
  failedItems: number;
  archivedItems: number;
  totalTags: number;
  totalModelSources: number;
};

export type DashboardSummary = {
  totalItems: number;
  inboxItems: number;
  readyItems: number;
  failedItems: number;
  recentItems: KnowledgeItem[];
  topTags: Array<{ name: string; count: number; color?: string }>;
  review: KnowledgeReviewSummary;
};

export type KnowledgeReviewRating = 'again' | 'hard' | 'good' | 'easy';

export type KnowledgeReviewTag = {
  id?: string;
  name: string;
  color?: string;
};

export type KnowledgeReviewItem = {
  id: string;
  title: string;
  sourceType: string;
  summary: string;
  tags: KnowledgeReviewTag[];
  updatedAt: string | null;
  dueAt: string | null;
  intervalDays: number | null;
  easeFactor: number | null;
  repetitions: number | null;
};

export type KnowledgeReviewQueue = {
  items: KnowledgeReviewItem[];
  dueCount: number;
};

export type KnowledgeReviewSummary = {
  dueCount: number;
  nextDueAt: string | null;
};

export type KnowledgeReviewState = {
  knowledgeItemId: string;
  rating: KnowledgeReviewRating;
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
};

export type KnowledgeDeskSnapshot = {
  status: 'ok' | 'degraded' | 'error' | 'unknown';
  error?: string;
  dashboard: DashboardSummary;
  inboxTotals: {
    all: number;
    pending: number;
    processing: number;
    failed: number;
  };
  inboxItems: KnowledgeItem[];
  libraryItems: KnowledgeItem[];
  archivedItems: KnowledgeItem[];
  tags: string[];
  modelProviders: ModelProvider[];
  profile: SettingsProfile;
  storage: StorageSummary;
};

export type ImportKnowledgeKind = 'web' | 'markdown' | 'pdf' | 'snippet';

export type ImportKnowledgeDraft = {
  kind: ImportKnowledgeKind;
  title?: string;
  source?: string;
  content: string;
};

export type UpdateKnowledgeItemDraft = {
  title?: string;
  summary?: string;
  tags?: string[];
};

export type BatchOrganizeResult = {
  total: number;
  succeeded: number;
  failed: number;
};

export type KnowledgeDeskBackup = {
  schemaVersion: number;
  exportedAt: string;
  preferences: {
    displayName?: string | null;
    avatarUrl?: string | null;
    organizeMode?: string | null;
    privacyMode?: string | null;
  };
  tags: Array<{
    id: string;
    name: string;
    color?: string | null;
    createdAt: string;
  }>;
  knowledgeItems: Array<{
    id: string;
    sourceType: string;
    title: string;
    sourceUri?: string | null;
    rawContent: string;
    cleanedContent?: string | null;
    summary?: string | null;
    status: string;
    language?: string | null;
    wordCount: number;
    createdAt: string;
    updatedAt: string;
    archivedAt?: string | null;
    sourceAsset?: KnowledgeSourceAsset | null;
    tagIds: string[];
  }>;
  modelSourcesIncluded: false;
  reviewStates: KnowledgeDeskBackupReviewState[];
};

export type KnowledgeDeskBackupReviewState = {
  knowledgeItemId: string;
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lastRating: KnowledgeReviewRating;
  lastReviewedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeDeskBackupImportResult = {
  importedItems: number;
  createdTags: number;
  preferencesRestored: false;
  modelSourcesRestored: false;
  message: string;
};

const WORKFLOW_STATUS_PRIORITY: Record<string, number> = {
  inbox: 0,
  processing: 1,
  failed: 2,
  archived: 3,
};

type BackendTag = {
  id?: string;
  name: string;
  color?: string;
  count?: number;
};

type BackendKnowledgeItem = {
  id: string;
  sourceType: string;
  title: string;
  sourceUri?: string | null;
  rawContent?: string | null;
  cleanedContent?: string | null;
  summary?: string | null;
  status: string;
  wordCount?: number;
  tags?: BackendTag[];
  sourceAsset?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

type BackendKnowledgePage = {
  items: BackendKnowledgeItem[];
  total: number;
  page: number;
  pageSize: number;
};

type BackendIngestionJob = {
  id: string;
  knowledgeItemId: string;
  jobType: string;
  status: string;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string | null;
};

type BackendDashboard = {
  totalItems: number;
  inboxItems: number;
  readyItems: number;
  failedItems: number;
  recentItems?: BackendKnowledgeItem[];
  topTags?: BackendTag[];
  review?: unknown;
};

type BackendModelSource = {
  id: string;
  providerType: string;
  name: string;
  baseUrl: string;
  apiKeyMasked?: string | null;
  defaultModel: string;
  enabled: boolean;
  isDefault: boolean;
  lastCheckStatus?: string | null;
  lastCheckMessage?: string | null;
};

export type ImportModelSourceDraft = {
  providerType: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  enabled?: boolean;
  isDefault?: boolean;
};

export type UpdateSettingsProfileDraft = {
  organizeMode?: 'manual' | 'auto';
  privacyMode?: 'local_first' | 'cloud_first';
  defaultModelSourceId?: string;
  summaryModelSourceId?: string;
  taggingModelSourceId?: string;
  clearDefaultModelSource?: boolean;
  clearSummaryModelSource?: boolean;
  clearTaggingModelSource?: boolean;
};

export type ModelSourceTestResult = {
  id: string;
  status: string;
  message: string;
  checkedAt?: string;
};

type BackendProfile = {
  email?: string | null;
  displayName?: string | null;
  organizeMode?: string | null;
  privacyMode?: string | null;
  defaultModelSourceId?: string | null;
  summaryModelSourceId?: string | null;
  taggingModelSourceId?: string | null;
};

type BackendStorage = {
  totalItems?: number;
  inboxItems?: number;
  readyItems?: number;
  failedItems?: number;
  archivedItems?: number;
  totalTags?: number;
  totalModelSources?: number;
};

type BackendBatchOrganizeResponse = {
  total?: number;
  succeeded?: number;
  failed?: number;
  totalCount?: number;
  successCount?: number;
  failedCount?: number;
};

type BackendLocalFileImportResponse = {
  canceled: boolean;
  item?: BackendKnowledgeItem;
};

type BackendLocalFileBatchPreflight = {
  canceled?: unknown;
  batchId?: unknown;
  candidates?: unknown;
};

type BackendLocalFileBatchCommitResult = {
  imported?: unknown;
  skipped?: unknown;
  failed?: unknown;
};

type LocalAssistantBridge = {
  listSessions: (page?: number) => Promise<unknown>;
  listMessages: (sessionId: string) => Promise<unknown>;
  deleteSession: (sessionId: string) => Promise<unknown>;
  exportSession?: (sessionId: string) => Promise<unknown>;
  send: (payload: { message: string; sessionId?: string; modelSourceId: string; model: string }) => Promise<unknown>;
  onStreamEvent: (callback: (event: unknown) => void) => () => void;
};

type KnowledgeElectronApi = {
  localChat?: LocalAssistantBridge;
  knowledge?: {
    request: <T>(payload: { method?: string; path: string; body?: unknown }) => Promise<T>;
    importLocalFile?: (payload?: { title?: string }) => Promise<BackendLocalFileImportResponse>;
    preflightLocalFileBatch?: () => Promise<BackendLocalFileBatchPreflight>;
    commitLocalFileBatch?: (payload: { batchId: string; candidateIds: string[] }) => Promise<BackendLocalFileBatchCommitResult>;
    saveBackup?: (payload: { content: string; suggestedName: string }) => Promise<{ canceled: boolean; filePath?: string }>;
    selectBackup?: () => Promise<{ canceled: boolean; content?: string; fileName?: string }>;
    listManagedSourceFolders?: () => Promise<unknown>;
    addManagedSourceFolder?: () => Promise<unknown>;
    setManagedSourceFolderEnabled?: (payload: { folderId: string; enabled: boolean }) => Promise<unknown>;
    scanManagedSourceFolder?: (payload: { folderId: string }) => Promise<unknown>;
    removeManagedSourceFolder?: (payload: { folderId: string }) => Promise<unknown>;
    openManagedSourceAsset?: (payload: { assetId: string; reveal?: boolean }) => Promise<unknown>;
  };
};

const DIRECT_API_BASE_URL = import.meta.env.VITE_KNOWLEDGE_API_BASE_URL || 'http://127.0.0.1:18080';
const DIRECT_BACKEND_PREVIEW_ENABLED = import.meta.env.VITE_KNOWLEDGE_DIRECT_BACKEND_PREVIEW === 'true';
const DIRECT_BACKEND_ACCESS_TOKEN = import.meta.env.VITE_KNOWLEDGE_DIRECT_BACKEND_ACCESS_TOKEN?.trim();
const getElectronApi = () => (window as unknown as { electronAPI?: KnowledgeElectronApi }).electronAPI;

const hasKnowledgeBridge = () => {
  const electronApi = getElectronApi();
  return Boolean(electronApi?.knowledge?.request);
};

export const canUseDesktopFilePicker = () => {
  const electronApi = getElectronApi();
  return Boolean(electronApi?.knowledge?.importLocalFile);
};

export const canUseDesktopBatchFileImport = () => {
  const electronApi = getElectronApi();
  return Boolean(electronApi?.knowledge?.preflightLocalFileBatch && electronApi?.knowledge?.commitLocalFileBatch);
};

export const canUseDesktopBackupPicker = () => {
  const electronApi = getElectronApi();
  return Boolean(electronApi?.knowledge?.saveBackup && electronApi?.knowledge?.selectBackup);
};

export const canUseManagedSourceFolders = () => {
  const knowledge = getElectronApi()?.knowledge;
  return Boolean(
    knowledge?.listManagedSourceFolders
      && knowledge.addManagedSourceFolder
      && knowledge.setManagedSourceFolderEnabled
      && knowledge.scanManagedSourceFolder
      && knowledge.removeManagedSourceFolder
      && knowledge.openManagedSourceAsset,
  );
};

export const canUseLocalAssistant = () => {
  const localChat = getElectronApi()?.localChat as Partial<LocalAssistantBridge> | undefined;
  return Boolean(
    localChat?.listSessions
      && localChat.listMessages
      && localChat.deleteSession
      && localChat.send
      && localChat.onStreamEvent,
  );
};

export const canExportLocalAssistantSession = () => Boolean(
  (getElectronApi()?.localChat as Partial<LocalAssistantBridge> | undefined)?.exportSession,
);

const requireLocalAssistantBridge = () => {
  const localChat = getElectronApi()?.localChat;
  if (!localChat || !canUseLocalAssistant()) {
    throw new Error('本机助手只能在桌面端使用。');
  }
  return localChat;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const localAssistantText = (value: unknown, maxChars: number) => (
  typeof value === 'string' && value.trim().length > 0 ? value.slice(0, maxChars) : null
);

const mapLocalAssistantSession = (value: unknown): LocalAssistantSession | null => {
  if (!isPlainRecord(value)) return null;
  const id = localAssistantText(value.id, 64);
  const title = localAssistantText(value.title, 120);
  const model = localAssistantText(value.model, 128);
  if (!id || !title || !model) return null;
  return {
    id,
    title,
    model,
    updatedAt: localAssistantText(value.updatedAt, 64) ?? undefined,
  };
};

const mapLocalAssistantMessage = (value: unknown): LocalAssistantMessage | null => {
  if (!isPlainRecord(value)) return null;
  const id = localAssistantText(value.id, 64);
  const content = localAssistantText(value.content, 120_000);
  const role = value.role;
  if (!id || !content || (role !== 'user' && role !== 'assistant')) return null;
  return {
    id,
    content,
    role,
    createdAt: localAssistantText(value.createdAt, 64) ?? undefined,
  };
};

const mapLocalAssistantStreamEvent = (value: unknown): LocalAssistantStreamEvent | null => {
  if (!isPlainRecord(value)) return null;
  const requestId = localAssistantText(value.requestId, 64);
  const sessionId = localAssistantText(value.sessionId, 64);
  const type = value.type;
  if (!requestId || !sessionId || !['started', 'chunk', 'done', 'error'].includes(String(type))) {
    return null;
  }
  return {
    requestId,
    sessionId,
    type: type as LocalAssistantStreamEvent['type'],
    chunk: localAssistantText(value.chunk, 120_000) ?? undefined,
    reply: localAssistantText(value.reply, 120_000) ?? undefined,
    message: localAssistantText(value.message, 240) ?? undefined,
  };
};

export const listLocalAssistantSessions = async (
  page = 0,
): Promise<LocalAssistantSessionPage> => {
  const response = await requireLocalAssistantBridge().listSessions(page);
  if (!isPlainRecord(response) || !Array.isArray(response.sessions)) {
    throw new Error('本机助手会话列表返回了无效数据。');
  }
  const nextPage = response.nextPage;
  if (
    nextPage !== null
    && (typeof nextPage !== 'number' || !Number.isSafeInteger(nextPage) || nextPage < 0)
  ) {
    throw new Error('本机助手会话列表返回了无效分页信息。');
  }
  return {
    sessions: response.sessions
      .map(mapLocalAssistantSession)
      .filter((session): session is LocalAssistantSession => session !== null),
    nextPage,
  };
};

export const listLocalAssistantMessages = async (sessionId: string): Promise<LocalAssistantMessage[]> => {
  const response = await requireLocalAssistantBridge().listMessages(sessionId);
  if (!Array.isArray(response)) {
    throw new Error('本机助手消息记录返回了无效数据。');
  }
  return response
    .map(mapLocalAssistantMessage)
    .filter((message): message is LocalAssistantMessage => message !== null);
};

export const deleteLocalAssistantSession = async (sessionId: string): Promise<void> => {
  await requireLocalAssistantBridge().deleteSession(sessionId);
};

export const exportLocalAssistantSession = async (
  sessionId: string,
): Promise<{ canceled: boolean }> => {
  const bridge = requireLocalAssistantBridge();
  if (!bridge.exportSession) {
    throw new Error('当前桌面端暂不支持导出本机助手对话。');
  }
  const response = await bridge.exportSession(sessionId);
  if (!isPlainRecord(response) || typeof response.canceled !== 'boolean') {
    throw new Error('本机助手导出没有返回有效结果。');
  }
  return { canceled: response.canceled };
};

export const sendLocalAssistantMessage = async (payload: {
  message: string;
  sessionId?: string;
  modelSourceId: string;
  model: string;
}): Promise<SendLocalAssistantMessageResult> => {
  const response = await requireLocalAssistantBridge().send(payload);
  if (!isPlainRecord(response)) {
    throw new Error('本机助手没有确认消息请求。');
  }
  const requestId = localAssistantText(response.requestId, 64);
  const sessionId = localAssistantText(response.sessionId, 64);
  if (!requestId || !sessionId || response.ok !== true) {
    throw new Error('本机助手没有确认消息请求。');
  }
  return {
    requestId,
    sessionId,
    isNewSession: response.isNewSession === true,
  };
};

export const subscribeLocalAssistantStream = (
  callback: (event: LocalAssistantStreamEvent) => void,
): (() => void) => requireLocalAssistantBridge().onStreamEvent((event) => {
  const mapped = mapLocalAssistantStreamEvent(event);
  if (mapped) callback(mapped);
});

const canUseDirectBackend = () => (
  DIRECT_BACKEND_PREVIEW_ENABLED
  && Boolean(DIRECT_BACKEND_ACCESS_TOKEN)
  && typeof window !== 'undefined'
  && typeof fetch === 'function'
);

const isPreviewOnlyMode = () => import.meta.env.DEV && !hasKnowledgeBridge() && !canUseDirectBackend();

const REVIEW_RATINGS: KnowledgeReviewRating[] = ['again', 'hard', 'good', 'easy'];
const DEFAULT_KNOWLEDGE_REVIEW_LIMIT = 10;
const MAX_KNOWLEDGE_REVIEW_LIMIT = 20;

const request = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const electronApi = getElectronApi();
  const knowledgeRequest = electronApi?.knowledge?.request;
  if (knowledgeRequest) {
    return knowledgeRequest<T>({ method, path, body });
  }
  if (canUseDirectBackend()) {
    return directBackendRequest<T>(path, method, body);
  }
  throw new Error('Knowledge API bridge is not available');
};

const requireKnowledgeReviewService = () => {
  if (isPreviewOnlyMode()) {
    throw new Error('每日回顾需要本机知识服务，浏览器预览不会伪造复习进度。');
  }
};

const directBackendRequest = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const token = getDirectBackendAccessToken();
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);

  let requestBody: BodyInit | undefined;
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(`${DIRECT_API_BASE_URL}${path}`, {
    method,
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    throw new Error(await toDirectErrorMessage(response));
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
};

const directBackendMultipartRequest = async <T>(path: string, formData: FormData): Promise<T> => {
  const token = getDirectBackendAccessToken();
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${DIRECT_API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await toDirectErrorMessage(response));
  }

  return response.json() as Promise<T>;
};

const getDirectBackendAccessToken = () => {
  if (!DIRECT_BACKEND_ACCESS_TOKEN) {
    throw new Error('浏览器直连预览未开启安全访问令牌，请回到桌面端，或显式设置直连开关和访问令牌。');
  }
  return DIRECT_BACKEND_ACCESS_TOKEN;
};

const toDirectErrorMessage = async (response: Response) => {
  const text = await response.text();
  if (!text) return `Request failed (${response.status})`;
  try {
    const parsed = JSON.parse(text) as { message?: string; code?: string };
    return parsed.message || parsed.code || text;
  } catch {
    return text;
  }
};

const requestLocalFileImport = async (title?: string): Promise<BackendLocalFileImportResponse> => {
  const electronApi = getElectronApi();
  const payload = { title: emptyToUndefined(title) };
  const importLocalFile = electronApi?.knowledge?.importLocalFile;
  if (importLocalFile) {
    return importLocalFile(payload);
  }

  throw new Error('桌面文件选择桥不可用，请在桌面端重启后重试。');
};

const toLocalFileBatchCandidate = (value: unknown): LocalFileBatchCandidate => {
  if (!value || typeof value !== 'object') {
    throw new Error('本机文件预检返回了无效条目。');
  }
  const candidate = value as Record<string, unknown>;
  const verdict = candidate.verdict;
  if (
    typeof candidate.candidateId !== 'string'
    || typeof candidate.name !== 'string'
    || typeof candidate.size !== 'number'
    || !['ready', 'duplicate_existing', 'duplicate_in_batch', 'invalid'].includes(String(verdict))
  ) {
    throw new Error('本机文件预检返回了无效条目。');
  }
  return {
    candidateId: candidate.candidateId,
    name: candidate.name,
    size: candidate.size,
    verdict: verdict as LocalFileBatchCandidateVerdict,
    reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
  };
};

const toLocalFileBatchCommitEntries = (value: unknown, includeReason: boolean) => {
  if (!Array.isArray(value)) {
    throw new Error('本机文件导入返回了无效结果。');
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('本机文件导入返回了无效结果。');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.candidateId !== 'string' || typeof record.name !== 'string') {
      throw new Error('本机文件导入返回了无效结果。');
    }
    if (includeReason && typeof record.reason !== 'string') {
      throw new Error('本机文件导入返回了无效结果。');
    }
    return includeReason
      ? { candidateId: record.candidateId, name: record.name, reason: record.reason as string }
      : { candidateId: record.candidateId, name: record.name };
  });
};

export const preflightLocalKnowledgeFileBatch = async (): Promise<LocalFileBatchPreflight> => {
  const preflight = getElectronApi()?.knowledge?.preflightLocalFileBatch;
  if (!preflight) {
    throw new Error('本机批量文件选择桥不可用，请在桌面端重启后重试。');
  }
  const result = await preflight();
  const candidates = Array.isArray(result?.candidates) ? result.candidates.map(toLocalFileBatchCandidate) : null;
  if (!candidates || typeof result?.canceled !== 'boolean') {
    throw new Error('本机文件预检返回了无效结果。');
  }
  if (!result.canceled && typeof result.batchId !== 'string') {
    throw new Error('本机文件预检没有返回有效批次。');
  }
  return {
    canceled: result.canceled,
    batchId: typeof result.batchId === 'string' ? result.batchId : undefined,
    candidates,
  };
};

export const commitLocalKnowledgeFileBatch = async (
  batchId: string,
  candidateIds: string[],
): Promise<LocalFileBatchCommitResult> => {
  const commit = getElectronApi()?.knowledge?.commitLocalFileBatch;
  if (!commit) {
    throw new Error('本机批量文件导入桥不可用，请在桌面端重启后重试。');
  }
  const result = await commit({ batchId, candidateIds });
  return {
    imported: toLocalFileBatchCommitEntries(result?.imported, false) as LocalFileBatchCommitResult['imported'],
    skipped: toLocalFileBatchCommitEntries(result?.skipped, true) as LocalFileBatchCommitResult['skipped'],
    failed: toLocalFileBatchCommitEntries(result?.failed, true) as LocalFileBatchCommitResult['failed'],
  };
};

const sourceFolderCount = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
);

const toManagedSourceFolder = (value: unknown): ManagedSourceFolder => {
  if (!value || typeof value !== 'object') {
    throw new Error('本机资料源返回了无效条目。');
  }
  const folder = value as Record<string, unknown>;
  if (
    typeof folder.id !== 'string'
    || typeof folder.label !== 'string'
    || typeof folder.enabled !== 'boolean'
  ) {
    throw new Error('本机资料源返回了无效条目。');
  }
  const rawStatus = typeof folder.status === 'string' ? folder.status : 'unknown';
  const status = rawStatus === 'disabled'
    ? 'paused'
    : ['watching', 'paused', 'scanning', 'error'].includes(rawStatus)
      ? rawStatus as ManagedSourceFolder['status']
      : 'unknown';
  const rawCounts = folder.counts && typeof folder.counts === 'object'
    ? folder.counts as Record<string, unknown>
    : {};
  return {
    id: folder.id,
    label: folder.label,
    enabled: folder.enabled,
    status,
    lastScanAt: typeof folder.lastScanAt === 'string' ? folder.lastScanAt : null,
    counts: {
      waiting: sourceFolderCount(rawCounts.waiting),
      importing: sourceFolderCount(rawCounts.importing),
      imported: sourceFolderCount(rawCounts.imported),
      skipped: sourceFolderCount(rawCounts.skipped),
      failed: sourceFolderCount(rawCounts.failed),
    },
  };
};

const requireManagedSourceFolderBridge = () => {
  const knowledge = getElectronApi()?.knowledge;
  if (!canUseManagedSourceFolders() || !knowledge) {
    throw new Error('本机资料源仅能在桌面端使用。');
  }
  return knowledge;
};

export const listManagedSourceFolders = async (): Promise<ManagedSourceFolder[]> => {
  const list = requireManagedSourceFolderBridge().listManagedSourceFolders!;
  const result = await list();
  if (!result || typeof result !== 'object' || !Array.isArray((result as { folders?: unknown }).folders)) {
    throw new Error('本机资料源返回了无效结果。');
  }
  return (result as { folders: unknown[] }).folders.map(toManagedSourceFolder);
};

export const addManagedSourceFolder = async (): Promise<void> => {
  await requireManagedSourceFolderBridge().addManagedSourceFolder!();
};

export const setManagedSourceFolderEnabled = async (folderId: string, enabled: boolean): Promise<void> => {
  await requireManagedSourceFolderBridge().setManagedSourceFolderEnabled!({ folderId, enabled });
};

export const scanManagedSourceFolder = async (folderId: string): Promise<void> => {
  await requireManagedSourceFolderBridge().scanManagedSourceFolder!({ folderId });
};

export const removeManagedSourceFolder = async (folderId: string): Promise<void> => {
  await requireManagedSourceFolderBridge().removeManagedSourceFolder!({ folderId });
};

export const openManagedSourceAsset = async (assetId: string, reveal = false): Promise<void> => {
  const result = await requireManagedSourceFolderBridge().openManagedSourceAsset!({ assetId, reveal });
  if (!result || typeof result !== 'object' || (result as { opened?: unknown }).opened !== true) {
    throw new Error('本机原件目前不可打开，请稍后重试。');
  }
};

export const loadKnowledgeDeskSnapshot = async (): Promise<KnowledgeDeskSnapshot> => {
  const results = await Promise.allSettled([
    request<BackendDashboard>('/api/v1/dashboard/summary'),
    request<BackendKnowledgePage>('/api/v1/knowledge-items?status=inbox&page=1&pageSize=20'),
    request<BackendKnowledgePage>('/api/v1/knowledge-items?status=processing&page=1&pageSize=20'),
    request<BackendKnowledgePage>('/api/v1/knowledge-items?status=failed&page=1&pageSize=20'),
    request<BackendKnowledgePage>('/api/v1/knowledge-items?status=ready&page=1&pageSize=20'),
    request<BackendKnowledgePage>('/api/v1/knowledge-items?status=archived&page=1&pageSize=20'),
    request<BackendTag[]>('/api/v1/tags'),
    request<BackendModelSource[]>('/api/v1/model-sources'),
    request<BackendProfile>('/api/v1/settings/profile'),
    request<BackendStorage>('/api/v1/settings/storage'),
  ]);

  const [
    dashboardResult, inboxResult, processingResult, failedResult,
    readyResult, archivedResult, tagsResult, modelSourcesResult,
    profileResult, storageResult,
  ] = results;

  const emptyPage: BackendKnowledgePage = { items: [], total: 0, page: 1, pageSize: 1 };
  const fulfilled = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback;

  const dashboard = fulfilled(dashboardResult, { totalItems: 0, inboxItems: 0, readyItems: 0, failedItems: 0 } as BackendDashboard);
  const inbox = fulfilled(inboxResult, emptyPage);
  const processing = fulfilled(processingResult, emptyPage);
  const failed = fulfilled(failedResult, emptyPage);
  const ready = fulfilled(readyResult, emptyPage);
  const archived = fulfilled(archivedResult, emptyPage);
  const tags = fulfilled(tagsResult, [] as BackendTag[]);
  const modelSources = fulfilled(modelSourcesResult, [] as BackendModelSource[]);
  const profile = fulfilled(profileResult, {} as BackendProfile);
  const storage = fulfilled(storageResult, {} as BackendStorage);

  const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

  if (errors.length === results.length) {
    const firstError = errors[0];
    const snapshot = isPreviewOnlyMode() ? withPreviewItems(fallbackSnapshot) : fallbackSnapshot;
    return {
      ...snapshot,
      status: 'error',
      error: firstError.reason instanceof Error ? firstError.reason.message : String(firstError.reason),
    };
  }

  const inboxItems = [...inbox.items, ...processing.items, ...failed.items]
    .sort(compareWorkflowItems)
    .map(toKnowledgeItem);
  const libraryItems = ready.items.map(toKnowledgeItem);
  const status = errors.length > 0 ? 'degraded' : 'ok';
  return {
    status,
    ...(errors.length > 0 ? { error: `${errors.length} 个接口请求失败` } : {}),
    dashboard: {
      totalItems: dashboard.totalItems,
      inboxItems: dashboard.inboxItems,
      readyItems: dashboard.readyItems,
      failedItems: dashboard.failedItems,
      recentItems: (dashboard.recentItems ?? []).map(toKnowledgeItem),
      topTags: (dashboard.topTags ?? []).map((tag) => ({
        name: tag.name,
        count: tag.count ?? 0,
        color: tag.color,
      })),
      review: dashboard.review == null ? emptyKnowledgeReviewSummary() : toKnowledgeReviewSummary(dashboard.review),
    },
    inboxTotals: {
      all: inbox.total + processing.total + failed.total,
      pending: inbox.total,
      processing: processing.total,
      failed: failed.total,
    },
    inboxItems,
    libraryItems,
    archivedItems: archived.items.map(toKnowledgeItem),
    tags: tags.map((tag) => tag.name),
    modelProviders: modelSources.map(toModelProvider),
    profile: toSettingsProfile(profile),
    storage: {
      totalItems: storage.totalItems ?? dashboard.totalItems,
      inboxItems: storage.inboxItems ?? dashboard.inboxItems,
      readyItems: storage.readyItems ?? dashboard.readyItems,
      failedItems: storage.failedItems ?? dashboard.failedItems,
      archivedItems: storage.archivedItems ?? 0,
      totalTags: storage.totalTags ?? tags.length,
      totalModelSources: storage.totalModelSources ?? modelSources.length,
    },
  };
};

export const listKnowledgeItems = async ({
  from,
  page = 1,
  pageSize = 20,
  sourceType,
  statuses,
  tag,
  to,
}: ListKnowledgeItemsParams): Promise<KnowledgeItemPage> => {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  statuses?.forEach((status) => params.append('status', status));
  if (tag?.trim()) params.set('tag', tag.trim());
  if (sourceType) params.set('sourceType', sourceType);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  return toKnowledgeItemPage(
    await request<BackendKnowledgePage>(`/api/v1/knowledge-items?${params.toString()}`),
  );
};

export const listIngestionJobs = async ({
  knowledgeItemId,
  limit = 20,
}: ListIngestionJobsParams): Promise<KnowledgeIngestionJob[]> => {
  const params = new URLSearchParams({ knowledgeItemId, limit: String(limit) });
  const jobs = await request<BackendIngestionJob[]>(`/api/v1/ingestion-jobs?${params.toString()}`);
  return jobs.map(toKnowledgeIngestionJob);
};

export const searchKnowledgeItems = async ({
  from,
  page = 1,
  pageSize = 12,
  query,
  sourceType,
  status,
  tag,
  to,
}: SearchKnowledgeItemsParams): Promise<KnowledgeItemPage> => {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query?.trim()) params.set('q', query.trim());
  if (tag?.trim()) params.set('tag', tag.trim());
  if (sourceType) params.set('sourceType', sourceType);
  if (status) params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  return toKnowledgeItemPage(
    await request<BackendKnowledgePage>(`/api/v1/knowledge-items/search?${params.toString()}`),
  );
};

export const loadKnowledgeItemDetail = async (id: string): Promise<KnowledgeItem> => {
  return toKnowledgeItem(await request<BackendKnowledgeItem>(`/api/v1/knowledge-items/${encodeURIComponent(id)}`));
};

export const updateKnowledgeItem = async (
  item: KnowledgeItem,
  draft: UpdateKnowledgeItemDraft,
): Promise<KnowledgeItem> => {
  if (isPreviewOnlyMode()) {
    const nextItem: KnowledgeItem = {
      ...item,
      title: draft.title?.trim() || item.title,
      summary: draft.summary === undefined ? item.summary : draft.summary.trim(),
      tags: draft.tags ? normalizePreviewTags(draft.tags) : item.tags,
      time: '刚刚',
    };
    syncPreviewItem(nextItem);
    return nextItem;
  }

  return toKnowledgeItem(await request<BackendKnowledgeItem>(
    `/api/v1/knowledge-items/${encodeURIComponent(item.id)}`,
    'PUT',
    draft,
  ));
};

export const importKnowledgeItem = async (draft: ImportKnowledgeDraft): Promise<KnowledgeItem> => {
  if (isPreviewOnlyMode()) {
    return savePreviewImport(draft);
  }

  if (draft.kind === 'web') {
    return toKnowledgeItem(await request<BackendKnowledgeItem>('/api/v1/knowledge-items/import/web', 'POST', {
      title: emptyToUndefined(draft.title),
      url: draft.source,
      content: draft.content,
    }));
  }

  if (draft.kind === 'snippet') {
    return toKnowledgeItem(await request<BackendKnowledgeItem>('/api/v1/knowledge-items/import/snippet', 'POST', {
      title: emptyToUndefined(draft.title),
      content: draft.content,
    }));
  }

  return toKnowledgeItem(await request<BackendKnowledgeItem>('/api/v1/knowledge-items/import/file', 'POST', {
    title: emptyToUndefined(draft.title),
    sourceType: draft.kind,
    sourceUri: emptyToUndefined(draft.source),
    content: draft.content,
  }));
};

export const importLocalKnowledgeFile = async (title?: string): Promise<KnowledgeItem | null> => {
  if (!hasKnowledgeBridge()) {
    throw new Error('本地文件选择需要在桌面端使用。');
  }

  const result = await requestLocalFileImport(title);
  if (result.canceled) {
    return null;
  }
  if (!result.item) {
    throw new Error('文件导入没有返回知识条目。');
  }
  return toKnowledgeItem(result.item);
};

export const importBrowserKnowledgeFile = async (file: File, title?: string): Promise<KnowledgeItem> => {
  if (isPreviewOnlyMode()) {
    return savePreviewImport(await buildBrowserPreviewDraft(file, title));
  }

  if (!canUseDirectBackend()) {
    throw new Error('浏览器文件导入仅在桌面端或显式开启直连预览时可用。');
  }

  const formData = new FormData();
  formData.append('file', file);
  const cleanedTitle = emptyToUndefined(title);
  if (cleanedTitle) {
    formData.append('title', cleanedTitle);
  }

  return toKnowledgeItem(await directBackendMultipartRequest<BackendKnowledgeItem>('/api/v1/knowledge-items/import/upload', formData));
};

export const createModelSource = async (draft: ImportModelSourceDraft): Promise<ModelProvider> => {
  const result = await request<BackendModelSource>('/api/v1/model-sources', 'POST', draft);
  return toModelProvider(result);
};

export const updateModelSource = async (id: string, draft: Partial<ImportModelSourceDraft>): Promise<ModelProvider> => {
  const result = await request<BackendModelSource>(`/api/v1/model-sources/${id}`, 'PUT', draft);
  return toModelProvider(result);
};

export const deleteModelSource = async (id: string): Promise<void> => {
  await request(`/api/v1/model-sources/${id}`, 'DELETE');
};

export const enableModelSource = async (id: string): Promise<ModelProvider> => {
  const result = await request<BackendModelSource>(`/api/v1/model-sources/${id}/enable`, 'POST');
  return toModelProvider(result);
};

export const disableModelSource = async (id: string): Promise<ModelProvider> => {
  const result = await request<BackendModelSource>(`/api/v1/model-sources/${id}/disable`, 'POST');
  return toModelProvider(result);
};

export const testModelSource = async (id: string): Promise<ModelSourceTestResult> => {
  return request<ModelSourceTestResult>(`/api/v1/model-sources/${id}/test`, 'POST');
};

export const updateKnowledgeDeskSettingsProfile = async (
  draft: UpdateSettingsProfileDraft,
): Promise<SettingsProfile> => {
  const result = await request<BackendProfile>('/api/v1/settings/profile', 'PUT', draft);
  return toSettingsProfile(result);
};

export const exportKnowledgeDeskBackup = async (): Promise<KnowledgeDeskBackup> => {
  const backup = await request<KnowledgeDeskBackup>('/api/v1/settings/export');
  return {
    ...backup,
    reviewStates: Array.isArray(backup.reviewStates) ? backup.reviewStates : [],
  };
};

export const importKnowledgeDeskBackup = async (
  backup: KnowledgeDeskBackup,
): Promise<KnowledgeDeskBackupImportResult> => {
  return request<KnowledgeDeskBackupImportResult>('/api/v1/settings/import', 'POST', {
    ...backup,
    reviewStates: Array.isArray(backup.reviewStates) ? backup.reviewStates : [],
  });
};

export const saveKnowledgeDeskBackup = async (backup: KnowledgeDeskBackup): Promise<string | null> => {
  const content = JSON.stringify(backup, null, 2);
  const suggestedName = backupFileName(backup.exportedAt);
  const saveBackup = getElectronApi()?.knowledge?.saveBackup;
  if (saveBackup) {
    const result = await saveBackup({ content, suggestedName });
    return result.canceled ? null : result.filePath ?? suggestedName;
  }

  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持本地备份下载。');
  }
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = suggestedName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return suggestedName;
};

export const pickKnowledgeDeskBackup = async (): Promise<KnowledgeDeskBackup | null> => {
  const selectBackup = getElectronApi()?.knowledge?.selectBackup;
  if (!selectBackup) {
    throw new Error('请在桌面端使用“导入备份”，或从浏览器选择 JSON 文件。');
  }
  const result = await selectBackup();
  if (result.canceled) return null;
  if (!result.content) {
    throw new Error('备份文件为空或无法读取。');
  }
  return parseKnowledgeDeskBackup(result.content);
};

export const parseKnowledgeDeskBackup = (content: string): KnowledgeDeskBackup => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('备份文件不是有效的 JSON。');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('备份文件格式无效。');
  }
  const backup = parsed as Partial<KnowledgeDeskBackup>;
  if (
    backup.schemaVersion !== 1
    || backup.modelSourcesIncluded !== false
    || !isValidKnowledgeDeskBackupShape(backup)
  ) {
    throw new Error('不支持该备份版本，或备份包含不允许恢复的模型配置。');
  }
  return {
    ...backup,
    reviewStates: Array.isArray(backup.reviewStates) ? backup.reviewStates : [],
  } as KnowledgeDeskBackup;
};

export const loadKnowledgeReviewQueue = async (
  requestedLimit = DEFAULT_KNOWLEDGE_REVIEW_LIMIT,
): Promise<KnowledgeReviewQueue> => {
  requireKnowledgeReviewService();
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(MAX_KNOWLEDGE_REVIEW_LIMIT, requestedLimit)
    : DEFAULT_KNOWLEDGE_REVIEW_LIMIT;
  return toKnowledgeReviewQueue(
    await request<unknown>(`/api/v1/knowledge-reviews/queue?limit=${limit}`),
  );
};

export const loadKnowledgeReviewSummary = async (): Promise<KnowledgeReviewSummary> => {
  requireKnowledgeReviewService();
  return toKnowledgeReviewSummary(
    await request<unknown>('/api/v1/knowledge-reviews/summary'),
  );
};

export const completeKnowledgeReview = (
  itemId: string,
  rating: KnowledgeReviewRating,
): Promise<KnowledgeReviewState> => {
  requireKnowledgeReviewService();
  if (!isNonEmptyString(itemId)) {
    throw new Error('复习条目无效。');
  }
  if (!isKnowledgeReviewRating(rating)) {
    throw new Error('无效的复习反馈');
  }
  return request<unknown>(
    `/api/v1/knowledge-reviews/${encodeURIComponent(itemId)}/complete`,
    'POST',
    { rating },
  ).then(toKnowledgeReviewState);
};

export const organizeKnowledgeItems = async (includeFailed = true): Promise<BatchOrganizeResult> => {
  if (isPreviewOnlyMode()) {
    const previews = readPreviewItems();
    const nextPreviews = previews.map((item) => (
      item.status === 'done' || item.status === 'archived'
        ? item
        : { ...item, status: 'done' as const, time: '刚刚' }
    ));
    writePreviewItems(nextPreviews);
    const changed = nextPreviews.filter((item, index) => item.status !== previews[index]?.status).length;
    return { total: changed, succeeded: changed, failed: 0 };
  }

  const params = new URLSearchParams({ limit: '20', includeFailed: String(includeFailed) });
  const result = await request<BackendBatchOrganizeResponse>(`/api/v1/knowledge-items/organize-batch?${params.toString()}`, 'POST');
  return {
    total: result.total ?? result.totalCount ?? 0,
    succeeded: result.succeeded ?? result.successCount ?? 0,
    failed: result.failed ?? result.failedCount ?? 0,
  };
};

export const organizeKnowledgeItem = async (item: KnowledgeItem): Promise<KnowledgeItem> => {
  if (isPreviewOnlyMode()) {
    const nextItem = toPreviewReadyItem(item);
    syncPreviewItem(nextItem);
    return nextItem;
  }

  return toKnowledgeItem(await request<BackendKnowledgeItem>(`/api/v1/knowledge-items/${encodeURIComponent(item.id)}/organize`, 'POST'));
};

export const reprocessKnowledgeItem = async (item: KnowledgeItem): Promise<KnowledgeItem> => {
  if (isPreviewOnlyMode()) {
    const nextItem = toPreviewReadyItem(item);
    syncPreviewItem(nextItem);
    return nextItem;
  }

  return toKnowledgeItem(await request<BackendKnowledgeItem>(`/api/v1/knowledge-items/${encodeURIComponent(item.id)}/reprocess`, 'POST'));
};

export const archiveKnowledgeItem = async (item: KnowledgeItem): Promise<KnowledgeItem> => {
  if (isPreviewOnlyMode()) {
    const nextItem = {
      ...item,
      status: 'archived' as const,
      time: '刚刚',
    };
    syncPreviewItem(nextItem);
    return nextItem;
  }

  return toKnowledgeItem(await request<BackendKnowledgeItem>(`/api/v1/knowledge-items/${encodeURIComponent(item.id)}/archive`, 'POST'));
};

export const restoreKnowledgeItem = async (item: KnowledgeItem): Promise<KnowledgeItem> => {
  if (isPreviewOnlyMode()) {
    const nextItem = {
      ...item,
      status: item.summary?.trim() ? ('done' as const) : ('pending' as const),
      time: '刚刚',
    };
    syncPreviewItem(nextItem);
    return nextItem;
  }

  return toKnowledgeItem(await request<BackendKnowledgeItem>(`/api/v1/knowledge-items/${encodeURIComponent(item.id)}/restore`, 'POST'));
};

const toKnowledgeSourceAsset = (value: unknown): KnowledgeSourceAsset | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const sourceAsset = value as Record<string, unknown>;
  if (
    typeof sourceAsset.id !== 'string'
    || typeof sourceAsset.originalFilename !== 'string'
    || typeof sourceAsset.mediaType !== 'string'
    || typeof sourceAsset.byteSize !== 'number'
  ) {
    return undefined;
  }
  const rawOrigin = sourceAsset.origin;
  const origin = rawOrigin === 'picker' || rawOrigin === 'watched_folder' ? rawOrigin : 'unknown';
  const rawAvailability = sourceAsset.availability;
  const availability = rawAvailability === 'pending' || rawAvailability === 'available' || rawAvailability === 'missing'
    ? rawAvailability
    : 'unknown';
  return {
    id: sourceAsset.id,
    originalFilename: sourceAsset.originalFilename,
    mediaType: sourceAsset.mediaType,
    byteSize: sourceAsset.byteSize,
    origin,
    availability,
  };
};

const emptyKnowledgeReviewSummary = (): KnowledgeReviewSummary => ({
  dueCount: 0,
  nextDueAt: null,
});

const isKnowledgeReviewRating = (value: unknown): value is KnowledgeReviewRating => (
  typeof value === 'string' && REVIEW_RATINGS.includes(value as KnowledgeReviewRating)
);

const optionalReviewTimestamp = (value: unknown, errorMessage: string): string | null => {
  if (value == null) return null;
  if (!isNonEmptyString(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(errorMessage);
  }
  return value;
};

const optionalReviewInteger = (value: unknown, minimum: number, errorMessage: string): number | null => {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(errorMessage);
  }
  return value;
};

const optionalReviewNumber = (value: unknown, minimum: number, errorMessage: string): number | null => {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new Error(errorMessage);
  }
  return value;
};

const toKnowledgeReviewTags = (value: unknown): KnowledgeReviewTag[] => {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error('每日回顾队列返回了无效数据。');
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('每日回顾队列返回了无效数据。');
    }
    const tag = entry as Record<string, unknown>;
    if (!isNonEmptyString(tag.name)) {
      throw new Error('每日回顾队列返回了无效数据。');
    }
    return {
      ...(isNonEmptyString(tag.id) ? { id: tag.id } : {}),
      name: tag.name,
      ...(typeof tag.color === 'string' && tag.color.trim() ? { color: tag.color } : {}),
    };
  });
};

const toKnowledgeReviewItem = (value: unknown): KnowledgeReviewItem => {
  if (!value || typeof value !== 'object') {
    throw new Error('每日回顾队列返回了无效数据。');
  }
  const item = value as Record<string, unknown>;
  if (!isNonEmptyString(item.id) || !isNonEmptyString(item.title) || !isNonEmptyString(item.sourceType)) {
    throw new Error('每日回顾队列返回了无效数据。');
  }
  return {
    id: item.id,
    title: item.title,
    sourceType: item.sourceType,
    summary: typeof item.summary === 'string' ? item.summary : '',
    tags: toKnowledgeReviewTags(item.tags),
    updatedAt: optionalReviewTimestamp(item.updatedAt, '每日回顾队列返回了无效数据。'),
    dueAt: optionalReviewTimestamp(item.dueAt, '每日回顾队列返回了无效数据。'),
    intervalDays: optionalReviewInteger(item.intervalDays, 1, '每日回顾队列返回了无效数据。'),
    easeFactor: optionalReviewNumber(item.easeFactor, 1.3, '每日回顾队列返回了无效数据。'),
    repetitions: optionalReviewInteger(item.repetitions, 0, '每日回顾队列返回了无效数据。'),
  };
};

const toKnowledgeReviewQueue = (value: unknown): KnowledgeReviewQueue => {
  if (!value || typeof value !== 'object') {
    throw new Error('每日回顾队列返回了无效数据。');
  }
  const queue = value as Record<string, unknown>;
  if (!Array.isArray(queue.items) || typeof queue.dueCount !== 'number'
    || !Number.isInteger(queue.dueCount) || queue.dueCount < 0) {
    throw new Error('每日回顾队列返回了无效数据。');
  }
  return {
    items: queue.items.map(toKnowledgeReviewItem),
    dueCount: queue.dueCount,
  };
};

const toKnowledgeReviewSummary = (value: unknown): KnowledgeReviewSummary => {
  if (!value || typeof value !== 'object') {
    throw new Error('每日回顾摘要返回了无效数据。');
  }
  const summary = value as Record<string, unknown>;
  if (typeof summary.dueCount !== 'number' || !Number.isInteger(summary.dueCount) || summary.dueCount < 0) {
    throw new Error('每日回顾摘要返回了无效数据。');
  }
  return {
    dueCount: summary.dueCount,
    nextDueAt: optionalReviewTimestamp(summary.nextDueAt, '每日回顾摘要返回了无效数据。'),
  };
};

const toKnowledgeReviewState = (value: unknown): KnowledgeReviewState => {
  if (!value || typeof value !== 'object') {
    throw new Error('每日回顾提交返回了无效数据。');
  }
  const state = value as Record<string, unknown>;
  if (!isNonEmptyString(state.knowledgeItemId) || !isKnowledgeReviewRating(state.rating)) {
    throw new Error('每日回顾提交返回了无效数据。');
  }
  const dueAt = optionalReviewTimestamp(state.dueAt, '每日回顾提交返回了无效数据。');
  const intervalDays = optionalReviewInteger(state.intervalDays, 1, '每日回顾提交返回了无效数据。');
  const easeFactor = optionalReviewNumber(state.easeFactor, 1.3, '每日回顾提交返回了无效数据。');
  const repetitions = optionalReviewInteger(state.repetitions, 0, '每日回顾提交返回了无效数据。');
  if (dueAt == null || intervalDays == null || easeFactor == null || repetitions == null) {
    throw new Error('每日回顾提交返回了无效数据。');
  }
  return {
    knowledgeItemId: state.knowledgeItemId,
    rating: state.rating,
    dueAt,
    intervalDays,
    easeFactor,
    repetitions,
  };
};

const toKnowledgeItem = (item: BackendKnowledgeItem): KnowledgeItem => ({
  id: item.id,
  title: item.title,
  source: item.sourceUri || '本地资料',
  type: toSourceType(item.sourceType),
  time: formatTime(item.updatedAt || item.createdAt),
  summary: item.summary || firstLine(item.cleanedContent || item.rawContent) || '暂无摘要',
  rawContent: item.rawContent || undefined,
  cleanedContent: item.cleanedContent || undefined,
  tags: (item.tags ?? []).map((tag) => tag.name),
  status: toStatus(item.status),
  sourceAsset: toKnowledgeSourceAsset(item.sourceAsset),
});

const toKnowledgeItemPage = (page: BackendKnowledgePage): KnowledgeItemPage => ({
  items: page.items.map(toKnowledgeItem),
  total: page.total,
  page: page.page,
  pageSize: page.pageSize,
});

const toKnowledgeIngestionJob = (job: BackendIngestionJob): KnowledgeIngestionJob => ({
  id: job.id,
  knowledgeItemId: job.knowledgeItemId,
  jobType: toIngestionJobType(job.jobType),
  status: toIngestionJobStatus(job.status),
  errorMessage: job.errorMessage?.trim() || null,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  createdAt: job.createdAt,
});

const toIngestionJobType = (jobType: string): KnowledgeIngestionJob['jobType'] => {
  if (jobType === 'import' || jobType === 'organize' || jobType === 'reprocess') return jobType;
  return 'unknown';
};

const toIngestionJobStatus = (status: string): KnowledgeIngestionJob['status'] => {
  if (status === 'pending' || status === 'running' || status === 'succeeded' || status === 'failed') return status;
  return 'unknown';
};

const toModelProvider = (source: BackendModelSource): ModelProvider => ({
  id: source.id,
  providerType: source.providerType,
  provider: source.name || source.providerType,
  baseUrl: source.baseUrl,
  keyState: source.apiKeyMasked || '未设置',
  model: source.defaultModel,
  state: toProviderState(source),
  enabled: source.enabled,
  isDefault: source.isDefault,
  lastCheckStatus: source.lastCheckStatus,
  lastCheckMessage: source.lastCheckMessage,
});

const toProviderState = (source: BackendModelSource): ModelProvider['state'] => {
  if (!source.enabled) return 'failed';
  if (source.lastCheckStatus === 'error' || source.lastCheckStatus === 'failed') return 'failed';
  if (source.providerType === 'local_compatible') {
    return source.lastCheckStatus === 'ok' || source.lastCheckStatus === 'success'
      ? 'local'
      : 'testing';
  }
  if (source.lastCheckStatus === 'ok' || source.lastCheckStatus === 'success') return 'connected';
  return 'testing';
};

const toSettingsProfile = (profile: BackendProfile): SettingsProfile => ({
  displayName: profile.displayName || '泽宝',
  email: profile.email || 'desktop@example.com',
  organizeMode: profile.organizeMode || 'manual',
  privacyMode: profile.privacyMode || 'local_first',
  defaultModelSourceId: profile.defaultModelSourceId,
  summaryModelSourceId: profile.summaryModelSourceId,
  taggingModelSourceId: profile.taggingModelSourceId,
});

const toSourceType = (sourceType: string): KnowledgeSourceType => {
  const normalized = sourceType.toLowerCase();
  if (normalized === 'snippet') return 'paste';
  if (normalized === 'web' || normalized === 'pdf' || normalized === 'markdown' || normalized === 'paste') {
    return normalized;
  }
  return 'markdown';
};

const toStatus = (status: string): KnowledgeStatus => {
  if (status === 'ready') return 'done';
  if (status === 'processing') return 'processing';
  if (status === 'failed') return 'failed';
  if (status === 'archived') return 'archived';
  return 'pending';
};

const firstLine = (value?: string | null): string => {
  if (!value) return '';
  return value.split('\n').find((line) => line.trim().length > 0)?.trim().slice(0, 180) ?? '';
};

const formatTime = (value?: string): string => {
  if (!value) return '刚刚';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '刚刚';
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
};

const PREVIEW_ITEMS_KEY = 'knowledge-desk-preview-items';

const emptyToUndefined = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const backupFileName = (exportedAt: string) => {
  const timestamp = Number.isNaN(Date.parse(exportedAt)) ? new Date() : new Date(exportedAt);
  const compact = timestamp.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  return `knowledge-desk-backup-${compact}.json`;
};

const isValidKnowledgeDeskBackupShape = (backup: Partial<KnowledgeDeskBackup>) => (
  isNonEmptyString(backup.exportedAt)
  && isBackupPreferences(backup.preferences)
  && Array.isArray(backup.tags)
  && backup.tags.every((tag) => (
    isNonEmptyString(tag?.id)
    && isNonEmptyString(tag?.name)
    && isNonEmptyString(tag?.createdAt)
  ))
  && Array.isArray(backup.knowledgeItems)
  && backup.knowledgeItems.every((item) => (
    isNonEmptyString(item?.id)
    && isNonEmptyString(item?.sourceType)
    && isNonEmptyString(item?.title)
    && typeof item?.rawContent === 'string'
    && isNonEmptyString(item?.status)
    && typeof item?.wordCount === 'number'
    && Number.isFinite(item.wordCount)
    && isNonEmptyString(item?.createdAt)
    && isNonEmptyString(item?.updatedAt)
    && (item.sourceAsset == null || isBackupSourceAsset(item.sourceAsset))
    && Array.isArray(item?.tagIds)
    && item.tagIds.every(isNonEmptyString)
  ))
  && (backup.reviewStates == null || (
    Array.isArray(backup.reviewStates)
    && backup.reviewStates.every(isBackupReviewState)
  ))
);

const isBackupReviewState = (state: KnowledgeDeskBackupReviewState) => (
  isNonEmptyString(state?.knowledgeItemId)
  && isNonEmptyString(state?.dueAt)
  && typeof state?.intervalDays === 'number'
  && Number.isInteger(state.intervalDays)
  && state.intervalDays >= 1
  && typeof state?.easeFactor === 'number'
  && Number.isFinite(state.easeFactor)
  && state.easeFactor >= 1.3
  && typeof state?.repetitions === 'number'
  && Number.isInteger(state.repetitions)
  && state.repetitions >= 0
  && isKnowledgeReviewRating(state?.lastRating)
  && isNonEmptyString(state?.lastReviewedAt)
  && isNonEmptyString(state?.createdAt)
  && isNonEmptyString(state?.updatedAt)
);

const isBackupSourceAsset = (sourceAsset: KnowledgeSourceAsset) => (
  isNonEmptyString(sourceAsset.id)
  && isNonEmptyString(sourceAsset.originalFilename)
  && isNonEmptyString(sourceAsset.mediaType)
  && typeof sourceAsset.byteSize === 'number'
  && Number.isFinite(sourceAsset.byteSize)
  && sourceAsset.byteSize >= 0
  && (sourceAsset.origin === 'picker' || sourceAsset.origin === 'watched_folder' || sourceAsset.origin === 'unknown')
  && ['pending', 'available', 'missing', 'unknown'].includes(sourceAsset.availability)
);

const isBackupPreferences = (preferences: KnowledgeDeskBackup['preferences'] | undefined) => (
  preferences != null
  && isNonEmptyString(preferences.organizeMode)
  && isNonEmptyString(preferences.privacyMode)
);

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const readPreviewItems = (): KnowledgeItem[] => {
  try {
    const raw = window.localStorage.getItem(PREVIEW_ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isKnowledgeItemLike) : [];
  } catch {
    return [];
  }
};

const writePreviewItems = (items: KnowledgeItem[]) => {
  try {
    window.localStorage.setItem(PREVIEW_ITEMS_KEY, JSON.stringify(items.slice(0, 30)));
  } catch {
    // Preview storage is best-effort for the browser-only prototype.
  }
};

const savePreviewImport = (draft: ImportKnowledgeDraft): KnowledgeItem => {
  const item: KnowledgeItem = {
    id: `preview-${Date.now()}`,
    title: draft.title?.trim() || fallbackImportTitle(draft),
    source: draft.source?.trim() || (draft.kind === 'snippet' ? '粘贴内容' : '本地预览'),
    type: draft.kind === 'snippet' ? 'paste' : draft.kind,
    time: '刚刚',
    summary: firstLine(draft.content) || '新导入内容等待整理',
    rawContent: draft.content,
    cleanedContent: draft.content,
    tags: ['收集箱'],
    status: 'pending',
  };
  writePreviewItems([item, ...readPreviewItems()]);
  return item;
};

export const withPreviewItems = (snapshot: KnowledgeDeskSnapshot): KnowledgeDeskSnapshot => {
  const previews = readPreviewItems();
  if (previews.length === 0) return snapshot;

  const previewInbox = previews.filter((item) => item.status !== 'done' && item.status !== 'archived');
  const previewPending = previews.filter((item) => item.status === 'pending');
  const previewProcessing = previews.filter((item) => item.status === 'processing');
  const previewFailed = previews.filter((item) => item.status === 'failed');
  const previewLibrary = previews.filter((item) => item.status === 'done');
  const previewArchived = previews.filter((item) => item.status === 'archived');
  return {
    ...snapshot,
    dashboard: {
      ...snapshot.dashboard,
      totalItems: snapshot.dashboard.totalItems + previews.length,
      inboxItems: snapshot.dashboard.inboxItems + previewInbox.length,
      readyItems: snapshot.dashboard.readyItems + previewLibrary.length,
      recentItems: [...previewLibrary, ...snapshot.dashboard.recentItems].slice(0, 8),
    },
    inboxTotals: {
      all: snapshot.inboxTotals.all + previewInbox.length,
      pending: snapshot.inboxTotals.pending + previewPending.length,
      processing: snapshot.inboxTotals.processing + previewProcessing.length,
      failed: snapshot.inboxTotals.failed + previewFailed.length,
    },
    inboxItems: [...previewInbox, ...snapshot.inboxItems],
    libraryItems: [...previewLibrary, ...snapshot.libraryItems],
    archivedItems: [...previewArchived, ...snapshot.archivedItems],
    tags: Array.from(new Set([...snapshot.tags, ...previews.flatMap((item) => item.tags)])),
    storage: {
      ...snapshot.storage,
      totalItems: snapshot.storage.totalItems + previews.length,
      inboxItems: snapshot.storage.inboxItems + previewInbox.length,
      readyItems: snapshot.storage.readyItems + previewLibrary.length,
      archivedItems: snapshot.storage.archivedItems + previewArchived.length,
    },
  };
};

const fallbackImportTitle = (draft: ImportKnowledgeDraft) => {
  if (draft.kind === 'web') return '网页摘录';
  if (draft.kind === 'pdf') return 'PDF 导入';
  if (draft.kind === 'markdown') return 'Markdown 导入';
  return '粘贴片段';
};

const buildBrowserPreviewDraft = async (file: File, title?: string): Promise<ImportKnowledgeDraft> => {
  const kind = inferBrowserPreviewKind(file);
  if (kind === 'pdf') {
    return {
      kind,
      title: title?.trim() || file.name,
      source: file.name,
      content: `PDF 文件 ${file.name} 已保存为浏览器预览，未上传到后端。`,
    };
  }

  let content = '';
  try {
    content = (await file.text()).trim();
  } catch {
    // Browser preview keeps a local placeholder when file text is unavailable.
  }

  return {
    kind,
    title: title?.trim() || file.name,
    source: file.name,
    content: content || `文件 ${file.name} 已保存为浏览器预览，未上传到后端。`,
  };
};

const inferBrowserPreviewKind = (file: File): ImportKnowledgeKind => {
  const lowerName = file.name.toLowerCase();
  if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
  if (file.type.startsWith('text/') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return 'markdown';
  }
  return 'snippet';
};

const isKnowledgeItemLike = (value: unknown): value is KnowledgeItem => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<KnowledgeItem>;
  return typeof item.id === 'string'
    && typeof item.title === 'string'
    && typeof item.source === 'string'
    && typeof item.summary === 'string'
    && Array.isArray(item.tags);
};

const compareWorkflowItems = (left: BackendKnowledgeItem, right: BackendKnowledgeItem) => {
  const priorityDelta = (WORKFLOW_STATUS_PRIORITY[left.status] ?? 9) - (WORKFLOW_STATUS_PRIORITY[right.status] ?? 9);
  if (priorityDelta !== 0) return priorityDelta;
  return toTimestamp(right.updatedAt || right.createdAt) - toTimestamp(left.updatedAt || left.createdAt);
};

const toTimestamp = (value?: string) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toPreviewReadyItem = (item: KnowledgeItem): KnowledgeItem => ({
  ...item,
  time: '刚刚',
  status: 'done',
  summary: item.summary || firstLine(item.cleanedContent || item.rawContent) || '已整理完成',
  cleanedContent: item.cleanedContent || item.rawContent || item.summary,
});

const syncPreviewItem = (item: KnowledgeItem) => {
  if (!item.id.startsWith('preview-')) return;
  const current = readPreviewItems().filter((previewItem) => previewItem.id !== item.id);
  writePreviewItems([item, ...current]);
};

const normalizePreviewTags = (tags: string[]) => (
  Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 12)
);

export const fallbackSnapshot: KnowledgeDeskSnapshot = {
  status: 'unknown',
  dashboard: {
    totalItems: 0,
    inboxItems: 0,
    readyItems: 0,
    failedItems: 0,
    recentItems: [],
    topTags: [],
    review: emptyKnowledgeReviewSummary(),
  },
  inboxTotals: {
    all: 0,
    pending: 0,
    processing: 0,
    failed: 0,
  },
  inboxItems: [],
  libraryItems: [],
  archivedItems: [],
  tags: [],
  modelProviders: [],
  profile: {
    displayName: '泽宝',
    email: 'desktop@example.com',
    organizeMode: 'manual',
    privacyMode: 'local_first',
  },
  storage: {
    totalItems: 0,
    inboxItems: 0,
    readyItems: 0,
    failedItems: 0,
    archivedItems: 0,
    totalTags: 0,
    totalModelSources: 0,
  },
};
