import { Provider } from '../types';

export function useSessionManager(api: any, chat: any, ui: any, applyError: (e: any) => void, navigate: any, refreshWorkspaceDiagnostics: any) {
  async function reloadSessions(nextActiveId?: string) {
    const list = await api.listSessions();
    chat.setSessions(list);
    const picked = (nextActiveId && list.find((s: any) => s.id === nextActiveId)) || list.find((s: any) => s.id === chat.activeSessionId) || list[0] || null;
    if (!picked) {
      chat.setActiveSessionId('');
      chat.setMessages([]);
      ui.setContextTokenLimit(null);
      await refreshWorkspaceDiagnostics(api, { sessionId: undefined });
      return;
    }
    chat.setActiveSessionId(picked.id);
    ui.setContextTokenLimit(picked.contextTokenLimit ?? null);
    chat.setMessages(await api.listMessages(picked.id));
    await refreshWorkspaceDiagnostics(api, { sessionId: picked.id });
  }

  async function onCreateSession(provider: Provider, model: string, title?: string, contextTokenLimit?: number | null) {
    chat.clearError();
    chat.setLoading(true);
    try {
      const created = await api.createSession({
        title: title || undefined,
        provider,
        model: model || undefined,
        contextTokenLimit: contextTokenLimit ?? undefined
      });
      const list = await api.listSessions();
      chat.setSessions(list);
      ui.setContextTokenLimit(created.contextTokenLimit ?? contextTokenLimit ?? null);
      navigate(`/chat/sessions/${created.id}`);
    } catch (e) {
      applyError(e);
    } finally {
      chat.setLoading(false);
    }
  }

  function onSelectSession(sessionId: string) {
    navigate(`/chat/sessions/${sessionId}`);
  }

  async function selectSession(sessionId: string) {
    chat.clearError();
    chat.setActiveSessionId(sessionId);
    chat.setLoading(true);
    try {
      const session = chat.sessions.find((item: any) => item.id === sessionId);
      ui.setContextTokenLimit(session?.contextTokenLimit ?? null);
      chat.setMessages(await api.listMessages(sessionId));
      await refreshWorkspaceDiagnostics(api, { sessionId });
    } catch (e) {
      applyError(e);
    } finally {
      chat.setLoading(false);
    }
  }

  return { reloadSessions, onCreateSession, onSelectSession, selectSession };
}
