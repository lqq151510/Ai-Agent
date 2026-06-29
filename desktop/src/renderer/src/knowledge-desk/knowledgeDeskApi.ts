export type KnowledgeSourceType = 'web' | 'pdf' | 'markdown' | 'paste' | 'snippet';
export type KnowledgeStatus = 'pending' | 'processing' | 'done' | 'failed';

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
  source: 'api' | 'fallback';
  error?: string;
  dashboard: DashboardSummary;
  inboxItems: KnowledgeItem[];
  libraryItems: KnowledgeItem[];
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

type BackendTokenResponse = {
  accessToken: string;
  refreshToken?: string;
};

type DirectPreviewCredentials = {
  email: string;
  password: string;
  accessToken?: string;
  refreshToken?: string;
};

type KnowledgeElectronApi = {
  knowledge?: {
    request: <T>(payload: { method?: string; path: string; body?: unknown }) => Promise<T>;
    importLocalFile?: (payload?: { title?: string }) => Promise<BackendLocalFileImportResponse>;
  };
  invoke?: <T>(channel: string, ...args: unknown[]) => Promise<T>;
};

const DIRECT_API_BASE_URL = import.meta.env.VITE_KNOWLEDGE_API_BASE_URL || 'http://127.0.0.1:18080';
const DIRECT_PREVIEW_AUTH_KEY = 'knowledge-desk-preview-auth';
const getElectronApi = () => (window as unknown as { electronAPI?: KnowledgeElectronApi }).electronAPI;

const hasKnowledgeBridge = () => {
  const electronApi = getElectronApi();
  return Boolean(electronApi?.knowledge?.request || electronApi?.invoke);
};

export const canUseDesktopFilePicker = () => {
  const electronApi = getElectronApi();
  return Boolean(electronApi?.knowledge?.importLocalFile || electronApi?.invoke);
};

const canUseDirectBackend = () => typeof window !== 'undefined' && typeof fetch === 'function';

const request = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const electronApi = getElectronApi();
  const knowledgeRequest = electronApi?.knowledge?.request;
  if (knowledgeRequest) {
    return knowledgeRequest<T>({ method, path, body });
  }
  const genericInvoke = electronApi?.invoke;
  if (genericInvoke) {
    return genericInvoke<T>('knowledge:request', { method, path, body });
  }
  if (canUseDirectBackend()) {
    return directBackendRequest<T>(path, method, body);
  }
  throw new Error('Knowledge API bridge is not available');
};

