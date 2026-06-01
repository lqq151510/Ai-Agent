import { useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate, useParams, Navigate, useLocation } from 'react-router-dom';
import { createApiClient } from './api';
import type { ModelOption, Provider, Session, Tokens } from './types';
import { defaultModel } from './utils';
import { AuthPanel } from './components/AuthPanel';
import { MouseFx } from './components/MouseFx';
import { ChatList } from './components/ChatList';
import { CoachWorkspace } from './components/CoachWorkspace';
import { MessageContainer } from './components/MessageContainer';
import { Settings } from './components/Settings';
import { useAuthStore } from './stores/authStore';
import { useStreamStore } from './stores/streamStore';
import { useChatActions } from './hooks/useChatActions';
import { useAppBootstrap } from './hooks/useAppBootstrap';

import { useChatStore, type ErrorKind } from './stores/chatStore';
import { useUiStore } from './stores/uiStore';

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

function fallbackModelOptions(): ModelOption[] {
  return [
    { provider: 'OPENAI', model: defaultModel('OPENAI'), isDefault: true }
  ];
}

function normalizeError(message: string): { message: string; kind: ErrorKind } {
  const raw = message.toLowerCase();
  if (raw.includes('too many') || raw.includes('429')) return { message: '请求过于频繁，请稍后重试。', kind: 'rate_limit' };
  if (raw.includes('authentication') || raw.includes('unauthorized') || raw.includes('token')) return { message: '登录状态已失效，请重新登录。', kind: 'auth_expired' };
  if (raw.includes('connect') || raw.includes('timeout') || raw.includes('model') || raw.includes('503')) return { message: '模型服务暂时不可用，请切换模型或稍后重试。', kind: 'model_unreachable' };
  return { message, kind: 'generic' };
}

