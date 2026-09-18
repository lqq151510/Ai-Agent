import type { KnowledgeDeskSnapshot, KnowledgeItem } from './knowledgeDeskApi';

export type FilterCategory = 'source' | 'time' | 'tag';
export type ItemFilters = Record<FilterCategory, string[]>;
export type InboxSegment = 'all' | 'pending' | 'processing' | 'failed';
export type SearchStatusFilter = 'all' | NonNullable<KnowledgeItem['status']>;
export type KnowledgeWorkflowAction = 'organize' | 'reprocess' | 'archive' | 'restore';
export type WorkflowActionTone = 'neutral' | 'primary' | 'danger';
export type WorkflowActionDescriptor = {
  id: KnowledgeWorkflowAction;
  label: string;
  tone: WorkflowActionTone;
};
export type InboxSegmentDescriptor = {
  id: InboxSegment;
  label: string;
  count: number;
};
export type SearchStatusDescriptor = {
  id: SearchStatusFilter;
  label: string;
  count: number;
};
export type KeyboardShortcutState = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
};

export const emptyFilters: ItemFilters = {
  source: [],
  time: [],
  tag: [],
};

export const typeCopy: Record<KnowledgeItem['type'], string> = {
  web: '网页',
  pdf: 'PDF',
  markdown: 'Markdown',
  paste: '粘贴',
  snippet: '片段',
};

const inboxSegmentCopy: Record<InboxSegment, string> = {
  all: '全部',
  pending: '待整理',
  processing: '整理中',
  failed: '失败重试',
};

const searchStatusCopy: Record<SearchStatusFilter, string> = {
  all: '全部资料',
  pending: '待整理',
  processing: '整理中',
  done: '知识库',
  failed: '需重试',
  archived: '归档',
};

