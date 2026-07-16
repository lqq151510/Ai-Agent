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
};

export type ModelProvider = {
  id: string;
  provider: string;
  baseUrl: string;
  keyState: string;
  model: string;
  state: 'connected' | 'testing' | 'local' | 'failed';
  isDefault: boolean;
};

export type SettingsProfile = {
  displayName: string;
  email: string;
  organizeMode: string;
  privacyMode: string;
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
};

export type KnowledgeDeskSnapshot = {
  status: 'ok' | 'degraded' | 'error' | 'unknown';
  error?: string;
  dashboard: DashboardSummary;
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

export type BatchOrganizeResult = {
  total: number;
  succeeded: number;
  failed: number;
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
  createdAt?: string;
  updatedAt?: string;
};

type BackendKnowledgePage = {
  items: BackendKnowledgeItem[];
  total: number;
  page: number;
  pageSize: number;
};

type BackendDashboard = {
  totalItems: number;
  inboxItems: number;
  readyItems: number;
  failedItems: number;
  recentItems?: BackendKnowledgeItem[];
  topTags?: BackendTag[];
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

type BackendProfile = {
  email?: string | null;
  displayName?: string | null;
  organizeMode?: string | null;
  privacyMode?: string | null;
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

type KnowledgeElectronApi = {
  knowledge?: {
    request: <T>(payload: { method?: string; path: string; body?: unknown }) => Promise<T>;
    importLocalFile?: (payload?: { title?: string }) => Promise<BackendLocalFileImportResponse>;
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

const canUseDirectBackend = () => (
  DIRECT_BACKEND_PREVIEW_ENABLED
  && Boolean(DIRECT_BACKEND_ACCESS_TOKEN)
  && typeof window !== 'undefined'
  && typeof fetch === 'function'
);

const isPreviewOnlyMode = () => import.meta.env.DEV && !hasKnowledgeBridge() && !canUseDirectBackend();

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

export const loadKnowledgeDeskSnapshot = async (): Promise<KnowledgeDeskSnapshot> => {
  const results = await Promise.allSettled([
    request<BackendDashboard>('/api/v1/dashboard/summary'),
    request<BackendKnowledgePage>('/api/v1/knowledge-items?status=inbox&page=1&pageSize=12'),
    request<BackendKnowledgePage>('/api/v1/knowledge-items?status=processing&page=1&pageSize=12'),
    request<BackendKnowledgePage>('/api/v1/knowledge-items?status=failed&page=1&pageSize=12'),
    request<BackendKnowledgePage>('/api/v1/knowledge-items?status=ready&page=1&pageSize=16'),
    request<BackendKnowledgePage>('/api/v1/knowledge-items?status=archived&page=1&pageSize=12'),
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
    },
    inboxItems,
    libraryItems,
    archivedItems: archived.items.map(toKnowledgeItem),
    tags: tags.map((tag) => tag.name),
    modelProviders: modelSources.map(toModelProvider),
    profile: {
      displayName: profile.displayName || '泽宝',
      email: profile.email || 'desktop@example.com',
      organizeMode: profile.organizeMode || 'manual',
      privacyMode: profile.privacyMode || 'local_first',
    },
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

export const searchKnowledgeItems = async (query: string): Promise<KnowledgeItem[]> => {
  const params = new URLSearchParams({ q: query, page: '1', pageSize: '10' });
  const page = await request<BackendKnowledgePage>(`/api/v1/knowledge-items/search?${params.toString()}`);
  return page.items.map(toKnowledgeItem);
};

export const loadKnowledgeItemDetail = async (id: string): Promise<KnowledgeItem> => {
  return toKnowledgeItem(await request<BackendKnowledgeItem>(`/api/v1/knowledge-items/${encodeURIComponent(id)}`));
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

export const testModelSource = async (id: string): Promise<{ success: boolean; message: string }> => {
  return request<{ success: boolean; message: string }>(`/api/v1/model-sources/${id}/test`, 'POST');
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
});

const toModelProvider = (source: BackendModelSource): ModelProvider => ({
  id: source.id,
  provider: source.name || source.providerType,
  baseUrl: source.baseUrl,
  keyState: source.apiKeyMasked || '未设置',
  model: source.defaultModel,
  state: toProviderState(source),
  isDefault: source.isDefault,
});

const toProviderState = (source: BackendModelSource): ModelProvider['state'] => {
  if (source.providerType === 'local_compatible') return 'local';
  if (!source.enabled) return 'failed';
  if (source.lastCheckStatus === 'failed') return 'failed';
  if (source.lastCheckStatus === 'success') return 'connected';
  return 'testing';
};

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

export const fallbackSnapshot: KnowledgeDeskSnapshot = {
  status: 'unknown',
  dashboard: {
    totalItems: 0,
    inboxItems: 0,
    readyItems: 0,
    failedItems: 0,
    recentItems: [],
    topTags: [],
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
