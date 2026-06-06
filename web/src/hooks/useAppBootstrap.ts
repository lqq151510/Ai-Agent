import { useAuthStore } from '../stores/authStore';
import { Tokens } from '../types';

export function useAppBootstrap(
  api: any,
  chat: any,
  ui: any,
  navigate: any,
  setUser: any,
  updateTokens: (tokens: Tokens | null) => void,
  clearAuth: () => void,
  applyError: (e: any) => void,
  loadModels: (client: any) => Promise<void>,
  refreshWorkspaceDiagnostics: (client: any, options: any) => Promise<void>
) {
  async function bootstrapAuth(client = api, preferredPath?: string) {
    if (!useAuthStore.getState().tokens && client === api) {
      navigate('/login');
      return;
    }
    chat.setLoading(true);
    chat.clearError();
    try {
      const [profile, list] = await Promise.all([client.me(), client.listSessions(), loadModels(client)]);
      setUser(profile);
      chat.setSessions(list);
      const picked = list.find((s: any) => s.id === chat.activeSessionId) ?? list[0] ?? null;
      const wantsCoach = preferredPath === '/coach';
      const wantsSession = preferredPath?.startsWith('/chat/sessions/');
      if (!picked) {
        chat.setActiveSessionId('');
        chat.setMessages([]);
        ui.setContextTokenLimit(null);
        await refreshWorkspaceDiagnostics(client, { sessionId: undefined });
        navigate(wantsCoach ? '/coach' : '/', { replace: true });
      } else {
        ui.setContextTokenLimit(picked.contextTokenLimit ?? null);
        if (wantsCoach) {
          navigate('/coach', { replace: true });
        } else if (wantsSession && preferredPath) {
          navigate(preferredPath, { replace: true });
        } else {
          navigate(`/chat/sessions/${picked.id}`, { replace: true });
        }
      }
    } catch (e) {
      updateTokens(null);
      clearAuth();
      chat.resetChat();
      ui.setToolStats(null);
      ui.setReleaseReport(null);
      applyError(e);
      navigate('/login');
    } finally {
      chat.setLoading(false);
    }
  }

  async function onLogout() {
    try {
      const tokens = useAuthStore.getState().tokens;
      if (tokens?.refreshToken) {
        await api.logout({ refreshToken: tokens.refreshToken });
      }
    } catch {
      // Best effort logout API call
    }
    updateTokens(null);
    clearAuth();
    chat.resetChat();
    ui.resetUi();
    navigate('/login');
  }

  return {
    bootstrapAuth,
    onLogout
  };
}