export const filterLocalItems = (items: KnowledgeItem[], query: string) => {
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

export const buildSearchCorpus = (...groups: KnowledgeItem[][]) => {
  const seen = new Set<string>();
  const merged: KnowledgeItem[] = [];

  groups.flat().forEach((item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    merged.push(item);
  });

  return merged;
};

export const mergeSearchResults = (primary: KnowledgeItem[], secondary: KnowledgeItem[]) => {
  const seen = new Set<string>();
  const merged: KnowledgeItem[] = [];

  [...primary, ...secondary].forEach((item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    merged.push(item);
  });

  return merged;
};

export const applyItemFilters = (items: KnowledgeItem[], filters: ItemFilters) => (
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

export const toggleFilterValue = (filters: ItemFilters, category: FilterCategory, value: string): ItemFilters => {
  const currentValues = filters[category];
  const nextValues = currentValues.includes(value)
    ? currentValues.filter((current) => current !== value)
    : [...currentValues, value];
  return { ...filters, [category]: nextValues };
};

export const toggleSingleFilterValue = (
  filters: ItemFilters,
  category: FilterCategory,
  value: string,
): ItemFilters => ({
  ...filters,
  [category]: filters[category].includes(value) ? [] : [value],
});

export const activeFilterCount = (filters: ItemFilters) => (
  filters.source.length + filters.time.length + filters.tag.length
);

export const isCommandSearchShortcut = (event: KeyboardShortcutState) => (
  event.key.toLowerCase() === 'k'
  && (event.metaKey || event.ctrlKey)
  && !event.altKey
  && !event.shiftKey
  && !event.isComposing
);

export const buildInboxSegments = (
  items: KnowledgeItem[],
  totals?: Partial<Record<InboxSegment, number>>,
): InboxSegmentDescriptor[] => {
  const counts = {
    pending: 0,
    processing: 0,
    failed: 0,
  };

  items.forEach((item) => {
    if (item.status === 'pending') counts.pending += 1;
    if (item.status === 'processing') counts.processing += 1;
    if (item.status === 'failed') counts.failed += 1;
  });

  return [
    { id: 'all', label: inboxSegmentCopy.all, count: totals?.all ?? items.length },
    { id: 'pending', label: inboxSegmentCopy.pending, count: totals?.pending ?? counts.pending },
    { id: 'processing', label: inboxSegmentCopy.processing, count: totals?.processing ?? counts.processing },
    { id: 'failed', label: inboxSegmentCopy.failed, count: totals?.failed ?? counts.failed },
  ];
};

export const inboxStatusesForSegment = (segment: InboxSegment) => {
  if (segment === 'all') return ['inbox', 'processing', 'failed'] as const;
  if (segment === 'pending') return ['inbox'] as const;
  return [segment] as const;
};

export const filterInboxItems = (items: KnowledgeItem[], segment: InboxSegment) => (
  segment === 'all' ? items : items.filter((item) => item.status === segment)
);

export const buildSearchStatusOptions = (items: KnowledgeItem[]): SearchStatusDescriptor[] => {
  const counts: Record<SearchStatusFilter, number> = {
    all: items.length,
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    archived: 0,
  };

  items.forEach((item) => {
    if (!item.status) return;
    counts[item.status] += 1;
  });

  return (Object.keys(searchStatusCopy) as SearchStatusFilter[])
    .map((id) => ({ id, label: searchStatusCopy[id], count: counts[id] }));
};

export const filterSearchItemsByStatus = (items: KnowledgeItem[], statusFilter: SearchStatusFilter) => (
  statusFilter === 'all' ? items : items.filter((item) => item.status === statusFilter)
);

export const buildWorkflowActions = (item: KnowledgeItem): WorkflowActionDescriptor[] => {
  if (item.status === 'pending') {
    return [
      { id: 'organize', label: '开始整理', tone: 'primary' },
      { id: 'archive', label: '归档', tone: 'danger' },
    ];
  }
  if (item.status === 'failed') {
    return [
      { id: 'reprocess', label: '重新整理', tone: 'primary' },
      { id: 'archive', label: '归档', tone: 'danger' },
    ];
  }
  if (item.status === 'done') {
    return [
      { id: 'reprocess', label: '再次整理', tone: 'neutral' },
      { id: 'archive', label: '归档', tone: 'danger' },
    ];
  }
  if (item.status === 'processing') {
    return [];
  }
  if (item.status === 'archived') {
    return [{ id: 'restore', label: '恢复到知识库', tone: 'primary' }];
  }
  return [];
};

export const buildSourceOptions = (items: KnowledgeItem[], fallback: string[]) => {
  const values = uniqueValues(items.map(sourceFilterLabel));
  return values.length > 0 ? values : fallback;
};

export const buildTagOptions = (items: KnowledgeItem[], fallback: string[]) => {
  const values = uniqueValues(items.flatMap((item) => item.tags)).slice(0, 8);
  return values.length > 0 ? values : uniqueValues(fallback).slice(0, 8);
};

export const buildSearchSnippet = (item: KnowledgeItem, query: string) => {
  const keyword = query.trim().split(/\s+/)[0];
  if (!keyword) return item.summary;
  if (item.summary.includes(keyword)) return item.summary;
  return `${item.summary} 关联关键词：${keyword}`;
};

export const applySnapshotItemUpdate = (
  snapshot: KnowledgeDeskSnapshot,
  previousItem: KnowledgeItem,
  nextItem: KnowledgeItem,
): KnowledgeDeskSnapshot => {
  const nextTags = nextItem.tags.length > 0 ? uniqueValues([...snapshot.tags, ...nextItem.tags]) : snapshot.tags;
  const counts = applyStatusCountDelta(snapshot, previousItem.status, nextItem.status, 0);

  return {
    ...snapshot,
    dashboard: {
      ...counts.dashboard,
      recentItems: updateRecentItems(snapshot.dashboard.recentItems, previousItem, nextItem),
    },
    inboxItems: insertVisibleItem(snapshot.inboxItems, previousItem, nextItem, belongsToInbox),
    inboxTotals: applyInboxTotalDelta(snapshot.inboxTotals, previousItem.status, nextItem.status),
    libraryItems: insertVisibleItem(snapshot.libraryItems, previousItem, nextItem, belongsToLibrary),
    archivedItems: insertVisibleItem(snapshot.archivedItems, previousItem, nextItem, belongsToArchive),
    tags: nextTags,
    storage: {
      ...counts.storage,
      totalTags: Math.max(counts.storage.totalTags, nextTags.length),
    },
  };
};

const uniqueValues = (values: string[]) => (
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
);

const belongsToInbox = (item: KnowledgeItem) => (
  item.status === 'pending' || item.status === 'processing' || item.status === 'failed'
);

const belongsToLibrary = (item: KnowledgeItem) => item.status === 'done';

const belongsToArchive = (item: KnowledgeItem) => item.status === 'archived';

const insertVisibleItem = (
  items: KnowledgeItem[],
  previousItem: KnowledgeItem,
  nextItem: KnowledgeItem,
  shouldInclude: (item: KnowledgeItem) => boolean,
) => {
  const filtered = items.filter((item) => item.id !== previousItem.id);
  if (!shouldInclude(nextItem)) return filtered;
  return [nextItem, ...filtered];
};

const updateRecentItems = (
  items: KnowledgeItem[],
  previousItem: KnowledgeItem,
  nextItem: KnowledgeItem,
) => {
  const filtered = items.filter((item) => item.id !== previousItem.id);
  const limit = items.length > 0 ? items.length : 5;
  return [nextItem, ...filtered].slice(0, limit);
};

const applyStatusCountDelta = (
  snapshot: KnowledgeDeskSnapshot,
  previousStatus: KnowledgeItem['status'],
  nextStatus: KnowledgeItem['status'] | null,
  archivedDeltaOverride: number,
) => {
  const dashboardDelta = countDelta(previousStatus, -1);
  const nextDelta = nextStatus ? countDelta(nextStatus, 1) : emptyCountDelta;
  const totalDelta = dashboardDelta.total + nextDelta.total;
  const inboxDelta = dashboardDelta.inbox + nextDelta.inbox;
  const readyDelta = dashboardDelta.ready + nextDelta.ready;
  const failedDelta = dashboardDelta.failed + nextDelta.failed;
  const archivedDelta = dashboardDelta.archived + nextDelta.archived + archivedDeltaOverride;

  return {
    dashboard: {
      ...snapshot.dashboard,
      totalItems: clampCount(snapshot.dashboard.totalItems + totalDelta),
      inboxItems: clampCount(snapshot.dashboard.inboxItems + inboxDelta),
      readyItems: clampCount(snapshot.dashboard.readyItems + readyDelta),
      failedItems: clampCount(snapshot.dashboard.failedItems + failedDelta),
    },
    storage: {
      ...snapshot.storage,
      totalItems: clampCount(snapshot.storage.totalItems + totalDelta),
      inboxItems: clampCount(snapshot.storage.inboxItems + inboxDelta),
      readyItems: clampCount(snapshot.storage.readyItems + readyDelta),
      failedItems: clampCount(snapshot.storage.failedItems + failedDelta),
      archivedItems: clampCount(snapshot.storage.archivedItems + archivedDelta),
    },
  };
};

const emptyCountDelta = {
  total: 0,
  inbox: 0,
  ready: 0,
  failed: 0,
  archived: 0,
};

const countDelta = (status: KnowledgeItem['status'], delta: number) => {
  if (!status) return emptyCountDelta;
  return {
    total: delta,
    inbox: status === 'pending' ? delta : 0,
    ready: status === 'done' ? delta : 0,
    failed: status === 'failed' ? delta : 0,
    archived: status === 'archived' ? delta : 0,
  };
};

const applyInboxTotalDelta = (
  totals: KnowledgeDeskSnapshot['inboxTotals'],
  previousStatus: KnowledgeItem['status'],
  nextStatus: KnowledgeItem['status'],
) => {
  const previousDelta = inboxTotalDelta(previousStatus, -1);
  const nextDelta = inboxTotalDelta(nextStatus, 1);
  return {
    all: clampCount(totals.all + previousDelta.all + nextDelta.all),
    pending: clampCount(totals.pending + previousDelta.pending + nextDelta.pending),
    processing: clampCount(totals.processing + previousDelta.processing + nextDelta.processing),
    failed: clampCount(totals.failed + previousDelta.failed + nextDelta.failed),
  };
};

const inboxTotalDelta = (status: KnowledgeItem['status'], delta: number) => ({
  all: status === 'pending' || status === 'processing' || status === 'failed' ? delta : 0,
  pending: status === 'pending' ? delta : 0,
  processing: status === 'processing' ? delta : 0,
  failed: status === 'failed' ? delta : 0,
});

const clampCount = (value: number) => Math.max(0, value);

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
