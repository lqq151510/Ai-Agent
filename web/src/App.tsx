import { useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { createApiClient } from './api';
import type { Tokens } from './types';
import { defaultModel } from './utils';
import { MouseFx } from './components/MouseFx';
import { CoachWorkspace } from './components/CoachWorkspace';
import { CliLogin } from './components/CliLogin';
import { Sparkles } from 'lucide-react';
import { LoginPage } from './pages/LoginPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { UserCenterPage } from './pages/UserCenterPage';
import { useAuthStore } from './stores/authStore';
import { useChatStore, type ErrorKind } from './stores/chatStore';
import { useUiStore } from './stores/uiStore';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useWorkspaceDiagnostics } from './hooks/useWorkspaceDiagnostics';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
const STORAGE_KEY = 'ai_agent_web_tokens_v1';
const FX_STORAGE_KEY = 'ai_agent_ui_fx_enabled_v1';
const RATE_LIMIT_AUTO_RETRY_SECONDS = 6;

function readStoredTokens(): Tokens | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Tokens;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeError(message: string): { message: string; kind: ErrorKind } {
  const raw = message.toLowerCase();
  if (raw.includes('too many') || raw.includes('429')) return { message: '请求过于频繁，请稍后重试。', kind: 'rate_limit' };
  if (raw.includes('authentication') || raw.includes('unauthorized') || raw.includes('token')) return { message: '登录状态已失效，请重新登录。', kind: 'auth_expired' };
  if (raw.includes('connect') || raw.includes('timeout') || raw.includes('model') || raw.includes('503')) return { message: '模型服务暂时不可用，请切换模型或稍后重试。', kind: 'model_unreachable' };
  return { message, kind: 'generic' };
}

export function App() {
  const authStore = useAuthStore();
  const { tokens, user, setTokens, setUser, clearAuth } = authStore;
  const chat = useChatStore();
  const ui = useUiStore();
  const effectsEnabled = ui.effectsEnabled;
  const setEffectsEnabled = ui.setEffectsEnabled;
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!tokens) {
      setTokens(readStoredTokens());
    }
    const rawFx = localStorage.getItem(FX_STORAGE_KEY);
    if (rawFx !== null) {
      setEffectsEnabled(rawFx === '1');
    }
  }, [setEffectsEnabled, setTokens, tokens]);

  function updateTokens(next: Tokens | null) {
    setTokens(next);
    if (!next) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const api = useMemo(() => createApiClient(API_BASE, { getTokens: () => useAuthStore.getState().tokens, setTokens: updateTokens }), [tokens]);

  function applyError(raw: unknown): ErrorKind {
    const text = raw instanceof Error ? raw.message : String(raw);
    const parsed = normalizeError(text);
    chat.setError(parsed.message);
    chat.setErrorKind(parsed.kind);
    return parsed.kind;
  }

  function armRateLimitAutoRetry(messageToRetry?: string) {
    const candidate = messageToRetry || chat.lastFailedMessage;
    if (!candidate) return;
    chat.setLastFailedMessage(candidate);
    chat.setRateLimitRetryArmed(true);
    chat.setRateLimitRetryInSec(RATE_LIMIT_AUTO_RETRY_SECONDS);
  }

  const { loadModels, refreshWorkspaceDiagnostics } = useWorkspaceDiagnostics(
    api, chat, ui, () => [{ provider: 'OPENAI', model: defaultModel('OPENAI'), isDefault: true }]
  );

  const { bootstrapAuth, onLogout } = useAppBootstrap(
    api, chat, ui, navigate, setUser, updateTokens, clearAuth, applyError, loadModels, refreshWorkspaceDiagnostics
  );

  useEffect(() => {
    const stored = readStoredTokens();
    if (!stored) {
      if (location.pathname === '/cli-login') {
        const port = new URLSearchParams(window.location.search).get('cliPort');
        if (port) {
          navigate(`/login?returnTo=${encodeURIComponent(`/cli-login?cliPort=${port}`)}`);
        } else {
          navigate('/login');
        }
      } else if (location.pathname !== '/login') {
        navigate('/login');
      }
    } else {
      void bootstrapAuth(api, location.pathname);
    }
  }, []);

  function toggleEffects() {
    const next = !effectsEnabled;
    setEffectsEnabled(next);
    localStorage.setItem(FX_STORAGE_KEY, next ? '1' : '0');
  }

  return (
    <div className="app-shell">
      {effectsEnabled ? <MouseFx /> : null}
      <button
        className="ghost fx-toggle icon-button"
        type="button"
        onClick={toggleEffects}
        aria-label={effectsEnabled ? '关闭动态效果' : '开启动态效果'}
        title={effectsEnabled ? '关闭动态效果' : '开启动态效果'}
      >
        <Sparkles size={15} />
      </button>
      <Routes>
        <Route path="/login" element={
          !tokens || !user ? (
            <LoginPage api={api} updateTokens={updateTokens} applyError={applyError} />
          ) : (
            <Navigate to="/" replace />
          )
        } />
        <Route path="/" element={
          tokens && user ? <WorkspacePage api={api} applyError={applyError} onLogout={onLogout} armRateLimitAutoRetry={armRateLimitAutoRetry} /> : <Navigate to="/login" replace />
        } />
        <Route path="/chat/sessions/:urlSessionId" element={
          tokens && user ? <WorkspacePage api={api} applyError={applyError} onLogout={onLogout} armRateLimitAutoRetry={armRateLimitAutoRetry} /> : <Navigate to="/login" replace />
        } />
        <Route path="/coach" element={
          tokens && user ? <CoachWorkspace api={api} onBack={() => navigate('/')} /> : <Navigate to="/login" replace />
        } />
        <Route path="/user/*" element={
          tokens && user ? <UserCenterPage api={api} /> : <Navigate to="/login" replace />
        } />
        <Route path="/cli-login" element={
          <CliLogin tokens={tokens} user={user} />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {chat.error && user ? <div className="toast">{chat.error}</div> : null}
    </div>
  );
}
