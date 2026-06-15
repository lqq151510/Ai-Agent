import React, { useMemo, useState } from 'react';
import type { ModelOption, Session, Provider, ToolStatsResponse } from '../types';
import { defaultModel } from '../utils';
import { LogOut, MessageSquarePlus, Plus, Brain } from 'lucide-react';
import { ToolStatsPanel } from './sidebar/ToolStatsPanel';
import { SessionList } from './sidebar/SessionList';

interface SidebarProps {
  userEmail: string;
  onLogout: () => void;
  sessions: Session[];
  activeSessionId: string;
  modelOptions: ModelOption[];
  toolStats: ToolStatsResponse | null;
  toolStatsLoading: boolean;
  toolStatsWindowHours: number;
  toolStatsScope: 'session' | 'global';
  hasActiveSession: boolean;
  onRefreshToolStats: () => void;
  onChangeToolStatsWindow: (hours: number) => void;
  onChangeToolStatsScope: (scope: 'session' | 'global') => void;
  onExportToolStatsJson: () => void;
  onExportToolStatsMarkdown: () => void;
  onExportReleaseReportJson: () => void;
  onExportReleaseReportMarkdown: () => void;
  onSelectSession: (id: string) => void;
  onCreateSession: (provider: Provider, model: string, title?: string) => void;
  onOpenMemory: () => void;
}

const RECENT_MODEL_KEY = 'ai_agent_recent_model';

function recentModelKey(provider: Provider) {
  return `${RECENT_MODEL_KEY}:${provider}`;
}

export const Sidebar: React.FC<SidebarProps> = ({
  userEmail,
  onLogout,
  sessions,
  activeSessionId,
  modelOptions,
  toolStats,
  toolStatsLoading,
  toolStatsWindowHours,
  toolStatsScope,
  hasActiveSession,
  onRefreshToolStats,
  onChangeToolStatsWindow,
  onChangeToolStatsScope,
  onExportToolStatsJson,
  onExportToolStatsMarkdown,
  onExportReleaseReportJson,
  onExportReleaseReportMarkdown,
  onSelectSession,
  onCreateSession,
  onOpenMemory,
}) => {
  const [createProvider, setCreateProvider] = useState<Provider>('OPENAI');
  const [createTitle, setCreateTitle] = useState('');
  const [sessionQuery, setSessionQuery] = useState('');

  const optionsByProvider = useMemo(() => {
    const grouped: Record<Provider, ModelOption[]> = {
      OPENAI: []
    };
    for (const option of modelOptions) {
      (grouped[option.provider] ??= []).push(option);
    }
    return grouped;
  }, [modelOptions]);

  const pickModel = (provider: Provider): string => {
    const recent = localStorage.getItem(recentModelKey(provider));
    const options = optionsByProvider[provider];
    if (recent && options.some(option => option.model === recent)) {
      return recent;
    }
    const preferred = options.find(option => option.isDefault)?.model || options[0]?.model;
    return preferred || defaultModel(provider);
  };

  const [createModel, setCreateModel] = useState(pickModel('OPENAI'));

  const providerModels = optionsByProvider[createProvider];

  const handleCreate = async () => {
    const model = createModel.trim() || pickModel(createProvider);
    await onCreateSession(createProvider, model, createTitle.trim() || undefined);
    localStorage.setItem(recentModelKey(createProvider), model);
    setCreateTitle('');
    setCreateModel(pickModel(createProvider));
  };

  return (
    <aside className="sidebar panel">
      <header className="sidebar-top">
        <div>
          <p className="badge">已登录</p>
          <h2>{userEmail}</h2>
        </div>
        <button className="icon-button" onClick={onLogout} aria-label="退出登录" title="退出登录">
          <LogOut size={17} />
        </button>
      </header>
      <div className="sidebar-memory-capsule-container">
        <button type="button" className="memory-capsule-btn glow-primary-hover" onClick={onOpenMemory}>
          <Brain size={14} className="text-primary animate-pulse-slow" />
          <span>Agent 记忆胶囊库</span>
        </button>
      </div>
      <section className="section new-session-form">
        <div className="section-heading">
          <MessageSquarePlus size={16} />
          <h3>新会话</h3>
        </div>
        <label htmlFor="provider">Provider</label>
        <select
          id="provider"
          value={createProvider}
          onChange={e => {
            const provider = e.target.value as Provider;
            setCreateProvider(provider);
            setCreateModel(pickModel(provider));
          }}
        >
          <option value="OPENAI">OPENAI</option>
        </select>

        <label htmlFor="model">Model</label>
        <input
          id="model"
          list={`model-list-${createProvider}`}
          value={createModel}
          onChange={e => setCreateModel(e.target.value)}
          placeholder={pickModel(createProvider)}
        />
        <datalist id={`model-list-${createProvider}`}>
          {providerModels.map(option => (
            <option key={option.model} value={option.model} />
          ))}
        </datalist>

        <label htmlFor="title">Title（可选）</label>
        <input
          id="title"
          value={createTitle}
          onChange={e => setCreateTitle(e.target.value)}
          placeholder="例如：仓库结构分析"
        />
        <button className="primary" onClick={handleCreate}>
          <Plus size={16} />
          创建会话
        </button>
      </section>
      <ToolStatsPanel
        toolStats={toolStats}
        toolStatsLoading={toolStatsLoading}
        toolStatsWindowHours={toolStatsWindowHours}
        toolStatsScope={toolStatsScope}
        hasActiveSession={hasActiveSession}
        onRefreshToolStats={onRefreshToolStats}
        onChangeToolStatsWindow={onChangeToolStatsWindow}
        onChangeToolStatsScope={onChangeToolStatsScope}
        onExportToolStatsJson={onExportToolStatsJson}
        onExportToolStatsMarkdown={onExportToolStatsMarkdown}
        onExportReleaseReportJson={onExportReleaseReportJson}
        onExportReleaseReportMarkdown={onExportReleaseReportMarkdown}
      />
      <SessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={onSelectSession}
      />
    </aside>
  );
};
