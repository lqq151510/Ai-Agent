import { useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate, useParams, Navigate, useLocation } from 'react-router-dom';
import { createApiClient } from './api';
import type { Tokens } from './types';
import { defaultModel } from './utils';
import { AuthPanel } from './components/AuthPanel';
import { MouseFx } from './components/MouseFx';
import { CoachWorkspace } from './components/CoachWorkspace';
import { Workspace } from './components/Workspace';
import { useAuthStore } from './stores/authStore';
import { useChatStore, type ErrorKind } from './stores/chatStore';
import { useUiStore } from './stores/uiStore';
import { useChatActions } from './hooks/useChatActions';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useWorkspaceDiagnostics } from './hooks/useWorkspaceDiagnostics';
import { useSessionManager } from './hooks/useSessionManager';
import { useChatStreaming } from './hooks/useChatStreaming';
import { useAuthSubmit } from './hooks/useAuthSubmit';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
const STORAGE_KEY = 'ai_agent_web_tokens_v1';
const FX_STORAGE_KEY = 'ai_agent_ui_fx_enabled_v1';
const RATE_LIMIT_AUTO_RETRY_SECONDS = 6;
const MIN_CONTEXT_TOKENS = 500;
const MAX_CONTEXT_TOKENS = 32768;

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
  const { tokens, user, authMode, email, password, setTokens, setUser, setAuthMode, setEmail, setPassword, clearAuth } = authStore;
  const chat = useChatStore();
  const ui = useUiStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { urlSessionId } = useParams<{ urlSessionId: string }>();

  useEffect(() => {
    if (!tokens) {
      setTokens(readStoredTokens());
    }
    const rawFx = localStorage.getItem(FX_STORAGE_KEY);
    if (rawFx !== null) {
      ui.setEffectsEnabled(rawFx === '1');
    }
  }, [setTokens, tokens, ui]);

  function updateTokens(next: Tokens | null) {
    setTokens(next);
    if (!next) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const api = useMemo(() => createApiClient(API_BASE, { getTokens: () => useAuthStore.getState().tokens, setTokens: updateTokens }), [tokens]);
  const activeSession = useMemo(() => chat.sessions.find(s => s.id === chat.activeSessionId) ?? null, [chat.sessions, chat.activeSessionId]);
  const currentModelOption = useMemo(
    () =>
      activeSession
        ? ui.modelOptions.find(option => option.provider === activeSession.provider && option.model === activeSession.model) ?? null
        : null,
    [activeSession, ui.modelOptions]
  );

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

  const { reloadSessions, onCreateSession, onSelectSession, selectSession } = useSessionManager(
    api, chat, ui, applyError, navigate, refreshWorkspaceDiagnostics
  );

  const {
    onExportSession,
    onExportToolStats,
    onExportReleaseReport,
    onSwitchFallbackSession
  } = useChatActions(api, chat, ui, activeSession, applyError, onCreateSession);

  const { sendMessage, onRetryLast } = useChatStreaming(
    api, chat, activeSession, ui.contextTokenLimit, applyError, armRateLimitAutoRetry, reloadSessions
  );

  const { onAuthSubmit } = useAuthSubmit(
    api, API_BASE, chat, authStore, updateTokens, setUser, navigate, applyError, loadModels, refreshWorkspaceDiagnostics, ui
  );

  useEffect(() => {
    const stored = readStoredTokens();
    if (!stored) {
      navigate('/login');
    } else {
      void bootstrapAuth();
    }
  }, []);

  useEffect(() => {
    if (!chat.rateLimitRetryArmed || chat.errorKind !== 'rate_limit' || !chat.lastFailedMessage) return;
    if (chat.rateLimitRetryInSec === null) {
      chat.setRateLimitRetryInSec(RATE_LIMIT_AUTO_RETRY_SECONDS);
      return;
    }
    if (chat.rateLimitRetryInSec <= 0) {
      chat.setRateLimitRetryArmed(false);
      chat.setRateLimitRetryInSec(null);
      void onRetryLast();
      return;
    }
    const timer = window.setTimeout(() => chat.setRateLimitRetryInSec(prev => (prev === null ? null : prev - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [chat.rateLimitRetryArmed, chat.rateLimitRetryInSec, chat.errorKind, chat.lastFailedMessage]);

  useEffect(() => {
    if (!tokens || !user) return;
    if (location.pathname.startsWith('/coach') || location.pathname === '/login') return;
    if (urlSessionId) {
      if (urlSessionId !== chat.activeSessionId) {
        void selectSession(urlSessionId);
      }
    } else {
      if (chat.sessions.length > 0) {
        const targetId = chat.activeSessionId || chat.sessions[0].id;
        navigate(`/chat/sessions/${targetId}`, { replace: true });
      }
    }
  }, [urlSessionId, chat.sessions, tokens, user, location.pathname]);

  function toggleEffects() {
    const next = !ui.effectsEnabled;
    ui.setEffectsEnabled(next);
    localStorage.setItem(FX_STORAGE_KEY, next ? '1' : '0');
  }

  function onChangeContextTokenLimit(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      ui.setContextTokenLimit(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      return;
    }
    const normalized = Math.max(MIN_CONTEXT_TOKENS, Math.min(MAX_CONTEXT_TOKENS, parsed));
    ui.setContextTokenLimit(normalized);
  }

  async function onPersistContextTokenLimit() {
    if (!chat.activeSessionId) {
      return;
    }
    try {
      const updated = await api.updateSessionContextTokenLimit(chat.activeSessionId, ui.contextTokenLimit ?? null);
      chat.setSessions(chat.sessions.map(session =>
        session.id === updated.id
          ? { ...session, contextTokenLimit: updated.contextTokenLimit ?? null }
          : session
      ));
    } catch (e) {
      applyError(e);
    }
  }

  function renderWorkspace() {
    return (
      <Workspace
        user={user}
        api={api}
        ui={ui}
        chat={chat}
        activeSession={activeSession}
        currentModelOption={currentModelOption}
        onLogout={onLogout}
        refreshWorkspaceDiagnostics={refreshWorkspaceDiagnostics}
        onExportToolStats={onExportToolStats}
        onExportReleaseReport={onExportReleaseReport}
        onCreateSession={onCreateSession}
        navigate={navigate}
        onSelectSession={onSelectSession}
        onSwitchFallbackSession={onSwitchFallbackSession}
        onRetryLast={onRetryLast}
        onExportSession={onExportSession}
        sendMessage={sendMessage}
        onChangeContextTokenLimit={onChangeContextTokenLimit}
        onPersistContextTokenLimit={onPersistContextTokenLimit}
        defaultModel={defaultModel}
      />
    );
  }

  return (
    <div className="app-shell">
      {ui.effectsEnabled ? <MouseFx /> : null}
      <button className="ghost fx-toggle" type="button" onClick={toggleEffects}>
        {ui.effectsEnabled ? '动态效果: 开' : '动态效果: 关'}
      </button>
      <Routes>
        <Route path="/login" element={
          !tokens || !user ? (
            <AuthPanel
              tokens={tokens}
              loading={chat.loading}
              error={chat.error}
              authMode={authMode}
              setAuthMode={setAuthMode}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              onAuthSubmit={onAuthSubmit}
            />
          ) : (
            <Navigate to="/" replace />
          )
        } />
        <Route path="/" element={
          tokens && user ? renderWorkspace() : <Navigate to="/login" replace />
        } />
        <Route path="/chat/sessions/:urlSessionId" element={
          tokens && user ? renderWorkspace() : <Navigate to="/login" replace />
        } />
        <Route path="/coach" element={
          tokens && user ? <CoachWorkspace api={api} onBack={() => navigate('/')} /> : <Navigate to="/login" replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {chat.error && user ? <div className="toast">{chat.error}</div> : null}
    </div>
  );
}
