/* global beforeEach, describe, expect, it */

import {
  archiveKnowledgeItem,
  fallbackSnapshot,
  organizeKnowledgeItem,
  restoreKnowledgeItem,
  updateKnowledgeItem,
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
      {
        id: 'preview-archived',
        title: '已归档预览',
        source: '本地预览',
        type: 'snippet',
        time: '刚刚',
        summary: '已归档。',
        tags: ['归档'],
        status: 'archived',
      },
    ]));

    const snapshot = withPreviewItems(fallbackSnapshot);

    expect(snapshot.dashboard.totalItems).toBe(fallbackSnapshot.dashboard.totalItems + 3);
    expect(snapshot.dashboard.inboxItems).toBe(fallbackSnapshot.dashboard.inboxItems + 1);
    expect(snapshot.dashboard.readyItems).toBe(fallbackSnapshot.dashboard.readyItems + 1);
    expect(snapshot.dashboard.recentItems[0]?.id).toBe('preview-done');
    expect(snapshot.inboxItems[0]?.id).toBe('preview-pending');
    expect(snapshot.libraryItems[0]?.id).toBe('preview-done');
    expect(snapshot.archivedItems[0]?.id).toBe('preview-archived');
    expect(snapshot.storage.archivedItems).toBe(fallbackSnapshot.storage.archivedItems + 1);
    expect(snapshot.tags).toEqual(expect.arrayContaining(['收集箱', 'RAG', '总结', '归档']));
  });

  it('updates preview storage when organizing a locally imported item', async () => {
    const previewItem = {
      id: 'preview-pending',
      title: '待整理预览',
      source: '本地预览',
      type: 'markdown',
      time: '刚刚',
      summary: '等待整理。',
      rawContent: '等待整理。',
      tags: ['收集箱'],
      status: 'pending',
    };
    window.localStorage.setItem('knowledge-desk-preview-items', JSON.stringify([previewItem]));

    const result = await organizeKnowledgeItem(previewItem);
    const stored = JSON.parse(window.localStorage.getItem('knowledge-desk-preview-items'));

    expect(result.status).toBe('done');
    expect(stored[0].status).toBe('done');
    expect(stored[0].cleanedContent).toContain('等待整理');
  });

  it('marks preview items as archived instead of removing them', async () => {
    const previewItem = {
      id: 'preview-pending',
      title: '待整理预览',
      source: '本地预览',
      type: 'markdown',
      time: '刚刚',
      summary: '等待整理。',
      tags: ['收集箱'],
      status: 'pending',
    };
    window.localStorage.setItem('knowledge-desk-preview-items', JSON.stringify([previewItem]));

    const result = await archiveKnowledgeItem(previewItem);
    const stored = JSON.parse(window.localStorage.getItem('knowledge-desk-preview-items'));

    expect(result.status).toBe('archived');
    expect(stored[0].status).toBe('archived');
  });

  it('restores archived preview items back into a searchable state', async () => {
    const previewItem = {
      id: 'preview-archived',
      title: '已归档预览',
      source: '本地预览',
      type: 'markdown',
      time: '刚刚',
      summary: '这条资料之前已经整理完成。',
      tags: ['归档'],
      status: 'archived',
    };
    window.localStorage.setItem('knowledge-desk-preview-items', JSON.stringify([previewItem]));

    const result = await restoreKnowledgeItem(previewItem);
    const stored = JSON.parse(window.localStorage.getItem('knowledge-desk-preview-items'));

    expect(result.status).toBe('done');
    expect(stored[0].status).toBe('done');
  });

  it('updates preview metadata without dropping the stored knowledge item', async () => {
    const previewItem = {
      id: 'preview-pending',
      title: '原始标题',
      source: '本地预览',
      type: 'markdown',
      time: '刚刚',
      summary: '原始摘要。',
      tags: ['旧标签'],
      status: 'pending',
    };
    window.localStorage.setItem('knowledge-desk-preview-items', JSON.stringify([previewItem]));

    const result = await updateKnowledgeItem(previewItem, {
      title: '校正后的标题',
      summary: '校正后的摘要。',
      tags: ['RAG', 'RAG', '检索'],
    });
    const stored = JSON.parse(window.localStorage.getItem('knowledge-desk-preview-items'));

    expect(result).toMatchObject({
      id: 'preview-pending',
      title: '校正后的标题',
      summary: '校正后的摘要。',
      tags: ['RAG', '检索'],
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject(result);
  });
});
