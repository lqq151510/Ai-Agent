/* global beforeEach, describe, expect, it */

import {
  applyItemFilters,
  buildSearchSnippet,
  filterLocalItems,
} from './knowledgeDeskViewModel';

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
