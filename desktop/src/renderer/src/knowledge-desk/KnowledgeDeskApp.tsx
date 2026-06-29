import { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  Clock3,
  Cloud,
  Cpu,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  Globe2,
  HardDrive,
  Inbox,
  KeyRound,
  LayoutGrid,
  Link2,
  ListFilter,
  Loader2,
  Network,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  UserRound,
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
  searchKnowledgeItems,
  type DashboardSummary,
  type ImportKnowledgeDraft,
  type KnowledgeDeskSnapshot,
  type KnowledgeItem,
  type ModelProvider,
} from './knowledgeDeskApi';
import './knowledge-desk.css';

type MainPage = 'dashboard' | 'inbox' | 'library' | 'detail' | 'search' | 'settings';
type SettingsTab = 'profile' | 'models' | 'ai' | 'privacy' | 'integrations';
type ImportMode = 'web' | 'file' | 'snippet';
type FilterCategory = 'source' | 'time' | 'tag';
type ItemFilters = Record<FilterCategory, string[]>;

const emptyFilters: ItemFilters = {
  source: [],
  time: [],
  tag: [],
};

const pages: Array<{ id: MainPage; label: string; icon: React.ElementType; badge?: string }> = [
  { id: 'dashboard', label: '工作台', icon: Archive },
  { id: 'inbox', label: '收集箱', icon: Inbox },
  { id: 'library', label: '知识库', icon: BookOpen },
  { id: 'search', label: '全局搜索', icon: Search },
];

const settingsTabs: Array<{ id: SettingsTab; label: string; icon: React.ElementType }> = [
  { id: 'profile', label: '账户', icon: UserRound },
  { id: 'models', label: '模型', icon: KeyRound },
  { id: 'ai', label: 'AI 偏好', icon: SlidersHorizontal },
  { id: 'privacy', label: '隐私', icon: Shield },
  { id: 'integrations', label: '导入集成', icon: Link2 },
];

const statusCopy: Record<NonNullable<KnowledgeItem['status']>, string> = {
  pending: '待整理',
  processing: '整理中',
  done: '已整理',
  failed: '需重试',
};

const typeCopy: Record<KnowledgeItem['type'], string> = {
  web: '网页',
  pdf: 'PDF',
  markdown: 'Markdown',
  paste: '粘贴',
  snippet: '片段',
};

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

const ConnectionBanner = ({
  error,
  isLoading,
  onRetry,
}: {
  error?: string;
  isLoading: boolean;
  onRetry: () => void;
}) => (
  <div className="kd-connection-banner" role="status">
    <AlertTriangle size={17} />
    <div>
      <strong>当前显示预览数据，尚未连接本机数据库</strong>
      <span>{error || '后端可能未启动，或登录凭证暂不可用。请重试连接。'}</span>
    </div>
    <button disabled={isLoading} onClick={onRetry} type="button">
      <RefreshCw size={15} />
      {isLoading ? '连接中' : '重新连接'}
    </button>
  </div>
);

const DashboardPage = ({
  dashboard,
  inboxItems,
  isLoading,
  libraryItems,
  onOpenImport,
  onOpenDetail,
  tags,
}: {
  dashboard: DashboardSummary;
  inboxItems: KnowledgeItem[];
  isLoading: boolean;
  libraryItems: KnowledgeItem[];
  onOpenImport: () => void;
  onOpenDetail: (item: KnowledgeItem) => void;
  tags: string[];
}) => {
  const recentItems = dashboard.recentItems.length > 0 ? dashboard.recentItems : libraryItems;
  const topTags = dashboard.topTags.length > 0 ? dashboard.topTags.map((tag) => tag.name) : tags;

  return (
  <div className="kd-stack">
    <section className="kd-search-hero">
      <div>
        <p>今日研究台</p>
        <h2>把新资料先收进来，再慢慢变成能找回的知识。</h2>
      </div>
      <button className="kd-primary-button" onClick={onOpenImport} type="button">
        <Plus size={17} />
        新增资料
      </button>
    </section>

    <div className="kd-stat-grid">
      <MetricCard label="今日新增" value={String(inboxItems.length)} detail={isLoading ? '正在同步本地知识库' : '来自收集箱最新条目'} />
      <MetricCard label="整理完成" value={formatCount(dashboard.readyItems)} detail="已进入可检索知识库" />
      <MetricCard label="待处理收集箱" value={formatCount(dashboard.inboxItems)} detail={`${dashboard.failedItems} 条需要重试`} />
      <MetricCard label="知识总量" value={formatCount(dashboard.totalItems)} detail="网页 / PDF / Markdown 统一索引" />
    </div>

    <div className="kd-two-column">
      <Panel title="最近整理完成" icon={CheckCircle2}>
        <ItemList emptyText="暂无整理完成的条目" items={recentItems.slice(0, 3)} onOpenDetail={onOpenDetail} />
      </Panel>
      <Panel title="待处理收集箱" icon={Inbox}>
        <ItemList emptyText="收集箱已清空" items={inboxItems.slice(0, 3)} />
      </Panel>
    </div>

    <div className="kd-two-column kd-two-column--soft">
      <Panel title="高频标签" icon={Tags}>
        <div className="kd-tag-cloud">
          {topTags.slice(0, 12).map((tag) => (
            <span className="kd-tag" key={tag}>{tag}</span>
          ))}
          {topTags.length === 0 ? <span className="kd-muted">暂无标签，导入并整理资料后会自动生成。</span> : null}
        </div>
      </Panel>
      <Panel title="最近访问" icon={Clock3}>
        <div className="kd-timeline">
          {recentItems.slice(0, 3).map((item) => (
            <TimelineItem item={item} key={item.id} />
          ))}
          {recentItems.length === 0 ? (
            <>
              <span>--</span>
              <strong>暂无访问记录</strong>
            </>
          ) : null}
        </div>
      </Panel>
    </div>
  </div>
  );
};

