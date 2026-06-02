import React, { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';

import { createApiClient, type ApiClient } from './api-client.js';
import { collectSystemContext } from './context-collector.js';
import { formatReleaseReportSummary, formatSessions, formatToolStatsSummary } from './format.js';
import { StateStore } from './state-store.js';
import { tokenize } from './tokenize.js';
import type { AuthState, Message, Session } from './types.js';

type UiMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'error';
  content: string;
};

type ReplAppProps = {
  baseUrl: string;
};

const MAX_RENDERED_MESSAGES = 18;

function mapMessagesToUi(messages: Message[]): UiMessage[] {
  return messages.map(message => ({
    id: message.id,
    role: message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : 'system',
    content: message.content,
  }));
}

function renderHelp(): string {
  return [
    'Slash commands:',
    '/help',
    '/login <email> <password>',
    '/logout',
    '/sessions',
    '/use <sessionId>',
    '/new [title]',
    '/stats [windowHours]',
    '/report [windowHours]',
    '/clear',
    '/exit',
  ].join('\n');
}

function nowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function ReplApp({ baseUrl }: ReplAppProps) {
  const { exit } = useApp();
  const [store] = useState(() => new StateStore());
  const [authState, setAuthState] = useState<AuthState>(() => store.read());
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: nowId('system'),
      role: 'system',
      content: 'Ink REPL ready. Type /help for commands.',
    },
  ]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [statusLine, setStatusLine] = useState('Idle');
  const authRef = useRef(authState);
  const deferredMessages = useDeferredValue(messages);
  const visibleMessages = deferredMessages.slice(-MAX_RENDERED_MESSAGES);
  const activeSessionId = authState.activeSessionId;

  useEffect(() => {
    authRef.current = authState;
    store.write(authState);
  }, [authState, store]);

  const [api] = useState<ApiClient>(() =>
    createApiClient(baseUrl, {
      getState: () => authRef.current,
      setState: nextState => {
        authRef.current = nextState;
        setAuthState(nextState);
      },
    }),
  );

  useInput((_input, key) => {
    if (key.escape) {
      exit();
    }
  });

  async function refreshSessions(preferredSessionId?: string) {
    const nextSessions = await api.listSessions();
    setSessions(nextSessions);
    const nextActiveSession =
      (preferredSessionId && nextSessions.find(session => session.id === preferredSessionId)) ||
      (authRef.current.activeSessionId &&
        nextSessions.find(session => session.id === authRef.current.activeSessionId)) ||
      nextSessions[0];

    setAuthState(current => ({
      ...current,
      activeSessionId: nextActiveSession?.id,
    }));

    return nextActiveSession;
  }

  function pushMessage(role: UiMessage['role'], content: string) {
    startTransition(() => {
      setMessages(current => [...current, { id: nowId(role), role, content }]);
    });
  }

  function updateDraftAssistant(id: string, append: string) {
    startTransition(() => {
      setMessages(current =>
        current.map(message =>
          message.id === id ? { ...message, content: `${message.content}${append}` } : message,
        ),
      );
    });
  }

  async function loadCurrentUser() {
    const profile = await api.me();
    setUserEmail(profile.email);
  }

  useEffect(() => {
    if (!authState.accessToken) {
      return;
    }

    void (async () => {
      try {
        setLoading(true);
        setStatusLine('Loading profile and sessions...');
        await loadCurrentUser();
        const nextActive = await refreshSessions();
        if (nextActive) {
          const history = await api.listMessages(nextActive.id);
          setMessages(current => [...current, ...mapMessagesToUi(history).slice(-MAX_RENDERED_MESSAGES)]);
        }
        setStatusLine('Ready');
      } catch (error) {
        pushMessage('error', error instanceof Error ? error.message : String(error));
        setStatusLine('Ready');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureSession(): Promise<Session> {
    const existing = sessions.find(session => session.id === authRef.current.activeSessionId);
    if (existing) {
      return existing;
    }

    const created = await api.createSession({
      title: `TS CLI Session ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      provider: 'OPENAI',
    });
    setAuthState(current => ({ ...current, activeSessionId: created.id }));
    await refreshSessions(created.id);
    return created;
  }

  async function submitChat(content: string) {
    if (!authRef.current.accessToken) {
      pushMessage('error', 'Please login first with /login <email> <password>.');
      return;
    }

    const session = await ensureSession();
    pushMessage('user', content);

    const draftId = nowId('assistant');
    setMessages(current => [...current, { id: draftId, role: 'assistant', content: '' }]);
    setLoading(true);
    setStatusLine('Collecting repo context...');

    try {
      const systemContext = await collectSystemContext();
      setStatusLine(`Streaming from ${session.provider}/${session.model}...`);
      await api.streamChat(
        {
          sessionId: session.id,
          message: content,
          provider: session.provider,
          model: session.model,
          systemContext,
        },
        {
          onMeta: payload => {
            setStatusLine(`Connected: ${payload.provider}/${payload.model}`);
          },
          onChunk: chunk => {
            updateDraftAssistant(draftId, chunk);
          },
          onDone: payload => {
            if (payload.reply && !messages.find(message => message.id === draftId)?.content) {
              updateDraftAssistant(draftId, payload.reply);
            }
            setStatusLine(`Done in ${payload.latencyMs}ms`);
          },
          onError: message => {
            setStatusLine('Stream failed');
            pushMessage('error', message);
          },
        },
      );
      await refreshSessions(session.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessages(current =>
        current.map(item => (item.id === draftId ? { ...item, role: 'error', content: message } : item)),
      );
      setStatusLine('Stream failed');
    } finally {
      setLoading(false);
    }
  }

  async function executeSlashCommand(rawInput: string) {
    const [command, ...args] = tokenize(rawInput.slice(1));
    switch (command) {
      case 'help':
        pushMessage('system', renderHelp());
        return;
      case 'clear':
        setMessages([]);
        setStatusLine('Cleared');
        return;
      case 'exit':
      case 'quit':
        exit();
        return;
      case 'login': {
        if (args.length < 2) {
          pushMessage('error', 'Usage: /login <email> <password>');
          return;
        }
        setLoading(true);
        setStatusLine('Logging in...');
        try {
          const [email, password] = args;
          const tokens = await api.login(email, password);
          setAuthState({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            activeSessionId: authRef.current.activeSessionId,
          });
          await loadCurrentUser();
          await refreshSessions();
          pushMessage('system', `Logged in as ${email}.`);
          setStatusLine('Ready');
        } catch (error) {
          pushMessage('error', error instanceof Error ? error.message : String(error));
          setStatusLine('Login failed');
        } finally {
          setLoading(false);
        }
        return;
      }
      case 'logout': {
        setLoading(true);
        setStatusLine('Logging out...');
        try {
          if (authRef.current.refreshToken) {
            await api.logout(authRef.current.refreshToken);
          }
        } catch {
          // Best effort logout.
        } finally {
          setAuthState({});
          setSessions([]);
          setUserEmail('');
          pushMessage('system', 'Logged out.');
          setStatusLine('Ready');
          setLoading(false);
        }
        return;
      }
      case 'sessions': {
        if (!authRef.current.accessToken) {
          pushMessage('error', 'Please login first.');
          return;
        }
        setLoading(true);
        setStatusLine('Loading sessions...');
        try {
          const nextSessions = await api.listSessions();
          setSessions(nextSessions);
          pushMessage('system', formatSessions(nextSessions, authRef.current.activeSessionId));
          setStatusLine('Ready');
        } catch (error) {
          pushMessage('error', error instanceof Error ? error.message : String(error));
          setStatusLine('Ready');
        } finally {
          setLoading(false);
        }
        return;
      }
      case 'use': {
        const targetSessionId = args[0];
        if (!targetSessionId) {
          pushMessage('error', 'Usage: /use <sessionId>');
          return;
        }
        setLoading(true);
        setStatusLine(`Switching to ${targetSessionId.slice(0, 8)}...`);
        try {
          setAuthState(current => ({ ...current, activeSessionId: targetSessionId }));
          const history = await api.listMessages(targetSessionId);
          setMessages(mapMessagesToUi(history).slice(-MAX_RENDERED_MESSAGES));
          setStatusLine('Ready');
        } catch (error) {
          pushMessage('error', error instanceof Error ? error.message : String(error));
          setStatusLine('Ready');
        } finally {
          setLoading(false);
        }
        return;
      }
      case 'new': {
        if (!authRef.current.accessToken) {
          pushMessage('error', 'Please login first.');
          return;
        }
        const title = args.join(' ').trim() || `TS CLI Session ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
        setLoading(true);
        setStatusLine('Creating session...');
        try {
          const created = await api.createSession({ title, provider: 'OPENAI' });
          setAuthState(current => ({ ...current, activeSessionId: created.id }));
          await refreshSessions(created.id);
          pushMessage('system', `Created session ${created.id}`);
          setStatusLine('Ready');
        } catch (error) {
          pushMessage('error', error instanceof Error ? error.message : String(error));
          setStatusLine('Ready');
        } finally {
          setLoading(false);
        }
        return;
      }
      case 'stats': {
        if (!authRef.current.accessToken) {
          pushMessage('error', 'Please login first.');
          return;
        }
        const hours = Number.parseInt(args[0] || '24', 10);
        setLoading(true);
        setStatusLine('Loading tool stats...');
        try {
          const stats = await api.toolStats(Number.isFinite(hours) ? hours : 24, authRef.current.activeSessionId);
          pushMessage('system', formatToolStatsSummary(stats));
          setStatusLine('Ready');
        } catch (error) {
          pushMessage('error', error instanceof Error ? error.message : String(error));
          setStatusLine('Ready');
        } finally {
          setLoading(false);
        }
        return;
      }
      case 'report': {
        if (!authRef.current.accessToken) {
          pushMessage('error', 'Please login first.');
          return;
        }
        const hours = Number.parseInt(args[0] || '24', 10);
        setLoading(true);
        setStatusLine('Loading release report...');
        try {
          const report = await api.releaseReport(Number.isFinite(hours) ? hours : 24, authRef.current.activeSessionId);
          pushMessage('system', formatReleaseReportSummary(report));
          setStatusLine('Ready');
        } catch (error) {
          pushMessage('error', error instanceof Error ? error.message : String(error));
          setStatusLine('Ready');
        } finally {
          setLoading(false);
        }
        return;
      }
      default:
        pushMessage('error', `Unknown command: /${command || ''}`);
    }
  }

  async function handleSubmit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    setInput('');
    if (trimmed.startsWith('/')) {
      await executeSlashCommand(trimmed);
      return;
    }

    await submitChat(trimmed);
  }

  const activeSessionLabel = authState.accessToken && activeSessionId ? activeSessionId.slice(0, 8) : 'none';

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Text color="cyan">AI Agent TS CLI</Text>
        <Text color="gray">
          user={userEmail || 'anonymous'} session={activeSessionLabel} status={statusLine}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {visibleMessages.map(message => (
          <Box key={message.id} flexDirection="row">
            <Text color={message.role === 'user' ? 'green' : message.role === 'assistant' ? 'blue' : message.role === 'error' ? 'red' : 'yellow'}>
              {message.role === 'user'
                ? 'you > '
                : message.role === 'assistant'
                  ? 'ai  > '
                  : message.role === 'error'
                    ? 'err > '
                    : 'sys > '}
            </Text>
            <Text>{message.content}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        {loading ? (
          <Text color="yellow">
            <Spinner type="dots" /> {statusLine}
          </Text>
        ) : (
          <Text color="gray">{statusLine}</Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color="green">❯ </Text>
        <TextInput value={input} onChange={setInput} onSubmit={value => void handleSubmit(value)} placeholder="Ask something or type /help" />
      </Box>
    </Box>
  );
}
