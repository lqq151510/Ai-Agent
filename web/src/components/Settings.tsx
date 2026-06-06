import React from 'react';
import type { ModelOption, Provider } from '../types';
import { LogOut, Zap } from 'lucide-react';
import { NewSessionForm } from './settings/NewSessionForm';

interface SettingsProps {
  userEmail: string;
  onLogout: () => void;
  modelOptions: ModelOption[];
  contextTokenLimit: number | null;
  onCreateSession: (provider: Provider, model: string, title?: string, contextTokenLimit?: number | null) => void;
  onNavigateToCoach: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  userEmail,
  onLogout,
  modelOptions,
  contextTokenLimit,
  onCreateSession,
  onNavigateToCoach
}) => {
  return (
    <>
      <header className="sidebar-top">
        <div className="user-info">
          <div className="user-avatar">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <div className="user-details">
            <p className="badge">已登录</p>
            <h2>{userEmail}</h2>
          </div>
        </div>
        <button className="icon-button logout-btn" onClick={onLogout} aria-label="退出登录" title="退出登录">
          <LogOut size={17} />
        </button>
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
    </>
  );
};
