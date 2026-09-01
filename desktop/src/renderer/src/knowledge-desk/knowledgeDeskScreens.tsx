import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Tags,
  Network,
  Cpu,
  X,
} from 'lucide-react';
import type {
  DashboardSummary,
  ImportKnowledgeDraft,
  KnowledgeIngestionJob,
  KnowledgeDeskSnapshot,
  KnowledgeItem,
  KnowledgeItemPage,
  LocalFileBatchCandidate,
  LocalFileBatchCommitResult,
  LocalFileBatchPreflight,
  ListKnowledgeItemsParams,
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
  buildWorkflowActions,
  buildSearchCorpus,
  emptyFilters,
  filterInboxItems,
  filterLocalItems,
  filterSearchItemsByStatus,
  inboxStatusesForSegment,
  toggleSingleFilterValue,
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
  StatusPill,
  TimelineItem,
} from './knowledgeDeskShared';
import { formatCount, sourceIcon, toPercent } from './knowledgeDeskDisplay';
import { KNOWLEDGE_FILE_ACCEPT } from './knowledgeDeskFileTypes';

const LIST_PAGE_SIZE = 20;
const DETAIL_INITIAL_PARAGRAPH_COUNT = 4;
const DETAIL_PARAGRAPH_BATCH_SIZE = 80;

type ListPageLoader = (params: ListKnowledgeItemsParams) => Promise<KnowledgeItemPage>;

const buildLocalKnowledgeItemPage = (
  items: KnowledgeItem[],
  requestedPage: number,
  pageSize = LIST_PAGE_SIZE,
): KnowledgeItemPage => {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
};

const usePagedKnowledgeItems = ({
  apiEnabled,
  fallbackItems,
  loadPage,
  params,
}: {
  apiEnabled: boolean;
  fallbackItems: KnowledgeItem[];
  loadPage: ListPageLoader;
  params: Omit<ListKnowledgeItemsParams, 'page' | 'pageSize'>;
}) => {
  const [pageData, setPageData] = useState<KnowledgeItemPage>(() => buildLocalKnowledgeItemPage(fallbackItems, 1));
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const requestPage = useCallback(async (requestedPage: number) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const localPage = buildLocalKnowledgeItemPage(fallbackItems, requestedPage);

    if (!apiEnabled) {
      setPageError(null);
      setPageData(localPage);
      return;
    }

    setIsPageLoading(true);
    setPageError(null);
    try {
      const nextPage = await loadPage({ ...params, page: requestedPage, pageSize: LIST_PAGE_SIZE });
      if (requestRef.current === requestId) {
        setPageData(nextPage);
      }
    } catch (error) {
      if (requestRef.current === requestId) {
        setPageError(error instanceof Error ? error.message : String(error));
        setPageData((current) => (current.items.length > 0 ? current : localPage));
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsPageLoading(false);
      }
    }
  }, [apiEnabled, fallbackItems, loadPage, params]);

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (!cancelled) return requestPage(1);
      return undefined;
    });

    return () => {
      cancelled = true;
    };
  }, [requestPage]);

  return { isPageLoading, pageData, pageError, requestPage };
};

const CollectionPagination = ({
  currentPage,
  isLoading,
  label,
  onPageChange,
  pageSize,
  total,
}: {
  currentPage: number;
  isLoading: boolean;
  label: string;
  onPageChange: (page: number) => void;
  pageSize: number;
  total: number;
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav className="kd-search-pagination" aria-label={label}>
      <button disabled={isLoading || currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} type="button">
        上一页
      </button>
      <span>第 {currentPage} / {totalPages} 页</span>
      <button disabled={isLoading || currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} type="button">
        下一页
      </button>
    </nav>
  );
};

