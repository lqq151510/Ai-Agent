import React, { useMemo, useState } from 'react';
import type { Session } from '../types';
import { RadioTower, Search } from 'lucide-react';

interface ChatListProps {
  sessions: Session[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
}

export const ChatList: React.FC<ChatListProps> = ({ sessions, activeSessionId, onSelectSession }) => {
  const [sessionQuery, setSessionQuery] = useState('');

  const filteredSessions = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(session => {
      const title = session.title.toLowerCase();
      const model = session.model.toLowerCase();
      const provider = session.provider.toLowerCase();
      return title.includes(q) || model.includes(q) || provider.includes(q);
    });
  }, [sessionQuery, sessions]);

  return (
    <section className="section sessions">
      <div className="section-heading">
        <RadioTower size={16} />
        <h3>会话列表</h3>
        <span className="count-pill">{filteredSessions.length}</span>
      </div>
      <div className="session-search input-shell">
        <Search size={14} />
        <input
          value={sessionQuery}
          onChange={e => setSessionQuery(e.target.value)}
          placeholder="搜索标题 / 模型 / Provider"
          aria-label="搜索会话"
        />
      </div>
      <div className="session-list">
        {filteredSessions.length === 0 ? (
          <p className="muted empty-copy">没有匹配会话，换个关键词试试。</p>
        ) : (
          filteredSessions.map(s => (
            <button
              key={s.id}
              className={activeSessionId === s.id ? 'session-card active' : 'session-card'}
              onClick={() => onSelectSession(s.id)}
            >
              <span className="title">{s.title}</span>
              <span className="meta">
                <span>{s.provider}</span>
                <span>{s.model}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
};
