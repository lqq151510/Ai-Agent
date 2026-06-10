import React from 'react';
import type { ModelOption, Provider, UserProfile } from '../types';
import { LogOut, Zap, Settings as SettingsIcon, User } from 'lucide-react';
import { NewSessionForm } from './settings/NewSessionForm';
import { UserConfigModal } from './settings/UserConfigModal';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SettingsProps {
  api: any;
  user: UserProfile;
  onUserUpdate: (user: UserProfile) => void;
  onLogout: () => void;
  modelOptions: ModelOption[];
  contextTokenLimit: number | null;
  onCreateSession: (provider: Provider, model: string, title?: string, contextTokenLimit?: number | null) => void;
  onNavigateToCoach: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  api,
  user,
  onUserUpdate,
  onLogout,
  modelOptions,
  contextTokenLimit,
  onCreateSession,
  onNavigateToCoach
}) => {
  const [showConfig, setShowConfig] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <header className="sidebar-top">
        <div className="user-info">
          <div className="user-avatar">
            {user.email.charAt(0).toUpperCase()}
          </div>
          <div className="user-details">
            <p className="badge">已登录</p>
            <h2>{user.email}</h2>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="icon-button" onClick={() => navigate('/user/profile')} aria-label="用户中心" title="用户中心">
            <User size={17} />
          </button>
          <button className="icon-button" onClick={() => setShowConfig(true)} aria-label="模型设置" title="自定义模型网关">
            <SettingsIcon size={17} />
          </button>
          <button className="icon-button logout-btn" onClick={onLogout} aria-label="退出登录" title="退出登录">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <div className="coach-nav-card" onClick={onNavigateToCoach} style={{ cursor: 'pointer' }}>
        <div className="coach-nav-icon">
          <Zap size={16} />
        </div>
        <div className="coach-nav-body">
          <h3>AI + Java 开发陪跑器</h3>
          <p>需求拆解、脚手架与日志诊断</p>
        </div>
      </div>

      <NewSessionForm
        modelOptions={modelOptions}
        contextTokenLimit={contextTokenLimit}
        onCreateSession={onCreateSession}
      />

      <UserConfigModal
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        api={api}
        user={user}
        onSaveSuccess={onUserUpdate}
      />
    </>
  );
};
