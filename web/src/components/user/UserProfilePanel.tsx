import React, { useState } from 'react';
import { ApiClient } from '../../api';
import type { UserProfile } from '../../types';
import { Save, Key } from 'lucide-react';

interface UserProfilePanelProps {
  api: ApiClient;
  user: UserProfile;
  onUserUpdate: (user: UserProfile) => void;
}

export const UserProfilePanel: React.FC<UserProfilePanelProps> = ({ api, user, onUserUpdate }) => {
  const [customBaseUrl, setCustomBaseUrl] = useState(user.customBaseUrl || '');
  const [customApiKey, setCustomApiKey] = useState(user.customApiKey || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const updatedUser = await api.updateConfig({
        customBaseUrl: customBaseUrl.trim() || null,
        customApiKey: customApiKey.trim() || null,
      });
      onUserUpdate(updatedUser);
      setMessage({ text: '大模型网关配置已更新', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || '保存配置失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>个人信息</h1>
        <p style={{ color: 'var(--text-muted)' }}>管理您的账户基础信息与偏好设置</p>
      </div>

      <div className="panel" style={{ padding: '24px', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>账户概览</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '16px', fontSize: '14px' }}>
          <div style={{ color: 'var(--text-muted)' }}>账号邮箱：</div>
          <div>{user.email}</div>
          <div style={{ color: 'var(--text-muted)' }}>注册时间：</div>
          <div>{new Date(user.createdAt).toLocaleString()}</div>
        </div>
      </div>

      <div className="panel" style={{ padding: '24px', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={18} /> 自定义大模型网关
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
          如果您希望使用第三方模型中转服务（例如 OpenAI 代理地址），请在此配置您的专属 BaseURL 和 API Key。这会覆盖系统的全局设置。
        </p>

        {message && (
          <div style={{ padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '13px', backgroundColor: message.type === 'success' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)', color: message.type === 'success' ? '#4caf50' : '#f44336' }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>自定义 Base URL</label>
            <input
              type="url"
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="例如：https://api.openai.com/v1"
              style={{ width: '100%', maxWidth: '500px', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>自定义 API Key</label>
            <input
              type="password"
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
              placeholder="您的 API Key (留空则不更改或清除旧配置)"
              style={{ width: '100%', maxWidth: '500px', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)' }}
            />
          </div>

          <div style={{ marginTop: '8px' }}>
            <button type="submit" className="primary" disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Save size={14} />
              {loading ? '保存中...' : '保存网关配置'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
