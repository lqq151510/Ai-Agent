import { useEffect, useMemo, useState } from 'react';
import { createApiClient } from './api';
import type {
  Message,
  ModelOption,
  Provider,
  Session,
  ToolStatsResponse,
  Tokens,
  UserProfile
} from './types';
import { defaultModel } from './utils';
import { AuthPanel } from './components/AuthPanel';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { MouseFx } from './components/MouseFx';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
const STORAGE_KEY = 'ai_agent_web_tokens_v1';
const FX_STORAGE_KEY = 'ai_agent_ui_fx_enabled_v1';
const RATE_LIMIT_AUTO_RETRY_SECONDS = 6;

type StreamState = 'idle' | 'connecting' | 'streaming' | 'error';
type ErrorKind = 'rate_limit' | 'auth_expired' | 'model_unreachable' | 'generic';
type ToolStatsScope = 'session' | 'global';

function readStoredTokens(): Tokens | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Tokens;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function fallbackModelOptions(): ModelOption[] {
  return [
    { provider: 'OPENAI', model: defaultModel('OPENAI'), isDefault: true },
    { provider: 'OLLAMA', model: defaultModel('OLLAMA'), isDefault: true }
  ];
}

function normalizeError(message: string): { message: string; kind: ErrorKind } {
  const raw = message.toLowerCase();
  if (raw.includes('too many') || raw.includes('429')) {
    return { message: '请求过于频繁，请稍后重试。', kind: 'rate_limit' };
  }
  if (raw.includes('authentication') || raw.includes('unauthorized') || raw.includes('token')) {
    return { message: '登录状态已失效，请重新登录。', kind: 'auth_expired' };
  }
  if (raw.includes('connect') || raw.includes('timeout') || raw.includes('model') || raw.includes('503')) {
    return { message: '模型服务暂时不可用，请切换模型或稍后重试。', kind: 'model_unreachable' };
  }
  return { message, kind: 'generic' };
}