export const ConnectionBanner = ({
  error,
  isLoading,
  isDegraded,
  onRetry,
}: {
  error?: string;
  isLoading: boolean;
  isDegraded?: boolean;
  onRetry: () => void;
}) => (
  <div className={`kd-connection-banner ${isDegraded ? 'kd-connection-banner--degraded' : ''}`} role="alert">
    <div className="kd-connection-banner__icon">
      <AlertTriangle size={18} />
    </div>
    <div>
      <strong>{isDegraded ? '部分服务异常' : '后端连接异常，当前显示预览数据'}</strong>
      <span>{error || (isDegraded ? '某些模块加载失败。请检查服务状态后重试。' : '本机数据库可能未启动，或登录凭证暂不可用。请检查服务状态后重试。')}</span>
    </div>
    <button disabled={isLoading} onClick={onRetry} type="button">
      <RefreshCw size={15} />
      {isLoading ? '重试中' : isDegraded ? '重试失败接口' : '重新连接'}
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
  onOpenReview,
  tags,
}: {
  dashboard: DashboardSummary;
  inboxItems: KnowledgeItem[];
  isLoading: boolean;
  libraryItems: KnowledgeItem[];
  onOpenImport: () => void;
  onOpenDetail: (item: KnowledgeItem) => void;
  onOpenReview: () => void;
  tags: string[];
}) => {
  const recentItems = dashboard.recentItems.length > 0 ? dashboard.recentItems : libraryItems;
  const topTags = dashboard.topTags.length > 0 ? dashboard.topTags.map((tag) => tag.name) : tags;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="kd-stack">
      <section className="kd-search-hero kd-search-hero--index">
        <div className="kd-index-hero-copy">
          <p><span className="kd-index-hero-signal" /> INDEX / TODAY</p>
          <h2>让每一条新线索<br /><em>在需要时重新出现。</em></h2>
          <span className="kd-index-hero-caption">收集、整理、连接、回顾。你的资料不会再散落在不同地方。</span>
        </div>
        <div aria-hidden="true" className="kd-index-hero-map">
          <img alt="" className="kd-index-hero-image" src="/knowledge-desk-index-v1.png" />
          <div className="kd-index-hero-map-lines">
            <span>01 / CAPTURE</span>
            <span>02 / INDEX</span>
            <span>03 / RECALL</span>
          </div>
        </div>
        <button className="kd-primary-button" onClick={onOpenImport} type="button">
          <Plus size={17} />
          录入线索
        </button>
      </section>

      <div className="kd-stat-grid">
        <MetricCard icon={Plus} label="今日新增" value={String(inboxItems.length)} detail={isLoading ? '正在同步本地知识库' : '来自收集箱最新条目'} />
        <MetricCard icon={CheckCircle2} label="整理完成" value={formatCount(dashboard.readyItems)} detail="已进入可检索知识库" />
        <MetricCard icon={Inbox} label="待处理收集箱" value={formatCount(dashboard.inboxItems)} detail={`${dashboard.failedItems} 条需要重试`} />
        <MetricCard icon={BookOpen} label="知识总量" value={formatCount(dashboard.totalItems)} detail="网页 / 本机文档 / 摘录统一索引" />
      </div>

      <button className="kd-review-dashboard-card" onClick={onOpenReview} type="button">
        <span><Clock3 size={17} /> 每日回顾</span>
        <strong>{formatCount(dashboard.review.dueCount)} 条</strong>
        <p>{dashboard.review.dueCount > 0 ? '先凭记忆找回，再选择下一次回顾间隔。' : '今天已完成回顾，继续收集新资料吧。'}</p>
        <em>进入回顾 →</em>
      </button>

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
  apiEnabled,
  inboxTotals,
  isLoading,
  isOrganizing,
  items,
  onItemAction,
  onLoadPage,
  onOpenDetail,
  onOrganizeBatch,
  onSegmentChange,
}: {
  actionState: { itemId: string; action: KnowledgeWorkflowAction } | null;
  activeSegment: InboxSegment;
  apiEnabled: boolean;
  inboxTotals: KnowledgeDeskSnapshot['inboxTotals'];
  isLoading?: boolean;
  isOrganizing: boolean;
  items: KnowledgeItem[];
  onItemAction: (item: KnowledgeItem, action: KnowledgeWorkflowAction) => Promise<void>;
  onLoadPage: ListPageLoader;
  onOpenDetail: (item: KnowledgeItem) => void;
  onOrganizeBatch: () => void;
  onSegmentChange: (segment: InboxSegment) => void;
}) => {
  const fallbackItems = useMemo(() => filterInboxItems(items, activeSegment), [items, activeSegment]);
  const serverStatuses = useMemo(() => inboxStatusesForSegment(activeSegment), [activeSegment]);
  const pageParams = useMemo<ListKnowledgeItemsParams>(() => ({
    statuses: [...serverStatuses],
  }), [serverStatuses]);
  const { isPageLoading, pageData, pageError, requestPage } = usePagedKnowledgeItems({
    apiEnabled,
    fallbackItems,
    loadPage: onLoadPage,
    params: pageParams,
  });
  const visibleItems = pageData.items;
  const shouldVirtualize = useShouldVirtualize(visibleItems.length);
  const inboxSegments = useMemo(
    () => buildInboxSegments(items, apiEnabled ? inboxTotals : undefined),
    [apiEnabled, inboxTotals, items],
  );
  const emptyState = useMemo(() => (
    <EmptyState
      icon={Inbox}
      title={activeSegment === 'all' ? '收集箱是空的' : '当前分段没有条目'}
      description={activeSegment === 'all'
        ? '网页摘录、本机文档和粘贴内容会先进入这里，再被整理进知识库。'
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
    <div className="kd-stack kd-inbox-stack">
      <header className="kd-page-identity kd-page-identity--inbox">
        <div>
          <p>INTAKE QUEUE / INBOX</p>
          <h2>把尚未成形的资料，先放进可靠的队列。</h2>
          <span>每一条都会保留来源和状态，等你决定下一步。</span>
        </div>
        <strong aria-hidden="true">01</strong>
      </header>
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
          <button disabled={isOrganizing || visibleItems.length === 0} onClick={onOrganizeBatch} type="button">
            <RefreshCw size={16} /> {isOrganizing ? '整理中' : '批量整理'}
          </button>
          <span className="kd-tool-note">
            {apiEnabled ? `当前页 ${visibleItems.length} / ${pageData.total} 条` : `当前已加载 ${pageData.total} 条`}
            ，需要优先处理的失败条目会保留在这里。
          </span>
        </div>
      </div>

      {pageError ? (
        <ErrorCard
          description="服务端分页暂不可用，当前保留已加载条目。"
          error={pageError}
          onRetry={() => void requestPage(pageData.page)}
          retryLabel="重试加载"
          title="收集箱加载失败"
        />
      ) : null}

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

      <CollectionPagination
        currentPage={pageData.page}
        isLoading={isPageLoading}
        label="收集箱分页"
        onPageChange={(page) => void requestPage(page)}
        pageSize={pageData.pageSize}
        total={pageData.total}
      />
    </div>
  );
};

type ImportPanelStatus = 'idle' | 'submitting' | 'success' | 'error';

export const ImportPanel = ({
  canUseDesktopBatchFileImport,
  canUseDesktopFilePicker,
  isSubmitting,
  mode,
  onClose,
  onCommitLocalFileBatch,
  onPreflightLocalFileBatch,
  onUploadBrowserFile,
  onImportLocalFile,
  onSubmit,
}: {
  canUseDesktopBatchFileImport: boolean;
  canUseDesktopFilePicker: boolean;
  isSubmitting: boolean;
  mode: ImportMode;
  onClose: () => void;
  onCommitLocalFileBatch: (batchId: string, candidateIds: string[]) => Promise<LocalFileBatchCommitResult>;
  onPreflightLocalFileBatch: () => Promise<LocalFileBatchPreflight>;
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
  const [localBatch, setLocalBatch] = useState<LocalFileBatchPreflight | null>(null);
  const [selectedBatchCandidateIds, setSelectedBatchCandidateIds] = useState<string[]>([]);
  const [batchResult, setBatchResult] = useState<LocalFileBatchCommitResult | null>(null);
  const [status, setStatus] = useState<ImportPanelStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isFileMode = mode === 'file';
  const sourceRequired = mode === 'web';
  const isBusy = isSubmitting || status === 'submitting';
  const readyBatchCandidateIds = localBatch?.candidates
    .filter((candidate) => candidate.verdict === 'ready')
    .map((candidate) => candidate.candidateId) ?? [];
  const selectedReadyBatchCandidateIds = selectedBatchCandidateIds.filter((candidateId) => (
    readyBatchCandidateIds.includes(candidateId)
  ));

  const resetStatus = () => {
    setStatus('idle');
    setStatusMessage(null);
    setValidationError(null);
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    resetStatus();
  };

  const handlePreflightLocalBatch = async () => {
    resetStatus();
    setBatchResult(null);
    setLocalBatch(null);
    setSelectedBatchCandidateIds([]);
    setStatus('submitting');
    setStatusMessage('正在检查文件类型、大小和重复内容…');
    try {
      const batch = await onPreflightLocalFileBatch();
      if (batch.canceled) {
        setStatus('idle');
        setStatusMessage('已取消文件选择。');
        return;
      }
      setLocalBatch(batch);
      setSelectedBatchCandidateIds(
        batch.candidates
          .filter((candidate) => candidate.verdict === 'ready')
          .map((candidate) => candidate.candidateId),
      );
      setStatus('idle');
      setStatusMessage(null);
    } catch (submitError) {
      setStatus('error');
      setStatusMessage(submitError instanceof Error ? submitError.message : String(submitError));
    }
  };

  const handleCommitLocalBatch = async () => {
    if (!localBatch?.batchId) {
      await handlePreflightLocalBatch();
      return;
    }
    if (selectedReadyBatchCandidateIds.length === 0) {
      setValidationError('请至少选择一份预检通过的文件。');
      return;
    }

    setValidationError(null);
    setStatus('submitting');
    setStatusMessage(`正在依次导入 ${selectedReadyBatchCandidateIds.length} 份文件…`);
    try {
      const result = await onCommitLocalFileBatch(localBatch.batchId, selectedReadyBatchCandidateIds);
      setLocalBatch(null);
      setSelectedBatchCandidateIds([]);
      setBatchResult(result);
      setStatus('success');
      setStatusMessage(`导入完成：成功 ${result.imported.length} 个，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个。`);
    } catch (submitError) {
      // The main-process token is single-use, so a failed commit must start with a new preflight.
      setLocalBatch(null);
      setSelectedBatchCandidateIds([]);
      setStatus('error');
      setStatusMessage(submitError instanceof Error ? submitError.message : String(submitError));
    }
  };

  const handleChooseFile = async () => {
    if (canUseDesktopBatchFileImport) {
      await handlePreflightLocalBatch();
      return;
    }
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
      if (canUseDesktopBatchFileImport) {
        await handleCommitLocalBatch();
        return;
      }
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

        {!isFileMode || !canUseDesktopBatchFileImport ? (
          <label className="kd-field">
            <span>标题</span>
            <input
              disabled={isBusy}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={isFileMode ? '可选，留空则使用文件名' : '可选，留空则按来源自动命名'}
              value={title}
            />
          </label>
        ) : null}

        {isFileMode ? (
          <div className="kd-import-file-area">
            {canUseDesktopBatchFileImport ? (
              <>
                <button
                  className="kd-batch-file-picker"
                  disabled={isBusy}
                  onClick={() => void handlePreflightLocalBatch()}
                  type="button"
                >
                  <FolderOpen size={20} />
                  <span>{localBatch ? '重新选择并预检文件' : '选择本机文件并预检'}</span>
                  <small>最多 20 个，每个不超过 20 MB</small>
                </button>
                {localBatch ? (
                  <LocalFileBatchPreflightList
                    candidates={localBatch.candidates}
                    disabled={isBusy}
                    selectedCandidateIds={selectedReadyBatchCandidateIds}
                    onToggle={(candidateId, checked) => {
                      setSelectedBatchCandidateIds((current) => (
                        checked
                          ? Array.from(new Set([...current, candidateId]))
                          : current.filter((id) => id !== candidateId)
                      ));
                    }}
                  />
                ) : null}
                {batchResult ? <LocalFileBatchResult result={batchResult} /> : null}
              </>
            ) : (
              <>
                <FileDropZone
                  disabled={isBusy}
                  file={selectedFile}
                  onFileSelect={handleFileSelect}
                  title={canUseDesktopFilePicker ? '点击打开系统文件选择器，或拖拽文件到此处' : '拖拽文件到此处，或点击选择文件'}
                />
                {!canUseDesktopFilePicker ? (
                  <input
                    ref={browserFileInputRef}
                    accept={KNOWLEDGE_FILE_ACCEPT}
                    className="kd-hidden-file-input"
                    onChange={(event) => void handleBrowserFileSelected(event)}
                    type="file"
                  />
                ) : null}
              </>
            )}
            <div className="kd-import-file-types">
              <span><FileText size={13} /> Markdown</span>
              <span><FileText size={13} /> PDF</span>
              <span><FileText size={13} /> Word / PowerPoint</span>
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
              ? canUseDesktopBatchFileImport
                ? '文件路径和 SHA-256 仅保留在本机主进程。预检会跳过批内重复与已入库的同字节文件，再逐个导入收集箱。'
                : '文件解析在后端完成，不需要手写路径。导入后内容会先进入收集箱。'
              : '内容会先进入收集箱，后续可批量整理为摘要、标签与可检索知识条目。'}
          </p>
          <div>
            <button className="kd-secondary-button" disabled={isBusy} onClick={onClose} type="button">取消</button>
            <button
              className="kd-primary-button"
              disabled={isBusy || (isFileMode && canUseDesktopBatchFileImport && Boolean(localBatch?.batchId) && selectedReadyBatchCandidateIds.length === 0)}
              type="submit"
            >
              {isBusy ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  导入中
                </>
              ) : isFileMode ? (
                canUseDesktopBatchFileImport
                  ? localBatch?.batchId
                    ? `导入已选 ${selectedReadyBatchCandidateIds.length} 个`
                    : '选择文件并预检'
                  : canUseDesktopFilePicker ? '选择文件并导入' : '上传文件到收集箱'
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

const localFileBatchVerdictCopy: Record<LocalFileBatchCandidate['verdict'], string> = {
  ready: '可导入',
  duplicate_existing: '已入库',
  duplicate_in_batch: '批内重复',
  invalid: '不可导入',
};

const LocalFileBatchPreflightList = ({
  candidates,
  disabled,
  onToggle,
  selectedCandidateIds,
}: {
  candidates: LocalFileBatchCandidate[];
  disabled: boolean;
  onToggle: (candidateId: string, checked: boolean) => void;
  selectedCandidateIds: string[];
}) => {
  const readyCount = candidates.filter((candidate) => candidate.verdict === 'ready').length;
  const skippedCount = candidates.length - readyCount;
  return (
    <section className="kd-batch-preflight" aria-label="本机文件预检清单">
      <header>
        <div>
          <strong>预检清单</strong>
          <span>可导入 {readyCount} 个，已跳过 {skippedCount} 个</span>
        </div>
        <span>{candidates.length} 个文件</span>
      </header>
      <ul>
        {candidates.map((candidate) => {
          const ready = candidate.verdict === 'ready';
          return (
            <li className={`kd-batch-candidate kd-batch-candidate-${candidate.verdict}`} key={candidate.candidateId}>
              {ready ? (
                <input
                  aria-label={`选择 ${candidate.name}`}
                  checked={selectedCandidateIds.includes(candidate.candidateId)}
                  disabled={disabled}
                  onChange={(event) => onToggle(candidate.candidateId, event.target.checked)}
                  type="checkbox"
                />
              ) : (
                <AlertTriangle aria-hidden="true" size={16} />
              )}
              <div>
                <strong title={candidate.name}>{candidate.name}</strong>
                <span>{formatFileSize(candidate.size)} · {localFileBatchVerdictCopy[candidate.verdict]}</span>
                {candidate.reason ? <small>{candidate.reason}</small> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const LocalFileBatchResult = ({ result }: { result: LocalFileBatchCommitResult }) => (
  <section className="kd-batch-result" aria-label="本机文件导入结果">
    <header>
      <CheckCircle2 size={18} />
      <div>
        <strong>本次导入结果</strong>
        <span>成功 {result.imported.length} 个，跳过 {result.skipped.length} 个，失败 {result.failed.length} 个</span>
      </div>
    </header>
    {result.skipped.length > 0 || result.failed.length > 0 ? (
      <ul>
        {result.skipped.map((entry) => (
          <li key={`skipped-${entry.candidateId}`}>
            <span>{entry.name}</span>
            <small>已跳过：{entry.reason}</small>
          </li>
        ))}
        {result.failed.map((entry) => (
          <li className="kd-batch-result-failed" key={`failed-${entry.candidateId}`}>
            <span>{entry.name}</span>
            <small>失败：{entry.reason}</small>
          </li>
        ))}
      </ul>
    ) : null}
  </section>
);

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / (1024 * 102.4)) / 10} MB`;
};

export const LibraryPage = ({
  apiEnabled,
  items,
  isLoading,
  mode,
  onLoadPage,
  onModeChange,
  onOpenDetail,
  tags,
}: {
  apiEnabled: boolean;
  items: KnowledgeItem[];
  isLoading?: boolean;
  mode: 'list' | 'cards';
  onLoadPage: ListPageLoader;
  onModeChange: (mode: 'list' | 'cards') => void;
  onOpenDetail: (item: KnowledgeItem) => void;
  tags: string[];
}) => {
  const [filters, setFilters] = useState<ItemFilters>(emptyFilters);
  const sourceOptions = useMemo(
    () => Array.from(new Set(['网页摘录', 'PDF', 'Markdown', '粘贴内容', ...buildSourceOptions(items, [])])),
    [items],
  );
  const tagOptions = useMemo(
    () => Array.from(new Set([...tags, ...buildTagOptions(items, [])])).slice(0, 8),
    [items, tags],
  );
  const fallbackItems = useMemo(() => applyItemFilters(items, filters), [items, filters]);
  const pageParams = useMemo<ListKnowledgeItemsParams>(() => ({
    statuses: ['ready'],
    sourceType: serverSearchSourceType(filters.source[0]),
    tag: filters.tag[0],
    ...serverSearchDateRange(filters.time),
  }), [filters.source, filters.tag, filters.time]);
  const { isPageLoading, pageData, pageError, requestPage } = usePagedKnowledgeItems({
    apiEnabled,
    fallbackItems,
    loadPage: onLoadPage,
    params: pageParams,
  });
  const filteredItems = pageData.items;
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
          onToggle={(value) => setFilters((current) => toggleSingleFilterValue(current, 'source', value))}
          selectionMode="single"
          title="来源"
          values={sourceOptions}
        />
        <FilterGroup
          activeValues={filters.time}
          onToggle={(value) => setFilters((current) => toggleSingleFilterValue(current, 'time', value))}
          selectionMode="single"
          title="时间"
          values={['今天', '本周', '本月', '更早']}
        />
        <FilterGroup
          activeValues={filters.tag}
          onToggle={(value) => setFilters((current) => toggleSingleFilterValue(current, 'tag', value))}
          selectionMode="single"
          title="主题"
          values={tagOptions}
        />
        <FilterSummary
          filters={filters}
          onClear={() => setFilters(emptyFilters)}
          resultCount={filteredItems.length}
          totalCount={pageData.total}
        />
      </aside>

      <div className="kd-stack">
        <header className="kd-page-identity kd-page-identity--library">
          <div>
            <p>RECALL INDEX / LIBRARY</p>
            <h2>不是收藏夹，是能够重新找到的记忆。</h2>
            <span>用来源、时间和主题切开索引，回到真正需要的那一条。</span>
          </div>
          <strong aria-hidden="true">02</strong>
        </header>
        <div className="kd-page-tools">
          <div>
            <h2 className="kd-section-title">当前页 {formatCount(filteredItems.length)} / {formatCount(pageData.total)} 条知识条目</h2>
            <p className="kd-muted">
              {apiEnabled
                ? (hasActiveFilters ? '筛选和分页均来自本机服务端全库。' : '按来源、标签、时间和文档类型找回全库内容。')
                : '后端未连接，当前仅筛选已加载条目。'}
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

        {pageError ? (
          <ErrorCard
            description="服务端分页暂不可用，当前保留已加载条目。"
            error={pageError}
            onRetry={() => void requestPage(pageData.page)}
            retryLabel="重试加载"
            title="知识库加载失败"
          />
        ) : null}

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

        <CollectionPagination
          currentPage={pageData.page}
          isLoading={isPageLoading}
          label="知识库分页"
          onPageChange={(page) => void requestPage(page)}
          pageSize={pageData.pageSize}
          total={pageData.total}
        />
      </div>
    </div>
  );
};

export const ArchivePage = ({
  actionState,
  apiEnabled,
  items,
  isLoading,
  onItemAction,
  onLoadPage,
  onOpenDetail,
  tags,
}: {
  actionState: { itemId: string; action: KnowledgeWorkflowAction } | null;
  apiEnabled: boolean;
  items: KnowledgeItem[];
  isLoading?: boolean;
  onItemAction: (item: KnowledgeItem, action: KnowledgeWorkflowAction) => Promise<void>;
  onLoadPage: ListPageLoader;
  onOpenDetail: (item: KnowledgeItem) => void;
  tags: string[];
}) => {
  const [filters, setFilters] = useState<ItemFilters>(emptyFilters);
  const sourceOptions = useMemo(
    () => Array.from(new Set(['网页摘录', 'PDF', 'Markdown', '粘贴内容', ...buildSourceOptions(items, [])])),
    [items],
  );
  const tagOptions = useMemo(
    () => Array.from(new Set([...tags, ...buildTagOptions(items, [])])).slice(0, 8),
    [items, tags],
  );
  const fallbackItems = useMemo(() => applyItemFilters(items, filters), [items, filters]);
  const pageParams = useMemo<ListKnowledgeItemsParams>(() => ({
    statuses: ['archived'],
    sourceType: serverSearchSourceType(filters.source[0]),
    tag: filters.tag[0],
    ...serverSearchDateRange(filters.time),
  }), [filters.source, filters.tag, filters.time]);
  const { isPageLoading, pageData, pageError, requestPage } = usePagedKnowledgeItems({
    apiEnabled,
    fallbackItems,
    loadPage: onLoadPage,
    params: pageParams,
  });
  const filteredItems = pageData.items;
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
          onToggle={(value) => setFilters((current) => toggleSingleFilterValue(current, 'source', value))}
          selectionMode="single"
          title="来源"
          values={sourceOptions}
        />
        <FilterGroup
          activeValues={filters.time}
          onToggle={(value) => setFilters((current) => toggleSingleFilterValue(current, 'time', value))}
          selectionMode="single"
          title="时间"
          values={['今天', '本周', '本月', '更早']}
        />
        <FilterGroup
          activeValues={filters.tag}
          onToggle={(value) => setFilters((current) => toggleSingleFilterValue(current, 'tag', value))}
          selectionMode="single"
          title="主题"
          values={tagOptions}
        />
        <FilterSummary
          filters={filters}
          onClear={() => setFilters(emptyFilters)}
          resultCount={filteredItems.length}
          totalCount={pageData.total}
        />
      </aside>

      <div className="kd-stack">
        <header className="kd-page-identity kd-page-identity--archive">
          <div>
            <p>QUIET STORAGE / ARCHIVE</p>
            <h2>暂时退出视野的资料，依然留在你的索引里。</h2>
            <span>归档不是删除；它只是从当前工作流中安静退场。</span>
          </div>
          <strong aria-hidden="true">03</strong>
        </header>
        <div className="kd-page-tools">
          <div>
            <h2 className="kd-section-title">当前页 {formatCount(filteredItems.length)} / {formatCount(pageData.total)} 条归档资料</h2>
            <p className="kd-muted">
              {apiEnabled
                ? (hasActiveFilters ? '筛选和分页均来自本机服务端全库。' : '归档不会丢失资料，后续仍可恢复。')
                : '后端未连接，当前仅筛选已加载条目。'}
            </p>
          </div>
        </div>

        {pageError ? (
          <ErrorCard
            description="服务端分页暂不可用，当前保留已加载条目。"
            error={pageError}
            onRetry={() => void requestPage(pageData.page)}
            retryLabel="重试加载"
            title="归档库加载失败"
          />
        ) : null}

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

        <CollectionPagination
          currentPage={pageData.page}
          isLoading={isPageLoading}
          label="归档库分页"
          onPageChange={(page) => void requestPage(page)}
          pageSize={pageData.pageSize}
          total={pageData.total}
        />
      </div>
    </div>
  );
};

const ingestionJobTypeCopy: Record<KnowledgeIngestionJob['jobType'], string> = {
  import: '导入资料',
  organize: '整理资料',
  reprocess: '重新整理',
  unknown: '未知操作',
};

const ingestionJobStatusCopy: Record<KnowledgeIngestionJob['status'], string> = {
  pending: '等待处理',
  running: '处理中',
  succeeded: '已完成',
  failed: '处理失败',
  unknown: '未知状态',
};

const IngestionHistory = ({
  error,
  isLoading,
  jobs,
  onRetry,
}: {
  error?: string | null;
  isLoading: boolean;
  jobs: KnowledgeIngestionJob[];
  onRetry: () => void;
}) => (
  <section aria-labelledby="kd-ingestion-history-title" className="kd-ingestion-history">
    <div className="kd-ingestion-history__header">
      <div>
        <h3 id="kd-ingestion-history-title">处理记录</h3>
        <p>仅显示这条资料在本机的导入、整理与重试结果。</p>
      </div>
      {isLoading ? <span className="kd-ingestion-history__loading"><Loader2 size={14} className="animate-spin" /> 同步中</span> : null}
    </div>

    {error ? (
      <ErrorCard
        className="kd-ingestion-history__error"
        description="处理记录暂时无法读取，正文与现有操作不受影响。"
        error={error}
        onRetry={onRetry}
        retryLabel="重新读取"
        title="处理记录加载失败"
      />
    ) : null}

    {isLoading && jobs.length === 0 ? (
      <p className="kd-ingestion-history__empty"><Loader2 size={15} className="animate-spin" /> 正在读取这条资料的处理记录…</p>
    ) : null}
    {!isLoading && !error && jobs.length === 0 ? (
      <p className="kd-ingestion-history__empty">暂无处理记录；早期导入的资料可能没有历史任务。</p>
    ) : null}
    {jobs.length > 0 ? (
      <ol className="kd-ingestion-history__list">
        {jobs.map((job) => {
          const JobIcon = job.status === 'succeeded'
            ? CheckCircle2
            : job.status === 'failed'
              ? AlertTriangle
              : job.status === 'running'
                ? Loader2
                : Clock3;
          return (
            <li className={`kd-ingestion-history__item kd-ingestion-history__item--${job.status}`} key={job.id}>
              <JobIcon className={job.status === 'running' ? 'animate-spin' : undefined} size={17} />
              <div>
                <div className="kd-ingestion-history__title">
                  <strong>{ingestionJobTypeCopy[job.jobType]}</strong>
                  <span>{ingestionJobStatusCopy[job.status]}</span>
                </div>
                <p>{formatIngestionJobTime(job)}</p>
                {job.errorMessage ? <p className="kd-ingestion-history__failure">失败原因：{job.errorMessage}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    ) : null}
  </section>
);

const formatIngestionJobTime = (job: KnowledgeIngestionJob) => {
  const value = job.finishedAt || job.startedAt || job.createdAt;
  if (!value || Number.isNaN(Date.parse(value))) return '未记录处理时间';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
};

export const DetailPage = ({
  actionState,
  error,
  isLoading,
  item,
  jobHistoryEnabled,
  jobs,
  jobsError,
  jobsLoading,
  onAction,
  onAskAssistant,
  onOpenManagedSourceAsset,
  onRetryJobs,
  onUpdate,
}: {
  actionState: { itemId: string; action: KnowledgeWorkflowAction } | null;
  error?: string | null;
  isLoading?: boolean;
  item: KnowledgeItem;
  jobHistoryEnabled: boolean;
  jobs: KnowledgeIngestionJob[];
  jobsError?: string | null;
  jobsLoading: boolean;
  onAction: (item: KnowledgeItem, action: KnowledgeWorkflowAction) => Promise<void>;
  onAskAssistant: (item: KnowledgeItem, context?: 'summary' | 'body') => void;
  onOpenManagedSourceAsset: (assetId: string, reveal?: boolean) => Promise<void>;
  onRetryJobs: () => void;
  onUpdate: (item: KnowledgeItem, draft: { title: string; summary: string; tags: string[] }) => Promise<void>;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: item.title,
    summary: item.summary,
    tags: item.tags.join(', '),
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [sourceAssetAction, setSourceAssetAction] = useState<'open' | 'reveal' | null>(null);
  const [sourceAssetError, setSourceAssetError] = useState<string | null>(null);
  const [visibleParagraphCount, setVisibleParagraphCount] = useState(DETAIL_INITIAL_PARAGRAPH_COUNT);
  const body = item.cleanedContent || item.rawContent || item.summary;
  const allParagraphs = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const paragraphs = allParagraphs.slice(0, visibleParagraphCount);
  const remainingParagraphCount = allParagraphs.length - paragraphs.length;
  const workflowActions = buildWorkflowActions(item);
  const itemTagDraft = item.tags.join(', ');
  const canAskWithBody = Boolean((item.cleanedContent || item.rawContent || '').trim());

  const startEditing = () => {
    setEditError(null);
    setDraft({ title: item.title, summary: item.summary, tags: itemTagDraft });
    setIsEditing(true);
  };

  const handleManagedSourceAsset = async (action: 'open' | 'reveal') => {
    if (!item.sourceAsset || item.sourceAsset.availability !== 'available') return;
    setSourceAssetAction(action);
    setSourceAssetError(null);
    try {
      await onOpenManagedSourceAsset(item.sourceAsset.id, action === 'reveal');
    } catch (sourceError) {
      setSourceAssetError(sourceError instanceof Error ? sourceError.message : String(sourceError));
    } finally {
      setSourceAssetAction(null);
    }
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();
    const summary = draft.summary.trim();
    const tags = Array.from(new Set(draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean)));
    if (!title) {
      setEditError('标题不能为空。');
      return;
    }
    if (title.length > 240) {
      setEditError('标题不能超过 240 个字符。');
      return;
    }
    if (tags.length > 12 || tags.some((tag) => tag.length > 80)) {
      setEditError('最多保留 12 个标签，每个标签不超过 80 个字符。');
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    try {
      await onUpdate(item, { title, summary, tags });
      setIsEditing(false);
    } catch (updateError) {
      setEditError(updateError instanceof Error ? updateError.message : String(updateError));
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (isLoading) {
    return <DetailSkeleton />;
  }

  return (
    <article className="kd-detail">
      <div className="kd-detail-header">
        <div className="kd-detail-identity">
          <span className="kd-detail-index">RECORD / {item.id.slice(-4).toUpperCase()}</span>
          <div className="kd-breadcrumb">{item.status === 'archived' ? '归档库' : '知识库'} / {item.tags[0] ?? '未分类'} / {typeCopy[item.type]}</div>
        </div>
        <div className="kd-inline-actions">
          {workflowActions.length > 0 ? (
            <>
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
            </>
          ) : null}
          <button
            className="kd-action-button"
            disabled={isSavingEdit || isEditing}
            onClick={() => onAskAssistant(item, 'summary')}
            type="button"
          >
            <MessageCircle size={15} /> 问本机助手
          </button>
          {canAskWithBody ? (
            <button
              aria-label="带正文提问，正文会先预填进本机助手输入框"
              className="kd-action-button"
              disabled={isSavingEdit || isEditing}
              onClick={() => onAskAssistant(item, 'body')}
              type="button"
            >
              <FileText size={15} /> 带正文提问
            </button>
          ) : null}
          <button
            className="kd-action-button"
            disabled={isSavingEdit || isEditing}
            onClick={startEditing}
            type="button"
          >
            <Pencil size={15} /> 编辑
          </button>
        </div>
      </div>
      {isEditing ? (
        <form className="kd-detail-editor" onSubmit={(event) => void submitEdit(event)}>
          <label className="kd-field">
            <span>标题</span>
            <input
              maxLength={240}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              value={draft.title}
            />
          </label>
          <label className="kd-field">
            <span>摘要</span>
            <textarea
              onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
              rows={4}
              value={draft.summary}
            />
          </label>
          <label className="kd-field">
            <span>标签（使用逗号分隔）</span>
            <input
              onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
              placeholder="例如 RAG, 向量检索"
              value={draft.tags}
            />
          </label>
          {editError ? <p className="kd-form-error">{editError}</p> : null}
          <div className="kd-inline-actions">
            <button className="kd-action-button" disabled={isSavingEdit} onClick={() => setIsEditing(false)} type="button">
              <X size={15} /> 取消
            </button>
            <button className="kd-action-button kd-action-button--primary" disabled={isSavingEdit} type="submit">
              {isSavingEdit ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {isSavingEdit ? '保存中' : '保存修改'}
            </button>
          </div>
        </form>
      ) : <h2>{item.title}</h2>}
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
      {item.sourceAsset ? (
        <section className={`kd-source-asset kd-source-asset--${item.sourceAsset.availability}`} aria-label="本机原件">
          <div className="kd-source-asset__meta">
            <FolderOpen size={18} />
            <div>
              <p className="kd-kicker">本机原件</p>
              <strong>{item.sourceAsset.originalFilename}</strong>
              <span>
                {item.sourceAsset.origin === 'watched_folder' ? '自动收集' : '手动导入'} · {formatSourceAssetSize(item.sourceAsset.byteSize)} · {sourceAssetAvailabilityCopy(item.sourceAsset.availability)}
              </span>
            </div>
          </div>
          {item.sourceAsset.availability === 'available' ? (
            <div className="kd-source-asset__actions">
              <button disabled={sourceAssetAction !== null} onClick={() => void handleManagedSourceAsset('open')} type="button">
                {sourceAssetAction === 'open' ? <Loader2 className="animate-spin" size={14} /> : <Eye size={14} />} 打开原件
              </button>
              <button disabled={sourceAssetAction !== null} onClick={() => void handleManagedSourceAsset('reveal')} type="button">
                {sourceAssetAction === 'reveal' ? <Loader2 className="animate-spin" size={14} /> : <FolderOpen size={14} />} 在 Finder 中显示
              </button>
            </div>
          ) : (
            <p className="kd-source-asset__missing">
              {item.sourceAsset.availability === 'missing'
                ? '此条资料的原件未随当前本机数据恢复，但正文、摘要和标签仍可使用。'
                : '原件正在完成本机保存，请稍后刷新详情。'}
            </p>
          )}
          {sourceAssetError ? <p className="kd-form-error">{sourceAssetError}</p> : null}
        </section>
      ) : null}
      {error ? (
        <ErrorCard
          className="my-4"
          description="完整正文加载失败，当前展示的是摘要内容。你可以返回列表重试，或先查看已有信息。"
          error={error}
          title="正文加载失败"
        />
      ) : null}

      {jobHistoryEnabled ? (
        <IngestionHistory
          error={jobsError}
          isLoading={jobsLoading}
          jobs={jobs}
          onRetry={onRetryJobs}
        />
      ) : null}

      {paragraphs.map((paragraph, index) => <p key={`${item.id}-${index}`}>{paragraph}</p>)}
      {allParagraphs.length === 0 ? <p>这条知识还没有可展示正文，整理完成后会补充清洗后的内容。</p> : null}
      {allParagraphs.length > DETAIL_INITIAL_PARAGRAPH_COUNT ? (
        <div className="kd-detail-reading-actions">
          <span>已显示 {paragraphs.length} / {allParagraphs.length} 段</span>
          <div>
            {remainingParagraphCount > 0 ? (
              <button
                className="kd-action-button"
                onClick={() => setVisibleParagraphCount((current) => (
                  Math.min(allParagraphs.length, current + DETAIL_PARAGRAPH_BATCH_SIZE)
                ))}
                type="button"
              >
                <ChevronDown size={15} /> 继续阅读 {Math.min(remainingParagraphCount, DETAIL_PARAGRAPH_BATCH_SIZE)} 段
              </button>
            ) : null}
            {visibleParagraphCount > DETAIL_INITIAL_PARAGRAPH_COUNT ? (
              <button
                className="kd-action-button"
                onClick={() => setVisibleParagraphCount(DETAIL_INITIAL_PARAGRAPH_COUNT)}
                type="button"
              >
                <ChevronUp size={15} /> 收起正文
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <blockquote>
        这条知识已关联到 {item.tags.length > 0 ? item.tags.join(' / ') : '未分类主题'}，后续可从标签、来源、时间和关键词再次找回。
      </blockquote>
    </article>
  );
};

const formatSourceAssetSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 1) return '大小未知';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const sourceAssetAvailabilityCopy = (availability: NonNullable<KnowledgeItem['sourceAsset']>['availability']) => {
  if (availability === 'available') return '已安全保存';
  if (availability === 'missing') return '原件缺失';
  if (availability === 'pending') return '保存中';
  return '状态未知';
};

const SEARCH_HISTORY_KEY = 'kd:search-history';
const MAX_HISTORY = 6;
const SEARCH_PAGE_SIZE = 12;

const serverSearchStatus = (status: SearchStatusFilter) => {
  if (status === 'pending') return 'inbox';
  if (status === 'done') return 'ready';
  return status === 'all' ? undefined : status;
};

const serverSearchSourceType = (source: string | undefined) => {
  if (source === '网页摘录') return 'web';
  if (source === 'PDF') return 'pdf';
  if (source === 'Markdown') return 'markdown';
  if (source === '粘贴内容') return 'snippet';
  return undefined;
};

const serverSearchDateRange = (ranges: string[]) => {
  const range = ranges[0];
  if (!range) return {};

  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  if (range === '更早') {
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    endOfPreviousMonth.setMilliseconds(-1);
    return { to: endOfPreviousMonth.toISOString() };
  }
  if (range === '本周') {
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  } else if (range === '本月') {
    from.setDate(1);
  } else if (range !== '今天') {
    return {};
  }

  return { from: from.toISOString(), to: now.toISOString() };
};

const buildLocalSearchPage = (
  items: KnowledgeItem[],
  query: string,
  filters: ItemFilters,
  statusFilter: SearchStatusFilter,
  requestedPage: number,
): KnowledgeItemPage => {
  const filtered = applyItemFilters(
    filterSearchItemsByStatus(filterLocalItems(items, query), statusFilter),
    filters,
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / SEARCH_PAGE_SIZE));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const start = (page - 1) * SEARCH_PAGE_SIZE;
  return {
    items: filtered.slice(start, start + SEARCH_PAGE_SIZE),
    total: filtered.length,
    page,
    pageSize: SEARCH_PAGE_SIZE,
  };
};

const searchStatusOptions: Array<{ id: SearchStatusFilter; label: string }> = [
  { id: 'all', label: '全部资料' },
  { id: 'pending', label: '待整理' },
  { id: 'processing', label: '整理中' },
  { id: 'done', label: '知识库' },
  { id: 'failed', label: '需重试' },
  { id: 'archived', label: '归档' },
];

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
  availableTags,
  searchableItems,
  onOpenDetail,
}: {
  apiEnabled: boolean;
  availableTags: string[];
  searchableItems: KnowledgeItem[];
  onOpenDetail: (item: KnowledgeItem) => void;
}) => {
  const [query, setQuery] = useState('');
  const [resultPage, setResultPage] = useState<KnowledgeItemPage | null>(null);
  const [filters, setFilters] = useState<ItemFilters>(emptyFilters);
  const [statusFilter, setStatusFilter] = useState<SearchStatusFilter>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>(loadSearchHistory);
  const [hasSearched, setHasSearched] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRequestIdRef = useRef(0);
  const searchCorpus = useMemo(() => buildSearchCorpus(searchableItems), [searchableItems]);
  const visibleResults = useMemo(() => resultPage?.items ?? [], [resultPage]);
  const totalResults = resultPage?.total ?? 0;
  const currentPage = resultPage?.page ?? 1;
  const currentPageSize = resultPage?.pageSize ?? SEARCH_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalResults / currentPageSize));
  const sourceOptions = useMemo(
    () => buildSourceOptions(visibleResults, ['网页摘录', 'PDF', 'Markdown', '粘贴内容']),
    [visibleResults],
  );
  const tagOptions = useMemo(
    () => buildTagOptions(visibleResults, availableTags),
    [availableTags, visibleResults],
  );
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

  const runSearch = useCallback(async ({
    nextFilters = filters,
    nextPage = 1,
    nextQuery = query,
    nextStatus = statusFilter,
  }: {
    nextFilters?: ItemFilters;
    nextPage?: number;
    nextQuery?: string;
    nextStatus?: SearchStatusFilter;
  } = {}) => {
    const normalizedQuery = nextQuery.trim();
    const requestId = ++searchRequestIdRef.current;
    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);
    try {
      if (apiEnabled) {
        const dateRange = serverSearchDateRange(nextFilters.time);
        const apiResult = await searchKnowledgeItems({
          query: normalizedQuery,
          tag: nextFilters.tag[0],
          sourceType: serverSearchSourceType(nextFilters.source[0]),
          status: serverSearchStatus(nextStatus),
          page: nextPage,
          pageSize: SEARCH_PAGE_SIZE,
          ...dateRange,
        });
        if (searchRequestIdRef.current !== requestId) return;
        setResultPage(apiResult);
      } else {
        setResultPage(buildLocalSearchPage(searchCorpus, normalizedQuery, nextFilters, nextStatus, nextPage));
      }
      addToHistory(normalizedQuery);
    } catch (error) {
      if (searchRequestIdRef.current !== requestId) return;
      setResultPage(buildLocalSearchPage(searchCorpus, normalizedQuery, nextFilters, nextStatus, nextPage));
      setSearchError(error instanceof Error ? error.message : String(error));
      addToHistory(normalizedQuery);
    } finally {
      if (searchRequestIdRef.current === requestId) {
        setIsSearching(false);
      }
    }
  }, [query, filters, statusFilter, searchCorpus, apiEnabled, addToHistory]);

  const applySuggestion = useCallback((term: string) => {
    setQuery(term);
    void runSearch({ nextQuery: term });
  }, [runSearch]);

  const updateFilters = useCallback((category: keyof ItemFilters, value: string) => {
    const currentValues = filters[category];
    const nextFilters = {
      ...filters,
      [category]: currentValues.includes(value) ? [] : [value],
    };
    setFilters(nextFilters);
    if (hasSearched) {
      void runSearch({ nextFilters });
    }
  }, [filters, hasSearched, runSearch]);

  const updateStatusFilter = useCallback((nextStatus: SearchStatusFilter) => {
    setStatusFilter(nextStatus);
    if (hasSearched) {
      void runSearch({ nextStatus });
    }
  }, [hasSearched, runSearch]);

  const clearFilters = useCallback(() => {
    setFilters(emptyFilters);
    if (hasSearched) {
      void runSearch({ nextFilters: emptyFilters });
    }
  }, [hasSearched, runSearch]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  return (
    <div className="kd-search-page">
      <header className="kd-page-identity kd-page-identity--search">
        <div>
          <p>QUERY ROOM / GLOBAL SEARCH</p>
          <h2>不是翻找，是重新抵达。</h2>
          <span>从主题、来源、标签或一句关键话，回到它最初留下来的位置。</span>
        </div>
        <strong aria-hidden="true">04</strong>
      </header>
      <div className="kd-search-box">
        <Search size={24} />
        <input
          aria-label="全局搜索"
          onChange={(event) => {
            searchRequestIdRef.current += 1;
            setQuery(event.target.value);
            setResultPage(null);
            setSearchError(null);
            setHasSearched(false);
            setIsSearching(false);
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
              {searchStatusOptions.map((option) => (
                <button
                  className={statusFilter === option.id ? 'is-active' : ''}
                  key={option.id}
                  onClick={() => updateStatusFilter(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="kd-search-scope" aria-live="polite">
              <strong>{formatCount(totalResults)}</strong>
              <span>条符合条件</span>
              <span>{apiEnabled ? '服务端全库检索' : '当前已加载条目'}</span>
            </div>
          </div>

          <div className="kd-search-layout">
            <aside className="kd-filter-rail">
              <FilterGroup
                activeValues={filters.source}
                onToggle={(value) => updateFilters('source', value)}
                selectionMode="single"
                title="来源"
                values={sourceOptions}
              />
              <FilterGroup
                activeValues={filters.tag}
                onToggle={(value) => updateFilters('tag', value)}
                selectionMode="single"
                title="标签"
                values={tagOptions}
              />
              <FilterGroup
                activeValues={filters.time}
                onToggle={(value) => updateFilters('time', value)}
                selectionMode="single"
                title="时间"
                values={['今天', '本周', '本月']}
              />
              <FilterSummary
                filters={filters}
                onClear={clearFilters}
                resultCount={visibleResults.length}
                totalCount={totalResults}
              />
            </aside>
            <section className="kd-search-results">
              {searchError ? (
                <ErrorCard
                  description="数据库搜索暂不可用，已使用当前可见条目过滤。"
                  error={searchError}
                  onRetry={() => void runSearch({ nextPage: currentPage })}
                  retryLabel="重试搜索"
                  title="搜索服务异常"
                />
              ) : null}
              {visibleResults.map((item) => (
                <article
                  aria-label={`打开知识条目：${item.title}`}
                  className="kd-search-result"
                  key={item.id}
                  onClick={() => onOpenDetail(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenDetail(item);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
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
                  title={query.trim() ? '未找到匹配结果' : '还没有符合条件的资料'}
                  description={query.trim()
                    ? '尝试更换关键词、清空筛选条件，或从左侧选择其他来源和标签。'
                    : '可输入主题、来源、标签或关键句，也可直接按筛选条件浏览全库。'}
                />
              ) : null}
              {totalPages > 1 ? (
                <nav className="kd-search-pagination" aria-label="搜索结果分页">
                  <button
                    disabled={isSearching || currentPage <= 1}
                    onClick={() => void runSearch({ nextPage: currentPage - 1 })}
                    type="button"
                  >
                    上一页
                  </button>
                  <span>第 {currentPage} / {totalPages} 页</span>
                  <button
                    disabled={isSearching || currentPage >= totalPages}
                    onClick={() => void runSearch({ nextPage: currentPage + 1 })}
                    type="button"
                  >
                    下一页
                  </button>
                </nav>
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
        <div className="kd-queue-row"><Clock3 size={15} /> {snapshot.dashboard.review.dueCount} 条待回顾</div>
      </ContextBlock>
      <ContextBlock title="知识资产" icon={FolderOpen}>
        <div className="kd-asset-meter"><span style={{ width: `${storagePercent}%` }} /></div>
        <p>{formatCount(snapshot.storage.readyItems)} / {formatCount(snapshot.storage.totalItems)} 条已进入可检索索引。</p>
      </ContextBlock>
      <ContextBlock title="未来扩展位" icon={Network}>
        <div className="kd-extension-list">
          <span><Network size={15} /> 知识图谱</span>
          <span><Cpu size={15} /> 个性化推荐</span>
          <span><BookOpen size={15} /> 本机备份恢复</span>
        </div>
      </ContextBlock>
    </aside>
  );
};

const importModeTitle = (mode: ImportMode) => {
  if (mode === 'web') return '网页摘录收藏';
  if (mode === 'file') return '导入本机文档';
  return '粘贴内容';
};
