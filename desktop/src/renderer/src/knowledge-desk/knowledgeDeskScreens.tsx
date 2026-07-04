import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  FolderOpen,
  Globe2,
  Inbox,
  LayoutGrid,
  Library,
  ListFilter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Network,
  Cpu,
} from 'lucide-react';
import type {
  DashboardSummary,
  ImportKnowledgeDraft,
  KnowledgeDeskSnapshot,
  KnowledgeItem,
} from './knowledgeDeskApi';
import { searchKnowledgeItems } from './knowledgeDeskApi';
import type { ImportMode, MainPage } from './knowledgeDeskTypes';
import {
  activeFilterCount,
  applyItemFilters,
  buildSearchSnippet,
  buildSourceOptions,
  buildTagOptions,
  buildInboxSegments,
  buildSearchStatusOptions,
  buildWorkflowActions,
  buildSearchCorpus,
  emptyFilters,
  filterInboxItems,
  filterLocalItems,
  filterSearchItemsByStatus,
  mergeSearchResults,
  toggleFilterValue,
  type InboxSegment,
  type ItemFilters,
  type KnowledgeWorkflowAction,
  type SearchStatusFilter,
  typeCopy,
} from './knowledgeDeskViewModel';
import {
  DashboardSkeleton,
  EmptyState,
  ErrorCard,
  FileDropZone,
  HighlightText,
  InboxSkeleton,
  LibrarySkeleton,
  ArchiveSkeleton,
  DetailSkeleton,
  VirtualList,
  useShouldVirtualize,
} from './components';
import {
  ContextBlock,
  FilterGroup,
  FilterSummary,
  ItemList,
  MetaLine,
  MetricCard,
  Panel,
  StateStrip,
  StatusPill,
  TimelineItem,
} from './knowledgeDeskShared';
import { formatCount, sourceIcon, toPercent } from './knowledgeDeskDisplay';

export const ConnectionBanner = ({
  error,
  isLoading,
  onRetry,
}: {
  error?: string;
  isLoading: boolean;
  onRetry: () => void;
}) => (
  <div className="kd-connection-banner" role="alert">
    <div className="kd-connection-banner__icon">
      <AlertTriangle size={18} />
    </div>
    <div>
      <strong>后端连接异常，当前显示预览数据</strong>
      <span>{error || '本机数据库可能未启动，或登录凭证暂不可用。请检查服务状态后重试。'}</span>
    </div>
    <button disabled={isLoading} onClick={onRetry} type="button">
      <RefreshCw size={15} />
      {isLoading ? '连接中' : '重新连接'}
    </button>
  </div>
);

