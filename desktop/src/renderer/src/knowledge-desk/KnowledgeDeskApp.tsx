import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  ChevronDown,
  FolderArchive,
  BookOpen,
  Clock3,
  FileText,
  Globe2,
  Inbox,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import { UserProfileDrawer } from './components/UserProfileDrawer';
import {
  archiveKnowledgeItem,
  addManagedSourceFolder,
  canUseDesktopBackupPicker,
  canUseDesktopBatchFileImport,
  canUseManagedSourceFolders,
  fallbackSnapshot,
  canUseDesktopFilePicker,
  commitLocalKnowledgeFileBatch,
  createModelSource,
  exportKnowledgeDeskBackup,
  importBrowserKnowledgeFile,
  importKnowledgeDeskBackup,
  importKnowledgeItem,
  importLocalKnowledgeFile,
  listIngestionJobs,
  listKnowledgeItems,
  listManagedSourceFolders,
  loadKnowledgeItemDetail,
  loadKnowledgeDeskSnapshot,
  organizeKnowledgeItem,
  organizeKnowledgeItems,
  openManagedSourceAsset,
  reprocessKnowledgeItem,
  restoreKnowledgeItem,
  pickKnowledgeDeskBackup,
  preflightLocalKnowledgeFileBatch,
  removeManagedSourceFolder,
  saveKnowledgeDeskBackup,
  scanManagedSourceFolder,
  setManagedSourceFolderEnabled,
  testModelSource,
  updateKnowledgeDeskSettingsProfile,
  updateKnowledgeItem,
  type ImportKnowledgeDraft,
  type ImportModelSourceDraft,
  type KnowledgeIngestionJob,
  type KnowledgeDeskSnapshot,
  type KnowledgeDeskBackup,
  type KnowledgeItem,
  type LocalFileBatchCommitResult,
  type LocalFileBatchPreflight,
  type ListKnowledgeItemsParams,
  type ModelProvider,
  type ManagedSourceFolder,
  type UpdateKnowledgeItemDraft,
} from './knowledgeDeskApi';
import { Button } from '../components/ui';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ArchivePage, ContextRail, ConnectionBanner, DashboardPage, DetailPage, ImportPanel, InboxPage, LibraryPage, SearchPage } from './knowledgeDeskScreens';
import { ReviewPage } from './knowledgeDeskReview';
import { LocalAssistantPage } from './knowledgeDeskAssistant';
import { SettingsPage } from './knowledgeDeskSettings';
import { KnowledgeDeskMark } from './KnowledgeDeskMark';
import type { MainPage, SettingsTab, ImportMode } from './knowledgeDeskTypes';
import {
  applySnapshotItemUpdate,
  buildSearchCorpus,
  isCommandSearchShortcut,
  type InboxSegment,
  type KnowledgeWorkflowAction,
} from './knowledgeDeskViewModel';
import './knowledge-desk.css';

const pages: Array<{ id: MainPage; label: string; icon: React.ElementType; badge?: string }> = [
  { id: 'dashboard', label: '工作台', icon: LayoutDashboard },
  { id: 'assistant', label: '本机助手', icon: MessageCircle },
  { id: 'inbox', label: '收集箱', icon: Inbox },
  { id: 'library', label: '知识库', icon: BookOpen },
  { id: 'review', label: '每日回顾', icon: Clock3 },
  { id: 'archive', label: '归档库', icon: FolderArchive },
  { id: 'search', label: '全局搜索', icon: Search },
];

const LOCAL_ASSISTANT_DRAFT_MAX_CHARS = 8_000;
const LOCAL_ASSISTANT_BODY_CONTEXT_MAX_CHARS = 6_000;
const LOCAL_ASSISTANT_TRUNCATION_NOTE = '\n\n（正文较长，以上为开头摘录；如需更多内容，请提示我继续补充。）';

