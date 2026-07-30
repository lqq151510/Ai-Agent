/* global afterEach, describe, expect, it */

import {
  commitLocalKnowledgeFileBatch,
  preflightLocalKnowledgeFileBatch,
} from './knowledgeDeskApi';

afterEach(() => {
  delete window.electronAPI;
});

describe('local batch file import bridge', () => {
  it('keeps local paths and hashes out of the renderer preflight contract', async () => {
    window.electronAPI = {
      knowledge: {
        preflightLocalFileBatch: async () => ({
          canceled: false,
          batchId: 'batch-opaque-token',
          candidates: [
            {
              candidateId: 'candidate-opaque-token',
              name: 'rag-notes.md',
              size: 1204,
              verdict: 'ready',
              filePath: '/private/rag-notes.md',
              contentHash: 'a'.repeat(64),
            },
            {
              candidateId: 'candidate-duplicate',
              name: 'rag-copy.md',
              size: 1204,
              verdict: 'duplicate_in_batch',
              reason: 'duplicate',
              filePath: '/private/rag-copy.md',
              contentHash: 'a'.repeat(64),
            },
          ],
        }),
      },
    };

    const batch = await preflightLocalKnowledgeFileBatch();

    expect(batch).toEqual({
      canceled: false,
      batchId: 'batch-opaque-token',
      candidates: [
        { candidateId: 'candidate-opaque-token', name: 'rag-notes.md', size: 1204, verdict: 'ready', reason: undefined },
        { candidateId: 'candidate-duplicate', name: 'rag-copy.md', size: 1204, verdict: 'duplicate_in_batch', reason: 'duplicate' },
      ],
    });
    expect(batch.candidates[0]).not.toHaveProperty('filePath');
    expect(batch.candidates[0]).not.toHaveProperty('contentHash');
  });

  it('commits only opaque batch and candidate tokens and maps the aggregate result', async () => {
    let receivedPayload;
    window.electronAPI = {
      knowledge: {
        commitLocalFileBatch: async (payload) => {
          receivedPayload = payload;
          return {
            imported: [{ candidateId: 'candidate-1', name: 'new.md', filePath: '/private/new.md' }],
            skipped: [{ candidateId: 'candidate-2', name: 'known.md', reason: 'already imported', contentHash: 'b'.repeat(64) }],
            failed: [{ candidateId: 'candidate-3', name: 'broken.pdf', reason: 'parse failed', filePath: '/private/broken.pdf' }],
          };
        },
      },
    };

    const result = await commitLocalKnowledgeFileBatch('batch-1', ['candidate-1', 'candidate-2', 'candidate-3']);

    expect(receivedPayload).toEqual({
      batchId: 'batch-1',
      candidateIds: ['candidate-1', 'candidate-2', 'candidate-3'],
    });
    expect(result).toEqual({
      imported: [{ candidateId: 'candidate-1', name: 'new.md' }],
      skipped: [{ candidateId: 'candidate-2', name: 'known.md', reason: 'already imported' }],
      failed: [{ candidateId: 'candidate-3', name: 'broken.pdf', reason: 'parse failed' }],
    });
  });
});
