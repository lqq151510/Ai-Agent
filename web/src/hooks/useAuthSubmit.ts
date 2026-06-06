import { Tokens } from '../types';
import { createApiClient } from '../api';

export function useAuthSubmit(
  api: any,
  API_BASE: string,
  chat: any,
  authStore: any,
  updateTokens: (tokens: Tokens | null) => void,
  setUser: any,
  navigate: any,
  applyError: (e: any) => void,
  loadModels: (client: any) => Promise<void>,
  refreshWorkspaceDiagnostics: (client: any, options: any) => Promise<void>,
  ui: any
) {
  const { authMode, email, password, setPassword } = authStore;

  async function onAuthSubmit() {
    chat.clearError();
    chat.setLoading(true);
    try {
      if (authMode === 'register') await api.register({ email: email.trim(), password });
      let mutableTokens: Tokens | null = await api.login({ email: email.trim(), password });
      updateTokens(mutableTokens);
      const authedApi = createApiClient(API_BASE, { getTokens: () => mutableTokens, setTokens: next => { mutableTokens = next; updateTokens(next); } });
      const [profile, list] = await Promise.all([authedApi.me(), authedApi.listSessions(), loadModels(authedApi)]);
      setUser(profile);
      chat.setSessions(list);
      if (list.length === 0) {
        chat.setActiveSessionId('');
        chat.setMessages([]);
        ui.setContextTokenLimit(null);
        await refreshWorkspaceDiagnostics(authedApi, { sessionId: undefined });
      } else {
        const targetId = list[0].id;
        ui.setContextTokenLimit(list[0].contextTokenLimit ?? null);
      }

      const searchParams = new URLSearchParams(window.location.search);
      const returnTo = searchParams.get('returnTo');
      if (returnTo) {
        navigate(returnTo);
      } else {
        if (list.length === 0) {
          navigate('/');
        } else {
          navigate(`/chat/sessions/${list[0].id}`);
        }
      }

      setPassword('');
      chat.setStreamState('idle');
    } catch (e) {
      applyError(e);
    } finally {
      chat.setLoading(false);
    }
  }

  return { onAuthSubmit };
}
