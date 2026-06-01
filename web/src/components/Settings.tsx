import React, { useMemo, useState } from 'react';
import type { ModelOption, Provider, ReleaseReportResponse, Session, ToolStatsResponse } from '../types';
import { defaultModel } from '../utils';
import { Activity, AlertTriangle, CheckCircle2, Clock, Download, LogOut, MessageSquarePlus, Plus, RefreshCw, TrendingUp, Zap } from 'lucide-react';
import { Card, CardContent, StatCard } from './Card';

interface SettingsProps {
  userEmail: string;
  onLogout: () => void;
  modelOptions: ModelOption[];
  toolStats: ToolStatsResponse | null;
  toolStatsLoading: boolean;
  releaseReport: ReleaseReportResponse | null;
  releaseReportLoading: boolean;
  toolStatsWindowHours: number;
  toolStatsScope: 'session' | 'global';
  hasActiveSession: boolean;
  activeSession: Session | null;
  currentModelOption: ModelOption | null;
  onRefreshToolStats: () => void;
  onChangeToolStatsWindow: (hours: number) => void;
  onChangeToolStatsScope: (scope: 'session' | 'global') => void;
  onExportToolStatsJson: () => void;
  onExportToolStatsMarkdown: () => void;
  onExportReleaseReportJson: () => void;
  onExportReleaseReportMarkdown: () => void;
  onCreateSession: (provider: Provider, model: string, title?: string) => void;
  onNavigateToCoach: () => void;
}

const RECENT_MODEL_KEY = 'ai_agent_recent_model';

function recentModelKey(provider: Provider) {
  return `${RECENT_MODEL_KEY}:${provider}`;
}

