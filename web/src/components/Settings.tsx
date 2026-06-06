import React from 'react';
import type { ModelOption, Provider, ReleaseReportResponse, Session, ToolStatsResponse } from '../types';
import { LogOut, Zap } from 'lucide-react';
import { NewSessionForm } from './settings/NewSessionForm';
import { WorkspaceContextPanel } from './settings/WorkspaceContextPanel';
import { ToolStatsDiagnostics } from './settings/ToolStatsDiagnostics';

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
  contextTokenLimit: number | null;
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
  onChangeContextTokenLimit: (rawValue: string) => void;
  onPersistContextTokenLimit: () => void;
  onCreateSession: (provider: Provider, model: string, title?: string, contextTokenLimit?: number | null) => void;
  onNavigateToCoach: () => void;
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
  contextTokenLimit,
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
  onChangeContextTokenLimit,
  onPersistContextTokenLimit,
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

      <WorkspaceContextPanel
        toolStatsScope={toolStatsScope}
        hasActiveSession={hasActiveSession}
        activeSession={activeSession}
        currentModelOption={currentModelOption}
        contextTokenLimit={contextTokenLimit}
        onChangeContextTokenLimit={onChangeContextTokenLimit}
        onPersistContextTokenLimit={onPersistContextTokenLimit}
      />

      <ToolStatsDiagnostics
        toolStats={toolStats}
        toolStatsLoading={toolStatsLoading}
        releaseReport={releaseReport}
        releaseReportLoading={releaseReportLoading}
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
    </>
  );
};