const buildAssistantDraftFromKnowledge = (
  item: KnowledgeItem,
  context: 'summary' | 'body' = 'summary',
) => {
  const title = (item.title.trim() || '未命名资料').slice(0, 240);
  const summary = (item.summary.trim() || '这条资料暂时还没有摘要。').slice(0, 1_600);
  const tags = (item.tags.length > 0 ? item.tags.join('、') : '未分类').slice(0, 600);
  const body = (item.cleanedContent || item.rawContent || '').trim();
  const instruction = context === 'body'
    ? '我想基于下面这条本机资料继续理解或延展。正文摘录由我主动带入，请优先依据正文回答；无法从正文确认时请明确说明。'
    : '我想基于下面这条本机资料继续理解或延展，请先结合标题、摘要和标签回答。';
  const metadata = [
    instruction,
    '',
    `标题：${title}`,
    `摘要：${summary}`,
    `标签：${tags}`,
  ];
  const question = '\n\n我的问题：';

  if (context !== 'body' || !body) {
    return `${metadata.join('\n')}${question}`.slice(0, LOCAL_ASSISTANT_DRAFT_MAX_CHARS);
  }

  const prefix = `${metadata.join('\n')}\n\n正文摘录（由我主动带入）：\n`;
  const availableBodyChars = Math.max(
    0,
    Math.min(
      LOCAL_ASSISTANT_BODY_CONTEXT_MAX_CHARS,
      LOCAL_ASSISTANT_DRAFT_MAX_CHARS - prefix.length - question.length - LOCAL_ASSISTANT_TRUNCATION_NOTE.length,
    ),
  );
  const excerpt = body.slice(0, availableBodyChars).trimEnd();
  const truncationNote = excerpt.length < body.length ? LOCAL_ASSISTANT_TRUNCATION_NOTE : '';
  return `${prefix}${excerpt}${truncationNote}${question}`.slice(0, LOCAL_ASSISTANT_DRAFT_MAX_CHARS);
};

