import { Session, ModelOption } from '../types';

export function useChatActions(
  api: any,
  chat: any,
  ui: any,
  activeSession: Session | null,
  applyError: (e: any) => void,
  onCreateSession: (provider: any, model: string, title?: string) => Promise<void>
) {
  function downloadFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function onExportSession(format: 'json' | 'markdown') {
    if (!chat.activeSessionId) return;
    chat.setExporting(true);
    chat.clearError();
    try {
      const payload = await api.exportSession(chat.activeSessionId, format);
      const baseTitle = (activeSession?.title || `session-${chat.activeSessionId}`).trim().replace(/[^\w.-]+/g, '_').slice(0, 48) || `session-${chat.activeSessionId}`;
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      if (format === 'markdown') {
        downloadFile(`${baseTitle}.md`, text, 'text/markdown;charset=utf-8');
        return;
      }
      downloadFile(`${baseTitle}.json`, text, 'application/json;charset=utf-8');
    } catch (e) {
      applyError(e);
    } finally {
      chat.setExporting(false);
    }
  }

  async function onExportToolStats(format: 'json' | 'markdown') {
    chat.setExporting(true);
    chat.clearError();
    try {
      const sessionId = ui.toolStatsScope === 'session' ? chat.activeSessionId || undefined : undefined;
      const payload = await api.exportToolStats(ui.toolStatsWindowHours, format, sessionId);
      const scope = sessionId ? 'session' : 'global';
      const baseName = `tool-stats-${scope}-${ui.toolStatsWindowHours}h`;
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      if (format === 'markdown') {
        downloadFile(`${baseName}.md`, text, 'text/markdown;charset=utf-8');
        return;
      }
      downloadFile(`${baseName}.json`, text, 'application/json;charset=utf-8');
    } catch (e) {
      applyError(e);
    } finally {
      chat.setExporting(false);
    }
  }

  async function onExportReleaseReport(format: 'json' | 'markdown') {
    chat.setExporting(true);
    chat.clearError();
    try {
      const sessionId = ui.toolStatsScope === 'session' ? chat.activeSessionId || undefined : undefined;
      const payload = await api.exportReleaseReport(ui.toolStatsWindowHours, format, sessionId);
      const scope = sessionId ? 'session' : 'global';
      const baseName = `release-report-${scope}-${ui.toolStatsWindowHours}h`;
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      if (format === 'markdown') {
        downloadFile(`${baseName}.md`, text, 'text/markdown;charset=utf-8');
        return;
      }
      downloadFile(`${baseName}.json`, text, 'application/json;charset=utf-8');
    } catch (e) {
      applyError(e);
    } finally {
      chat.setExporting(false);
    }
  }

  async function onSwitchFallbackSession(defaultModel: (provider: 'OPENAI') => string) {
    if (!activeSession) return;
    const fallbackModel = ui.modelOptions.find((item: ModelOption) => item.provider === 'OPENAI' && item.isDefault)?.model || ui.modelOptions.find((item: ModelOption) => item.provider === 'OPENAI')?.model || defaultModel('OPENAI');
    await onCreateSession('OPENAI', fallbackModel, 'Fallback OPENAI');
  }

  return {
    onExportSession,
    onExportToolStats,
    onExportReleaseReport,
    onSwitchFallbackSession
  };
}
