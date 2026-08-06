/* global afterEach, describe, expect, it */

import {
  exportKnowledgeDeskBackup,
  importKnowledgeDeskBackup,
  parseKnowledgeDeskBackup,
  saveKnowledgeDeskBackup,
} from './knowledgeDeskApi';

const backup = {
  schemaVersion: 1,
  exportedAt: '2026-07-29T08:00:00.000Z',
  preferences: {
    displayName: '本机用户',
    organizeMode: 'manual',
    privacyMode: 'local_first',
  },
  tags: [{
    id: 'tag-rag',
    name: 'RAG',
    color: '#4F46E5',
    createdAt: '2026-07-29T08:00:00.000Z',
  }],
  knowledgeItems: [{
    id: 'item-rag',
    sourceType: 'markdown',
    title: '本机 RAG 笔记',
    rawContent: '# RAG',
    status: 'ready',
    wordCount: 2,
    createdAt: '2026-07-29T08:00:00.000Z',
    updatedAt: '2026-07-29T08:00:00.000Z',
    tagIds: ['tag-rag'],
  }],
  modelSourcesIncluded: false,
};

const normalizedBackup = { ...backup, reviewStates: [] };

afterEach(() => {
  delete window.electronAPI;
});

describe('Knowledge Desk backup API', () => {
  it('uses the bridge to export and merge-import a non-sensitive backup', async () => {
    const requests = [];
    window.electronAPI = {
      knowledge: {
        request: async (payload) => {
          requests.push(payload);
          if (payload.method === 'POST') {
            return {
              importedItems: 1,
              createdTags: 0,
              preferencesRestored: false,
              modelSourcesRestored: false,
              message: '已合并 1 条资料。',
            };
          }
          return backup;
        },
      },
    };

    await expect(exportKnowledgeDeskBackup()).resolves.toEqual(normalizedBackup);
    await expect(importKnowledgeDeskBackup(backup)).resolves.toMatchObject({
      importedItems: 1,
      modelSourcesRestored: false,
      preferencesRestored: false,
    });

    expect(requests).toEqual([
      { method: 'GET', path: '/api/v1/settings/export', body: undefined },
      { method: 'POST', path: '/api/v1/settings/import', body: normalizedBackup },
    ]);
    expect(JSON.stringify(backup)).not.toContain('apiKey');
    expect(backup).not.toHaveProperty('modelSources');
  });

  it('saves a user-requested backup through the desktop bridge', async () => {
    let savePayload;
    window.electronAPI = {
      knowledge: {
        saveBackup: async (payload) => {
          savePayload = payload;
          return { canceled: false, filePath: '/tmp/knowledge-desk-backup.json' };
        },
      },
    };

    await expect(saveKnowledgeDeskBackup(normalizedBackup)).resolves.toBe('/tmp/knowledge-desk-backup.json');
    expect(savePayload.suggestedName).toMatch(/^knowledge-desk-backup-.*\.json$/);
    expect(JSON.parse(savePayload.content)).toEqual(normalizedBackup);
  });

  it('normalizes legacy backups and validates optional review states before import', () => {
    expect(parseKnowledgeDeskBackup(JSON.stringify(backup))).toEqual(normalizedBackup);
    const withReviewState = {
      ...normalizedBackup,
      reviewStates: [{
        knowledgeItemId: 'item-rag',
        dueAt: '2026-08-01T08:00:00.000Z',
        intervalDays: 3,
        easeFactor: 2.5,
        repetitions: 2,
        lastRating: 'good',
        lastReviewedAt: '2026-07-29T08:00:00.000Z',
        createdAt: '2026-07-29T08:00:00.000Z',
        updatedAt: '2026-07-29T08:00:00.000Z',
      }],
    };
    expect(parseKnowledgeDeskBackup(JSON.stringify(withReviewState))).toEqual(withReviewState);
    expect(() => parseKnowledgeDeskBackup('{bad json')).toThrow('不是有效的 JSON');
    expect(() => parseKnowledgeDeskBackup(JSON.stringify({ ...backup, schemaVersion: 2 }))).toThrow('不支持该备份版本');
    expect(() => parseKnowledgeDeskBackup(JSON.stringify({ ...backup, modelSourcesIncluded: true }))).toThrow('不支持该备份版本');
    expect(() => parseKnowledgeDeskBackup(JSON.stringify({ ...backup, knowledgeItems: undefined }))).toThrow('不支持该备份版本');
    expect(() => parseKnowledgeDeskBackup(JSON.stringify({ ...backup, preferences: null }))).toThrow('不支持该备份版本');
    expect(() => parseKnowledgeDeskBackup(JSON.stringify({ ...backup, preferences: undefined }))).toThrow('不支持该备份版本');
    expect(() => parseKnowledgeDeskBackup(JSON.stringify({
      ...backup,
      knowledgeItems: [{ ...backup.knowledgeItems[0], updatedAt: undefined }],
    }))).toThrow('不支持该备份版本');
    expect(() => parseKnowledgeDeskBackup(JSON.stringify({
      ...normalizedBackup,
      reviewStates: [{ ...withReviewState.reviewStates[0], easeFactor: 1.2 }],
    }))).toThrow('不支持该备份版本');
    expect(() => parseKnowledgeDeskBackup(JSON.stringify({
      ...normalizedBackup,
      reviewStates: [{ ...withReviewState.reviewStates[0], lastRating: 'unknown' }],
    }))).toThrow('不支持该备份版本');
  });
});
