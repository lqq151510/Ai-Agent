import React, { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import cliMd from 'cli-markdown';

import { createApiClient, type ApiClient } from './api-client.js';
import { startAuthServer } from './cli-auth-server.js';
import { collectSystemContext } from './context-collector.js';
import { formatReleaseReportSummary, formatSessions, formatToolStatsSummary } from './format.js';
import { StateStore } from './state-store.js';
import { tokenize } from './tokenize.js';
import type { AuthState, Message, Session } from './types.js';

import { Header } from './components/Header.js';
import { MessageBubble } from './components/MessageBubble.js';
import { InputArea } from './components/InputArea.js';
import { SentinelAlertModal } from './components/SentinelAlertModal.js';

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
    '/sessions',
    '/use <sessionId>',
    '/new [title]',
    '/stats [windowHours]',
    '/report [windowHours]',
    '/model <provider> <modelName>',
    '/coach <task prompt>',
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
  const [authState, setAuthState] = useState<AuthState>(() => {
    const stored = store.read();
    return { ...stored, accessToken: stored.accessToken || 'local-bypass', refreshToken: stored.refreshToken || 'local-bypass' };
  });
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
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftInput, setDraftInput] = useState('');
  const authRef = useRef(authState);
  const deferredMessages = useDeferredValue(messages);
  const visibleMessages = deferredMessages.slice(-MAX_RENDERED_MESSAGES);
  const activeSessionId = authState.activeSessionId;
  const [sentinelAlert, setSentinelAlert] = useState<{ rootCause: string; suggestedFix: string } | null>(null);

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

  useEffect(() => {
    const abortController = new AbortController();
    void api.subscribeToSentinelAlerts(abortController.signal, {
      onAlert: alert => {
        setSentinelAlert(alert);
      },
      onError: () => {},
    });
    return () => abortController.abort();
  }, [api]);

  const ALL_SLASH_COMMANDS = ['/help', '/sessions', '/use', '/new', '/stats', '/report', '/model', '/coach', '/clear', '/exit', '/quit'];

  useInput((_char, key) => {
    if (sentinelAlert) return;

    if (key.escape) {
      exit();
    }

    const history = authRef.current.commandHistory || [];

    if (key.upArrow) {
      if (history.length === 0) return;
      if (historyIndex === -1) {
        setDraftInput(input);
      }
      const nextIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIndex);
      setInput(history[history.length - 1 - nextIndex] || '');
    } else if (key.downArrow) {
      if (historyIndex >= 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        if (nextIndex === -1) {
          setInput(draftInput);
        } else {
          setInput(history[history.length - 1 - nextIndex] || '');
        }
      }
    } else if (key.tab) {
      if (input.startsWith('/')) {
        const matches = ALL_SLASH_COMMANDS.filter(cmd => cmd.startsWith(input));
        if (matches.length === 1) {
          setInput(matches[0] + ' ');
        } else if (matches.length > 1) {
          let prefix = matches[0] || '';
          for (let i = 1; i < matches.length; i++) {
            let j = 0;
            const match = matches[i] || '';
            while (j < prefix.length && j < match.length && prefix[j] === match[j]) {
              j++;
            }
            prefix = prefix.slice(0, j);
          }
          setInput(prefix);
        }
      }
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
        // 跳过不必要的 Profile 动画，实现快速进入
        await loadCurrentUser().catch(() => {});
        const nextActive = await refreshSessions();
        if (nextActive) {
          const history = await api.listMessages(nextActive.id);
          setMessages(current => [...current, ...mapMessagesToUi(history).slice(-MAX_RENDERED_MESSAGES)]);
        }
        setStatusLine('Ready');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('fetch failed')) {
          pushMessage('error', '⚠️ Cannot connect to backend server. Is the Java backend running?');
        } else {
          pushMessage('error', msg);
        }
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
      provider: authRef.current.defaultProvider || 'OPENAI',
      model: authRef.current.defaultModel,
    });
    setAuthState(current => ({ ...current, activeSessionId: created.id }));
    await refreshSessions(created.id);
    return created;
  }

  async function submitChat(content: string) {

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
          onClientToolCall: async call => {
            if (call.name === 'execute_cli_command') {
              try {
                const args = JSON.parse(call.argumentsJson);
                setStatusLine(`⚙️ Executing local command: ${args.command}`);
                pushMessage('system', `⚙️ Local tool execution: \`${args.command}\``);
                const { exec } = await import('node:child_process');
                const { promisify } = await import('node:util');
                const execAsync = promisify(exec);
                const { stdout, stderr } = await execAsync(args.command, { cwd: args.cwd || process.cwd() });
                const output = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
                await api.submitToolResult(call.id, output || 'Command executed successfully with no output.');
              } catch (error) {
                await api.submitToolResult(call.id, `Error: ${error instanceof Error ? error.message : String(error)}`);
              }
            } else {
              await api.submitToolResult(call.id, `Error: Unknown client tool ${call.name}`);
            }
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
      const msg = error instanceof Error ? error.message : String(error);
      const displayMsg = msg.includes('fetch failed') ? '⚠️ Cannot connect to backend server. Is the Java backend running?' : msg;
      setMessages(current =>
        current.map(item => (item.id === draftId ? { ...item, role: 'error', content: displayMsg } : item)),
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
      // 移除登录登出逻辑
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
      case 'model': {
        const provider = args[0] as 'OPENAI' | undefined;
        const model = args[1];
        if (!provider || !model) {
          pushMessage('error', 'Usage: /model <provider> <modelName>\nExample: /model OPENAI qwen/qwen3.5-9b');
          return;
        }
        setAuthState(current => ({ ...current, defaultProvider: provider, defaultModel: model }));
        pushMessage('system', `Default model set to ${provider}/${model}. It will be used for new sessions.`);
        return;
      }
      case 'coach': {
        const taskPrompt = args.join(' ').trim();
        if (!taskPrompt) {
          pushMessage('error', 'Usage: /coach <task prompt>');
          return;
        }
        setLoading(true);
        setStatusLine('Coach executing multi-agent task...');
        try {
          const res = await api.executeMultiAgentTask({ taskPrompt });
          pushMessage('assistant', `🤖 Coach Result:\n${res.result}`);
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

    setAuthState(current => {
      const hist = current.commandHistory || [];
      if (hist.length > 0 && hist[hist.length - 1] === trimmed) {
        return current;
      }
      const newHist = [...hist, trimmed];
      if (newHist.length > 500) newHist.shift();
      return { ...current, commandHistory: newHist };
    });
    setHistoryIndex(-1);
    setDraftInput('');

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
      <Header 
        userEmail={userEmail} 
        activeSessionId={activeSessionId} 
        statusLine={statusLine} 
      />

      <Box flexDirection="column" marginTop={1}>
        {visibleMessages.map(message => (
          <MessageBubble key={message.id} role={message.role} content={message.content} />
        ))}
      </Box>

      {sentinelAlert ? (
        <SentinelAlertModal
          rootCause={sentinelAlert.rootCause}
          suggestedFix={sentinelAlert.suggestedFix}
          onDismiss={() => setSentinelAlert(null)}
        />
      ) : (
        <InputArea 
          input={input} 
          setInput={setInput} 
          onSubmit={value => void handleSubmit(value)} 
          loading={loading} 
          statusLine={statusLine} 
        />
      )}
    </Box>
  );
}
