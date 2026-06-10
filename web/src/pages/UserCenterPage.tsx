import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { ApiClient } from '../api';
import { User, Server, Settings as SettingsIcon, ArrowLeft } from 'lucide-react';
import { UserProfilePanel } from '../components/user/UserProfilePanel';
import { UserSessionsPanel } from '../components/user/UserSessionsPanel';
import { UserAgentsPanel } from '../components/user/UserAgentsPanel';

interface UserCenterPageProps {
  api: ApiClient;
}

type TabType = 'profile' | 'sessions' | 'agents';

export const UserCenterPage: React.FC<UserCenterPageProps> = ({ api }) => {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const ui = useUiStore();
  const [activeTab, setActiveTab] = useState<TabType>('profile');

  if (!user) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-color)' }}>
      {/* Sidebar */}
      <aside className="panel" style={{ width: '280px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '24px 16px' }}>
        <button 
          className="ghost" 
          onClick={() => navigate('/')} 
          style={{ display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', marginBottom: '32px' }}
        >
          <ArrowLeft size={16} /> 返回工作区
        </button>

        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', paddingLeft: '8px' }}>用户中心</h2>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button 
            className={activeTab === 'profile' ? 'primary' : 'ghost'} 
            onClick={() => setActiveTab('profile')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start', padding: '10px 16px' }}
          >
            <User size={18} /> 个人信息
          </button>
          <button 
            className={activeTab === 'sessions' ? 'primary' : 'ghost'} 
            onClick={() => setActiveTab('sessions')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start', padding: '10px 16px' }}
          >
            <Server size={18} /> 会话管理
          </button>
          <button 
            className={activeTab === 'agents' ? 'primary' : 'ghost'} 
            onClick={() => setActiveTab('agents')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start', padding: '10px 16px' }}
          >
            <SettingsIcon size={18} /> Agent 配置
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {activeTab === 'profile' && <UserProfilePanel api={api} user={user} onUserUpdate={setUser} />}
          {activeTab === 'sessions' && <UserSessionsPanel api={api} />}
          {activeTab === 'agents' && <UserAgentsPanel />}
        </div>
      </main>
    </div>
  );
};
