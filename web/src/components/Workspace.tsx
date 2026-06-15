import React, { useState } from 'react';
import { Session, ModelOption, MemoryItem } from '../types';
import { Settings } from './Settings';
import { ChatList } from './ChatList';
import { MessageContainer } from './MessageContainer';
import { MemoryModal } from './MemoryModal';

interface WorkspaceProps {
  api: any;
  user: any;
  onUserUpdate: (user: any) => void;
  ui: any;
  chat: any;
  activeSession: Session | null;
  currentModelOption: ModelOption | null;
  onLogout: () => void;
  onCreateSession: (provider: any, model: string, title?: string, contextTokenLimit?: number | null) => void;
  navigate: any;
  onSelectSession: (sessionId: string) => void;
  onSwitchFallbackSession: (defaultModel: any) => void;
  onRetryLast: () => void;
  sendMessage: (msg: string) => void;
  defaultModel: any;
}

export function Workspace({
  api, user, onUserUpdate, ui, chat, activeSession, currentModelOption,
  onLogout, onCreateSession, navigate,
  onSelectSession, onSwitchFallbackSession, onRetryLast,
  sendMessage, defaultModel
}: WorkspaceProps) {
  const [prompt, setPrompt] = useState('');
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);

  const loadMemories = async () => {
    setMemoriesLoading(true);
    try {
      const data = await api.listMemories();
      setMemories(data || []);
    } catch (err) {
      console.error('Failed to load memories', err);
    } finally {
      setMemoriesLoading(false);
    }
  };

  const handleOpenMemory = () => {
    setIsMemoryOpen(true);
    void loadMemories();
  };

  const handleUpdateMemory = async (id: string, text: string) => {
    await api.updateMemory(id, text);
    setMemories(prev => prev.map(item => item.id === id ? { ...item, text } : item));
  };

  const handleDeleteMemory = async (id: string) => {
    await api.deleteMemory(id);
    setMemories(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="workspace-shell">
      <header className="workspace-chrome">
        <div className="chrome-brand">
          <span className="chrome-mark">AJ</span>
          <div>
            <strong>AI + Java Dev Coach</strong>
            <span>Agent workspace / RAG cockpit</span>
          </div>
        </div>
        <nav className="chrome-nav" aria-label="主工作区">
          <button type="button" className="chrome-nav-item active">工作台</button>
          <button type="button" className="chrome-nav-item" onClick={() => navigate('/coach')}>开发陪跑器</button>
        </nav>
      </header>
      <div className="workspace">
        <aside className="sidebar panel">
          <Settings
            api={api}
            user={user}
            onUserUpdate={onUserUpdate}
            onLogout={onLogout}
            modelOptions={ui.modelOptions}
            contextTokenLimit={ui.contextTokenLimit}
            onCreateSession={onCreateSession}
            onNavigateToCoach={() => navigate('/coach')}
            ui={ui}
            onOpenMemory={handleOpenMemory}
          />
          <ChatList sessions={chat.sessions} activeSessionId={chat.activeSessionId} onSelectSession={onSelectSession} />
        </aside>
        <MessageContainer
          activeSession={activeSession}
          messages={chat.messages}
          prompt={prompt}
          setPrompt={setPrompt}
          sending={chat.sending}
          loading={chat.loading}
          error={chat.error}
          streamState={chat.streamState}
          currentModelOption={currentModelOption}
          toolStats={ui.toolStats}
          toolStatsLoading={ui.toolStatsLoading}
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
          onRetryLast={onRetryLast}
          onSendMessage={() => { void sendMessage(prompt); setPrompt(''); }}
        />
      </div>
      <footer className="workspace-statusbar">
        <span>{activeSession ? `session://${activeSession.id.slice(0, 8)}` : 'session://none'}</span>
        <span>{currentModelOption?.displayName || currentModelOption?.model || activeSession?.model || 'model:auto'}</span>
        <span>{ui.contextTokenLimit ? `context:${ui.contextTokenLimit}` : 'context:default'}</span>
      </footer>

      <MemoryModal
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        memories={memories}
        loading={memoriesLoading}
        onUpdateMemory={handleUpdateMemory}
        onDeleteMemory={handleDeleteMemory}
      />
    </div>
  );
}
