/* global afterEach, describe, expect, it */

import { fallbackSnapshot, loadKnowledgeDeskSnapshot } from './knowledgeDeskApi';

const emptyPage = { items: [], total: 0, page: 1, pageSize: 20 };

const healthyResponse = (path) => {
  if (path === '/api/v1/dashboard/summary') {
    return { totalItems: 2, inboxItems: 1, readyItems: 1, failedItems: 0 };
  }
  if (path.startsWith('/api/v1/knowledge-items?')) return emptyPage;
  if (path === '/api/v1/tags') return [];
  if (path === '/api/v1/settings/profile') return { displayName: '泽宝' };
  if (path === '/api/v1/settings/storage') {
    return { totalItems: 2, inboxItems: 1, readyItems: 1, failedItems: 0, archivedItems: 0, totalTags: 0 };
  }
  throw new Error(`Unexpected knowledge request: ${path}`);
};

afterEach(() => {
  delete window.electronAPI;
});

describe('knowledge desk degraded backend handling', () => {
  it('keeps local knowledge visible when the model source endpoint is unavailable', async () => {
    const requestedPaths = [];
    window.electronAPI = {
      knowledge: {
        request: async ({ path }) => {
          requestedPaths.push(path);
          if (path === '/api/v1/model-sources') {
            throw new Error('本机模型服务暂时不可用');
          }
          return healthyResponse(path);
        },
      },
    };

    const snapshot = await loadKnowledgeDeskSnapshot();

    expect(snapshot).toMatchObject({
      status: 'degraded',
      error: '1 个接口请求失败',
      dashboard: { totalItems: 2, inboxItems: 1, readyItems: 1 },
      storage: { totalItems: 2, totalModelSources: 0 },
      modelProviders: [],
    });
    expect(requestedPaths).toHaveLength(10);
    expect(requestedPaths).toContain('/api/v1/model-sources');
  });

  it('falls back to the preview snapshot when every local API request fails', async () => {
    window.electronAPI = {
      knowledge: {
        request: async () => {
          throw new Error('本机后端连接失败');
        },
      },
    };

    const snapshot = await loadKnowledgeDeskSnapshot();

    expect(snapshot).toMatchObject({
      status: 'error',
      error: '本机后端连接失败',
      dashboard: fallbackSnapshot.dashboard,
      storage: fallbackSnapshot.storage,
    });
    expect(snapshot.modelProviders).toEqual(fallbackSnapshot.modelProviders);
  });
});
