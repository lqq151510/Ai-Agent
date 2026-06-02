import type { ReleaseReportResponse, Session, ToolStatsResponse } from './types.js';

export function formatSessions(sessions: Session[], activeSessionId?: string): string {
  if (sessions.length === 0) {
    return 'No sessions.';
  }

  return sessions
    .map(session => {
      const marker = session.id === activeSessionId ? '*' : ' ';
      return `${marker} ${session.id} | ${session.title} | ${session.provider}/${session.model}`;
    })
    .join('\n');
}

export function formatToolStatsSummary(stats: ToolStatsResponse): string {
  const lines = [
    `[tool-stats] window=${stats.windowHours}h total=${stats.totalRuns} success=${stats.successRuns} failed=${stats.failedRuns} successRate=${stats.successRate}% avg=${stats.averageDurationMs}ms p95=${stats.p95DurationMs}ms`,
  ];

  if (stats.durationBuckets.length > 0) {
    lines.push('duration buckets:');
    lines.push(...stats.durationBuckets.map(bucket => `- ${bucket.label}: ${bucket.count}`));
  }

  if (stats.topTools.length > 0) {
    lines.push('top tools:');
    lines.push(
      ...stats.topTools.map(
        tool =>
          `- ${tool.toolName} | runs=${tool.runs} | success=${tool.successRate}% | avg=${tool.averageDurationMs}ms | p95=${tool.p95DurationMs}ms`,
      ),
    );
  }

  return lines.join('\n');
}

export function formatReleaseReportSummary(report: ReleaseReportResponse): string {
  const lines = [
    `[release-report] window=${report.windowHours}h generatedAt=${report.generatedAt}`,
    `readiness: ready=${report.readiness.ready}`,
    `models: default=${report.models.defaultProvider}/${report.models.defaultModel}`,
    `toolStats: total=${report.toolStats.totalRuns} successRate=${report.toolStats.successRate}% p95=${report.toolStats.p95DurationMs}ms`,
  ];

  if (report.toolStats.topTools.length > 0) {
    lines.push('top tools:');
    lines.push(
      ...report.toolStats.topTools.map(
        tool => `- ${tool.toolName} | runs=${tool.runs} | success=${tool.successRate}%`,
      ),
    );
  }

  return lines.join('\n');
}
