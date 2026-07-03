/* global beforeEach, describe, expect, it */

import {
  fallbackSnapshot,
  withPreviewItems,
} from './knowledgeDeskApi';

const createStorage = () => {
  const store = new Map();
  return {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, String(value)),
  };
};

describe('knowledgeDeskApi preview fallback', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage(),
      configurable: true,
    });
  });

  it('merges preview items into fallback counts, lists, and tags', () => {
    window.localStorage.setItem('knowledge-desk-preview-items', JSON.stringify([
      {
        id: 'preview-pending',
        title: '待整理预览',
        source: '本地预览',
        type: 'markdown',
        time: '刚刚',
        summary: '等待整理。',
        tags: ['收集箱', 'RAG'],
        status: 'pending',
      },
      {
        id: 'preview-done',
        title: '已整理预览',
        source: '本地预览',
        type: 'pdf',
        time: '刚刚',
        summary: '已整理完成。',
        tags: ['总结'],
        status: 'done',
      },
    ]));

    const snapshot = withPreviewItems(fallbackSnapshot);

    expect(snapshot.dashboard.totalItems).toBe(fallbackSnapshot.dashboard.totalItems + 2);
    expect(snapshot.dashboard.inboxItems).toBe(fallbackSnapshot.dashboard.inboxItems + 1);
    expect(snapshot.dashboard.readyItems).toBe(fallbackSnapshot.dashboard.readyItems + 1);
    expect(snapshot.dashboard.recentItems[0]?.id).toBe('preview-done');
    expect(snapshot.inboxItems[0]?.id).toBe('preview-pending');
    expect(snapshot.libraryItems[0]?.id).toBe('preview-done');
    expect(snapshot.tags).toEqual(expect.arrayContaining(['收集箱', 'RAG', '总结']));
  });
});
