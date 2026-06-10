import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { UserProfile } from '../../types';

interface UserConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  api: any;
  user: UserProfile;
  onSaveSuccess: (updatedUser: UserProfile) => void;
}

export const UserConfigModal: React.FC<UserConfigModalProps> = ({
  isOpen,
  onClose,
  api,
  user,
  onSaveSuccess,
}) => {
  const [customBaseUrl, setCustomBaseUrl] = useState(user.customBaseUrl || '');
  const [customApiKey, setCustomApiKey] = useState(user.customApiKey || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCustomBaseUrl(user.customBaseUrl || '');
      setCustomApiKey(user.customApiKey || '');
      setError(null);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const updatedUser = await api.updateConfig({
        customBaseUrl: customBaseUrl.trim() || null,
        customApiKey: customApiKey.trim() || null,
      });
      onSaveSuccess(updatedUser);
      onClose();
    } catch (err: any) {
      setError(err.message || '保存配置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="modal-content" style={{ backgroundColor: 'var(--panel-bg, #1e1e1e)', padding: '24px', borderRadius: '8px', width: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>自定义大模型网关</h3>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        {error && <div className="error-banner" style={{ color: '#ff4d4f', marginBottom: '12px', fontSize: '13px' }}>{error}</div>}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>自定义 Base URL</label>
            <input
              type="url"
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="例如：http://localhost:1234/v1"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>自定义 API Key</label>
            <input
              type="password"
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
              placeholder="你的 API Key (如果填写，将覆盖默认设置)"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button type="button" className="ghost" onClick={onClose} disabled={loading}>
              取消
            </button>
            <button type="submit" className="primary" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={14} />
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