export const DashboardPage = ({
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

  if (isLoading) {
    return <DashboardSkeleton />;
  }

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

export const InboxPage = ({
  actionState,
  activeSegment,
  isLoading,
  isOrganizing,
  items,
  onItemAction,
  onOpenDetail,
  onOrganizeBatch,
  onSegmentChange,
}: {
  actionState: { itemId: string; action: KnowledgeWorkflowAction } | null;
  activeSegment: InboxSegment;
  isLoading?: boolean;
  isOrganizing: boolean;
  items: KnowledgeItem[];
  onItemAction: (item: KnowledgeItem, action: KnowledgeWorkflowAction) => Promise<void>;
  onOpenDetail: (item: KnowledgeItem) => void;
  onOrganizeBatch: () => void;
  onSegmentChange: (segment: InboxSegment) => void;
}) => {
  const visibleItems = useMemo(() => filterInboxItems(items, activeSegment), [items, activeSegment]);
  const shouldVirtualize = useShouldVirtualize(visibleItems.length);
  const inboxSegments = useMemo(() => buildInboxSegments(items), [items]);
  const emptyState = useMemo(() => (
    <EmptyState
      icon={Inbox}
      title={activeSegment === 'all' ? '收集箱是空的' : '当前分段没有条目'}
      description={activeSegment === 'all'
        ? '网页摘录、本地 Markdown / PDF 和粘贴内容会先进入这里，再被整理进知识库。'
        : '切回全部，或继续导入资料后再处理。'}
    />
  ), [activeSegment]);

  const renderInboxItem = useCallback((item: KnowledgeItem) => {
    const actions = buildWorkflowActions(item);
    return (
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
        <div className="kd-row-actions">
          <button className="kd-icon-button" onClick={() => onOpenDetail(item)} type="button" aria-label="查看详情">
            <Eye size={17} />
          </button>
          {actions.map((action) => {
            const isPendingAction = actionState?.itemId === item.id && actionState.action === action.id;
            return (
              <button
                className={`kd-action-button kd-action-button--${action.tone}`}
                disabled={isPendingAction}
                key={action.id}
                onClick={() => void onItemAction(item, action.id)}
                type="button"
              >
                {isPendingAction ? '处理中' : action.label}
              </button>
            );
          })}
        </div>
      </article>
    );
  }, [actionState, onItemAction, onOpenDetail]);

  if (isLoading) {
    return <InboxSkeleton />;
  }

  return (
    <div className="kd-stack">
      <div className="kd-page-tools">
        <div className="kd-segmented">
          {inboxSegments.map((segment) => (
            <button
              className={activeSegment === segment.id ? 'is-active' : ''}
              key={segment.id}
              onClick={() => onSegmentChange(segment.id)}
              type="button"
            >
              <span>{segment.label}</span>
              <span className="kd-segment-count">{segment.count}</span>
            </button>
          ))}
        </div>
        <div className="kd-tool-actions">
          <button disabled={isOrganizing || items.length === 0} onClick={onOrganizeBatch} type="button">
            <RefreshCw size={16} /> {isOrganizing ? '整理中' : '批量整理'}
          </button>
          <span className="kd-tool-note">
            当前显示 {visibleItems.length} 条，需要优先处理的失败条目会保留在这里。
          </span>
        </div>
      </div>

      <section className="kd-inbox-board">
        {shouldVirtualize ? (
          <VirtualList
            emptyContent={emptyState}
            estimateSize={130}
            items={visibleItems}
            renderItem={renderInboxItem}
          />
        ) : (
          <>
            {visibleItems.map(renderInboxItem)}
            {visibleItems.length === 0 ? emptyState : null}
          </>
        )}
      </section>

      <StateStrip />
    </div>
  );
};

type ImportPanelStatus = 'idle' | 'submitting' | 'success' | 'error';

export const ImportPanel = ({
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ImportPanelStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isFileMode = mode === 'file';
  const sourceRequired = mode === 'web';
  const isBusy = isSubmitting || status === 'submitting';

  const resetStatus = () => {
    setStatus('idle');
    setStatusMessage(null);
    setValidationError(null);
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    resetStatus();
  };

  const handleChooseFile = async () => {
    if (!canUseDesktopFilePicker) {
      browserFileInputRef.current?.click();
      return;
    }
    setStatus('submitting');
    setStatusMessage('正在打开系统文件选择器…');
    try {
      await onImportLocalFile(title);
      setStatus('success');
      setStatusMessage('文件导入成功');
    } catch (submitError) {
      setStatus('error');
      setStatusMessage(submitError instanceof Error ? submitError.message : String(submitError));
    }
  };

  const handleBrowserFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    setSelectedFile(file);
    setStatus('submitting');
    setStatusMessage(`正在上传 ${file.name}…`);
    try {
      await onUploadBrowserFile(file, title);
      setStatus('success');
      setStatusMessage('文件上传成功');
    } catch (submitError) {
      setStatus('error');
      setStatusMessage(submitError instanceof Error ? submitError.message : String(submitError));
    }
    input.value = '';
  };

  const runImport = async () => {
    resetStatus();

    if (isFileMode) {
      if (selectedFile && !canUseDesktopFilePicker) {
        setStatus('submitting');
        setStatusMessage(`正在上传 ${selectedFile.name}…`);
        try {
          await onUploadBrowserFile(selectedFile, title);
          setStatus('success');
          setStatusMessage('文件上传成功');
        } catch (submitError) {
          setStatus('error');
          setStatusMessage(submitError instanceof Error ? submitError.message : String(submitError));
        }
        return;
      }
      await handleChooseFile();
      return;
    }

    if (sourceRequired && !source.trim()) {
      setValidationError('网页摘录需要填写来源 URL。');
      return;
    }
    if (!content.trim()) {
      setValidationError('内容不能为空。');
      return;
    }

    setStatus('submitting');
    setStatusMessage('正在导入到收集箱…');
    try {
      await onSubmit({
        kind: mode,
        title,
        source,
        content,
      });
      setStatus('success');
      setStatusMessage('导入成功');
    } catch (submitError) {
      setStatus('error');
      setStatusMessage(submitError instanceof Error ? submitError.message : String(submitError));
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runImport();
  };

  return (
    <div className="kd-import-modal" role="dialog" aria-modal="true" aria-label="导入资料">
      <form className="kd-import-sheet" onSubmit={(event) => void handleSubmit(event)}>
        <header>
          <div>
            <p className="kd-kicker">收集到收集箱</p>
            <h2>{importModeTitle(mode)}</h2>
          </div>
          <button className="kd-icon-button" disabled={isBusy} onClick={onClose} type="button" aria-label="关闭导入面板">×</button>
        </header>

        <label className="kd-field">
          <span>标题</span>
          <input
            disabled={isBusy}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={isFileMode ? '可选，留空则使用文件名' : '可选，留空则按来源自动命名'}
            value={title}
          />
        </label>

        {isFileMode ? (
          <div className="kd-import-file-area">
            <FileDropZone
              accept=".md,.markdown,.pdf,.txt,.html,text/markdown,application/pdf,text/plain,text/html"
              description="支持 .md、.markdown、.pdf，也兼容 txt/html 文本资料。"
              disabled={isBusy}
              file={selectedFile}
              onFileSelect={handleFileSelect}
              title={canUseDesktopFilePicker ? '点击打开系统文件选择器，或拖拽文件到此处' : '拖拽文件到此处，或点击选择文件'}
            />
            {!canUseDesktopFilePicker ? (
              <input
                ref={browserFileInputRef}
                accept=".md,.markdown,.pdf,.txt,.html,text/markdown,application/pdf,text/plain,text/html"
                className="kd-hidden-file-input"
                onChange={(event) => void handleBrowserFileSelected(event)}
                type="file"
              />
            ) : null}
            <div className="kd-import-file-types">
              <span><FileText size={13} /> Markdown</span>
              <span><FileText size={13} /> PDF</span>
              <span><FileText size={13} /> 纯文本 / HTML</span>
            </div>
          </div>
        ) : null}

        {!isFileMode && mode !== 'snippet' ? (
          <label className="kd-field">
            <span>来源 URL</span>
            <input
              disabled={isBusy}
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
              disabled={isBusy}
              onChange={(event) => setContent(event.target.value)}
              placeholder="粘贴网页正文、Markdown 内容或临时摘录..."
              rows={9}
              value={content}
            />
          </label>
        ) : null}

        {validationError ? <div className="kd-form-error">{validationError}</div> : null}

        {status === 'error' && statusMessage ? (
          <ErrorCard
            description="导入失败，请检查文件类型或网络连接后重试。"
            error={statusMessage}
            onRetry={() => void runImport()}
            retryLabel="重试"
            title="导入失败"
          />
        ) : null}
        {status === 'success' && statusMessage ? (
          <div className="kd-import-success">
            <CheckCircle2 size={18} />
            <span>{statusMessage}</span>
          </div>
        ) : null}
        {status === 'submitting' && statusMessage ? (
          <div className="kd-import-progress">
            <Loader2 size={18} className="animate-spin" />
            <span>{statusMessage}</span>
          </div>
        ) : null}

        <footer>
          <p>
            {isFileMode
              ? '文件解析在后端完成，不需要手写路径。导入后内容会先进入收集箱。'
              : '内容会先进入收集箱，后续可批量整理为摘要、标签与可检索知识条目。'}
          </p>
          <div>
            <button className="kd-secondary-button" disabled={isBusy} onClick={onClose} type="button">取消</button>
            <button className="kd-primary-button" disabled={isBusy} type="submit">
              {isBusy ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  导入中
                </>
              ) : isFileMode ? (
                canUseDesktopFilePicker ? '选择文件并导入' : '上传文件到收集箱'
              ) : (
                '导入收集箱'
              )}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
};

export const LibraryPage = ({
  items,
  isLoading,
  mode,
  onModeChange,
  onOpenDetail,
  tags,
  totalItems,
}: {
  items: KnowledgeItem[];
  isLoading?: boolean;
  mode: 'list' | 'cards';
  onModeChange: (mode: 'list' | 'cards') => void;
  onOpenDetail: (item: KnowledgeItem) => void;
  tags: string[];
  totalItems: number;
}) => {
  const [filters, setFilters] = useState<ItemFilters>(emptyFilters);
  const sourceOptions = useMemo(() => buildSourceOptions(items, ['网页摘录', 'PDF', 'Markdown', '粘贴内容']), [items]);
  const tagOptions = useMemo(() => buildTagOptions(items, tags), [items, tags]);
  const filteredItems = useMemo(() => applyItemFilters(items, filters), [items, filters]);
  const hasActiveFilters = activeFilterCount(filters) > 0;
  const shouldVirtualizeList = useShouldVirtualize(filteredItems.length) && mode === 'list';
  const emptyState = useMemo(() => (
    <EmptyState
      icon={BookOpen}
      title={hasActiveFilters ? '没有匹配当前筛选的条目' : '知识库还没有可检索条目'}
      description={hasActiveFilters
        ? '清空部分筛选条件，或换一个来源、标签、时间范围再找。'
        : '完成整理后的资料会出现在这里，并支持按来源、标签、时间和文档类型筛选。'}
    />
  ), [hasActiveFilters]);

  const renderLibraryItem = useCallback((item: KnowledgeItem) => (
    <article className="kd-library-item" key={item.id} onClick={() => onOpenDetail(item)}>
      <div className="kd-type-badge">{typeCopy[item.type]}</div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      <MetaLine item={item} />
    </article>
  ), [onOpenDetail]);

  if (isLoading) {
    return <LibrarySkeleton />;
  }

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
          {mode === 'list' && shouldVirtualizeList ? (
            <VirtualList
              emptyContent={emptyState}
              estimateSize={140}
              items={filteredItems}
              renderItem={renderLibraryItem}
            />
          ) : (
            <>
              {filteredItems.map(renderLibraryItem)}
              {filteredItems.length === 0 ? emptyState : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const ArchivePage = ({
  actionState,
  items,
  isLoading,
  onItemAction,
  onOpenDetail,
  tags,
  totalItems,
}: {
  actionState: { itemId: string; action: KnowledgeWorkflowAction } | null;
  items: KnowledgeItem[];
  isLoading?: boolean;
  onItemAction: (item: KnowledgeItem, action: KnowledgeWorkflowAction) => Promise<void>;
  onOpenDetail: (item: KnowledgeItem) => void;
  tags: string[];
  totalItems: number;
}) => {
  const [filters, setFilters] = useState<ItemFilters>(emptyFilters);
  const sourceOptions = useMemo(() => buildSourceOptions(items, ['网页摘录', 'PDF', 'Markdown', '粘贴内容']), [items]);
  const tagOptions = useMemo(() => buildTagOptions(items, tags), [items, tags]);
  const filteredItems = useMemo(() => applyItemFilters(items, filters), [items, filters]);
  const hasActiveFilters = activeFilterCount(filters) > 0;
  const shouldVirtualize = useShouldVirtualize(filteredItems.length);
  const emptyState = useMemo(() => (
    <EmptyState
      icon={Archive}
      title={hasActiveFilters ? '没有匹配当前筛选的归档资料' : '归档库还是空的'}
      description={hasActiveFilters
        ? '清空部分筛选条件，或换一个来源、标签、时间范围再找。'
        : '把不想参与当前知识流的资料归档后，这里会保留恢复入口。'}
    />
  ), [hasActiveFilters]);

  const renderArchiveItem = useCallback((item: KnowledgeItem) => {
    const restoreAction = buildWorkflowActions(item).find((action) => action.id === 'restore');
    const isRestoring = actionState?.itemId === item.id && actionState.action === 'restore';
    return (
      <article className="kd-archive-item" key={item.id}>
        <button className="kd-archive-main" onClick={() => onOpenDetail(item)} type="button">
          <div className="kd-type-badge">{typeCopy[item.type]}</div>
          <div className="kd-row-titleline">
            <h3>{item.title}</h3>
            {item.status ? <StatusPill status={item.status} /> : null}
          </div>
          <p>{item.summary}</p>
          <MetaLine item={item} />
        </button>
        {restoreAction ? (
          <button
            className={`kd-action-button kd-action-button--${restoreAction.tone}`}
            disabled={isRestoring}
            onClick={() => void onItemAction(item, restoreAction.id)}
            type="button"
          >
            {isRestoring ? '恢复中' : restoreAction.label}
          </button>
        ) : null}
      </article>
    );
  }, [actionState, onItemAction, onOpenDetail]);

  if (isLoading) {
    return <ArchiveSkeleton />;
  }

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
            <h2 className="kd-section-title">{formatCount(filteredItems.length)} / {formatCount(totalItems)} 条归档资料</h2>
            <p className="kd-muted">
              {hasActiveFilters ? '已按当前筛选条件收窄归档结果。' : '归档不会丢失资料，只是从主知识流中移出，后续仍可恢复。'}
            </p>
          </div>
        </div>

        <div className="kd-library-list">
          {shouldVirtualize ? (
            <VirtualList
              emptyContent={emptyState}
              estimateSize={130}
              items={filteredItems}
              renderItem={renderArchiveItem}
            />
          ) : (
            <>
              {filteredItems.map(renderArchiveItem)}
              {filteredItems.length === 0 ? emptyState : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const DetailPage = ({
  actionState,
  error,
  isLoading,
  item,
  onAction,
}: {
  actionState: { itemId: string; action: KnowledgeWorkflowAction } | null;
  error?: string | null;
  isLoading?: boolean;
  item: KnowledgeItem;
  onAction: (item: KnowledgeItem, action: KnowledgeWorkflowAction) => Promise<void>;
}) => {
  const body = item.cleanedContent || item.rawContent || item.summary;
  const paragraphs = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
  const workflowActions = buildWorkflowActions(item);

  if (isLoading) {
    return <DetailSkeleton />;
  }

  return (
    <article className="kd-detail">
      <div className="kd-detail-header">
        <div className="kd-breadcrumb">{item.status === 'archived' ? '归档库' : '知识库'} / {item.tags[0] ?? '未分类'} / {typeCopy[item.type]}</div>
        {workflowActions.length > 0 ? (
          <div className="kd-inline-actions">
            {workflowActions.map((action) => {
              const isPendingAction = actionState?.itemId === item.id && actionState.action === action.id;
              return (
                <button
                  className={`kd-action-button kd-action-button--${action.tone}`}
                  disabled={isPendingAction}
                  key={action.id}
                  onClick={() => void onAction(item, action.id)}
                  type="button"
                >
                  {isPendingAction ? '处理中' : action.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <h2>{item.title}</h2>
      <div className="kd-detail-meta">
        <span>{sourceIcon(item.type)} {typeCopy[item.type]}</span>
        <span><Clock3 size={16} /> {item.time} 整理</span>
        <span><Globe2 size={16} /> {item.source}</span>
        {item.status ? <StatusPill status={item.status} /> : null}
      </div>

      {item.status === 'failed' ? (
        <div className="kd-detail-status kd-detail-status--error">
          <AlertTriangle size={16} />
          上次整理失败，可直接重新整理或先归档。
        </div>
      ) : null}
      {item.status === 'archived' ? (
        <div className="kd-detail-status">
          <Archive size={16} />
          这条资料已移出主知识流，恢复后会重新回到可检索集合。
        </div>
      ) : null}
      {item.status === 'processing' ? (
        <div className="kd-detail-status">
          <Loader2 size={16} />
          这条资料仍在整理中，完成后会自动进入知识库。
        </div>
      ) : null}
      {error ? (
        <ErrorCard
          className="my-4"
          description="完整正文加载失败，当前展示的是摘要内容。你可以返回列表重试，或先查看已有信息。"
          error={error}
          title="正文加载失败"
        />
      ) : null}

      {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {paragraphs.length === 0 ? <p>这条知识还没有可展示正文，整理完成后会补充清洗后的内容。</p> : null}
      <blockquote>
        这条知识已关联到 {item.tags.length > 0 ? item.tags.join(' / ') : '未分类主题'}，后续可从标签、来源、时间和关键词再次找回。
      </blockquote>
    </article>
  );
};

const SEARCH_HISTORY_KEY = 'kd:search-history';
const MAX_HISTORY = 6;

const loadSearchHistory = (): string[] => {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const saveSearchHistory = (history: string[]) => {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // ignore storage errors
  }
};

export const SearchPage = ({
  apiEnabled,
  searchableItems,
  onOpenDetail,
}: {
  apiEnabled: boolean;
  searchableItems: KnowledgeItem[];
  onOpenDetail: (item: KnowledgeItem) => void;
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KnowledgeItem[] | null>(null);
  const [filters, setFilters] = useState<ItemFilters>(emptyFilters);
  const [statusFilter, setStatusFilter] = useState<SearchStatusFilter>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>(loadSearchHistory);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const searchCorpus = useMemo(() => buildSearchCorpus(searchableItems), [searchableItems]);
  const localResults = useMemo(() => filterLocalItems(searchCorpus, deferredQuery), [searchCorpus, deferredQuery]);
  const baseResults = results ?? localResults;
  const statusOptions = useMemo(() => buildSearchStatusOptions(baseResults), [baseResults]);
  const statusFilteredResults = useMemo(() => filterSearchItemsByStatus(baseResults, statusFilter), [baseResults, statusFilter]);
  const filteredResults = useMemo(() => applyItemFilters(statusFilteredResults, filters), [statusFilteredResults, filters]);
  const visibleResults = useMemo(() => filteredResults.slice(0, 12), [filteredResults]);
  const sourceOptions = useMemo(() => buildSourceOptions(baseResults, ['网页摘录', 'PDF', 'Markdown']), [baseResults]);
  const tagOptions = useMemo(() => buildTagOptions(baseResults, searchCorpus.flatMap((item) => item.tags)), [baseResults, searchCorpus]);
  const hasSearched = results !== null || query.trim().length > 0;
  const suggestedTags = useMemo(() => Array.from(new Set(searchCorpus.flatMap((item) => item.tags))).slice(0, 6), [searchCorpus]);
  const suggestedSources = useMemo(() => Array.from(new Set(searchCorpus.map((item) => item.source))).slice(0, 4), [searchCorpus]);

  const addToHistory = useCallback((term: string) => {
    if (!term.trim()) return;
    setSearchHistory((current) => {
      const next = [term.trim(), ...current.filter((item) => item !== term.trim())].slice(0, MAX_HISTORY);
      saveSearchHistory(next);
      return next;
    });
  }, []);

  const runSearch = useCallback(async () => {
    const nextQuery = query.trim();
    const fallbackResults = filterLocalItems(searchCorpus, nextQuery);
    setIsSearching(true);
    setSearchError(null);
    try {
      if (apiEnabled && nextQuery) {
        const apiResults = await searchKnowledgeItems(nextQuery);
        setResults(mergeSearchResults(apiResults, fallbackResults));
      } else {
        setResults(fallbackResults);
      }
      addToHistory(nextQuery);
    } catch (error) {
      setResults(fallbackResults);
      setSearchError(error instanceof Error ? error.message : String(error));
      addToHistory(nextQuery);
    } finally {
      setIsSearching(false);
    }
  }, [query, searchCorpus, apiEnabled, addToHistory]);

  const applySuggestion = useCallback((term: string) => {
    setQuery(term);
    setResults(null);
    setTimeout(() => void runSearch(), 0);
  }, [runSearch]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  return (
    <div className="kd-search-page">
      <div className="kd-search-box">
        <Search size={24} />
        <input
          aria-label="全局搜索"
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value === '') setResults(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void runSearch();
          }}
          placeholder="搜索主题、来源、标签、关键句"
          ref={searchInputRef}
          value={query}
        />
        <button disabled={isSearching} onClick={() => void runSearch()} type="button">
          {isSearching ? '搜索中' : '搜索'}
        </button>
      </div>

      {!hasSearched ? (
        <div className="kd-search-tips">
          <div className="kd-search-tip-section">
            <strong>最近搜索</strong>
            {searchHistory.length > 0 ? (
              <div className="kd-search-tip-list">
                {searchHistory.map((term) => (
                  <button key={term} onClick={() => applySuggestion(term)} type="button">
                    <Clock3 size={13} />
                    {term}
                  </button>
                ))}
              </div>
            ) : (
              <span className="kd-muted">暂无搜索记录，输入关键词开始第一次搜索。</span>
            )}
          </div>
          <div className="kd-search-tip-section">
            <strong>搜索建议</strong>
            <div className="kd-search-tip-list">
              {suggestedTags.map((tag) => (
                <button key={tag} onClick={() => applySuggestion(tag)} type="button">
                  <Tags size={13} />
                  {tag}
                </button>
              ))}
              {suggestedSources.map((source) => (
                <button key={source} onClick={() => applySuggestion(source)} type="button">
                  <Globe2 size={13} />
                  {source}
                </button>
              ))}
              {suggestedTags.length === 0 && suggestedSources.length === 0 ? (
                <span className="kd-muted">导入并整理资料后，这里会显示热门标签和来源。</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {hasSearched ? (
        <>
          <div className="kd-search-toolbar">
            <div className="kd-segmented kd-search-status-filter" aria-label="搜索状态筛选">
              {statusOptions.map((option) => (
                <button
                  className={statusFilter === option.id ? 'is-active' : ''}
                  key={option.id}
                  onClick={() => setStatusFilter(option.id)}
                  type="button"
                >
                  {option.label}
                  <span className="kd-segment-count">{option.count}</span>
                </button>
              ))}
            </div>
            <div className="kd-search-scope" aria-live="polite">
              <strong>{filteredResults.length}</strong>
              <span>/ {baseResults.length} 条</span>
              <span>收集箱 + 知识库 + 归档库</span>
            </div>
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
                totalCount={statusFilteredResults.length}
              />
            </aside>
            <section className="kd-search-results">
              {searchError ? (
                <ErrorCard
                  description="数据库搜索暂不可用，已使用当前可见条目过滤。"
                  error={searchError}
                  onRetry={() => void runSearch()}
                  retryLabel="重试搜索"
                  title="搜索服务异常"
                />
              ) : null}
              {visibleResults.map((item) => (
                <article className="kd-search-result" key={item.id} onClick={() => onOpenDetail(item)}>
                  <div className="kd-result-head">
                    <span className="kd-type-badge">{typeCopy[item.type]}</span>
                    <span>{item.source}</span>
                    <span>{item.time}</span>
                    {item.status ? <StatusPill status={item.status} /> : null}
                  </div>
                  <h3><HighlightText query={query} text={item.title} /></h3>
                  <p>
                    命中片段：
                    <HighlightText query={query} text={buildSearchSnippet(item, query)} />
                  </p>
                  <small><HighlightText query={query} text={item.summary} /></small>
                </article>
              ))}
              {visibleResults.length === 0 ? (
                <EmptyState
                  className="min-h-[240px]"
                  icon={Search}
                  title={query.trim() ? '未找到匹配结果' : '请输入搜索关键词'}
                  description={query.trim()
                    ? '尝试更换关键词、清空筛选条件，或从左侧选择其他来源和标签。'
                    : '输入主题、来源、标签或关键句，开始在知识库中检索。'}
                />
              ) : null}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
};

export const ContextRail = ({
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
        <ContextBlock title="AI 摘要" icon={BookOpen}>
          <p>{selectedItem.summary}</p>
        </ContextBlock>
        <ContextBlock title="关联标签" icon={Tags}>
          <div className="kd-tag-cloud">
            {selectedItem.tags.map((tag) => <span className="kd-tag" key={tag}>{tag}</span>)}
            {selectedItem.tags.length === 0 ? <span className="kd-muted">暂无标签</span> : null}
          </div>
        </ContextBlock>
        <ContextBlock title="关联条目" icon={Library}>
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
      <ContextBlock title="整理队列" icon={Inbox}>
        <div className="kd-queue-row"><Loader2 size={15} /> {snapshot.dashboard.inboxItems} 条待整理</div>
        <div className="kd-queue-row"><CheckCircle2 size={15} /> {snapshot.dashboard.readyItems} 条已整理</div>
        <div className="kd-queue-row is-warning"><AlertTriangle size={15} /> {snapshot.dashboard.failedItems} 条需重试</div>
      </ContextBlock>
      <ContextBlock title="知识资产" icon={FolderOpen}>
        <div className="kd-asset-meter"><span style={{ width: `${storagePercent}%` }} /></div>
        <p>{formatCount(snapshot.storage.readyItems)} / {formatCount(snapshot.storage.totalItems)} 条已进入可检索索引。</p>
      </ContextBlock>
      <ContextBlock title="未来扩展位" icon={Network}>
        <div className="kd-extension-list">
          <span><Network size={15} /> 知识图谱</span>
          <span><Cpu size={15} /> 个性化推荐</span>
          <span><BookOpen size={15} /> 复习回顾</span>
        </div>
      </ContextBlock>
    </aside>
  );
};

const importModeTitle = (mode: ImportMode) => {
  if (mode === 'web') return '网页摘录收藏';
  if (mode === 'file') return '导入 Markdown / PDF';
  return '粘贴内容';
};
