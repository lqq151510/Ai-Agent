/* global afterEach, describe, expect, it */

import {
  completeKnowledgeReview,
  loadKnowledgeReviewQueue,
  loadKnowledgeReviewSummary,
} from './knowledgeDeskApi';

afterEach(() => {
  delete window.electronAPI;
});

describe('knowledge review API contract', () => {
  it('maps only safe review queue fields and submits a closed rating vocabulary', async () => {
    const calls = [];
    window.electronAPI = {
      knowledge: {
        request: async (payload) => {
          calls.push(payload);
          if (payload.path.startsWith('/api/v1/knowledge-reviews/queue')) {
            return {
              dueCount: 1,
              items: [{
                id: 'item-1',
                title: 'RAG 复习卡',
                sourceType: 'markdown',
                summary: '检索、重排与回答生成。',
                tags: [{ id: 'tag-1', name: 'RAG', color: '#1d4ed8' }],
                updatedAt: '2026-08-06T12:00:00Z',
                dueAt: '2026-08-06T11:00:00Z',
                intervalDays: 3,
                easeFactor: 2.5,
                repetitions: 2,
                rawContent: 'private body',
                sourceUri: 'file:///Users/ze/private/rag.md',
                contentHash: 'a'.repeat(64),
                sourceAsset: { storageKey: 'private/rag.md' },
              }],
            };
          }
          if (payload.path === '/api/v1/knowledge-reviews/summary') {
            return { dueCount: 1, nextDueAt: '2026-08-06T11:00:00Z', filePath: '/private/never' };
          }
          return {
            knowledgeItemId: 'item-1',
            rating: 'good',
            dueAt: '2026-08-07T12:00:00Z',
            intervalDays: 1,
            easeFactor: 2.5,
            repetitions: 1,
            rawContent: 'private body',
          };
        },
      },
    };

    const queue = await loadKnowledgeReviewQueue();
    const summary = await loadKnowledgeReviewSummary();
    const completion = await completeKnowledgeReview('item-1', 'good');

    expect(queue).toMatchObject({ dueCount: 1 });
    expect(queue.items[0]).toEqual({
      id: 'item-1',
      title: 'RAG 复习卡',
      sourceType: 'markdown',
      summary: '检索、重排与回答生成。',
      tags: [{ id: 'tag-1', name: 'RAG', color: '#1d4ed8' }],
      updatedAt: '2026-08-06T12:00:00Z',
      dueAt: '2026-08-06T11:00:00Z',
      intervalDays: 3,
      easeFactor: 2.5,
      repetitions: 2,
    });
    expect(summary).toEqual({ dueCount: 1, nextDueAt: '2026-08-06T11:00:00Z' });
    expect(completion).toEqual({
      knowledgeItemId: 'item-1',
      rating: 'good',
      dueAt: '2026-08-07T12:00:00Z',
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 1,
    });
    expect(calls).toEqual([
      { method: 'GET', path: '/api/v1/knowledge-reviews/queue?limit=10', body: undefined },
      { method: 'GET', path: '/api/v1/knowledge-reviews/summary', body: undefined },
      { method: 'POST', path: '/api/v1/knowledge-reviews/item-1/complete', body: { rating: 'good' } },
    ]);
    expect(() => completeKnowledgeReview('item-1', 'unknown')).toThrow('无效的复习反馈');
  });

  it('rejects malformed review responses instead of making unsafe data available', async () => {
    window.electronAPI = {
      knowledge: {
        request: async () => ({ dueCount: -1, items: [] }),
      },
    };

    await expect(loadKnowledgeReviewQueue()).rejects.toThrow('每日回顾队列返回了无效数据');
  });
});
