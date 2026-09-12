export type KnowledgeDeskBackendStatusPayload = {
  status?: unknown;
};

/**
 * The renderer may load before Electron's managed local backend becomes ready.
 * Only a confirmed running transition is safe to use as an automatic retry
 * trigger; all other status changes leave the current snapshot untouched.
 */
export const shouldRefreshKnowledgeDeskSnapshot = (
  status: KnowledgeDeskBackendStatusPayload,
) => status.status === 'running';
