import React, { useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Download, RefreshCw, TrendingUp, Zap } from 'lucide-react';
import type { ReleaseReportResponse, ToolStatsResponse } from '../../types';
import { Card, CardContent, StatCard } from '../Card';

export interface ToolStatsDiagnosticsProps {
  toolStats: ToolStatsResponse | null;
  toolStatsLoading: boolean;
  releaseReport: ReleaseReportResponse | null;
  releaseReportLoading: boolean;
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
}

export const ToolStatsDiagnostics: React.FC<ToolStatsDiagnosticsProps> = ({
  toolStats,
  toolStatsLoading,
  releaseReport,
  releaseReportLoading,
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
}) => {
  const failedChecks = releaseReport?.readiness.checks.filter(check => !check.ok) ?? [];

  const maxBucketCount = useMemo(() => {
    if (!toolStats || toolStats.durationBuckets.length === 0) {
      return 1;
    }
    return Math.max(...toolStats.durationBuckets.map(bucket => bucket.count), 1);
  }, [toolStats]);

  return (
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
  );
};
