import { useDeferredValue, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  FolderOpen,
  Globe2,
  Inbox,
  LayoutGrid,
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
  emptyFilters,
  filterLocalItems,
  toggleFilterValue,
  type ItemFilters,
  typeCopy,
} from './knowledgeDeskViewModel';
import {
  ContextBlock,
  EmptyBlock,
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

  const handleBrowserFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    await onUploadBrowserFile(file, title);
    input.value = '';
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

export const LibraryPage = ({
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

export const DetailPage = ({
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

export const SearchPage = ({
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

const importModeTitle = (mode: ImportMode) => {
  if (mode === 'web') return '网页摘录收藏';
  if (mode === 'file') return '导入 Markdown / PDF';
  return '粘贴内容';
};
