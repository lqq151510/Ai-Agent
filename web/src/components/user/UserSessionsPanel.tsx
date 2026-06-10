import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api';
import type { Session } from '../../types';
import { Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UserSessionsPanelProps {
  api: ApiClient;
}

export const UserSessionsPanel: React.FC<UserSessionsPanelProps> = ({ api }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listSessions();
      // Assuming listSessions returns either Session[] or PageResult<Session>
      const sessionList = Array.isArray(data) ? data : (data as any).content || [];
      setSessions(sessionList);
    } catch (err: any) {
      setError(err.message || '获取会话列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要永久删除此会话吗？此操作不可逆。')) return;
    try {
      await api.deleteSession(id);
      setSessions(sessions.filter(s => s.id !== id));
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>会话管理</h1>
        <p style={{ color: 'var(--text-muted)' }}>查看、继续或删除您过往的 AI 对话记录</p>
      </div>

      <div className="panel" style={{ padding: '24px', borderRadius: '8px' }}>
        {error && <div style={{ color: '#f44336', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>暂无会话记录</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px', fontWeight: 500 }}>标题</th>
                  <th style={{ padding: '12px', fontWeight: 500 }}>模型</th>
                  <th style={{ padding: '12px', fontWeight: 500 }}>更新时间</th>
                  <th style={{ padding: '12px', fontWeight: 500, textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(session => (
                  <tr key={session.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {session.title || '新会话'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                        {session.model || 'Unknown'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                      {new Date(session.updatedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button 
                          className="icon-button" 
                          title="继续对话"
                          onClick={() => navigate(`/chat/sessions/${session.id}`)}
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button 
                          className="icon-button" 
                          style={{ color: '#f44336' }} 
                          title="删除会话"
                          onClick={() => handleDelete(session.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
