import { useEffect } from 'react';
import type { ChatSession } from './MainLayout';

interface SessionListProps {
  sessions: ChatSession[];
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export function SessionList({
  sessions, setSessions, activeSessionId, onSelectSession, onNewSession
}: SessionListProps) {

  useEffect(() => {
    window.electronAPI?.invoke('chat:get-sessions').then((data: ChatSession[]) => {
      if (Array.isArray(data)) setSessions(data);
    }).catch(() => {});
  }, [setSessions]);

  return (
    <div className="session-list">
      <div className="session-list__header">
        <span className="session-list__title">对话</span>
        <button
          id="btn-new-session"
          className="session-list__new-btn"
          onClick={onNewSession}
          title="新建对话"
        >
          +
        </button>
      </div>

      <div className="session-list__items">
        {sessions.length === 0 && (
          <div className="session-list__empty">暂无对话，点击 + 新建</div>
        )}
        {sessions.map(session => (
          <div
            key={session.id}
            id={`session-item-${session.id}`}
            className={`session-list__item${session.id === activeSessionId ? ' session-list__item--active' : ''}`}
            onClick={() => onSelectSession(session.id)}
            title={session.title}
          >
            <div className="session-list__item-title">{session.title || '新对话'}</div>
            <div className="session-list__item-meta">
              <span className="session-list__item-branch">{session.branch || 'main'}</span>
              <span className="session-list__item-time">
                {new Date(session.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
