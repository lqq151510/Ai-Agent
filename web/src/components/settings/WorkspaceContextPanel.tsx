import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ModelOption, Session } from '../../types';
import { Card, CardContent } from '../Card';

export interface WorkspaceContextPanelProps {
  toolStatsScope: 'session' | 'global';
  hasActiveSession: boolean;
  activeSession: Session | null;
  currentModelOption: ModelOption | null;
  contextTokenLimit: number | null;
  onChangeContextTokenLimit: (rawValue: string) => void;
  onPersistContextTokenLimit: () => void;
}

export const WorkspaceContextPanel: React.FC<WorkspaceContextPanelProps> = ({
  toolStatsScope,
  hasActiveSession,
  activeSession,
  currentModelOption,
  contextTokenLimit,
  onChangeContextTokenLimit,
  onPersistContextTokenLimit,
}) => {
  const sessionSummary = activeSession?.summary || activeSession?.lastMessagePreview || '当前会话的任务概览会显示在这里。';

  return (
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
          <label htmlFor="contextTokenLimit">上下文Token上限</label>
          <input
            id="contextTokenLimit"
            type="number"
            min={500}
            max={32768}
            value={contextTokenLimit ?? ''}
            onChange={e => onChangeContextTokenLimit(e.target.value)}
            onBlur={onPersistContextTokenLimit}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            placeholder="留空使用系统默认"
          />
          <p className="muted">可选范围 500 - 32768，留空则按系统默认配置。</p>
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
  );
};