export function App() {
  const [tokens, setTokensState] = useState<Tokens | null>(() => readStoredTokens());
  const [user, setUser] = useState<UserProfile | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>(fallbackModelOptions());
  const [toolStats, setToolStats] = useState<ToolStatsResponse | null>(null);
  const [toolStatsLoading, setToolStatsLoading] = useState(false);
  const [toolStatsWindowHours, setToolStatsWindowHours] = useState(24);
  const [toolStatsScope, setToolStatsScope] = useState<ToolStatsScope>('session');

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const [prompt, setPrompt] = useState('');

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [rateLimitRetryInSec, setRateLimitRetryInSec] = useState<number | null>(null);
  const [rateLimitRetryArmed, setRateLimitRetryArmed] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [lastFailedMessage, setLastFailedMessage] = useState('');
  const [effectsEnabled, setEffectsEnabled] = useState(() => {
    const raw = localStorage.getItem(FX_STORAGE_KEY);
    return raw === null ? true : raw === '1';
  });

  function updateTokens(next: Tokens | null) {
    setTokensState(next);
    if (!next) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const api = useMemo(
    () =>
      createApiClient(API_BASE, {
        getTokens: () => tokens,
        setTokens: updateTokens
      }),
    [tokens]
  );

  const activeSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  function clearError() {
    setError('');
    setErrorKind(null);
    setRateLimitRetryInSec(null);
    setRateLimitRetryArmed(false);
  }

  function applyError(raw: unknown): ErrorKind {
    const text = raw instanceof Error ? raw.message : String(raw);
    const parsed = normalizeError(text);
    setError(parsed.message);
    setErrorKind(parsed.kind);
    return parsed.kind;
  }

  function armRateLimitAutoRetry(messageToRetry?: string) {
    const candidate = messageToRetry || lastFailedMessage;
    if (!candidate) {
      return;
    }
    setLastFailedMessage(candidate);
    setRateLimitRetryArmed(true);
    setRateLimitRetryInSec(RATE_LIMIT_AUTO_RETRY_SECONDS);
  }

  async function loadModels(client = api) {
    try {
      const res = await client.listModels();
      if (res.options.length > 0) {
        setModelOptions(res.options);
      } else {
        setModelOptions(fallbackModelOptions());
      }
    } catch {
      setModelOptions(fallbackModelOptions());
    }
  }

  async function loadToolStats(
    client = api,
    options: { windowHours?: number; scope?: ToolStatsScope; sessionId?: string } = {}
  ) {
    setToolStatsLoading(true);
    try {
      const windowHours = options.windowHours ?? toolStatsWindowHours;
      const scope = options.scope ?? toolStatsScope;
      const rawSessionId = options.sessionId ?? activeSessionId;
      const scopedSessionId = scope === 'session' ? rawSessionId || undefined : undefined;
      const stats = await client.toolStats(windowHours, scopedSessionId);
      setToolStats(stats);
    } catch {
      setToolStats(null);
    } finally {
      setToolStatsLoading(false);
    }
  }

  async function bootstrapAuth(client = api) {
    if (!tokens && client === api) {
      return;
    }
    setLoading(true);
    clearError();
    try {
      const [profile, list] = await Promise.all([
        client.me(),
        client.listSessions(),
        loadModels(client)
      ]);

      setUser(profile);
      setSessions(list);
      const picked = list.find(s => s.id === activeSessionId) ?? list[0] ?? null;
      if (picked) {
        setActiveSessionId(picked.id);
        const msgList = await client.listMessages(picked.id);
        setMessages(msgList);
        await loadToolStats(client, { sessionId: picked.id });
      } else {
        setActiveSessionId('');
        setMessages([]);
        await loadToolStats(client, { sessionId: undefined });
      }
    } catch (e) {
      updateTokens(null);
      setUser(null);
      setSessions([]);
      setActiveSessionId('');
      setMessages([]);
      setToolStats(null);
      applyError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void bootstrapAuth();
  }, []);

  useEffect(() => {
    if (!rateLimitRetryArmed || errorKind !== 'rate_limit' || !lastFailedMessage) {
      return;
    }

    if (rateLimitRetryInSec === null) {
      setRateLimitRetryInSec(RATE_LIMIT_AUTO_RETRY_SECONDS);
      return;
    }

    if (rateLimitRetryInSec <= 0) {
      setRateLimitRetryArmed(false);
      setRateLimitRetryInSec(null);
      void onRetryLast();
      return;
    }

    const timer = window.setTimeout(() => {
      setRateLimitRetryInSec(prev => (prev === null ? null : prev - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [rateLimitRetryArmed, rateLimitRetryInSec, errorKind, lastFailedMessage]);

  async function onAuthSubmit() {
    clearError();
    setLoading(true);
    try {
      if (authMode === 'register') {
        await api.register({ email: email.trim(), password });
      }
      let mutableTokens: Tokens | null = await api.login({ email: email.trim(), password });
      updateTokens(mutableTokens);

      const authedApi = createApiClient(API_BASE, {
        getTokens: () => mutableTokens,
        setTokens: (next) => {
          mutableTokens = next;
          updateTokens(next);
        }
      });

      const [profile, list] = await Promise.all([
        authedApi.me(),
        authedApi.listSessions(),
        loadModels(authedApi)
      ]);

      setUser(profile);
      setSessions(list);
      if (list.length > 0) {
        setActiveSessionId(list[0].id);
        const msgList = await authedApi.listMessages(list[0].id);
        setMessages(msgList);
        await loadToolStats(authedApi, { sessionId: list[0].id });
      } else {
        setActiveSessionId('');
        setMessages([]);
        await loadToolStats(authedApi, { sessionId: undefined });
      }
      setPassword('');
      setStreamState('idle');
    } catch (e) {
      applyError(e);
    } finally {
      setLoading(false);
    }
  }

  async function reloadSessions(nextActiveId?: string) {
    const list = await api.listSessions();
    setSessions(list);
    const picked =
      (nextActiveId && list.find(s => s.id === nextActiveId)) ||
      list.find(s => s.id === activeSessionId) ||
      list[0] ||
      null;
    if (!picked) {
      setActiveSessionId('');
      setMessages([]);
      await loadToolStats(api, { sessionId: undefined });
      return;
    }
    setActiveSessionId(picked.id);
    const msgList = await api.listMessages(picked.id);
    setMessages(msgList);
    await loadToolStats(api, { sessionId: picked.id });
  }

  async function onCreateSession(provider: Provider, model: string, title?: string) {
    clearError();
    setLoading(true);
    try {
      const created = await api.createSession({
        title: title || undefined,
        provider,
        model: model || undefined
      });
      await reloadSessions(created.id);
    } catch (e) {
      applyError(e);
    } finally {
      setLoading(false);
    }
  }

  async function onSelectSession(sessionId: string) {
    clearError();
    setActiveSessionId(sessionId);
    setLoading(true);
    try {
      const msgList = await api.listMessages(sessionId);
      setMessages(msgList);
      await loadToolStats(api, { sessionId });
    } catch (e) {
      applyError(e);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(outgoing: string) {
    if (!activeSessionId || !outgoing.trim()) {
      return;
    }
    const content = outgoing.trim();
    const assistantMessageId = `stream-assistant-${Date.now()}`;
    const now = new Date().toISOString();
    let streamedAnyChunk = false;

    setSending(true);
    clearError();
    setPrompt('');
    setStreamState('connecting');
    setMessages(prev => [
      ...prev,
      {
        id: `stream-user-${Date.now()}`,
        role: 'user',
        content,
        provider: activeSession?.provider ?? '',
        model: activeSession?.model ?? '',
        createdAt: now
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        toolTrace: '[]',
        provider: activeSession?.provider ?? '',
        model: activeSession?.model ?? '',
        createdAt: now
      }
    ]);

    try {
      await api.streamChat(
        {
          sessionId: activeSessionId,
          message: content
        },
        {
          onChunk: chunk => {
            if (!streamedAnyChunk) {
              streamedAnyChunk = true;
              setStreamState('streaming');
            }
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + chunk }
                  : msg
              )
            );
          },
          onError: message => {
            const kind = applyError(message);
            if (kind === 'rate_limit') {
              armRateLimitAutoRetry(content);
            }
            setStreamState('error');
          }
        }
      );
      setStreamState('idle');
      setLastFailedMessage('');
      await reloadSessions(activeSessionId);
    } catch (e) {
      setStreamState('error');
      setLastFailedMessage(content);
      const kind = applyError(e);
      if (kind === 'rate_limit') {
        armRateLimitAutoRetry(content);
      }
      try {
        await reloadSessions(activeSessionId);
      } catch {
        // keep stream failure message.
      }
    } finally {
      setSending(false);
    }
  }

  async function onSendMessage() {
    await sendMessage(prompt);
  }

  async function onRetryLast() {
    if (!lastFailedMessage) {
      return;
    }
    await sendMessage(lastFailedMessage);
  }

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
    if (!activeSessionId) {
      return;
    }
    setExporting(true);
    clearError();
    try {
      const payload = await api.exportSession(activeSessionId, format);
      const baseTitle = (activeSession?.title || `session-${activeSessionId}`)
        .trim()
        .replace(/[^\w.-]+/g, '_')
        .slice(0, 48) || `session-${activeSessionId}`;

      if (format === 'markdown') {
        const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
        downloadFile(`${baseTitle}.md`, text, 'text/markdown;charset=utf-8');
        return;
      }

      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      downloadFile(`${baseTitle}.json`, text, 'application/json;charset=utf-8');
    } catch (e) {
      applyError(e);
    } finally {
      setExporting(false);
    }
  }

  async function onExportToolStats(format: 'json' | 'markdown') {
    setExporting(true);
    clearError();
    try {
      const sessionId = toolStatsScope === 'session' ? activeSessionId || undefined : undefined;
      const payload = await api.exportToolStats(toolStatsWindowHours, format, sessionId);
      const scope = sessionId ? 'session' : 'global';
      const baseName = `tool-stats-${scope}-${toolStatsWindowHours}h`;

      if (format === 'markdown') {
        const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
        downloadFile(`${baseName}.md`, text, 'text/markdown;charset=utf-8');
        return;
      }

      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      downloadFile(`${baseName}.json`, text, 'application/json;charset=utf-8');
    } catch (e) {
      applyError(e);
    } finally {
      setExporting(false);
    }
  }

  async function onExportReleaseReport(format: 'json' | 'markdown') {
    setExporting(true);
    clearError();
    try {
      const sessionId = toolStatsScope === 'session' ? activeSessionId || undefined : undefined;
      const payload = await api.exportReleaseReport(toolStatsWindowHours, format, sessionId);
      const scope = sessionId ? 'session' : 'global';
      const baseName = `release-report-${scope}-${toolStatsWindowHours}h`;

      if (format === 'markdown') {
        const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
        downloadFile(`${baseName}.md`, text, 'text/markdown;charset=utf-8');
        return;
      }

      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      downloadFile(`${baseName}.json`, text, 'application/json;charset=utf-8');
    } catch (e) {
      applyError(e);
    } finally {
      setExporting(false);
    }
  }

  async function onSwitchFallbackSession() {
    if (!activeSession) {
      return;
    }
    const fallbackProvider: Provider = activeSession.provider === 'OPENAI' ? 'OLLAMA' : 'OPENAI';
    const fallbackModel =
      modelOptions.find(item => item.provider === fallbackProvider && item.isDefault)?.model ||
      modelOptions.find(item => item.provider === fallbackProvider)?.model ||
      defaultModel(fallbackProvider);
    await onCreateSession(fallbackProvider, fallbackModel, `Fallback ${fallbackProvider}`);
  }

  function onLogout() {
    updateTokens(null);
    setUser(null);
    setSessions([]);
    setMessages([]);
    setToolStats(null);
    setModelOptions(fallbackModelOptions());
    setActiveSessionId('');
    setExporting(false);
    setPassword('');
    setLastFailedMessage('');
    setStreamState('idle');
    setToolStatsWindowHours(24);
    setToolStatsScope('session');
    setRateLimitRetryInSec(null);
    setRateLimitRetryArmed(false);
    clearError();
  }

  function toggleEffects() {
    const next = !effectsEnabled;
    setEffectsEnabled(next);
    localStorage.setItem(FX_STORAGE_KEY, next ? '1' : '0');
  }

  return (
    <div className="app-shell">
      {effectsEnabled ? <MouseFx /> : null}
      <button className="ghost fx-toggle" type="button" onClick={toggleEffects}>
        {effectsEnabled ? '动态效果: 开' : '动态效果: 关'}
      </button>
      {!tokens || !user ? (
        <AuthPanel
          tokens={tokens}
          loading={loading}
          error={error}
          authMode={authMode}
          setAuthMode={setAuthMode}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          onAuthSubmit={onAuthSubmit}
        />
      ) : (
        <div className="workspace">
          <Sidebar
            userEmail={user.email}
            onLogout={onLogout}
            sessions={sessions}
            activeSessionId={activeSessionId}
            modelOptions={modelOptions}
            toolStats={toolStats}
            toolStatsLoading={toolStatsLoading}
            toolStatsWindowHours={toolStatsWindowHours}
            toolStatsScope={toolStatsScope}
            hasActiveSession={!!activeSessionId}
            onRefreshToolStats={() => {
              void loadToolStats(api, { sessionId: activeSessionId || undefined });
            }}
            onChangeToolStatsWindow={(hours) => {
              setToolStatsWindowHours(hours);
              void loadToolStats(api, { windowHours: hours, sessionId: activeSessionId || undefined });
            }}
            onChangeToolStatsScope={(scope) => {
              setToolStatsScope(scope);
              void loadToolStats(api, { scope, sessionId: activeSessionId || undefined });
            }}
            onExportToolStatsJson={() => {
              void onExportToolStats('json');
            }}
            onExportToolStatsMarkdown={() => {
              void onExportToolStats('markdown');
            }}
            onExportReleaseReportJson={() => {
              void onExportReleaseReport('json');
            }}
            onExportReleaseReportMarkdown={() => {
              void onExportReleaseReport('markdown');
            }}
            onSelectSession={onSelectSession}
            onCreateSession={onCreateSession}
          />
          <ChatWindow
            activeSession={activeSession}
            messages={messages}
            prompt={prompt}
            setPrompt={setPrompt}
            sending={sending}
            loading={loading}
            error={error}
            streamState={streamState}
            exporting={exporting}
            canRetry={!!lastFailedMessage && !sending && errorKind !== 'rate_limit'}
            errorActionLabel={
              errorKind === 'auth_expired'
                ? '重新登录'
                : errorKind === 'model_unreachable'
                ? '切换备用模型'
                : errorKind === 'rate_limit' && !!lastFailedMessage
                ? rateLimitRetryInSec && rateLimitRetryInSec > 0
                  ? `${rateLimitRetryInSec}s后自动重试`
                  : '立即重试'
                : undefined
            }
            onErrorAction={
              errorKind === 'auth_expired'
                ? onLogout
                : errorKind === 'model_unreachable'
                ? () => {
                    void onSwitchFallbackSession();
                  }
                : errorKind === 'rate_limit' && !!lastFailedMessage
                ? () => {
                    setRateLimitRetryArmed(false);
                    setRateLimitRetryInSec(null);
                    void onRetryLast();
                  }
                : undefined
            }
            onExportJson={() => {
              void onExportSession('json');
            }}
            onExportMarkdown={() => {
              void onExportSession('markdown');
            }}
            onRetryLast={onRetryLast}
            onSendMessage={onSendMessage}
          />
        </div>
      )}
      {error && user ? <div className="toast">{error}</div> : null}
    </div>
  );
}