const InboxPage = ({
  isOrganizing,
  items,
  onOrganizeBatch,
}: {
  isOrganizing: boolean;
  items: KnowledgeItem[];
  onOrganizeBatch: () => void;
}) => (
  <div className="kd-stack">
    <div className="kd-page-tools">
      <div className="kd-segmented">
        <button className="is-active" type="button">待整理</button>
        <button type="button">整理中</button>
        <button type="button">已整理</button>
      </div>
      <div className="kd-tool-actions">
        <button disabled={isOrganizing || items.length === 0} onClick={onOrganizeBatch} type="button">
          <RefreshCw size={16} /> {isOrganizing ? '整理中' : '批量整理'}
        </button>
        <button type="button"><Filter size={16} /> 来源筛选</button>
      </div>
    </div>

    <section className="kd-inbox-board">
      {items.map((item) => (
        <article className={`kd-inbox-row kd-inbox-row--${item.status}`} key={item.id}>
          <div className="kd-source-icon">{sourceIcon(item.type)}</div>
          <div className="kd-row-main">
            <div className="kd-row-titleline">
              <h3>{item.title}</h3>
              {item.status ? <StatusPill status={item.status} /> : null}
            </div>
            <p>{item.summary}</p>
            <MetaLine item={item} />
          </div>
          <button className="kd-icon-button" type="button" aria-label="预览">
            <Eye size={17} />
          </button>
        </article>
      ))}
      {items.length === 0 ? (
        <EmptyBlock
          icon={Inbox}
          title="收集箱是空的"
          description="网页摘录、本地 Markdown / PDF 和粘贴内容会先进入这里，再被整理进知识库。"
        />
      ) : null}
    </section>

    <StateStrip />
  </div>
);

