import { useState, useCallback, useEffect } from 'react';
import { SessionList } from './SessionList';
import { ChatArea } from './ChatArea';
import { ContextPanel } from './ContextPanel';

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  branch: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system' | 'error';
  content: string;
  time: string;
}

type StreamState = {
  requestId: string;
  sessionId: string;
  assistantMessageId: string;
} | null;

export function MainLayout() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>(null);

  const refreshSessions = useCallback(async () => {
    const data = await window.electronAPI?.invoke('chat:get-sessions');
    if (Array.isArray(data)) {
      setSessions(data);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.chat?.onStreamEvent?.((event: any) => {
      setStreamState(current => {
        if (!current || current.requestId !== event.requestId) {
          return current;
        }

        if (event.type === 'chunk') {
          setMessages(prev =>
            prev.map(message =>
              message.id === current.assistantMessageId
                ? { ...message, content: `${message.content}${event.chunk ?? ''}` }
                : message,
            ),
          );
          return current;
        }

        if (event.type === 'done') {
          const reply = typeof event.reply === 'string' ? event.reply : '';
          setMessages(prev =>
            prev.map(message =>
              message.id === current.assistantMessageId
                ? { ...message, content: reply || message.content || '已完成，但无文本输出。' }
                : message,
            ),
          );
          void refreshSessions();
          return null;
        }

        if (event.type === 'error') {
          setMessages(prev =>
            prev.map(message =>
              message.id === current.assistantMessageId
                ? { ...message, role: 'error', content: event.message || '流式请求失败' }
                : message,
            ),
          );
          return null;
        }

        return current;
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [refreshSessions]);

  const handleSelectSession = useCallback(async (id: string) => {
    setActiveSessionId(id);
    const session = await window.electronAPI?.invoke('chat:get-session', id);
    if (session) {
      setMessages(session.messages || []);
    }
  }, []);

  const handleNewSession = useCallback(async () => {
    const session = await window.electronAPI?.invoke('chat:create-session', 'main');
    if (session) {
      setSessions(prev => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([]);
      void refreshSessions();
    }
  }, [refreshSessions]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streamState) return;

    const now = new Date().toLocaleTimeString();
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      time: now,
    };
    const assistantMsg: ChatMessage = {
      id: `agent-${Date.now()}`,
      role: 'agent',
      content: '',
      time: now,
    };
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      const result = await window.electronAPI?.chat?.streamWithContext({
        message: text,
        workspacePath: workspacePath ?? undefined,
        selectedFiles,
        sessionId: activeSessionId ?? undefined,
      });
      if (!result?.requestId || !result?.sessionId) {
        throw new Error('stream request did not return identifiers');
      }
      setActiveSessionId(result.sessionId);
      setStreamState({
        requestId: result.requestId,
        sessionId: result.sessionId,
        assistantMessageId: assistantMsg.id,
      });
    } catch (err) {
      setMessages(prev =>
        prev.map(message =>
          message.id === assistantMsg.id
            ? {
                ...message,
                role: 'error',
                content: `发送失败: ${err instanceof Error ? err.message : String(err)}`,
              }
            : message,
        ),
      );
      setStreamState(null);
    }
  }, [activeSessionId, workspacePath, selectedFiles, streamState, refreshSessions]);

  return (
    <div className="main-layout">
      {/* Left: Session List */}
      <aside className="main-layout__sidebar">
        <SessionList
          sessions={sessions}
          setSessions={setSessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      </aside>

      {/* Center: Chat Area */}
      <main className="main-layout__chat">
        <ChatArea
          messages={messages}
          onSendMessage={handleSendMessage}
          terminalOpen={terminalOpen}
          onToggleTerminal={() => setTerminalOpen(v => !v)}
          workspacePath={workspacePath}
          selectedFiles={selectedFiles}
        />
      </main>

      {/* Right: Context Panel */}
      <aside className="main-layout__context">
        <ContextPanel
          workspacePath={workspacePath}
          onSelectWorkspace={setWorkspacePath}
          selectedFiles={selectedFiles}
          onToggleFile={(path) => {
            setSelectedFiles(prev =>
              prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
            );
          }}
        />
      </aside>
    </div>
  );
}
