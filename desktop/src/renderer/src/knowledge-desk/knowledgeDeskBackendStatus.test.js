/* global describe, expect, it */

import { shouldRefreshKnowledgeDeskSnapshot } from './knowledgeDeskBackendStatus';

describe('Knowledge Desk backend readiness refresh', () => {
  it('retries the initial snapshot only after the managed backend is running', () => {
    expect(shouldRefreshKnowledgeDeskSnapshot({ status: 'starting' })).toBe(false);
    expect(shouldRefreshKnowledgeDeskSnapshot({ status: 'error' })).toBe(false);
    expect(shouldRefreshKnowledgeDeskSnapshot({ status: 'stopped' })).toBe(false);
    expect(shouldRefreshKnowledgeDeskSnapshot({ status: 'running' })).toBe(true);
  });
});