const ImportPanel = ({
  canUseDesktopFilePicker,
  isSubmitting,
  mode,
  onClose,
  onUploadBrowserFile,
  onImportLocalFile,
  onSubmit,
}: {
  canUseDesktopFilePicker: boolean;
  isSubmitting: boolean;
  mode: ImportMode;
  onClose: () => void;
  onUploadBrowserFile: (file: File, title?: string) => Promise<void>;
  onImportLocalFile: (title?: string) => Promise<void>;
  onSubmit: (draft: ImportKnowledgeDraft) => Promise<void>;
}) => {
  const browserFileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isFileMode = mode === 'file';
  const sourceRequired = mode === 'web';

  const handleChooseFile = async () => {
    setError(null);
    if (!canUseDesktopFilePicker) {
      browserFileInputRef.current?.click();
      return;
    }
    await onImportLocalFile(title);
  };

  const handleBrowserFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    await onUploadBrowserFile(file, title);
    input.value = '';
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFileMode) {
      await handleChooseFile();
      return;
    }
    if (sourceRequired && !source.trim()) {
      setError('网页摘录需要填写来源 URL。');
      return;
    }
    if (!content.trim()) {
      setError('内容不能为空。');
      return;
    }
    setError(null);
    await onSubmit({
      kind: mode,
      title,
      source,
      content,
    });
  };

  return (
    <div className="kd-import-modal" role="dialog" aria-modal="true" aria-label="导入资料">
      <form className="kd-import-sheet" onSubmit={(event) => void handleSubmit(event)}>
        <header>
          <div>
            <p className="kd-kicker">收集到收集箱</p>
            <h2>{importModeTitle(mode)}</h2>
          </div>
          <button className="kd-icon-button" onClick={onClose} type="button" aria-label="关闭导入面板">×</button>
        </header>

        <label className="kd-field">
          <span>标题</span>
          <input
            onChange={(event) => setTitle(event.target.value)}
            placeholder={isFileMode ? '可选，留空则使用文件名' : '可选，留空则按来源自动命名'}
            value={title}
          />
        </label>

        {isFileMode ? (
          <div className="kd-file-picker-card">
            <div className="kd-file-picker-icon">
              <FolderOpen size={24} />
            </div>
            <div>
              <strong>从访达 / 我的电脑选择文件</strong>
              <span>
                支持 .md、.markdown、.pdf，也兼容 txt/html 文本资料。
                {canUseDesktopFilePicker ? '桌面端会打开系统文件选择器。' : '浏览器预览会使用系统文件选择器上传到本机数据库。'}
              </span>
            </div>
            <input
              ref={browserFileInputRef}
              accept=".md,.markdown,.pdf,.txt,.html,text/markdown,application/pdf,text/plain,text/html"
              className="kd-hidden-file-input"
              onChange={(event) => void handleBrowserFileSelected(event)}
              type="file"
            />
          </div>
        ) : null}

        {!isFileMode && mode !== 'snippet' ? (
          <label className="kd-field">
            <span>来源 URL</span>
            <input
              onChange={(event) => setSource(event.target.value)}
              placeholder="https://example.com/article"
              value={source}
            />
          </label>
        ) : null}

        {!isFileMode ? (
          <label className="kd-field">
            <span>摘录内容</span>
            <textarea
              onChange={(event) => setContent(event.target.value)}
              placeholder="粘贴网页正文、Markdown 内容或临时摘录..."
              rows={9}
              value={content}
            />
          </label>
        ) : null}

        {error ? <div className="kd-form-error">{error}</div> : null}

        <footer>
          <p>
            {isFileMode
              ? '点击导入会打开系统文件选择器；文件解析在后端完成，不需要手写路径。'
              : '内容会先进入收集箱，后续可批量整理为摘要、标签与可检索知识条目。'}
          </p>
          <div>
            <button className="kd-secondary-button" onClick={onClose} type="button">取消</button>
            <button className="kd-primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? '导入中' : isFileMode ? '选择文件并导入' : '导入收集箱'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
};

