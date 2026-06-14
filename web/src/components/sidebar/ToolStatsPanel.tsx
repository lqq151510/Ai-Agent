import React, { useMemo } from 'react';
import { Activity, Download, RefreshCw } from 'lucide-react';
import type { ToolStatsResponse } from '../../types';

interface ToolStatsPanelProps {
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
}

export const ToolStatsPanel: React.FC<ToolStatsPanelProps> = ({
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
}) => {
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
  );
};