const KnowledgeDeskApp = () => {
  const [activePage, setActivePage] = useState<MainPage>('dashboard');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('profile');
  const [libraryMode, setLibraryMode] = useState<'list' | 'cards'>('list');
  const [activeInboxSegment, setActiveInboxSegment] = useState<InboxSegment>('all');
  const [snapshot, setSnapshot] = useState<KnowledgeDeskSnapshot>(fallbackSnapshot);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(true);
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
  const [detailFetch, setDetailFetch] = useState<{ isLoading: boolean; error: string | null }>({
    isLoading: false,
    error: null,
  });
  const [detailJobs, setDetailJobs] = useState<KnowledgeIngestionJob[]>([]);
  const [detailJobsFetch, setDetailJobsFetch] = useState<{ isLoading: boolean; error: string | null }>({
    isLoading: false,
    error: null,
  });
  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [itemActionState, setItemActionState] = useState<{ itemId: string; action: KnowledgeWorkflowAction } | null>(null);
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [managedSourceFolders, setManagedSourceFolders] = useState<ManagedSourceFolder[]>([]);
  const [assistantDraft, setAssistantDraft] = useState<{ id: number; text: string } | null>(null);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const detailRequestRef = useRef(0);
  const detailJobsRequestRef = useRef(0);
  const desktopFilePickerAvailable = canUseDesktopFilePicker();
  const desktopBatchFileImportAvailable = canUseDesktopBatchFileImport();
  const desktopBackupPickerAvailable = canUseDesktopBackupPicker();
  const desktopManagedSourceFoldersAvailable = canUseManagedSourceFolders();

  useEffect(() => {
    let cancelled = false;

    void loadKnowledgeDeskSnapshot().then((nextSnapshot) => {
      if (cancelled) return;
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setSelectedItem((current) => current ?? nextSnapshot.libraryItems[0] ?? nextSnapshot.inboxItems[0] ?? nextSnapshot.archivedItems[0] ?? null);
        setIsLoadingSnapshot(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault();
        setIsProfileDrawerOpen((prev) => !prev);
        return;
      }
      if (!isCommandSearchShortcut(event)) return;
      event.preventDefault();
      setActivePage('search');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    setIsLoadingSnapshot(true);
    try {
      const nextSnapshot = await loadKnowledgeDeskSnapshot();
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setSelectedItem((current) => current ?? nextSnapshot.libraryItems[0] ?? nextSnapshot.inboxItems[0] ?? nextSnapshot.archivedItems[0] ?? null);
        setIsLoadingSnapshot(false);
      });
      return nextSnapshot;
    } catch (error) {
      setIsLoadingSnapshot(false);
      throw error;
    }
  }, []);

  const showNotice = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 3200);
  };

  const refreshManagedSourceFolders = useCallback(async (isActive: () => boolean = () => true) => {
    if (!desktopManagedSourceFoldersAvailable) {
      if (isActive()) setManagedSourceFolders([]);
      return [];
    }
    const folders = await listManagedSourceFolders();
    if (isActive()) setManagedSourceFolders(folders);
    return folders;
  }, [desktopManagedSourceFoldersAvailable]);

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(() => refreshManagedSourceFolders(() => !cancelled)).catch(() => {
      if (!cancelled) setManagedSourceFolders([]);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshManagedSourceFolders]);

  const handleAddManagedSourceFolder = useCallback(async () => {
    await addManagedSourceFolder();
    await refreshManagedSourceFolders();
  }, [refreshManagedSourceFolders]);

  const handleSetManagedSourceFolderEnabled = useCallback(async (folderId: string, enabled: boolean) => {
    await setManagedSourceFolderEnabled(folderId, enabled);
    await refreshManagedSourceFolders();
    showNotice(enabled ? '已恢复资料夹监听。' : '已暂停资料夹监听。');
  }, [refreshManagedSourceFolders]);

  const handleScanManagedSourceFolder = useCallback(async (folderId: string) => {
    await scanManagedSourceFolder(folderId);
    await refreshManagedSourceFolders();
    showNotice('已开始扫描本机资料夹。', 'info');
  }, [refreshManagedSourceFolders]);

  const handleRemoveManagedSourceFolder = useCallback(async (folderId: string) => {
    await removeManagedSourceFolder(folderId);
    await refreshManagedSourceFolders();
    showNotice('已停止并移除资料夹监听；原目录和已收录原件均未删除。', 'info');
  }, [refreshManagedSourceFolders]);

  const handleOpenManagedSourceAsset = useCallback(async (assetId: string, reveal = false) => {
    await openManagedSourceAsset(assetId, reveal);
    showNotice(reveal ? '已在 Finder 中定位受管原件。' : '已使用系统默认应用打开受管原件。', 'info');
  }, []);

  const loadDetailJobs = useCallback(async (itemId: string) => {
    const requestId = detailJobsRequestRef.current + 1;
    detailJobsRequestRef.current = requestId;
    setDetailJobs([]);
    setDetailJobsFetch({ isLoading: true, error: null });
    try {
      const jobs = await listIngestionJobs({ knowledgeItemId: itemId, limit: 20 });
      if (detailJobsRequestRef.current !== requestId) return;
      startTransition(() => {
        setDetailJobs(jobs);
        setDetailJobsFetch({ isLoading: false, error: null });
      });
    } catch (error) {
      if (detailJobsRequestRef.current !== requestId) return;
      setDetailJobsFetch({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const handleImportSubmit = useCallback(async (draft: ImportKnowledgeDraft) => {
    setIsImporting(true);
    try {
      const item = await importKnowledgeItem(draft);
      setSelectedItem(item);
      setActivePage('inbox');
      setImportMode(null);
      await refreshSnapshot();
      showNotice(`已收集：${item.title}`);
    } catch (error) {
      setImportMode(null);
      showNotice(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setIsImporting(false);
    }
  }, [refreshSnapshot]);

  const handleLocalFileImport = useCallback(async (title?: string) => {
    setIsImporting(true);
    try {
      const item = await importLocalKnowledgeFile(title);
      if (!item) {
        setImportMode(null);
        showNotice('已取消文件选择', 'info');
        return;
      }
      setSelectedItem(item);
      setActivePage('inbox');
      setImportMode(null);
      await refreshSnapshot();
      showNotice(`已导入：${item.title}`);
    } catch (error) {
      setImportMode(null);
      showNotice(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setIsImporting(false);
    }
  }, [refreshSnapshot]);

  const handlePreflightLocalFileBatch = useCallback(async (): Promise<LocalFileBatchPreflight> => (
    preflightLocalKnowledgeFileBatch()
  ), []);

  const handleCommitLocalFileBatch = useCallback(async (
    batchId: string,
    candidateIds: string[],
  ): Promise<LocalFileBatchCommitResult> => {
    setIsImporting(true);
    try {
      const result = await commitLocalKnowledgeFileBatch(batchId, candidateIds);
      if (result.imported.length > 0) {
        await refreshSnapshot();
        setActivePage('inbox');
      }
      showNotice(
        `本机导入完成：成功 ${result.imported.length} 个，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个。`,
        result.failed.length > 0 ? 'info' : 'success',
      );
      return result;
    } finally {
      setIsImporting(false);
    }
  }, [refreshSnapshot]);

  const handleBrowserFileImport = useCallback(async (file: File, title?: string) => {
    setIsImporting(true);
    try {
      const item = await importBrowserKnowledgeFile(file, title);
      setSelectedItem(item);
      setActivePage('inbox');
      setImportMode(null);
      await refreshSnapshot();
      showNotice(`已导入：${item.title}`);
    } catch (error) {
      setImportMode(null);
      showNotice(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setIsImporting(false);
    }
  }, [refreshSnapshot]);

  const handleOrganizeBatch = useCallback(async () => {
    setIsOrganizing(true);
    try {
      const result = await organizeKnowledgeItems(true);
      await refreshSnapshot();
      showNotice(`整理完成：成功 ${result.succeeded} 条，失败 ${result.failed} 条`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setIsOrganizing(false);
    }
  }, [refreshSnapshot]);

  const handleItemAction = useCallback(async (item: KnowledgeItem, action: KnowledgeWorkflowAction) => {
    setItemActionState({ itemId: item.id, action });
    try {
      const nextItem = await runItemAction(item, action);

      if (snapshot.status === 'error' || snapshot.status === 'unknown') {
        const nextSnapshot = applySnapshotItemUpdate(snapshot, item, nextItem);
        startTransition(() => {
          setSnapshot(nextSnapshot);
          setSelectedItem((current) => (current?.id === item.id ? nextItem : current));
        });
      } else {
        const nextSnapshot = await refreshSnapshot();
        const refreshedItem = findSnapshotItem(nextSnapshot, nextItem.id) ?? nextItem;
        setSelectedItem((current) => (current?.id === item.id ? refreshedItem : current));
      }

      if (
        (action === 'organize' || action === 'reprocess')
        && (snapshot.status === 'ok' || snapshot.status === 'degraded')
      ) {
        void loadDetailJobs(nextItem.id);
      }

      showNotice(workflowNotice(action, nextItem.title));
    } catch (error) {
      const shouldRefreshFailedOrganize = (
        (action === 'organize' || action === 'reprocess')
        && (snapshot.status === 'ok' || snapshot.status === 'degraded')
      );
      if (shouldRefreshFailedOrganize) {
        const nextSnapshot = await refreshSnapshot().catch(() => null);
        const refreshedItem = nextSnapshot ? findSnapshotItem(nextSnapshot, item.id) : undefined;
        if (refreshedItem) {
          setSelectedItem((current) => (current?.id === item.id ? refreshedItem : current));
        }
        void loadDetailJobs(item.id);
      }
      showNotice(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setItemActionState(null);
    }
  }, [snapshot, refreshSnapshot, loadDetailJobs]);

  const handleItemUpdate = useCallback(async (item: KnowledgeItem, draft: UpdateKnowledgeItemDraft) => {
    const nextItem = await updateKnowledgeItem(item, draft);

    if (snapshot.status === 'error' || snapshot.status === 'unknown') {
      const nextSnapshot = applySnapshotItemUpdate(snapshot, item, nextItem);
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setSelectedItem((current) => (current?.id === item.id ? nextItem : current));
      });
    } else {
      const nextSnapshot = await refreshSnapshot();
      const refreshedItem = findSnapshotItem(nextSnapshot, nextItem.id) ?? nextItem;
      setSelectedItem((current) => (current?.id === item.id ? refreshedItem : current));
    }

    showNotice('知识条目已更新。');
  }, [snapshot, refreshSnapshot]);

  const handleCreateLocalModel = useCallback(async (
    draft: Pick<ImportModelSourceDraft, 'name' | 'baseUrl' | 'defaultModel' | 'apiKey'>,
  ) => {
    try {
      const source = await createModelSource({
        ...draft,
        providerType: 'local_compatible',
        apiKey: draft.apiKey.trim() || 'local',
        enabled: true,
        isDefault: false,
      });
      await testModelSource(source.id);
      await updateKnowledgeDeskSettingsProfile({
        defaultModelSourceId: source.id,
        summaryModelSourceId: source.id,
      });
      await refreshSnapshot();
      showNotice(`${source.provider} 已通过测试，并设为本机知识整理模型。`);
    } catch (error) {
      await refreshSnapshot().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      showNotice(message, 'error');
      throw error;
    }
  }, [refreshSnapshot]);

  const handleTestModel = useCallback(async (provider: ModelProvider) => {
    try {
      const result = await testModelSource(provider.id);
      await refreshSnapshot();
      const message = result.message || `${provider.provider} 可以用于本机整理。`;
      showNotice(message);
      return message;
    } catch (error) {
      await refreshSnapshot().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      showNotice(message, 'error');
      throw error;
    }
  }, [refreshSnapshot]);

  const handleUseForOrganization = useCallback(async (provider: ModelProvider) => {
    if (provider.providerType !== 'local_compatible' || provider.lastCheckStatus !== 'ok') {
      const error = new Error('请先通过本机聊天模型测试，再将它用于知识整理。');
      showNotice(error.message, 'error');
      throw error;
    }
    try {
      await updateKnowledgeDeskSettingsProfile({
        defaultModelSourceId: provider.id,
        summaryModelSourceId: provider.id,
      });
      await refreshSnapshot();
      showNotice(`${provider.provider} 已设为知识整理模型。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showNotice(message, 'error');
      throw error;
    }
  }, [refreshSnapshot]);

  const handleOrganizeModeChange = useCallback(async (mode: 'manual' | 'auto') => {
    try {
      await updateKnowledgeDeskSettingsProfile({ organizeMode: mode });
      await refreshSnapshot();
      showNotice(mode === 'auto' ? '已开启导入后自动整理。' : '已改为手动整理。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showNotice(message, 'error');
      throw error;
    }
  }, [refreshSnapshot]);

  const handleLoadKnowledgeItemsPage = useCallback((params: ListKnowledgeItemsParams) => (
    listKnowledgeItems(params)
  ), []);

  const handleExportBackup = useCallback(async () => {
    const backup = await exportKnowledgeDeskBackup();
    const savedPath = await saveKnowledgeDeskBackup(backup);
    showNotice(savedPath ? `本机备份已保存：${savedPath}` : '已取消备份保存。', savedPath ? 'success' : 'info');
    return savedPath !== null;
  }, []);

  const handleImportBackup = useCallback(async (backup: KnowledgeDeskBackup) => {
    const result = await importKnowledgeDeskBackup(backup);
    await refreshSnapshot();
    showNotice(result.message || `已合并导入 ${result.importedItems} 条资料。`);
  }, [refreshSnapshot]);

  const handlePickDesktopBackup = useCallback(async () => {
    const backup = await pickKnowledgeDeskBackup();
    if (!backup) {
      showNotice('已取消选择备份文件。', 'info');
      return false;
    }
    await handleImportBackup(backup);
    return true;
  }, [handleImportBackup]);

  const currentTitle = activePage === 'settings' ? '个人中心' : pages.find((page) => page.id === activePage)?.label ?? '工作台';
  const inboxItems = snapshot.inboxItems;
  const libraryItems = snapshot.libraryItems;
  const archivedItems = snapshot.archivedItems;
  const apiEnabled = snapshot.status === 'ok' || snapshot.status === 'degraded';
  const searchableItems = useMemo(() => buildSearchCorpus(libraryItems, archivedItems, inboxItems), [libraryItems, archivedItems, inboxItems]);
  const tags = useMemo(() => (snapshot.tags.length > 0 ? snapshot.tags : snapshot.dashboard.topTags.map((tag) => tag.name)), [snapshot.tags, snapshot.dashboard.topTags]);
  const detailItem = useMemo(() => selectedItem ?? libraryItems[0] ?? inboxItems[0] ?? archivedItems[0] ?? fallbackSnapshot.libraryItems[0], [selectedItem, libraryItems, inboxItems, archivedItems]);
  const getPageBadge = (page: (typeof pages)[number]) => {
    if (page.id === 'inbox' && snapshot.inboxItems.length > 0) return String(snapshot.inboxItems.length);
    if (page.id === 'archive' && snapshot.storage.archivedItems > 0) return String(snapshot.storage.archivedItems);
    if (page.id === 'review' && snapshot.dashboard.review.dueCount > 0) return String(snapshot.dashboard.review.dueCount);
    return page.badge;
  };
  const renderPageNavButton = (page: (typeof pages)[number], className: string) => {
    const Icon = page.icon;
    const badge = getPageBadge(page);
    return (
      <button
        aria-current={activePage === page.id ? 'page' : undefined}
        aria-label={`切换到${page.label}`}
        className={`${className} ${activePage === page.id ? 'is-active' : ''}`}
        key={`${className}-${page.id}`}
        onClick={() => setActivePage(page.id)}
        type="button"
      >
        <Icon size={18} />
        <span>{page.label}</span>
        {badge ? <span className="kd-nav-badge">{badge}</span> : null}
      </button>
    );
  };
  const openDetail = useCallback((item: KnowledgeItem, alreadyLoaded = false) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedItem(item);
    setActivePage('detail');
    if (snapshot.status !== 'ok' && snapshot.status !== 'degraded') {
      setDetailFetch({ isLoading: false, error: null });
      detailJobsRequestRef.current += 1;
      setDetailJobs([]);
      setDetailJobsFetch({ isLoading: false, error: null });
      return;
    }

    void loadDetailJobs(item.id);
    if (alreadyLoaded) {
      setDetailFetch({ isLoading: false, error: null });
      return;
    }
    setDetailFetch({ isLoading: true, error: null });
    void loadKnowledgeItemDetail(item.id)
      .then((fullItem) => {
        if (detailRequestRef.current !== requestId) return;
        startTransition(() => {
          setSelectedItem(fullItem);
          setDetailFetch({ isLoading: false, error: null });
        });
      })
      .catch((error) => {
        if (detailRequestRef.current !== requestId) return;
        setDetailFetch({
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [snapshot.status, loadDetailJobs]);

  return (
    <div className="kd-app kd-app--obsidian-index">
      <aside className="kd-sidebar">
        <div className="kd-brand" aria-label="知识工作台">
          <KnowledgeDeskMark className="kd-brand-mark" title="Knowledge Desk" />
          <div>
            <div className="kd-brand-name">知识工作台</div>
            <div className="kd-brand-subtitle">私人索引系统 / 01</div>
          </div>
        </div>

        <nav className="kd-nav" aria-label="主导航">
          {pages.map((page) => renderPageNavButton(page, 'kd-nav-item'))}
        </nav>

        <div className="kd-import-box">
          <div className="kd-import-title">快速导入</div>
          <button aria-label="导入网页摘录" className="kd-import-action" onClick={() => setImportMode('web')} type="button">
            <Globe2 size={16} />
            网页摘录
          </button>
          <button aria-label="导入本地文档" className="kd-import-action" onClick={() => setImportMode('file')} type="button">
            <Upload size={16} />
            本地文档
          </button>
          <button aria-label="粘贴文本片段" className="kd-import-action" onClick={() => setImportMode('snippet')} type="button">
            <FileText size={16} />
            粘贴内容
          </button>
        </div>

        <button aria-label="打开个人中心" className="kd-user-card" onClick={() => setIsProfileDrawerOpen(true)} type="button">
          <div className="kd-avatar">{snapshot.profile.displayName.slice(0, 1) || '泽'}</div>
          <div className="kd-user-meta">
            <strong>{snapshot.profile.displayName}</strong>
            <span className={snapshot.status === 'error' || snapshot.status === 'unknown' ? 'kd-user-meta--warning' : ''}>
              {snapshot.status === 'ok' ? '数据库已连接' : snapshot.status === 'degraded' ? '数据库已连接 (部分服务异常)' : '后端连接异常，当前为预览数据'}
            </span>
          </div>
          <Settings size={16} />
        </button>
      </aside>

      <main className={`kd-main kd-main--${activePage}`}>
        <header className="kd-topbar">
          <div>
            <p className="kd-kicker">Obsidian Index / Private Memory System</p>
            <h1>{currentTitle}</h1>
          </div>
          <button
            aria-keyshortcuts="Meta+K Control+K"
            aria-label="打开全局搜索"
            className="kd-command-search"
            onClick={() => setActivePage('search')}
            type="button"
          >
            <Search size={18} />
            <span>搜索主题、来源、标签、关键句</span>
            <kbd>⌘K</kbd>
          </button>
          <nav className="kd-mobile-nav" aria-label="移动端主导航">
            {pages.map((page) => renderPageNavButton(page, 'kd-mobile-nav-item'))}
          </nav>
          <div className="kd-topbar-actions">
            <Button onClick={() => setImportMode('snippet')} variant="primary">
              <Plus size={16} />
              新建资料
            </Button>
            <span className={`kd-sync-badge kd-sync-badge--${snapshot.status}`}>
              {isLoadingSnapshot ? '同步中' : snapshot.status === 'ok' ? '数据库已连接' : snapshot.status === 'degraded' ? '部分服务异常' : '预览数据'}
            </span>
            <button
              aria-label="刷新数据"
              className="kd-refresh-button"
              disabled={isLoadingSnapshot}
              onClick={() => void refreshSnapshot()}
              type="button"
            >
              <RefreshCw size={15} />
              {isLoadingSnapshot ? '同步中' : '刷新'}
            </button>

            {/* SupportFlow Style User Quick Center */}
            <div className="kd-topbar-divider" />
            <button
              aria-label="消息中心"
              className="kd-topbar-icon-btn"
              onClick={() => setActivePage('assistant')}
              title="本机智能助手"
              type="button"
            >
              <MessageSquare size={17} />
            </button>
            <button
              aria-label="系统通知"
              className="kd-topbar-icon-btn kd-has-badge"
              onClick={() => setIsProfileDrawerOpen(true)}
              title="通知与状态"
              type="button"
            >
              <Bell size={17} />
              <span className="kd-badge-dot">3</span>
            </button>
            <div className="kd-online-status-pill" onClick={() => setIsProfileDrawerOpen(true)}>
              <span className="kd-online-dot-sm" />
              <span>在线</span>
            </div>
            <button
              aria-label="打开个人中心"
              className="kd-user-topbar-pill"
              onClick={() => setIsProfileDrawerOpen(true)}
              type="button"
            >
              <div className="kd-topbar-avatar">
                {snapshot.profile.displayName.slice(0, 2) || 'AS'}
              </div>
              <ChevronDown size={14} className="kd-topbar-chevron" />
            </button>
          </div>
        </header>

        {activePage === 'settings' ? (
          <SettingsPage
            activeTab={settingsTab}
            canUseDesktopBackupPicker={desktopBackupPickerAvailable}
            canUseManagedSourceFolders={desktopManagedSourceFoldersAvailable}
            managedSourceFolders={managedSourceFolders}
            onAddManagedSourceFolder={handleAddManagedSourceFolder}
            onCreateLocalModel={handleCreateLocalModel}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onOrganizeModeChange={handleOrganizeModeChange}
            onPickDesktopBackup={handlePickDesktopBackup}
            onRemoveManagedSourceFolder={handleRemoveManagedSourceFolder}
            onScanManagedSourceFolder={handleScanManagedSourceFolder}
            onSetManagedSourceFolderEnabled={handleSetManagedSourceFolderEnabled}
            onTabChange={setSettingsTab}
            onTestModel={handleTestModel}
            onUseForOrganization={handleUseForOrganization}
            snapshot={snapshot}
          />
        ) : (
          <div className="kd-content-grid">
            {snapshot.status === 'error' || snapshot.status === 'unknown' || snapshot.status === 'degraded' ? (
              <ConnectionBanner
                error={snapshot.error}
                isLoading={isLoadingSnapshot}
                isDegraded={snapshot.status === 'degraded'}
                onRetry={() => void refreshSnapshot()}
              />
            ) : null}
            <section className="kd-workspace" aria-label={`${currentTitle} 主内容`}>
              {activePage === 'dashboard' ? (
                <PageErrorBoundary label="工作台" onReset={() => setActivePage('dashboard')}>
                  <DashboardPage
                    dashboard={snapshot.dashboard}
                    inboxItems={inboxItems}
                    isLoading={isLoadingSnapshot}
                    libraryItems={libraryItems}
                    onOpenImport={() => setImportMode('snippet')}
                    onOpenDetail={openDetail}
                    onOpenReview={() => setActivePage('review')}
                    tags={tags}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'assistant' ? (
                <PageErrorBoundary label="本机助手" onReset={() => setActivePage('assistant')}>
                  <LocalAssistantPage
                    defaultModelSourceId={snapshot.profile.defaultModelSourceId}
                    initialDraft={assistantDraft}
                    modelProviders={snapshot.modelProviders}
                    onConsumeInitialDraft={(id) => {
                      setAssistantDraft((current) => current?.id === id ? null : current);
                    }}
                    onOpenModelSettings={() => {
                      setSettingsTab('models');
                      setActivePage('settings');
                    }}
                    onSaveAssistantMessage={async (message) => {
                      const firstLine = message.content.replace(/\s+/g, ' ').trim().slice(0, 72);
                      const item = await importKnowledgeItem({
                        kind: 'snippet',
                        title: `助手笔记：${firstLine || '未命名回答'}`,
                        content: message.content,
                      });
                      await refreshSnapshot();
                      showNotice(`已收进知识库：${item.title}`);
                    }}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'inbox' ? (
                <PageErrorBoundary label="收集箱" onReset={() => setActivePage('inbox')}>
                  <InboxPage
                    actionState={itemActionState}
                    activeSegment={activeInboxSegment}
                    apiEnabled={apiEnabled}
                    inboxTotals={snapshot.inboxTotals}
                    isLoading={isLoadingSnapshot}
                    isOrganizing={isOrganizing}
                    items={inboxItems}
                    onItemAction={handleItemAction}
                    onLoadPage={handleLoadKnowledgeItemsPage}
                    onOpenDetail={openDetail}
                    onOrganizeBatch={handleOrganizeBatch}
                    onSegmentChange={setActiveInboxSegment}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'library' ? (
                <PageErrorBoundary label="知识库" onReset={() => setActivePage('library')}>
                  <LibraryPage
                    apiEnabled={apiEnabled}
                    isLoading={isLoadingSnapshot}
                    items={libraryItems}
                    mode={libraryMode}
                    onLoadPage={handleLoadKnowledgeItemsPage}
                    onModeChange={setLibraryMode}
                    onOpenDetail={openDetail}
                    tags={tags}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'review' ? (
                <PageErrorBoundary label="每日回顾" onReset={() => setActivePage('review')}>
                  <ReviewPage
                    apiEnabled={apiEnabled}
                    onOpenDetail={(itemId) => {
                      const item = libraryItems.find((candidate) => candidate.id === itemId);
                      if (item) {
                        openDetail(item);
                        return;
                      }
                      void loadKnowledgeItemDetail(itemId)
                        .then((fullItem) => openDetail(fullItem, true))
                        .catch((error) => showNotice(error instanceof Error ? error.message : String(error), 'error'));
                    }}
                    onReviewCompleted={async () => {
                      await refreshSnapshot();
                    }}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'archive' ? (
                <PageErrorBoundary label="归档库" onReset={() => setActivePage('archive')}>
                  <ArchivePage
                    actionState={itemActionState}
                    apiEnabled={apiEnabled}
                    isLoading={isLoadingSnapshot}
                    items={archivedItems}
                    onItemAction={handleItemAction}
                    onLoadPage={handleLoadKnowledgeItemsPage}
                    onOpenDetail={openDetail}
                    tags={tags}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'detail' ? (
                <PageErrorBoundary label="详情" onReset={() => setActivePage('dashboard')}>
                  <DetailPage
                    actionState={itemActionState}
                    error={detailFetch.error}
                    isLoading={detailFetch.isLoading}
                    item={detailItem}
                    jobHistoryEnabled={apiEnabled}
                    key={detailItem.id}
                    jobs={detailJobs}
                    jobsError={detailJobsFetch.error}
                    jobsLoading={detailJobsFetch.isLoading}
                    onAction={handleItemAction}
                    onAskAssistant={(targetItem, context) => {
                      setAssistantDraft({
                        id: Date.now(),
                        text: buildAssistantDraftFromKnowledge(targetItem, context),
                      });
                      setActivePage('assistant');
                    }}
                    onOpenManagedSourceAsset={handleOpenManagedSourceAsset}
                    onRetryJobs={() => void loadDetailJobs(detailItem.id)}
                    onUpdate={handleItemUpdate}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'search' ? (
                <PageErrorBoundary label="全局搜索" onReset={() => setActivePage('search')}>
                  <SearchPage
                    apiEnabled={apiEnabled}
                    availableTags={snapshot.tags}
                    searchableItems={searchableItems}
                    onOpenDetail={openDetail}
                  />
                </PageErrorBoundary>
              ) : null}
            </section>
            <ContextRail activePage={activePage} selectedItem={detailItem} snapshot={snapshot} />
          </div>
        )}
      </main>
      {importMode ? (
        <ImportPanel
          isSubmitting={isImporting}
          mode={importMode}
          onClose={() => setImportMode(null)}
          canUseDesktopBatchFileImport={desktopBatchFileImportAvailable}
          canUseDesktopFilePicker={desktopFilePickerAvailable}
          onCommitLocalFileBatch={handleCommitLocalFileBatch}
          onPreflightLocalFileBatch={handlePreflightLocalFileBatch}
          onUploadBrowserFile={handleBrowserFileImport}
          onImportLocalFile={handleLocalFileImport}
          onSubmit={handleImportSubmit}
        />
      ) : null}
      {notice ? (
        <div className={`kd-toast kd-toast-${notice.type}`} role="status" aria-live="polite">
          {notice.message}
        </div>
      ) : null}
      <UserProfileDrawer
        isOpen={isProfileDrawerOpen}
        onClose={() => setIsProfileDrawerOpen(false)}
        snapshot={snapshot}
        onRefreshSnapshot={async () => {
          await refreshSnapshot();
        }}
        onOpenSettingsTab={(tab) => {
          setActivePage('settings');
          setSettingsTab(tab as SettingsTab);
        }}
      />
    </div>
  );
};

const PageErrorBoundary = ({
  children,
  label,
  onReset,
}: {
  children: ReactNode;
  label: string;
  onReset: () => void;
}) => (
  <ErrorBoundary
    description={`${label}页面发生异常，已隔离显示，不影响其他页面。`}
    onReset={onReset}
    showDetails
    title={`${label}加载失败`}
  >
    {children}
  </ErrorBoundary>
);

const runItemAction = async (item: KnowledgeItem, action: KnowledgeWorkflowAction) => {
  if (action === 'organize') return organizeKnowledgeItem(item);
  if (action === 'reprocess') return reprocessKnowledgeItem(item);
  if (action === 'restore') return restoreKnowledgeItem(item);
  return archiveKnowledgeItem(item);
};

const workflowNotice = (action: KnowledgeWorkflowAction, title: string) => {
  if (action === 'organize') return `已开始整理：${title}`;
  if (action === 'reprocess') return `已重新整理：${title}`;
  if (action === 'restore') return `已恢复：${title}`;
  return `已归档：${title}`;
};

const findSnapshotItem = (snapshot: KnowledgeDeskSnapshot, itemId: string) => (
  snapshot.libraryItems.find((item) => item.id === itemId)
  ?? snapshot.inboxItems.find((item) => item.id === itemId)
  ?? snapshot.archivedItems.find((item) => item.id === itemId)
  ?? null
);

export default KnowledgeDeskApp;
