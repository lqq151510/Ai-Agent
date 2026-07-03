import { startTransition, useEffect, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  FileText,
  Globe2,
  Inbox,
  RefreshCw,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import {
  fallbackSnapshot,
  canUseDesktopFilePicker,
  importBrowserKnowledgeFile,
  importKnowledgeItem,
  importLocalKnowledgeFile,
  loadKnowledgeItemDetail,
  loadKnowledgeDeskSnapshot,
  organizeKnowledgeItems,
  type ImportKnowledgeDraft,
  type KnowledgeDeskSnapshot,
  type KnowledgeItem,
} from './knowledgeDeskApi';
import { ContextRail, ConnectionBanner, DashboardPage, DetailPage, ImportPanel, InboxPage, LibraryPage, SearchPage } from './knowledgeDeskScreens';
import { SettingsPage } from './knowledgeDeskSettings';
import type { MainPage, SettingsTab, ImportMode } from './knowledgeDeskTypes';
import './knowledge-desk.css';

const pages: Array<{ id: MainPage; label: string; icon: React.ElementType; badge?: string }> = [
  { id: 'dashboard', label: '工作台', icon: Archive },
  { id: 'inbox', label: '收集箱', icon: Inbox },
  { id: 'library', label: '知识库', icon: BookOpen },
  { id: 'search', label: '全局搜索', icon: Search },
];

const KnowledgeDeskApp = () => {
  const [activePage, setActivePage] = useState<MainPage>('dashboard');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('profile');
  const [libraryMode, setLibraryMode] = useState<'list' | 'cards'>('list');
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
  const [notice, setNotice] = useState<string | null>(null);
  const detailRequestRef = useRef(0);
  const desktopFilePickerAvailable = canUseDesktopFilePicker();

  useEffect(() => {
    let cancelled = false;

    void loadKnowledgeDeskSnapshot().then((nextSnapshot) => {
      if (cancelled) return;
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setSelectedItem((current) => current ?? nextSnapshot.libraryItems[0] ?? nextSnapshot.inboxItems[0] ?? null);
        setIsLoadingSnapshot(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSnapshot = async () => {
    setIsLoadingSnapshot(true);
    const nextSnapshot = await loadKnowledgeDeskSnapshot();
    startTransition(() => {
      setSnapshot(nextSnapshot);
      setSelectedItem((current) => current ?? nextSnapshot.libraryItems[0] ?? nextSnapshot.inboxItems[0] ?? null);
      setIsLoadingSnapshot(false);
    });
    return nextSnapshot;
  };

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  };

  const handleImportSubmit = async (draft: ImportKnowledgeDraft) => {
    setIsImporting(true);
    try {
      const item = await importKnowledgeItem(draft);
      setSelectedItem(item);
      setActivePage('inbox');
      setImportMode(null);
      await refreshSnapshot();
      showNotice(`已收集：${item.title}`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  };

  const handleLocalFileImport = async (title?: string) => {
    setIsImporting(true);
    try {
      const item = await importLocalKnowledgeFile(title);
      if (!item) {
        showNotice('已取消文件选择');
        return;
      }
      setSelectedItem(item);
      setActivePage('inbox');
      setImportMode(null);
      await refreshSnapshot();
      showNotice(`已导入：${item.title}`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  };

  const handleBrowserFileImport = async (file: File, title?: string) => {
    setIsImporting(true);
    try {
      const item = await importBrowserKnowledgeFile(file, title);
      setSelectedItem(item);
      setActivePage('inbox');
      setImportMode(null);
      await refreshSnapshot();
      showNotice(`已导入：${item.title}`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  };

  const handleOrganizeBatch = async () => {
    setIsOrganizing(true);
    try {
      const result = await organizeKnowledgeItems(true);
      await refreshSnapshot();
      showNotice(`整理完成：成功 ${result.succeeded} 条，失败 ${result.failed} 条`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOrganizing(false);
    }
  };

  const currentTitle = activePage === 'settings' ? '个人中心' : pages.find((page) => page.id === activePage)?.label ?? '工作台';
  const inboxItems = snapshot.inboxItems;
  const libraryItems = snapshot.libraryItems;
  const tags = snapshot.tags.length > 0 ? snapshot.tags : snapshot.dashboard.topTags.map((tag) => tag.name);
  const detailItem = selectedItem ?? libraryItems[0] ?? inboxItems[0] ?? fallbackSnapshot.libraryItems[0];
  const openDetail = (item: KnowledgeItem) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedItem(item);
    setActivePage('detail');
    if (snapshot.source !== 'api') {
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
  };

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
          {pages.map((page) => {
            const Icon = page.icon;
            const badge = page.id === 'inbox' && snapshot.dashboard.inboxItems > 0 ? String(snapshot.dashboard.inboxItems) : page.badge;
            return (
              <button
                className={`kd-nav-item ${activePage === page.id ? 'is-active' : ''}`}
                key={page.id}
                onClick={() => setActivePage(page.id)}
                type="button"
              >
                <Icon size={18} />
                <span>{page.label}</span>
                {badge ? <span className="kd-nav-badge">{badge}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="kd-import-box">
          <div className="kd-import-title">快速导入</div>
          <button className="kd-import-action" onClick={() => setImportMode('web')} type="button">
            <Globe2 size={16} />
            网页摘录
          </button>
          <button className="kd-import-action" onClick={() => setImportMode('file')} type="button">
            <Upload size={16} />
            本地文档
          </button>
          <button className="kd-import-action" onClick={() => setImportMode('snippet')} type="button">
            <FileText size={16} />
            粘贴内容
          </button>
        </div>

        <button className="kd-user-card" onClick={() => setActivePage('settings')} type="button">
          <div className="kd-avatar">泽</div>
          <div className="kd-user-meta">
            <strong>{snapshot.profile.displayName}</strong>
            <span>{snapshot.source === 'api' ? '数据库已连接' : '预览数据，未连接数据库'}</span>
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
          <button className="kd-command-search" onClick={() => setActivePage('search')} type="button">
            <Search size={18} />
            <span>搜索主题、来源、标签、关键句</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="kd-topbar-actions">
            <span className={`kd-sync-badge kd-sync-badge--${snapshot.source}`}>
              {isLoadingSnapshot ? '同步中' : snapshot.source === 'api' ? '数据库已连接' : '预览数据'}
            </span>
            <button
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
            {snapshot.source === 'fallback' ? (
              <ConnectionBanner
                error={snapshot.error}
                isLoading={isLoadingSnapshot}
                onRetry={() => void refreshSnapshot()}
              />
            ) : null}
            <section className="kd-workspace" aria-label={`${currentTitle} 主内容`}>
              {activePage === 'dashboard' ? (
                <DashboardPage
                  dashboard={snapshot.dashboard}
                  inboxItems={inboxItems}
                  isLoading={isLoadingSnapshot}
                  libraryItems={libraryItems}
                  onOpenImport={() => setImportMode('snippet')}
                  onOpenDetail={openDetail}
                  tags={tags}
                />
              ) : null}
              {activePage === 'inbox' ? (
                <InboxPage
                  isOrganizing={isOrganizing}
                  items={inboxItems}
                  onOrganizeBatch={handleOrganizeBatch}
                />
              ) : null}
              {activePage === 'library' ? (
                <LibraryPage
                  items={libraryItems}
                  mode={libraryMode}
                  onModeChange={setLibraryMode}
                  onOpenDetail={openDetail}
                  tags={tags}
                  totalItems={snapshot.dashboard.totalItems}
                />
              ) : null}
              {activePage === 'detail' ? (
                <DetailPage error={detailFetch.error} isLoading={detailFetch.isLoading} item={detailItem} />
              ) : null}
              {activePage === 'search' ? (
                <SearchPage apiEnabled={snapshot.source === 'api'} initialItems={libraryItems} onOpenDetail={openDetail} />
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
      {notice ? <div className="kd-toast">{notice}</div> : null}
    </div>
  );
};

export default KnowledgeDeskApp;