export function App() {
  const { tokens, user, authMode, email, password, setTokens, setUser, setAuthMode, setEmail, setPassword, clearAuth } = useAuthStore();
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

  const { bootstrapAuth, onLogout } = useAppBootstrap(
    api, chat, ui, navigate, setUser, updateTokens, clearAuth, applyError, loadModels, refreshWorkspaceDiagnostics
  );

  const {
    onExportSession,
    onExportToolStats,
    onExportReleaseReport,
    onSwitchFallbackSession
  } = useChatActions(api, chat, ui, activeSession, applyError, onCreateSession);

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
        await refreshWorkspaceDiagnostics(authedApi, { sessionId: undefined });
        navigate('/');
      } else {
        const targetId = list[0].id;
        navigate(`/chat/sessions/${targetId}`);
      }
      setPassword('');
      chat.setStreamState('idle');
    } catch (e) {
      applyError(e);
    } finally {
      chat.setLoading(false);
    }
  }

  async function reloadSessions(nextActiveId?: string) {
    const list = await api.listSessions();
    chat.setSessions(list);
    const picked = (nextActiveId && list.find(s => s.id === nextActiveId)) || list.find(s => s.id === chat.activeSessionId) || list[0] || null;
    if (!picked) {
      chat.setActiveSessionId('');
      chat.setMessages([]);
      await refreshWorkspaceDiagnostics(api, { sessionId: undefined });
      return;
    }
    chat.setActiveSessionId(picked.id);
    chat.setMessages(await api.listMessages(picked.id));
    await refreshWorkspaceDiagnostics(api, { sessionId: picked.id });
  }

  async function onCreateSession(provider: Provider, model: string, title?: string) {
    chat.clearError();
    chat.setLoading(true);
    try {
      const created = await api.createSession({ title: title || undefined, provider, model: model || undefined });
      const list = await api.listSessions();
      chat.setSessions(list);
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
      chat.setMessages(await api.listMessages(sessionId));
      await refreshWorkspaceDiagnostics(api, { sessionId });
    } catch (e) {
      applyError(e);
    } finally {
      chat.setLoading(false);
    }
  }

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

    async function sendMessage(outgoing: string) {
    if (!chat.activeSessionId || !outgoing.trim()) return;
    const content = outgoing.trim();
    const assistantMessageId = `stream-assistant-${Date.now()}`;
    const now = new Date().toISOString();
    let streamedAnyChunk = false;
    
    useStreamStore.getState().resetStream();
    
    chat.setSending(true);
    chat.clearError();
    chat.setPrompt('');
    chat.setStreamState('connecting');
    chat.setMessages(prev => [
      ...prev,
      { id: `stream-user-${Date.now()}`, role: 'user', content, provider: activeSession?.provider ?? '', model: activeSession?.model ?? '', createdAt: now },
      { id: assistantMessageId, role: 'assistant', content: '', toolTrace: '[]', provider: activeSession?.provider ?? '', model: activeSession?.model ?? '', createdAt: now }
    ]);
    
    try {
      await api.streamChat({ sessionId: chat.activeSessionId, message: content, provider: activeSession?.provider, model: activeSession?.model }, {
        onChunk: chunk => {
          if (!streamedAnyChunk) {
            streamedAnyChunk = true;
            chat.setStreamState('streaming');
          }
          useStreamStore.getState().setStream(assistantMessageId, chunk);
        },
        onError: message => {
          const kind = applyError(message);
          if (kind === 'rate_limit') armRateLimitAutoRetry(content);
          chat.setStreamState('error');
        }
      });
      chat.setStreamState('idle');
      chat.setLastFailedMessage('');
      
      const finalBuffer = useStreamStore.getState().buffer;
      chat.setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, content: finalBuffer } : msg));
      useStreamStore.getState().resetStream();
      
      await reloadSessions(chat.activeSessionId);
    } catch (e) {
      chat.setStreamState('error');
      chat.setLastFailedMessage(content);
      const kind = applyError(e);
      if (kind === 'rate_limit') armRateLimitAutoRetry();
      try {
        await reloadSessions(chat.activeSessionId);
      } catch {
        // keep stream failure message.
      }
    } finally {
      chat.setSending(false);
    }
  }

  async function onRetryLast() {
    if (!chat.lastFailedMessage) return;
    await sendMessage(chat.lastFailedMessage);
  }







  function toggleEffects() {
    const next = !ui.effectsEnabled;
    ui.setEffectsEnabled(next);
    localStorage.setItem(FX_STORAGE_KEY, next ? '1' : '0');
  }

  function renderWorkspace() {
    return (
      <div className="workspace">
        <aside className="sidebar panel">
          <Settings
            userEmail={user!.email}
            onLogout={onLogout}
            modelOptions={ui.modelOptions}
            toolStats={ui.toolStats}
            toolStatsLoading={ui.toolStatsLoading}
            releaseReport={ui.releaseReport}
            releaseReportLoading={ui.releaseReportLoading}
            toolStatsWindowHours={ui.toolStatsWindowHours}
            toolStatsScope={ui.toolStatsScope}
            hasActiveSession={!!chat.activeSessionId}
            activeSession={activeSession}
            currentModelOption={currentModelOption}
            onRefreshToolStats={() => { void refreshWorkspaceDiagnostics(api, { sessionId: chat.activeSessionId || undefined }); }}
            onChangeToolStatsWindow={hours => { ui.setToolStatsWindowHours(hours); void refreshWorkspaceDiagnostics(api, { windowHours: hours, sessionId: chat.activeSessionId || undefined }); }}
            onChangeToolStatsScope={scope => { ui.setToolStatsScope(scope); void refreshWorkspaceDiagnostics(api, { scope, sessionId: chat.activeSessionId || undefined }); }}
            onExportToolStatsJson={() => { void onExportToolStats('json'); }}
            onExportToolStatsMarkdown={() => { void onExportToolStats('markdown'); }}
            onExportReleaseReportJson={() => { void onExportReleaseReport('json'); }}
            onExportReleaseReportMarkdown={() => { void onExportReleaseReport('markdown'); }}
            onCreateSession={onCreateSession}
            onNavigateToCoach={() => navigate('/coach')}
          />
          <ChatList sessions={chat.sessions} activeSessionId={chat.activeSessionId} onSelectSession={onSelectSession} />
        </aside>
        <MessageContainer
          activeSession={activeSession}
          messages={chat.messages}
          prompt={chat.prompt}
          setPrompt={chat.setPrompt}
          sending={chat.sending}
          loading={chat.loading}
          error={chat.error}
          streamState={chat.streamState}
          exporting={chat.exporting}
          currentModelOption={currentModelOption}
          toolStats={ui.toolStats}
          toolStatsScope={ui.toolStatsScope}
          toolStatsLoading={ui.toolStatsLoading}
          releaseReport={ui.releaseReport}
          diagnosticsLoading={ui.releaseReportLoading}
          canRetry={!!chat.lastFailedMessage && !chat.sending && chat.errorKind !== 'rate_limit'}
          errorActionLabel={
            chat.errorKind === 'auth_expired'
              ? '重新登录'
              : chat.errorKind === 'model_unreachable'
              ? '切换备用模型'
              : chat.errorKind === 'rate_limit' && !!chat.lastFailedMessage
              ? chat.rateLimitRetryInSec && chat.rateLimitRetryInSec > 0
                ? `${chat.rateLimitRetryInSec}s后自动重试`
                : '立即重试'
              : undefined
          }
          onErrorAction={
            chat.errorKind === 'auth_expired'
              ? onLogout
              : chat.errorKind === 'model_unreachable'
              ? () => { void onSwitchFallbackSession(defaultModel); }
              : chat.errorKind === 'rate_limit' && !!chat.lastFailedMessage
              ? () => { chat.setRateLimitRetryArmed(false); chat.setRateLimitRetryInSec(null); void onRetryLast(); }
              : undefined
          }
          onExportJson={() => { void onExportSession('json'); }}
          onExportMarkdown={() => { void onExportSession('markdown'); }}
          onRetryLast={onRetryLast}
          onSendMessage={() => { void sendMessage(chat.prompt); }}
        />
      </div>
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
