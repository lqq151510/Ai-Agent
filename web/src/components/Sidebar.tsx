import React, { useMemo, useState } from 'react';
import type { ModelOption, Session, Provider, ToolStatsResponse } from '../types';
import { defaultModel } from '../utils';
import { Activity, Download, LogOut, MessageSquarePlus, Plus, RadioTower, RefreshCw, Search } from 'lucide-react';

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

  const maxBucketCount = useMemo(() => {
    if (!toolStats || toolStats.durationBuckets.length === 0) {
      return 1;
    }
    return Math.max(...toolStats.durationBuckets.map(bucket => bucket.count), 1);
  }, [toolStats]);

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
      <section className="section tool-stats">
        <div className="section-heading">
          <Activity size={16} />
          <h3>工具统计</h3>
          <button
            className="icon-button stat-refresh"
            onClick={onRefreshToolStats}
            title="刷新统计"
            aria-label="刷新统计"
            disabled={toolStatsLoading}
          >
            <RefreshCw size={14} className={toolStatsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="stats-filter-row">
          <div className="stats-export-row">
            <button type="button" className="ghost stat-export-btn" onClick={onExportToolStatsJson} disabled={toolStatsLoading}>
              <Download size={13} />
              导出 JSON
            </button>
            <button type="button" className="ghost stat-export-btn" onClick={onExportToolStatsMarkdown} disabled={toolStatsLoading}>
              <Download size={13} />
              导出 MD
            </button>
            <button type="button" className="ghost stat-export-btn" onClick={onExportReleaseReportJson} disabled={toolStatsLoading}>
              <Download size={13} />
              巡检 JSON
            </button>
            <button type="button" className="ghost stat-export-btn" onClick={onExportReleaseReportMarkdown} disabled={toolStatsLoading}>
              <Download size={13} />
              巡检 MD
            </button>
          </div>
          <div className="stats-segment">
            {[1, 24, 168].map(hours => (
              <button
                key={hours}
                type="button"
                className={toolStatsWindowHours === hours ? 'segment-btn active' : 'segment-btn'}
                onClick={() => onChangeToolStatsWindow(hours)}
                disabled={toolStatsLoading}
              >
                {hours === 168 ? '7d' : `${hours}h`}
              </button>
            ))}
          </div>
          <div className="stats-segment">
            <button
              type="button"
              className={toolStatsScope === 'session' ? 'segment-btn active' : 'segment-btn'}
              onClick={() => onChangeToolStatsScope('session')}
              disabled={!hasActiveSession || toolStatsLoading}
            >
              当前会话
            </button>
            <button
              type="button"
              className={toolStatsScope === 'global' ? 'segment-btn active' : 'segment-btn'}
              onClick={() => onChangeToolStatsScope('global')}
              disabled={toolStatsLoading}
            >
              全局
            </button>
          </div>
        </div>
        {!toolStats || toolStats.totalRuns === 0 ? (
          <p className="muted empty-copy">最近 {toolStats?.windowHours ?? 24} 小时暂无工具调用数据。</p>
        ) : (
          <div className="tool-stats-panel">
            <div className="stats-kpis">
              <div>
                <span>总调用</span>
                <strong>{toolStats.totalRuns}</strong>
              </div>
              <div>
                <span>成功率</span>
                <strong>{toolStats.successRate}%</strong>
              </div>
              <div>
                <span>P95</span>
                <strong>{toolStats.p95DurationMs}ms</strong>
              </div>
            </div>

            <div className="bucket-list">
              {toolStats.durationBuckets.map(bucket => (
                <div key={bucket.label} className="bucket-item">
                  <div className="bucket-label">
                    <span>{bucket.label}</span>
                    <span>{bucket.count}</span>
                  </div>
                  <div className="bucket-track">
                    <i style={{ width: `${Math.max(6, (bucket.count / maxBucketCount) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="tool-top-list">
              {toolStats.topTools.slice(0, 5).map(tool => (
                <div key={tool.toolName} className="tool-top-item">
                  <span className="tool-name">{tool.toolName}</span>
                  <span className="tool-meta">{tool.runs}次 / {tool.successRate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
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
    </aside>
  );
};