export const Settings: React.FC<SettingsProps> = ({
  userEmail,
  onLogout,
  modelOptions,
  toolStats,
  toolStatsLoading,
  releaseReport,
  releaseReportLoading,
  toolStatsWindowHours,
  toolStatsScope,
  hasActiveSession,
  activeSession,
  currentModelOption,
  onRefreshToolStats,
  onChangeToolStatsWindow,
  onChangeToolStatsScope,
  onExportToolStatsJson,
  onExportToolStatsMarkdown,
  onExportReleaseReportJson,
  onExportReleaseReportMarkdown,
  onCreateSession,
  onNavigateToCoach
}) => {
  const [createProvider, setCreateProvider] = useState<Provider>('OPENAI');
  const [createTitle, setCreateTitle] = useState('');

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
  const failedChecks = releaseReport?.readiness.checks.filter(check => !check.ok) ?? [];
  const sessionSummary = activeSession?.summary || activeSession?.lastMessagePreview || '当前会话的任务概览会显示在这里。';

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
        <input id="title" value={createTitle} onChange={e => setCreateTitle(e.target.value)} placeholder="例如：仓库结构分析" />
        <button className="primary create-btn" onClick={handleCreate}>
          <Plus size={16} />
          创建会话
        </button>
      </section>
      <section className="section workspace-context">
        <div className="section-heading">
          <CheckCircle2 size={16} />
          <h3>工作区上下文</h3>
        </div>
        <Card className="workspace-context-card">
          <CardContent>
            <div className="workspace-context-head">
              <span className={`scope-badge ${toolStatsScope === 'session' ? 'is-session' : 'is-global'}`}>
                {toolStatsScope === 'session' ? 'Session Scope' : 'Global Scope'}
              </span>
              {activeSession ? <span className="context-session-id">#{activeSession.id.slice(0, 8)}</span> : null}
            </div>
            <h4>{activeSession?.title || '尚未选择会话'}</h4>
            <p>{sessionSummary}</p>
            <div className="workspace-context-meta">
              <span>{activeSession?.provider || 'OPENAI'}</span>
              <span>{activeSession?.model || currentModelOption?.displayName || '等待会话'}</span>
              <span>{activeSession?.taskCount ? `${activeSession.taskCount} tasks` : hasActiveSession ? '1 active session' : '0 session'}</span>
            </div>
            {currentModelOption?.capabilities?.length ? (
              <div className="context-capability-list">
                {currentModelOption.capabilities.slice(0, 4).map(capability => (
                  <span key={capability} className="capability-chip">{capability}</span>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
      <section className="section tool-stats">
        <div className="section-heading">
          <Activity size={16} />
          <h3>工具统计</h3>
          <button className="icon-button stat-refresh" onClick={onRefreshToolStats} title="刷新统计" aria-label="刷新统计" disabled={toolStatsLoading}>
            <RefreshCw size={14} className={toolStatsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="stats-filter-row">
          <div className="stats-export-row">
            <button type="button" className="ghost stat-export-btn" onClick={onExportToolStatsJson} disabled={toolStatsLoading}>
              <Download size={13} />
              JSON
            </button>
            <button type="button" className="ghost stat-export-btn" onClick={onExportToolStatsMarkdown} disabled={toolStatsLoading}>
              <Download size={13} />
              MD
            </button>
            <button type="button" className="ghost stat-export-btn" onClick={onExportReleaseReportJson} disabled={toolStatsLoading}>
              <Download size={13} />
              巡检
            </button>
          </div>
          <div className="stats-segment">
            {[1, 24, 168].map(hours => (
              <button key={hours} type="button" className={toolStatsWindowHours === hours ? 'segment-btn active' : 'segment-btn'} onClick={() => onChangeToolStatsWindow(hours)} disabled={toolStatsLoading}>
                {hours === 168 ? '7天' : `${hours}小时`}
              </button>
            ))}
          </div>
          <div className="stats-segment">
            <button type="button" className={toolStatsScope === 'session' ? 'segment-btn active' : 'segment-btn'} onClick={() => onChangeToolStatsScope('session')} disabled={!hasActiveSession || toolStatsLoading}>
              当前会话
            </button>
            <button type="button" className={toolStatsScope === 'global' ? 'segment-btn active' : 'segment-btn'} onClick={() => onChangeToolStatsScope('global')} disabled={toolStatsLoading}>
              全局
            </button>
          </div>
        </div>
        {!toolStats || toolStats.totalRuns === 0 ? (
          <div className="empty-stats">
            <Zap size={24} />
            <p className="muted">最近 {toolStats?.windowHours ?? 24} 小时暂无工具调用数据</p>
          </div>
        ) : (
          <div className="tool-stats-panel">
            <div className="stats-kpis">
              <StatCard
                label="总调用"
                value={toolStats.totalRuns}
                icon={<TrendingUp size={16} />}
              />
              <StatCard
                label="成功率"
                value={`${toolStats.successRate}%`}
                icon={<Activity size={16} />}
                trend={toolStats.successRate >= 90 ? 'up' : 'neutral'}
                trendValue={toolStats.successRate >= 90 ? '良好' : '一般'}
              />
              <StatCard
                label="P95延迟"
                value={`${toolStats.p95DurationMs}ms`}
                icon={<Clock size={16} />}
              />
            </div>
            <Card className="stats-chart-card">
              <CardContent>
                <h4 className="chart-title">执行时长分布</h4>
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
              </CardContent>
            </Card>
            <Card className="stats-tools-card">
              <CardContent>
                <h4 className="chart-title">热门工具 TOP5</h4>
                <div className="tool-top-list">
                  {toolStats.topTools.slice(0, 5).map((tool, index) => (
                    <div key={tool.toolName} className="tool-top-item">
                      <div className="tool-rank">{index + 1}</div>
                      <span className="tool-name">{tool.toolName}</span>
                      <div className="tool-stats">
                        <span className="tool-runs">{tool.runs}次</span>
                        <span className="tool-success">{tool.successRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        <Card className="diagnostics-card">
          <CardContent>
            <div className="diagnostics-card-head">
              <h4 className="chart-title">诊断巡检</h4>
              {releaseReportLoading ? (
                <span className="diagnostics-state muted">更新中</span>
              ) : releaseReport?.readiness.ready ? (
                <span className="diagnostics-state diagnostics-ok">
                  <CheckCircle2 size={13} />
                  Ready
                </span>
              ) : (
                <span className="diagnostics-state diagnostics-warn">
                  <AlertTriangle size={13} />
                  {releaseReport ? 'Needs Attention' : 'Unavailable'}
                </span>
              )}
            </div>
            <div className="diagnostics-copy">
              <strong>
                {releaseReport
                  ? releaseReport.readiness.ready
                    ? '当前巡检全部通过'
                    : `${failedChecks.length} 项检查待处理`
                  : '后端未返回巡检摘要，仍可继续聊天与导出。'}
              </strong>
              <p>
                {releaseReport?.summary
                  || failedChecks[0]?.detail
                  || '使用右上导出按钮可获得完整 release report。'}
              </p>
            </div>
            {releaseReport?.readiness.checks?.length ? (
              <div className="diagnostics-check-list">
                {releaseReport.readiness.checks.slice(0, 3).map(check => (
                  <div key={check.name} className={`diagnostics-check ${check.ok ? 'ok' : 'warn'}`}>
                    {check.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    <span>{check.name}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="stats-export-row diagnostics-export-row">
              <button type="button" className="ghost stat-export-btn" onClick={onExportReleaseReportJson} disabled={toolStatsLoading}>
                <Download size={13} />
                巡检 JSON
              </button>
              <button type="button" className="ghost stat-export-btn" onClick={onExportReleaseReportMarkdown} disabled={toolStatsLoading}>
                <Download size={13} />
                巡检 MD
              </button>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  );
};
