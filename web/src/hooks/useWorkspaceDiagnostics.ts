import { ModelOption } from '../types';

export function useWorkspaceDiagnostics(api: any, chat: any, ui: any, fallbackModelOptions: () => ModelOption[]) {
  async function loadModels(client = api) {
    try {
      const res = await client.listModels();
      ui.setModelOptions(res.options.length > 0 ? res.options : fallbackModelOptions());
    } catch {
      ui.setModelOptions(fallbackModelOptions());
    }
  }

  async function loadToolStats(client = api, options: { windowHours?: number; scope?: 'session' | 'global'; sessionId?: string } = {}) {
    ui.setToolStatsLoading(true);
    try {
      const windowHours = options.windowHours ?? ui.toolStatsWindowHours;
      const scope = options.scope ?? ui.toolStatsScope;
      const rawSessionId = options.sessionId ?? chat.activeSessionId;
      const scopedSessionId = scope === 'session' ? rawSessionId || undefined : undefined;
      ui.setToolStats(await client.toolStats(windowHours, scopedSessionId));
    } catch {
      ui.setToolStats(null);
    } finally {
      ui.setToolStatsLoading(false);
    }
  }

  async function loadReleaseReport(client = api, options: { windowHours?: number; scope?: 'session' | 'global'; sessionId?: string } = {}) {
    ui.setReleaseReportLoading(true);
    try {
      const windowHours = options.windowHours ?? ui.toolStatsWindowHours;
      const scope = options.scope ?? ui.toolStatsScope;
      const rawSessionId = options.sessionId ?? chat.activeSessionId;
      const scopedSessionId = scope === 'session' ? rawSessionId || undefined : undefined;
      ui.setReleaseReport(await client.releaseReport(windowHours, scopedSessionId));
    } catch {
      ui.setReleaseReport(null);
    } finally {
      ui.setReleaseReportLoading(false);
    }
  }

  async function refreshWorkspaceDiagnostics(client = api, options: { windowHours?: number; scope?: 'session' | 'global'; sessionId?: string } = {}) {
    await Promise.allSettled([
      loadToolStats(client, options),
      loadReleaseReport(client, options)
    ]);
  }

  return { loadModels, loadToolStats, loadReleaseReport, refreshWorkspaceDiagnostics };
}