const directBackendRequest = async <T>(path: string, method = 'GET', body?: unknown, retryOnUnauthorized = true): Promise<T> => {
  const token = await ensureDirectAccessToken();
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

  if (response.status === 401 && retryOnUnauthorized) {
    clearDirectAccessToken();
    return directBackendRequest<T>(path, method, body, false);
  }

  if (!response.ok) {
    throw new Error(await toDirectErrorMessage(response));
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
};

const directBackendMultipartRequest = async <T>(path: string, formData: FormData, retryOnUnauthorized = true): Promise<T> => {
  const token = await ensureDirectAccessToken();
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${DIRECT_API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (response.status === 401 && retryOnUnauthorized) {
    clearDirectAccessToken();
    return directBackendMultipartRequest<T>(path, formData, false);
  }

  if (!response.ok) {
    throw new Error(await toDirectErrorMessage(response));
  }

  return response.json() as Promise<T>;
};

const ensureDirectAccessToken = async (): Promise<string> => {
  const credentials = readDirectPreviewCredentials();
  if (credentials.accessToken) {
    return credentials.accessToken;
  }

  try {
    const tokens = await directAuthRequest('/api/v1/auth/login', credentials);
    writeDirectPreviewCredentials({ ...credentials, ...tokens });
    return tokens.accessToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Invalid credentials')
      && !message.includes('Invalid email or password')
      && !message.includes('Request failed')
      && !message.includes('401')) {
      throw error;
    }

    await directAuthRequest('/api/v1/auth/register', credentials);
    const tokens = await directAuthRequest('/api/v1/auth/login', credentials);
    writeDirectPreviewCredentials({ ...credentials, ...tokens });
    return tokens.accessToken;
  }
};

const directAuthRequest = async (path: string, credentials: DirectPreviewCredentials): Promise<BackendTokenResponse> => {
  const response = await fetch(`${DIRECT_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  });
  if (!response.ok) {
    throw new Error(await toDirectErrorMessage(response));
  }
  return response.json() as Promise<BackendTokenResponse>;
};

const readDirectPreviewCredentials = (): DirectPreviewCredentials => {
  try {
    const raw = window.localStorage.getItem(DIRECT_PREVIEW_AUTH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DirectPreviewCredentials>;
      if (parsed.email && parsed.password) {
        return parsed as DirectPreviewCredentials;
      }
    }
  } catch {
    // Preview auth is best-effort and regenerated if localStorage is corrupted.
  }

  const nonce = Math.random().toString(36).slice(2, 12);
  const credentials: DirectPreviewCredentials = {
    email: `knowledge-preview-${nonce}@local.invalid`,
    password: `KnowledgePreview!${nonce}Aa1`,
  };
  writeDirectPreviewCredentials(credentials);
  return credentials;
};

const writeDirectPreviewCredentials = (credentials: DirectPreviewCredentials) => {
  try {
    window.localStorage.setItem(DIRECT_PREVIEW_AUTH_KEY, JSON.stringify(credentials));
  } catch {
    // If storage is unavailable, the next request will regenerate preview credentials.
  }
};

const clearDirectAccessToken = () => {
  const credentials = readDirectPreviewCredentials();
  writeDirectPreviewCredentials({
    email: credentials.email,
    password: credentials.password,
  });
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

  const genericInvoke = electronApi?.invoke;
  if (genericInvoke) {
    return genericInvoke<BackendLocalFileImportResponse>('knowledge:import-local-file', payload);
  }

  throw new Error('桌面文件选择桥不可用，请在桌面端重启后重试。');
};

export const loadKnowledgeDeskSnapshot = async (): Promise<KnowledgeDeskSnapshot> => {
  try {
    const [
      dashboard,
      inbox,
      ready,
      tags,
      modelSources,
      profile,
      storage,
    ] = await Promise.all([
      request<BackendDashboard>('/api/v1/dashboard/summary'),
      request<BackendKnowledgePage>('/api/v1/knowledge-items?status=inbox&page=1&pageSize=12'),
      request<BackendKnowledgePage>('/api/v1/knowledge-items?status=ready&page=1&pageSize=16'),
      request<BackendTag[]>('/api/v1/tags'),
      request<BackendModelSource[]>('/api/v1/model-sources'),
      request<BackendProfile>('/api/v1/settings/profile'),
      request<BackendStorage>('/api/v1/settings/storage'),
    ]);

    const inboxItems = inbox.items.map(toKnowledgeItem);
    const libraryItems = ready.items.map(toKnowledgeItem);
    return {
      source: 'api',
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
  } catch (error) {
    return {
      ...withPreviewItems(fallbackSnapshot),
      source: 'fallback',
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
  if (!hasKnowledgeBridge() && !canUseDirectBackend()) {
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
  if (!canUseDirectBackend()) {
    throw new Error('当前环境无法连接本机数据库，请在桌面端使用本地文档导入。');
  }

  const formData = new FormData();
  formData.append('file', file);
  const cleanedTitle = emptyToUndefined(title);
  if (cleanedTitle) {
    formData.append('title', cleanedTitle);
  }

  return toKnowledgeItem(await directBackendMultipartRequest<BackendKnowledgeItem>('/api/v1/knowledge-items/import/upload', formData));
};

export const organizeKnowledgeItems = async (includeFailed = true): Promise<BatchOrganizeResult> => {
  if (!hasKnowledgeBridge() && !canUseDirectBackend()) {
    const previews = readPreviewItems();
    const nextPreviews = previews.map((item) => (
      item.status === 'done' ? item : { ...item, status: 'done' as const, time: '刚刚' }
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

const withPreviewItems = (snapshot: KnowledgeDeskSnapshot): KnowledgeDeskSnapshot => {
  const previews = readPreviewItems();
  if (previews.length === 0) return snapshot;

  const previewInbox = previews.filter((item) => item.status !== 'done');
  const previewLibrary = previews.filter((item) => item.status === 'done');
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
    tags: Array.from(new Set([...snapshot.tags, ...previews.flatMap((item) => item.tags)])),
    storage: {
      ...snapshot.storage,
      totalItems: snapshot.storage.totalItems + previews.length,
      inboxItems: snapshot.storage.inboxItems + previewInbox.length,
      readyItems: snapshot.storage.readyItems + previewLibrary.length,
    },
  };
};

const fallbackImportTitle = (draft: ImportKnowledgeDraft) => {
  if (draft.kind === 'web') return '网页摘录';
  if (draft.kind === 'pdf') return 'PDF 导入';
  if (draft.kind === 'markdown') return 'Markdown 导入';
  return '粘贴片段';
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

export const fallbackSnapshot: KnowledgeDeskSnapshot = {
  source: 'fallback',
  dashboard: {
    totalItems: 1247,
    inboxItems: 7,
    readyItems: 1182,
    failedItems: 1,
    recentItems: [],
    topTags: [
      { name: 'RAG', count: 48 },
      { name: 'LLM', count: 42 },
      { name: 'Spring AI', count: 31 },
      { name: 'Transformer', count: 29 },
    ],
  },
  inboxItems: [
    {
      id: 'sample-inbox-1',
      title: 'RAG 系统优化：混合检索策略对比',
      source: 'arxiv.org',
      type: 'web',
      time: '10 分钟前',
      summary: '对比 BM25、向量检索和重排序在课程资料问答中的表现，适合沉淀到检索架构主题。',
      tags: ['RAG', '混合检索', '资料召回'],
      status: 'pending',
    },
    {
      id: 'sample-inbox-2',
      title: '图神经网络推荐系统课程笔记',
      source: 'course-notes.pdf',
      type: 'pdf',
      time: '24 分钟前',
      summary: 'PDF 正在解析章节标题、引用和公式，摘要会在整理完成后进入知识库。',
      tags: ['图神经网络', '推荐系统'],
      status: 'processing',
    },
    {
      id: 'sample-inbox-3',
      title: '个人知识管理方法论：从信息到智慧',
      source: 'notes/pkm.md',
      type: 'markdown',
      time: '昨天',
      summary: '围绕 DIKW、渐进式总结和卡片盒笔记法建立个人知识沉淀路径。',
      tags: ['个人知识管理', '回顾'],
      status: 'done',
    },
    {
      id: 'sample-inbox-4',
      title: 'Transformer 论文摘录',
      source: '粘贴内容',
      type: 'paste',
      time: '昨天',
      summary: '粘贴内容缺少来源链接，建议补充来源后再进入知识库。',
      tags: ['Transformer'],
      status: 'failed',
    },
  ],
  libraryItems: [
    {
      id: 'sample-library-1',
      title: 'Transformer 架构详解：注意力机制与编码器设计',
      source: '机器学习课程',
      type: 'markdown',
      time: '今天 09:10',
      summary: '从 self-attention、multi-head attention 到 encoder block 的结构拆解，已关联到 RAG 和 LLM 基础主题。',
      tags: ['Transformer', 'LLM', 'Attention'],
      status: 'done',
    },
    {
      id: 'sample-library-2',
      title: '向量数据库选型笔记：Milvus、Qdrant 与 pgvector',
      source: '本地 PDF',
      type: 'pdf',
      time: '昨天 21:30',
      summary: '围绕索引类型、过滤能力、部署复杂度和 Java 生态集成成本做横向对比。',
      tags: ['向量数据库', 'Milvus', '基础设施'],
      status: 'done',
    },
    {
      id: 'sample-library-3',
      title: 'Spring AI RAG 流水线实验记录',
      source: 'project-log.md',
      type: 'markdown',
      time: '周二',
      summary: '记录文档切分、embedding、召回、重排序和答案生成的最小闭环。',
      tags: ['Spring AI', 'RAG', 'Java'],
      status: 'done',
    },
    {
      id: 'sample-library-4',
      title: 'Claude Code 与 Codex 工具协议差异',
      source: '网页摘录',
      type: 'web',
      time: '6 月 22 日',
      summary: '比较本地工具调用、审批机制、上下文注入和多代理协作差异。',
      tags: ['智能体', '工具协议'],
      status: 'done',
    },
  ],
  tags: ['RAG', 'LLM', 'Spring AI', 'Transformer', 'Milvus', '智能体', 'Java', '阅读'],
  modelProviders: [
    {
      id: 'openai',
      provider: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      keyState: 'sk-...a31f',
      model: 'gpt-4o',
      state: 'connected',
      isDefault: false,
    },
    {
      id: 'deepseek',
      provider: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      keyState: 'sk-...d92c',
      model: 'deepseek-v4-flash',
      state: 'connected',
      isDefault: true,
    },
    {
      id: 'local',
      provider: '本地 Qwen',
      baseUrl: 'http://localhost:1234/v1',
      keyState: '无需密钥',
      model: 'qwen3.5-9b',
      state: 'local',
      isDefault: false,
    },
  ],
  profile: {
    displayName: '泽宝',
    email: 'liuyongze@example.com',
    organizeMode: 'manual',
    privacyMode: 'local_first',
  },
  storage: {
    totalItems: 1247,
    inboxItems: 7,
    readyItems: 1182,
    failedItems: 1,
    archivedItems: 57,
    totalTags: 84,
    totalModelSources: 4,
  },
};
