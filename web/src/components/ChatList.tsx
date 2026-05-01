import React, { useMemo, useState } from 'react';
import type { Session } from '../types';
import { RadioTower, Search, MessageSquare, Clock } from 'lucide-react';
import { Card, CardContent } from './Card';

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

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
          <div className="empty-sessions">
            <MessageSquare size={24} />
            <p className="muted">{sessionQuery ? '没有匹配会话' : '暂无会话'}</p>
          </div>
        ) : (
          filteredSessions.map(s => (
            <Card
              key={s.id}
              hover
              className={activeSessionId === s.id ? 'session-card active' : 'session-card'}
              onClick={() => onSelectSession(s.id)}
            >
              <CardContent className="session-card-content">
                <div className="session-card-header">
                  <span className="session-title">{s.title}</span>
                  <span className="session-date">
                    <Clock size={10} />
                    {formatDate(s.updatedAt)}
                  </span>
                </div>
                <div className="session-card-meta">
                  <span className="meta-tag provider-tag">{s.provider}</span>
                  <span className="meta-tag model-tag">{s.model}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
};
