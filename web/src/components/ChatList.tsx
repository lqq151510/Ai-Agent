import React, { useMemo, useState } from "react";
import type { Session } from "../types";
import {
  RadioTower,
  Search,
  MessageSquare,
  Clock,
  Hash,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "./Card";
import { getTaskModeDefinition, getTaskStatusLabel } from "../taskModes";

interface ChatListProps {
  sessions: Session[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
}

export const ChatList: React.FC<ChatListProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
}) => {
  const [sessionQuery, setSessionQuery] = useState("");

  const filteredSessions = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((session) => {
      const title = session.title.toLowerCase();
      const model = session.model.toLowerCase();
      const provider = session.provider.toLowerCase();
      return title.includes(q) || model.includes(q) || provider.includes(q);
    });
  }, [sessionQuery, sessions]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
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
          onChange={(e) => setSessionQuery(e.target.value)}
          placeholder="搜索标题 / 模型 / Provider"
          aria-label="搜索会话"
        />
      </div>
      <div className="session-list">
        {filteredSessions.length === 0 ? (
          <div className="empty-sessions">
            <MessageSquare size={24} />
            <p className="muted">
              {sessionQuery ? "没有匹配会话" : "暂无会话"}
            </p>
          </div>
        ) : (
          filteredSessions.map((s) => (
            <Card
              key={s.id}
              hover
              className={
                activeSessionId === s.id
                  ? "session-card active"
                  : "session-card"
              }
              onClick={() => onSelectSession(s.id)}
            >
              <CardContent className="session-card-content">
                {s.taskType || s.taskStatus ? (
                  <div className="session-task-row">
                    <span className="meta-tag task-type-tag">
                      {getTaskModeDefinition(s.taskType).shortLabel}
                    </span>
                    <span className="meta-tag task-status-tag">
                      {getTaskStatusLabel(s.taskStatus)}
                    </span>
                  </div>
                ) : null}
                <div className="session-card-header">
                  <span className="session-title">{s.title}</span>
                  <span className="session-date">
                    <Clock size={10} />
                    {formatDate(s.updatedAt)}
                  </span>
                </div>
                <div className="session-card-subline">
                  <span className="session-inline-meta">
                    <Hash size={10} />
                    {s.id.slice(0, 8)}
                  </span>
                  <span className="session-inline-meta">
                    <Sparkles size={10} />
                    {formatTime(s.updatedAt)}
                  </span>
                </div>
                {s.taskGoal || s.summary || s.lastMessagePreview ? (
                  <p className="session-summary">
                    {s.taskGoal || s.summary || s.lastMessagePreview}
                  </p>
                ) : null}
                <div className="session-card-meta">
                  <span className="meta-tag provider-tag">{s.provider}</span>
                  <span className="meta-tag model-tag">{s.model}</span>
                  {s.taskCount ? (
                    <span className="meta-tag">{s.taskCount} tasks</span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
};
