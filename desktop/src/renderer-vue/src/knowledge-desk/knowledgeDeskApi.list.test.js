/* global afterEach, describe, expect, it */

import { listKnowledgeItems } from './knowledgeDeskApi';

afterEach(() => {
  delete window.electronAPI;
});

describe('listKnowledgeItems', () => {
  it('uses the list endpoint with repeated statuses and preserves server pagination', async () => {
    let requestPayload;
    window.electronAPI = {
      knowledge: {
        request: async (payload) => {
          requestPayload = payload;
          return {
            items: [{
              id: 'inbox-item',
              sourceType: 'markdown',
              title: '待整理资料',
              summary: '服务端列表摘要。',
              status: 'inbox',
              tags: [{ name: 'RAG' }],
              createdAt: '2026-07-29T01:00:00Z',
            }],
            total: 42,
            page: 2,
            pageSize: 20,
          };
        },
      },
    };

    const result = await listKnowledgeItems({
      statuses: ['inbox', 'processing', 'failed'],
      sourceType: 'markdown',
      tag: ' RAG ',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-29T23:59:59.999Z',
      page: 2,
      pageSize: 20,
    });

    const params = new URL(`http://localhost${requestPayload.path}`).searchParams;
    expect(requestPayload.method).toBe('GET');
    expect(requestPayload.path).toMatch(/^\/api\/v1\/knowledge-items\?/);
    expect(params.getAll('status')).toEqual(['inbox', 'processing', 'failed']);
    expect(params.get('sourceType')).toBe('markdown');
    expect(params.get('tag')).toBe('RAG');
    expect(params.get('from')).toBe('2026-07-01T00:00:00.000Z');
    expect(params.get('to')).toBe('2026-07-29T23:59:59.999Z');
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('20');
    expect(result).toMatchObject({
      total: 42,
      page: 2,
      pageSize: 20,
      items: [{ id: 'inbox-item', status: 'pending', tags: ['RAG'] }],
    });
  });
});
