/* global afterEach, describe, expect, it */

import { listIngestionJobs } from './knowledgeDeskApi';

afterEach(() => {
  delete window.electronAPI;
});

describe('listIngestionJobs', () => {
  it('requests item-scoped history, preserves backend timeline order, and omits snapshots', async () => {
    let requestPayload;
    window.electronAPI = {
      knowledge: {
        request: async (payload) => {
          requestPayload = payload;
          return [
            {
              id: 'job-reprocess',
              knowledgeItemId: 'item-rag',
              jobType: 'reprocess',
              status: 'failed',
              errorMessage: '本机模型未响应',
              startedAt: '2026-07-29T01:00:00Z',
              finishedAt: '2026-07-29T01:00:25Z',
              createdAt: '2026-07-29T01:00:00Z',
            },
            {
              id: 'job-import',
              knowledgeItemId: 'item-rag',
              jobType: 'import',
              status: 'pending',
              inputSnapshot: '{"rawContent":"never render this"}',
              resultSnapshot: '{"summary":"never render this"}',
              startedAt: '2026-07-28T01:00:00Z',
              finishedAt: '2026-07-28T01:00:02Z',
              createdAt: '2026-07-28T01:00:00Z',
            },
            {
              id: 'job-future',
              knowledgeItemId: 'item-rag',
              jobType: 'future-operation',
              status: 'queued',
              createdAt: '2026-07-27T01:00:00Z',
            },
          ];
        },
      },
    };

    const jobs = await listIngestionJobs({ knowledgeItemId: 'item-rag', limit: 20 });

    const params = new URL(`http://localhost${requestPayload.path}`).searchParams;
    expect(requestPayload.method).toBe('GET');
    expect(requestPayload.path).toMatch(/^\/api\/v1\/ingestion-jobs\?/);
    expect(params.get('knowledgeItemId')).toBe('item-rag');
    expect(params.get('limit')).toBe('20');
    expect(jobs.map((job) => job.id)).toEqual(['job-reprocess', 'job-import', 'job-future']);
    expect(jobs[0]).toMatchObject({
      jobType: 'reprocess',
      status: 'failed',
      errorMessage: '本机模型未响应',
    });
    expect(jobs[1]).toMatchObject({ jobType: 'import', status: 'pending' });
    expect(jobs[2]).toMatchObject({ jobType: 'unknown', status: 'unknown' });
    expect(jobs[1]).not.toHaveProperty('inputSnapshot');
    expect(jobs[1]).not.toHaveProperty('resultSnapshot');
  });
});
