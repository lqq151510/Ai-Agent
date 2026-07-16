import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FolderArchive,
  BookOpen,
  FileText,
  Globe2,
  Inbox,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import {
  archiveKnowledgeItem,
  fallbackSnapshot,
  canUseDesktopFilePicker,
  importBrowserKnowledgeFile,
  importKnowledgeItem,
  importLocalKnowledgeFile,
  loadKnowledgeItemDetail,
  loadKnowledgeDeskSnapshot,
  organizeKnowledgeItem,
  organizeKnowledgeItems,
  reprocessKnowledgeItem,
  restoreKnowledgeItem,
  type ImportKnowledgeDraft,
  type KnowledgeDeskSnapshot,
  type KnowledgeItem,
} from './knowledgeDeskApi';
import { Button } from '../components/ui';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ArchivePage, ContextRail, ConnectionBanner, DashboardPage, DetailPage, ImportPanel, InboxPage, LibraryPage, SearchPage } from './knowledgeDeskScreens';
import { SettingsPage } from './knowledgeDeskSettings';
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
  { id: 'inbox', label: '收集箱', icon: Inbox },
  { id: 'library', label: '知识库', icon: BookOpen },
  { id: 'archive', label: '归档库', icon: FolderArchive },
  { id: 'search', label: '全局搜索', icon: Search },
];

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
  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [itemActionState, setItemActionState] = useState<{ itemId: string; action: KnowledgeWorkflowAction } | null>(null);
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const detailRequestRef = useRef(0);
  const desktopFilePickerAvailable = canUseDesktopFilePicker();

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
      if (!isCommandSearchShortcut(event)) return;
      event.preventDefault();
      setActivePage('search');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    setIsLoadingSnapshot(true);
    const nextSnapshot = await loadKnowledgeDeskSnapshot();
    startTransition(() => {
      setSnapshot(nextSnapshot);
      setSelectedItem((current) => current ?? nextSnapshot.libraryItems[0] ?? nextSnapshot.inboxItems[0] ?? nextSnapshot.archivedItems[0] ?? null);
      setIsLoadingSnapshot(false);
    });
    return nextSnapshot;
  }, []);

  const showNotice = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 3200);
  };

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

      showNotice(workflowNotice(action, nextItem.title));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setItemActionState(null);
    }
  }, [snapshot, refreshSnapshot]);

  const currentTitle = activePage === 'settings' ? '个人中心' : pages.find((page) => page.id === activePage)?.label ?? '工作台';
  const inboxItems = snapshot.inboxItems;
  const libraryItems = snapshot.libraryItems;
  const archivedItems = snapshot.archivedItems;
  const searchableItems = useMemo(() => buildSearchCorpus(libraryItems, archivedItems, inboxItems), [libraryItems, archivedItems, inboxItems]);
  const tags = useMemo(() => (snapshot.tags.length > 0 ? snapshot.tags : snapshot.dashboard.topTags.map((tag) => tag.name)), [snapshot.tags, snapshot.dashboard.topTags]);
  const detailItem = useMemo(() => selectedItem ?? libraryItems[0] ?? inboxItems[0] ?? archivedItems[0] ?? fallbackSnapshot.libraryItems[0], [selectedItem, libraryItems, inboxItems, archivedItems]);
  const getPageBadge = (page: (typeof pages)[number]) => {
    if (page.id === 'inbox' && snapshot.inboxItems.length > 0) return String(snapshot.inboxItems.length);
    if (page.id === 'archive' && snapshot.storage.archivedItems > 0) return String(snapshot.storage.archivedItems);
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
  const openDetail = useCallback((item: KnowledgeItem) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedItem(item);
    setActivePage('detail');
    if (snapshot.status !== 'ok' && snapshot.status !== 'degraded') {
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
  }, [snapshot.status]);

  return (
    <div className="kd-app">
      <aside className="kd-sidebar">
        <div className="kd-brand" aria-label="知识工作台">
          <div className="kd-brand-mark">知</div>
          <div>
            <div className="kd-brand-name">知识工作台</div>
            <div className="kd-brand-subtitle">个人知识工作台</div>
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

        <button aria-label="打开个人中心" className="kd-user-card" onClick={() => setActivePage('settings')} type="button">
          <div className="kd-avatar">泽</div>
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
            <p className="kd-kicker">现代编辑部式知识中台</p>
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
          </div>
        </header>

        {activePage === 'settings' ? (
          <SettingsPage activeTab={settingsTab} onTabChange={setSettingsTab} snapshot={snapshot} />
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
                    tags={tags}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'inbox' ? (
                <PageErrorBoundary label="收集箱" onReset={() => setActivePage('inbox')}>
                  <InboxPage
                    actionState={itemActionState}
                    activeSegment={activeInboxSegment}
                    isLoading={isLoadingSnapshot}
                    isOrganizing={isOrganizing}
                    items={inboxItems}
                    onItemAction={handleItemAction}
                    onOpenDetail={openDetail}
                    onOrganizeBatch={handleOrganizeBatch}
                    onSegmentChange={setActiveInboxSegment}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'library' ? (
                <PageErrorBoundary label="知识库" onReset={() => setActivePage('library')}>
                  <LibraryPage
                    isLoading={isLoadingSnapshot}
                    items={libraryItems}
                    mode={libraryMode}
                    onModeChange={setLibraryMode}
                    onOpenDetail={openDetail}
                    tags={tags}
                    totalItems={snapshot.storage.readyItems}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'archive' ? (
                <PageErrorBoundary label="归档库" onReset={() => setActivePage('archive')}>
                  <ArchivePage
                    actionState={itemActionState}
                    isLoading={isLoadingSnapshot}
                    items={archivedItems}
                    onItemAction={handleItemAction}
                    onOpenDetail={openDetail}
                    tags={tags}
                    totalItems={snapshot.storage.archivedItems}
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
                    onAction={handleItemAction}
                  />
                </PageErrorBoundary>
              ) : null}
              {activePage === 'search' ? (
                <PageErrorBoundary label="全局搜索" onReset={() => setActivePage('search')}>
                  <SearchPage apiEnabled={snapshot.status === 'ok' || snapshot.status === 'degraded'} searchableItems={searchableItems} onOpenDetail={openDetail} />
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
          canUseDesktopFilePicker={desktopFilePickerAvailable}
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
