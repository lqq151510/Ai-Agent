/* global afterEach, describe, expect, it */

import { searchKnowledgeItems } from './knowledgeDeskApi';

const backendPage = {
  items: [{
    id: 'search-item-1',
    sourceType: 'web',
    title: 'RAG 搜索结果',
    sourceUri: 'https://example.test/rag',
    summary: '来自服务端分页查询的结果。',
    status: 'ready',
    tags: [{ name: 'RAG' }],
    createdAt: '2026-07-29T01:00:00Z',
  }],
  total: 37,
  page: 3,
  pageSize: 12,
};

afterEach(() => {
  delete window.electronAPI;
});

describe('searchKnowledgeItems', () => {
  it('sends server-side filters and preserves the backend pagination response', async () => {
    let requestPayload;
    window.electronAPI = {
      knowledge: {
        request: async (payload) => {
          requestPayload = payload;
          return backendPage;
        },
      },
    };

    const result = await searchKnowledgeItems({
      query: ' RAG ',
      tag: '检索',
      sourceType: 'web',
      status: 'ready',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-29T23:59:59.999Z',
      page: 3,
      pageSize: 12,
    });

    const params = new URL(`http://localhost${requestPayload.path}`).searchParams;
    expect(requestPayload.method).toBe('GET');
    expect(params.get('q')).toBe('RAG');
    expect(params.get('tag')).toBe('检索');
    expect(params.get('sourceType')).toBe('web');
    expect(params.get('status')).toBe('ready');
    expect(params.get('from')).toBe('2026-07-01T00:00:00.000Z');
    expect(params.get('to')).toBe('2026-07-29T23:59:59.999Z');
    expect(params.get('page')).toBe('3');
    expect(params.get('pageSize')).toBe('12');
    expect(result).toMatchObject({
      total: 37,
      page: 3,
      pageSize: 12,
      items: [{ id: 'search-item-1', status: 'done', tags: ['RAG'] }],
    });
  });
});
