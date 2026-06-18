import { useState, useCallback } from 'react';
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

export function MainLayout() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);

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
    }
  }, []);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      await window.electronAPI?.invoke('chat:send-with-context', {
        message: text,
        workspacePath: workspacePath ?? undefined,
        selectedFiles,
        sessionId: activeSessionId ?? undefined,
      });

      // Persist to local session store
      if (activeSessionId) {
        await window.electronAPI?.invoke('chat:append-message', activeSessionId, {
          role: 'user', content: text, time: userMsg.time,
        });
      }
    } catch (err) {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'error',
        content: `发送失败: ${err instanceof Error ? err.message : String(err)}`,
        time: new Date().toLocaleTimeString(),
      };
      setMessages(prev => [...prev, errMsg]);
    }
  }, [activeSessionId, workspacePath, selectedFiles]);

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