const LibraryPage = ({
  items,
  mode,
  onModeChange,
  onOpenDetail,
  tags,
  totalItems,
}: {
  items: KnowledgeItem[];
  mode: 'list' | 'cards';
  onModeChange: (mode: 'list' | 'cards') => void;
  onOpenDetail: (item: KnowledgeItem) => void;
  tags: string[];
  totalItems: number;
}) => {
  const [filters, setFilters] = useState<ItemFilters>(emptyFilters);
  const sourceOptions = buildSourceOptions(items, ['网页摘录', 'PDF', 'Markdown', '粘贴内容']);
  const tagOptions = buildTagOptions(items, tags);
  const filteredItems = applyItemFilters(items, filters);
  const hasActiveFilters = activeFilterCount(filters) > 0;

  return (
    <div className="kd-library-layout">
      <aside className="kd-filter-rail">
        <FilterGroup
          activeValues={filters.source}
          onToggle={(value) => setFilters((current) => toggleFilterValue(current, 'source', value))}
          title="来源"
          values={sourceOptions}
        />
        <FilterGroup
          activeValues={filters.time}
          onToggle={(value) => setFilters((current) => toggleFilterValue(current, 'time', value))}
          title="时间"
          values={['今天', '本周', '本月', '更早']}
        />
        <FilterGroup
          activeValues={filters.tag}
          onToggle={(value) => setFilters((current) => toggleFilterValue(current, 'tag', value))}
          title="主题"
          values={tagOptions}
        />
        <FilterSummary
          filters={filters}
          onClear={() => setFilters(emptyFilters)}
          resultCount={filteredItems.length}
          totalCount={items.length}
        />
      </aside>

      <div className="kd-stack">
        <div className="kd-page-tools">
          <div>
            <h2 className="kd-section-title">{formatCount(filteredItems.length)} / {formatCount(totalItems)} 条知识条目</h2>
            <p className="kd-muted">
              {hasActiveFilters ? '已按当前筛选条件收窄结果。' : '按来源、标签、时间和文档类型找回内容。'}
            </p>
          </div>
          <div className="kd-segmented">
            <button className={mode === 'list' ? 'is-active' : ''} onClick={() => onModeChange('list')} type="button">
              <ListFilter size={15} /> 列表
            </button>
            <button className={mode === 'cards' ? 'is-active' : ''} onClick={() => onModeChange('cards')} type="button">
              <LayoutGrid size={15} /> 卡片
            </button>
          </div>
        </div>

        <div className={mode === 'list' ? 'kd-library-list' : 'kd-library-cards'}>
          {filteredItems.map((item) => (
            <article className="kd-library-item" key={item.id} onClick={() => onOpenDetail(item)}>
              <div className="kd-type-badge">{typeCopy[item.type]}</div>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <MetaLine item={item} />
            </article>
          ))}
          {filteredItems.length === 0 ? (
            <EmptyBlock
              icon={BookOpen}
              title={hasActiveFilters ? '没有匹配当前筛选的条目' : '知识库还没有可检索条目'}
              description={hasActiveFilters
                ? '清空部分筛选条件，或换一个来源、标签、时间范围再找。'
                : '完成整理后的资料会出现在这里，并支持按来源、标签、时间和文档类型筛选。'}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

const DetailPage = ({
  error,
  isLoading,
  item,
}: {
  error?: string | null;
  isLoading?: boolean;
  item: KnowledgeItem;
}) => {
  const body = item.cleanedContent || item.rawContent || item.summary;
  const paragraphs = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
  <article className="kd-detail">
    <div className="kd-breadcrumb">知识库 / {item.tags[0] ?? '未分类'} / {typeCopy[item.type]}</div>
    <h2>{item.title}</h2>
    <div className="kd-detail-meta">
      <span>{sourceIcon(item.type)} {typeCopy[item.type]}</span>
      <span><Clock3 size={16} /> {item.time} 整理</span>
      <span><Globe2 size={16} /> {item.source}</span>
    </div>

    {isLoading ? (
      <div className="kd-detail-status">
        <Loader2 size={16} />
        正在加载完整正文，当前先展示摘要内容。
      </div>
    ) : null}
    {error ? (
      <div className="kd-detail-status kd-detail-status--error">
        <AlertTriangle size={16} />
        完整正文加载失败：{error}
      </div>
    ) : null}

    {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    {paragraphs.length === 0 ? <p>这条知识还没有可展示正文，整理完成后会补充清洗后的内容。</p> : null}
    <blockquote>
      这条知识已关联到 {item.tags.length > 0 ? item.tags.join(' / ') : '未分类主题'}，后续可从标签、来源、时间和关键词再次找回。
    </blockquote>
  </article>
  );
};

const SearchPage = ({
  apiEnabled,
  initialItems,
  onOpenDetail,
}: {
  apiEnabled: boolean;
  initialItems: KnowledgeItem[];
  onOpenDetail: (item: KnowledgeItem) => void;
}) => {
  const [query, setQuery] = useState('注意力机制 RAG 检索');
  const [results, setResults] = useState<KnowledgeItem[] | null>(null);
  const [filters, setFilters] = useState<ItemFilters>(emptyFilters);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const baseResults = results ?? filterLocalItems(initialItems, deferredQuery);
  const visibleResults = applyItemFilters(baseResults, filters).slice(0, 12);
  const sourceOptions = buildSourceOptions(baseResults, ['网页摘录', 'PDF', 'Markdown']);
  const tagOptions = buildTagOptions(baseResults, initialItems.flatMap((item) => item.tags));

  const runSearch = async () => {
    const nextQuery = query.trim();
    setIsSearching(true);
    setSearchError(null);
    try {
      if (apiEnabled && nextQuery) {
        const apiResults = await searchKnowledgeItems(nextQuery);
        setResults(apiResults);
        return;
      }
      setResults(filterLocalItems(initialItems, nextQuery));
    } catch (error) {
      setResults(filterLocalItems(initialItems, nextQuery));
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="kd-search-page">
      <div className="kd-search-box">
        <Search size={24} />
        <input
          aria-label="全局搜索"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void runSearch();
          }}
          value={query}
        />
        <button disabled={isSearching} onClick={() => void runSearch()} type="button">
          {isSearching ? '搜索中' : '搜索'}
        </button>
      </div>

      <div className="kd-search-layout">
        <aside className="kd-filter-rail">
          <FilterGroup
            activeValues={filters.source}
            onToggle={(value) => setFilters((current) => toggleFilterValue(current, 'source', value))}
            title="来源"
            values={sourceOptions}
          />
          <FilterGroup
            activeValues={filters.tag}
            onToggle={(value) => setFilters((current) => toggleFilterValue(current, 'tag', value))}
            title="标签"
            values={tagOptions}
          />
          <FilterGroup
            activeValues={filters.time}
            onToggle={(value) => setFilters((current) => toggleFilterValue(current, 'time', value))}
            title="时间"
            values={['今天', '本周', '本月']}
          />
          <FilterSummary
            filters={filters}
            onClear={() => setFilters(emptyFilters)}
            resultCount={visibleResults.length}
            totalCount={baseResults.length}
          />
        </aside>
        <section className="kd-search-results">
          {searchError ? (
            <div className="kd-search-warning">
              数据库搜索暂不可用，已使用当前可见条目过滤。{searchError}
            </div>
          ) : null}
          {visibleResults.map((item) => (
            <article className="kd-search-result" key={item.id} onClick={() => onOpenDetail(item)}>
              <div className="kd-result-head">
                <span className="kd-type-badge">{typeCopy[item.type]}</span>
                <span>{item.source}</span>
                <span>{item.time}</span>
              </div>
              <h3>{item.title}</h3>
              <p>命中片段：{buildSearchSnippet(item, query)}</p>
              <small>{item.summary}</small>
            </article>
          ))}
          {visibleResults.length === 0 ? (
            <div className="kd-no-result">
              <Search size={18} />
              <strong>无结果状态</strong>
              <span>当没有命中时，展示可调整的标签、来源和时间范围，而不是空白页面。</span>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

const SettingsPage = ({
  activeTab,
  onTabChange,
  snapshot,
}: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  snapshot: KnowledgeDeskSnapshot;
}) => (
  <div className="kd-settings">
    <aside className="kd-settings-nav">
      {settingsTabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            className={activeTab === tab.id ? 'is-active' : ''}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            <Icon size={17} />
            {tab.label}
          </button>
        );
      })}
    </aside>
    <section className="kd-settings-content">
      {activeTab === 'profile' ? <ProfileSettings snapshot={snapshot} /> : null}
      {activeTab === 'models' ? <ModelSettings providers={snapshot.modelProviders} /> : null}
      {activeTab === 'ai' ? <AiPreferenceSettings providers={snapshot.modelProviders} profile={snapshot.profile} /> : null}
      {activeTab === 'privacy' ? <PrivacySettings privacyMode={snapshot.profile.privacyMode} /> : null}
      {activeTab === 'integrations' ? <IntegrationSettings /> : null}
    </section>
  </div>
);

const ProfileSettings = ({ snapshot }: { snapshot: KnowledgeDeskSnapshot }) => (
  <div className="kd-stack">
    <SettingsHeader title="账户信息" description="管理身份、设备状态、同步状态、存储占用和数据备份。" />
    <section className="kd-profile-band">
      <div className="kd-profile-avatar">{snapshot.profile.displayName.slice(0, 1) || '泽'}</div>
      <div>
        <h2>{snapshot.profile.displayName}</h2>
        <p>{snapshot.profile.email}</p>
        <div className="kd-inline-status">
          <span><HardDrive size={15} /> MacBook Pro 本地在线</span>
          <span><Cloud size={15} /> {snapshot.source === 'api' ? '本机数据库同步正常' : '未连接数据库'}</span>
        </div>
      </div>
    </section>
    <section className="kd-settings-grid">
      <MetricCard label="知识条目" value={formatCount(snapshot.storage.totalItems)} detail={`${snapshot.storage.archivedItems} 条已归档`} />
      <MetricCard label="本地索引" value={formatCount(snapshot.storage.readyItems)} detail={`${snapshot.storage.inboxItems} 条仍在收集箱`} />
      <MetricCard label="标签资产" value={formatCount(snapshot.storage.totalTags)} detail={`${snapshot.storage.totalModelSources} 个模型源可用`} />
      <MetricCard
        label="数据库连接"
        value={snapshot.source === 'api' ? '已连接' : '未连接'}
        detail={snapshot.source === 'api' ? '正在读取本机知识库' : snapshot.error ?? '后端未启动或认证不可用'}
      />
    </section>
    <div className="kd-settings-actions">
      <button type="button"><Download size={16} /> 导出数据</button>
      <button type="button"><Database size={16} /> 备份知识库</button>
      <button type="button"><RefreshCw size={16} /> 重建索引</button>
    </div>
  </div>
);

const ModelSettings = ({ providers }: { providers: ModelProvider[] }) => (
  <div className="kd-stack">
    <SettingsHeader title="第三方模型配置" description="管理 OpenAI、DeepSeek、Anthropic、OpenRouter 和本地模型源。" />
    <div className="kd-model-grid">
      {providers.map((provider) => (
        <article className="kd-model-card" key={provider.id}>
          <div className="kd-model-card-head">
            <strong>{provider.provider}</strong>
            <span className={`kd-provider-state kd-provider-state--${provider.state}`}>{providerStateLabel(provider)}</span>
          </div>
          <dl>
            <dt>接口地址</dt>
            <dd>{provider.baseUrl}</dd>
            <dt>密钥状态</dt>
            <dd>{provider.keyState}</dd>
            <dt>默认模型</dt>
            <dd>{provider.model}</dd>
          </dl>
          <div className="kd-model-actions">
            <button disabled={provider.isDefault} type="button">{provider.isDefault ? '默认模型源' : '设为默认'}</button>
            <button type="button">测试连接</button>
            <button type="button">编辑</button>
            <button className="danger" type="button"><Trash2 size={14} /> 删除</button>
          </div>
        </article>
      ))}
      {providers.length === 0 ? (
        <EmptyBlock
          icon={KeyRound}
          title="还没有配置模型源"
          description="添加 OpenAI、DeepSeek、OpenRouter 或本地兼容模型后，整理和检索能力会使用这里的配置。"
        />
      ) : null}
      <button className="kd-add-provider" type="button">
        <Plus size={20} />
        新增模型源
      </button>
    </div>
  </div>
);

const AiPreferenceSettings = ({
  providers,
  profile,
}: {
  providers: ModelProvider[];
  profile: KnowledgeDeskSnapshot['profile'];
}) => {
  const defaultProvider = providers.find((provider) => provider.isDefault) ?? providers[0];
  const defaultModel = defaultProvider ? `${defaultProvider.provider} / ${defaultProvider.model}` : '未配置模型源';

  return (
  <div className="kd-stack">
    <SettingsHeader title="AI 能力偏好" description="为摘要、标签、知识整理和检索问答分配默认模型。" />
    <section className="kd-preference-list">
      <PreferenceRow label="摘要默认模型" value={defaultModel} />
      <PreferenceRow label="标签提取默认模型" value={defaultModel} />
      <PreferenceRow label="知识整理默认模型" value={defaultModel} />
      <PreferenceRow label="检索问答默认模型" value={defaultModel} />
    </section>
    <section className="kd-settings-split">
      <Panel title="响应偏好" icon={Sparkles}>
        <div className="kd-segmented kd-segmented--wide">
          <button type="button">简短</button>
          <button className="is-active" type="button">标准</button>
          <button type="button">详细</button>
        </div>
        <div className="kd-segmented kd-segmented--wide">
          <button type="button">成本优先</button>
          <button className="is-active" type="button">质量优先</button>
          <button type="button">速度优先</button>
        </div>
      </Panel>
      <Panel title="整理策略" icon={PanelRight}>
        <ToggleRow label="自动生成摘要" checked={profile.organizeMode !== 'manual'} />
        <ToggleRow label="自动提取标签" checked={profile.organizeMode !== 'manual'} />
        <ToggleRow label="自动建立主题归类" checked={profile.organizeMode === 'auto'} />
      </Panel>
    </section>
  </div>
  );
};

const PrivacySettings = ({ privacyMode }: { privacyMode: string }) => (
  <div className="kd-stack">
    <SettingsHeader title="隐私与数据控制" description="控制内容是否发送云端模型，并管理缓存、索引和敏感内容提示。" />
    <section className="kd-preference-list">
      <ToggleRow label="允许内容发送给云端模型" checked={privacyMode !== 'local_only'} />
      <ToggleRow label="本地优先处理" checked={privacyMode === 'local_first' || privacyMode === 'local_only'} />
      <ToggleRow label="敏感内容处理提示" checked />
    </section>
    <section className="kd-danger-zone">
      <AlertTriangle size={18} />
      <div>
        <strong>数据清理</strong>
        <p>删除缓存、重建索引和清理知识库前应先导出备份。</p>
      </div>
      <button type="button">删除缓存</button>
      <button type="button">重建索引</button>
    </section>
  </div>
);

const IntegrationSettings = () => (
  <div className="kd-stack">
    <SettingsHeader title="导入与集成设置" description="配置浏览器摘录、本地导入规则、Markdown / PDF 解析偏好和自动整理。" />
    <section className="kd-preference-list">
      <PreferenceRow label="浏览器摘录来源" value="Chrome 扩展已连接" />
      <PreferenceRow label="默认导入目录" value="~/Documents/知识工作台/收集箱" />
      <PreferenceRow label="Markdown 解析" value="保留标题层级、代码块和 frontmatter" />
      <PreferenceRow label="PDF 解析" value="章节识别 + 引用保留 + 图片占位" />
      <PreferenceRow label="默认标签策略" value="主题标签 3 个 + 来源标签 1 个" />
      <ToggleRow label="导入后自动整理" checked />
    </section>
  </div>
);

const ContextRail = ({
  activePage,
  selectedItem,
  snapshot,
}: {
  activePage: MainPage;
  selectedItem: KnowledgeItem;
  snapshot: KnowledgeDeskSnapshot;
}) => {
  if (activePage === 'detail') {
    return (
      <aside className="kd-context-rail">
        <ContextBlock title="AI 摘要">
          <p>{selectedItem.summary}</p>
        </ContextBlock>
        <ContextBlock title="关联标签">
          <div className="kd-tag-cloud">
            {selectedItem.tags.map((tag) => <span className="kd-tag" key={tag}>{tag}</span>)}
            {selectedItem.tags.length === 0 ? <span className="kd-muted">暂无标签</span> : null}
          </div>
        </ContextBlock>
        <ContextBlock title="关联条目">
          {snapshot.libraryItems
            .filter((item) => item.id !== selectedItem.id)
            .slice(0, 3)
            .map((item) => <p key={item.id}>{item.title}</p>)}
          {snapshot.libraryItems.length <= 1 ? <p>整理更多资料后会显示关联条目。</p> : null}
        </ContextBlock>
      </aside>
    );
  }

  const storagePercent = toPercent(snapshot.storage.readyItems, Math.max(snapshot.storage.totalItems, 1));

  return (
    <aside className="kd-context-rail">
      <ContextBlock title="整理队列">
        <div className="kd-queue-row"><Loader2 size={15} /> {snapshot.dashboard.inboxItems} 条待整理</div>
        <div className="kd-queue-row"><CheckCircle2 size={15} /> {snapshot.dashboard.readyItems} 条已整理</div>
        <div className="kd-queue-row is-warning"><AlertTriangle size={15} /> {snapshot.dashboard.failedItems} 条需重试</div>
      </ContextBlock>
      <ContextBlock title="知识资产">
        <div className="kd-asset-meter"><span style={{ width: `${storagePercent}%` }} /></div>
        <p>{formatCount(snapshot.storage.readyItems)} / {formatCount(snapshot.storage.totalItems)} 条已进入可检索索引。</p>
      </ContextBlock>
      <ContextBlock title="未来扩展位">
        <div className="kd-extension-list">
          <span><Network size={15} /> 知识图谱</span>
          <span><Cpu size={15} /> 个性化推荐</span>
          <span><BookOpen size={15} /> 复习回顾</span>
        </div>
      </ContextBlock>
    </aside>
  );
};

const Panel = ({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) => (
  <section className="kd-panel">
    <header>
      <Icon size={17} />
      <h2>{title}</h2>
    </header>
    {children}
  </section>
);

const ContextBlock = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="kd-context-block">
    <h2>{title}</h2>
    {children}
  </section>
);

const MetricCard = ({ label, value, detail }: { label: string; value: string; detail: string }) => (
  <article className="kd-metric">
    <span>{label}</span>
    <strong>{value}</strong>
    <p>{detail}</p>
  </article>
);

const TimelineItem = ({ item }: { item: KnowledgeItem }) => (
  <>
    <span>{item.time}</span>
    <strong>{item.title}</strong>
  </>
);

const EmptyBlock = ({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: React.ElementType;
  title: string;
}) => (
  <div className="kd-empty-state">
    <Icon size={18} />
    <strong>{title}</strong>
    <span>{description}</span>
  </div>
);

const ItemList = ({
  emptyText,
  items,
  onOpenDetail,
}: {
  emptyText?: string;
  items: KnowledgeItem[];
  onOpenDetail?: (item: KnowledgeItem) => void;
}) => (
  <div className="kd-item-list">
    {items.map((item) => (
      <button className="kd-compact-item" key={item.id} onClick={() => onOpenDetail?.(item)} type="button">
        <span className="kd-source-icon">{sourceIcon(item.type)}</span>
        <span>
          <strong>{item.title}</strong>
          <small>{item.summary}</small>
        </span>
      </button>
    ))}
    {items.length === 0 && emptyText ? <span className="kd-empty-inline">{emptyText}</span> : null}
  </div>
);

const StatusPill = ({ status }: { status: NonNullable<KnowledgeItem['status']> }) => (
  <span className={`kd-status kd-status--${status}`}>{statusCopy[status]}</span>
);

const MetaLine = ({ item }: { item: KnowledgeItem }) => (
  <div className="kd-meta-line">
    <span>{typeCopy[item.type]}</span>
    <span>{item.source}</span>
    <span>{item.time}</span>
    {item.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
  </div>
);

const FilterGroup = ({
  activeValues,
  onToggle,
  title,
  values,
}: {
  activeValues: string[];
  onToggle: (value: string) => void;
  title: string;
  values: string[];
}) => (
  <section className="kd-filter-group">
    <h3>{title}</h3>
    {values.map((value) => (
      <label key={value}>
        <input checked={activeValues.includes(value)} onChange={() => onToggle(value)} type="checkbox" />
        {value}
      </label>
    ))}
    {values.length === 0 ? <span className="kd-muted">暂无可筛选项</span> : null}
  </section>
);

const FilterSummary = ({
  filters,
  onClear,
  resultCount,
  totalCount,
}: {
  filters: ItemFilters;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}) => {
  const activeCount = activeFilterCount(filters);
  return (
    <div className="kd-filter-summary">
      <FolderOpen size={18} />
      <strong>{activeCount > 0 ? `${activeCount} 个筛选条件` : '未启用筛选'}</strong>
      <span>{formatCount(resultCount)} / {formatCount(totalCount)} 条结果可见</span>
      <button disabled={activeCount === 0} onClick={onClear} type="button">清空筛选</button>
    </div>
  );
};

const SettingsHeader = ({ title, description }: { title: string; description: string }) => (
  <header className="kd-settings-header">
    <h2>{title}</h2>
    <p>{description}</p>
  </header>
);

const PreferenceRow = ({ label, value }: { label: string; value: string }) => (
  <div className="kd-preference-row">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const ToggleRow = ({ label, checked }: { label: string; checked: boolean }) => (
  <label className="kd-toggle-row">
    <span>{label}</span>
    <input defaultChecked={checked} type="checkbox" />
  </label>
);

const StateStrip = () => (
  <div className="kd-state-strip">
    <span><Upload size={16} /> 导入中：课程资料包.pdf</span>
    <span><Loader2 size={16} /> 整理中：图神经网络推荐系统</span>
    <span><AlertTriangle size={16} /> 失败重试：Transformer 论文摘录</span>
  </div>
);

const filterLocalItems = (items: KnowledgeItem[], query: string) => {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return items.slice(0, 10);
  return items
    .filter((item) => {
      const haystack = [item.title, item.summary, item.source, ...item.tags].join(' ').toLowerCase();
      return tokens.some((token) => haystack.includes(token));
    })
    .slice(0, 10);
};

const applyItemFilters = (items: KnowledgeItem[], filters: ItemFilters) => (
  items.filter((item) => {
    if (filters.source.length > 0 && !filters.source.includes(sourceFilterLabel(item))) {
      return false;
    }
    if (filters.time.length > 0 && !filters.time.some((range) => itemMatchesTimeRange(item, range))) {
      return false;
    }
    if (filters.tag.length > 0 && !filters.tag.some((tag) => item.tags.includes(tag))) {
      return false;
    }
    return true;
  })
);

const toggleFilterValue = (filters: ItemFilters, category: FilterCategory, value: string): ItemFilters => {
  const currentValues = filters[category];
  const nextValues = currentValues.includes(value)
    ? currentValues.filter((current) => current !== value)
    : [...currentValues, value];
  return { ...filters, [category]: nextValues };
};

const activeFilterCount = (filters: ItemFilters) => (
  filters.source.length + filters.time.length + filters.tag.length
);

const buildSourceOptions = (items: KnowledgeItem[], fallback: string[]) => {
  const values = uniqueValues(items.map(sourceFilterLabel));
  return values.length > 0 ? values : fallback;
};

const buildTagOptions = (items: KnowledgeItem[], fallback: string[]) => {
  const values = uniqueValues(items.flatMap((item) => item.tags)).slice(0, 8);
  return values.length > 0 ? values : uniqueValues(fallback).slice(0, 8);
};

const uniqueValues = (values: string[]) => (
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
);

const sourceFilterLabel = (item: KnowledgeItem) => {
  if (item.type === 'web') return '网页摘录';
  if (item.type === 'pdf') return 'PDF';
  if (item.type === 'markdown') return 'Markdown';
  if (item.type === 'paste' || item.type === 'snippet') return '粘贴内容';
  return typeCopy[item.type];
};

const itemMatchesTimeRange = (item: KnowledgeItem, range: string) => {
  const normalized = item.time.toLowerCase();
  if (range === '今天') {
    return normalized.includes('今天') || normalized.includes('分钟前') || normalized.includes('小时前');
  }
  if (range === '本周') {
    return !normalized.includes('更早') && !normalized.includes('上月');
  }
  if (range === '本月') {
    return !normalized.includes('更早');
  }
  if (range === '更早') {
    return normalized.includes('更早') || normalized.includes('上月') || normalized.includes('去年');
  }
  return false;
};

const buildSearchSnippet = (item: KnowledgeItem, query: string) => {
  const keyword = query.trim().split(/\s+/)[0];
  if (!keyword) return item.summary;
  if (item.summary.includes(keyword)) return item.summary;
  return `${item.summary} 关联关键词：${keyword}`;
};

const providerStateLabel = (provider: ModelProvider) => {
  if (provider.state === 'connected') return '可用';
  if (provider.state === 'testing') return '待检测';
  if (provider.state === 'local') return '本地';
  return '不可用';
};

const importModeTitle = (mode: ImportMode) => {
  if (mode === 'web') return '网页摘录收藏';
  if (mode === 'file') return '导入 Markdown / PDF';
  return '粘贴内容';
};

const formatCount = (value: number) => new Intl.NumberFormat('zh-CN').format(value);

const toPercent = (value: number, total: number) => Math.min(100, Math.max(0, Math.round((value / total) * 100)));

const sourceIcon = (type: KnowledgeItem['type']) => {
  if (type === 'web') return <Globe2 size={18} />;
  if (type === 'pdf') return <FileText size={18} />;
  if (type === 'markdown') return <BookOpen size={18} />;
  return <FileText size={18} />;
};

export default KnowledgeDeskApp;
