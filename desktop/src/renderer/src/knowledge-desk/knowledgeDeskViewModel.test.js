/* global beforeEach, describe, expect, it */

import {
  applySnapshotItemUpdate,
  applyItemFilters,
  buildInboxSegments,
  buildSearchCorpus,
  buildSearchSnippet,
  buildSearchStatusOptions,
  buildWorkflowActions,
  filterLocalItems,
  filterInboxItems,
  filterSearchItemsByStatus,
  isCommandSearchShortcut,
  mergeSearchResults,
} from './knowledgeDeskViewModel';
import { fallbackSnapshot } from './knowledgeDeskApi';

const makeItem = (overrides = {}) => ({
  id: 'item',
  title: '默认标题',
  source: '本地资料',
  type: 'markdown',
  time: '今天',
  summary: '默认摘要',
  tags: [],
  status: 'pending',
  ...overrides,
});

describe('knowledgeDeskViewModel', () => {
  beforeEach(() => {
    installLocalStorageMock().clear();
  });

  it('returns the first 10 items when no local fallback query is provided', () => {
    const items = Array.from({ length: 12 }, (_, index) => (
      makeItem({
        id: `item-${index}`,
        title: `条目 ${index}`,
      })
    ));

    const results = filterLocalItems(items, '   ');

    expect(results).toHaveLength(10);
    expect(results.map((item) => item.id)).toEqual(items.slice(0, 10).map((item) => item.id));
  });

  it('filters by source, tag, and time without breaking search preview snippets', () => {
    const items = [
      makeItem({
        id: 'web-today-rag',
        title: 'RAG 检索策略',
        source: 'arxiv.org',
        type: 'web',
        time: '15 分钟前',
        summary: '这条摘要没有直接提到 Milvus。',
        tags: ['RAG', '检索'],
      }),
      makeItem({
        id: 'pdf-week-agent',
        title: 'Agent 工程复盘',
        source: '本地 PDF',
        type: 'pdf',
        time: '2 天前',
        summary: '覆盖 Agent 编排。',
        tags: ['Agent'],
      }),
      makeItem({
        id: 'web-old-rag',
        title: '旧版 RAG 笔记',
        source: 'blog.example.com',
        type: 'web',
        time: '去年',
        summary: '旧资料。',
        tags: ['RAG'],
      }),
    ];

    const filtered = applyItemFilters(items, {
      source: ['网页摘录'],
      time: ['今天'],
      tag: ['RAG'],
    });

    expect(filtered.map((item) => item.id)).toEqual(['web-today-rag']);
    expect(buildSearchSnippet(filtered[0], 'pgvector')).toContain('关联关键词：pgvector');
  });

  it('builds a unified search corpus and merges api results without dropping archived items', () => {
    const ready = makeItem({ id: 'ready-1', status: 'done', title: '知识库条目' });
    const archived = makeItem({ id: 'archived-1', status: 'archived', title: '归档条目' });
    const duplicateReady = makeItem({ id: 'ready-1', status: 'done', title: '重复知识库条目' });

    const corpus = buildSearchCorpus([ready], [archived], [duplicateReady]);
    const merged = mergeSearchResults([ready], [archived, duplicateReady]);

    expect(corpus.map((item) => item.id)).toEqual(['ready-1', 'archived-1']);
    expect(merged.map((item) => item.id)).toEqual(['ready-1', 'archived-1']);
  });

  it('builds search status filters and keeps archived items directly filterable', () => {
    const items = [
      makeItem({ id: 'pending', status: 'pending' }),
      makeItem({ id: 'ready', status: 'done' }),
      makeItem({ id: 'archived', status: 'archived' }),
      makeItem({ id: 'failed', status: 'failed' }),
    ];

    expect(buildSearchStatusOptions(items)).toEqual([
      { id: 'all', label: '全部资料', count: 4 },
      { id: 'pending', label: '待整理', count: 1 },
      { id: 'processing', label: '整理中', count: 0 },
      { id: 'done', label: '知识库', count: 1 },
      { id: 'failed', label: '需重试', count: 1 },
      { id: 'archived', label: '归档', count: 1 },
    ]);
    expect(filterSearchItemsByStatus(items, 'archived').map((item) => item.id)).toEqual(['archived']);
    expect(filterSearchItemsByStatus(items, 'all').map((item) => item.id)).toEqual([
      'pending',
      'ready',
      'archived',
      'failed',
    ]);
  });

  it('detects the command search shortcut without hijacking modified text input shortcuts', () => {
    expect(isCommandSearchShortcut({ key: 'k', metaKey: true })).toBe(true);
    expect(isCommandSearchShortcut({ key: 'K', ctrlKey: true })).toBe(true);
    expect(isCommandSearchShortcut({ key: 'k', metaKey: true, shiftKey: true })).toBe(false);
    expect(isCommandSearchShortcut({ key: 'k', ctrlKey: true, altKey: true })).toBe(false);
    expect(isCommandSearchShortcut({ key: 'k', metaKey: true, isComposing: true })).toBe(false);
    expect(isCommandSearchShortcut({ key: 'j', metaKey: true })).toBe(false);
  });

  it('builds inbox segments and workflow actions from item status', () => {
    const items = [
      makeItem({ id: 'pending', status: 'pending' }),
      makeItem({ id: 'processing', status: 'processing' }),
      makeItem({ id: 'failed', status: 'failed' }),
    ];

    expect(buildInboxSegments(items)).toEqual([
      { id: 'all', label: '全部', count: 3 },
      { id: 'pending', label: '待整理', count: 1 },
      { id: 'processing', label: '整理中', count: 1 },
      { id: 'failed', label: '失败重试', count: 1 },
    ]);
    expect(filterInboxItems(items, 'failed').map((item) => item.id)).toEqual(['failed']);
    expect(buildWorkflowActions(items[0]).map((action) => action.id)).toEqual(['organize', 'archive']);
    expect(buildWorkflowActions(items[2]).map((action) => action.id)).toEqual(['reprocess', 'archive']);
    expect(buildWorkflowActions(makeItem({ id: 'archived', status: 'archived' })).map((action) => action.id)).toEqual(['restore']);
  });

  it('moves a just-organized item from inbox to library and adjusts counts', () => {
    const previousItem = makeItem({ id: 'test-inbox-1', status: 'pending', tags: ['RAG'] });
    const nextItem = {
      ...previousItem,
      status: 'done',
      time: '刚刚',
    };
    const testSnapshot = {
      ...fallbackSnapshot,
      inboxItems: [previousItem],
      dashboard: {
        ...fallbackSnapshot.dashboard,
        inboxItems: 1,
      }
    };

    const nextSnapshot = applySnapshotItemUpdate(testSnapshot, previousItem, nextItem);

    expect(nextSnapshot.inboxItems.some((item) => item.id === previousItem.id)).toBe(false);
    expect(nextSnapshot.libraryItems[0]?.id).toBe(previousItem.id);
    expect(nextSnapshot.dashboard.inboxItems).toBe(testSnapshot.dashboard.inboxItems - 1);
    expect(nextSnapshot.dashboard.readyItems).toBe(testSnapshot.dashboard.readyItems + 1);
    expect(nextSnapshot.storage.archivedItems).toBe(testSnapshot.storage.archivedItems);
  });

  it('moves an archived item into the archive collection without changing total item count', () => {
    const previousItem = makeItem({ id: 'test-ready-1', status: 'done', tags: ['RAG'] });
    const nextItem = {
      ...previousItem,
      status: 'archived',
      time: '刚刚',
    };
    const testSnapshot = {
      ...fallbackSnapshot,
      libraryItems: [previousItem],
      dashboard: {
        ...fallbackSnapshot.dashboard,
        readyItems: 1,
        totalItems: 1,
      },
      storage: {
        ...fallbackSnapshot.storage,
        readyItems: 1,
        totalItems: 1,
        archivedItems: 0,
      }
    };

    const nextSnapshot = applySnapshotItemUpdate(testSnapshot, previousItem, nextItem);

    expect(nextSnapshot.libraryItems.some((item) => item.id === previousItem.id)).toBe(false);
    expect(nextSnapshot.archivedItems[0]?.id).toBe(previousItem.id);
    expect(nextSnapshot.dashboard.readyItems).toBe(testSnapshot.dashboard.readyItems - 1);
    expect(nextSnapshot.dashboard.totalItems).toBe(testSnapshot.dashboard.totalItems);
    expect(nextSnapshot.storage.archivedItems).toBe(testSnapshot.storage.archivedItems + 1);
  });
});

const installLocalStorageMock = () => {
  const store = new Map();
  const mock = {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, String(value)),
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: mock,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: mock,
    });
  }

  return mock;
};
