import { Session, ModelOption } from '../types';
import { Settings } from './Settings';
import { ChatList } from './ChatList';
import { MessageContainer } from './MessageContainer';

interface WorkspaceProps {
  user: any;
  api: any;
  ui: any;
  chat: any;
  activeSession: Session | null;
  currentModelOption: ModelOption | null;
  onLogout: () => void;
  refreshWorkspaceDiagnostics: (client: any, options: any) => void;
  onExportToolStats: (format: 'json' | 'markdown') => void;
  onExportReleaseReport: (format: 'json' | 'markdown') => void;
  onCreateSession: (provider: any, model: string, title?: string, contextTokenLimit?: number | null) => void;
  navigate: any;
  onSelectSession: (sessionId: string) => void;
  onSwitchFallbackSession: (defaultModel: any) => void;
  onRetryLast: () => void;
  onExportSession: (format: 'json' | 'markdown') => void;
  sendMessage: (msg: string) => void;
  onChangeContextTokenLimit: (rawValue: string) => void;
  onPersistContextTokenLimit: () => void;
  defaultModel: any;
}

export function Workspace({
  user, api, ui, chat, activeSession, currentModelOption,
  onLogout, refreshWorkspaceDiagnostics, onExportToolStats,
  onExportReleaseReport, onCreateSession, navigate,
  onSelectSession, onSwitchFallbackSession, onRetryLast,
  onExportSession, sendMessage, onChangeContextTokenLimit, onPersistContextTokenLimit, defaultModel
}: WorkspaceProps) {
  const sessionCount = chat.sessions.length;
  const readinessLabel = ui.releaseReportLoading
    ? '巡检中'
    : ui.releaseReport?.readiness?.ready
      ? 'Ready'
      : ui.releaseReport
        ? 'Attention'
        : 'Standby';

  return (
    <div className="workspace-shell">
      <header className="workspace-chrome">
        <div className="chrome-brand">
          <span className="chrome-mark">AJ</span>
          <div>
            <strong>AI + Java Dev Coach</strong>
            <span>Agent workspace / RAG cockpit</span>
          </div>
        </div>
        <nav className="chrome-nav" aria-label="主工作区">
          <button type="button" className="chrome-nav-item active">工作台</button>
          <button type="button" className="chrome-nav-item" onClick={() => navigate('/coach')}>开发陪跑器</button>
        </nav>
        <div className="chrome-status-grid" aria-label="工作区状态">
          <span><b>{sessionCount}</b> 会话</span>
          <span><b>{ui.toolStats?.successRate ?? '--'}%</b> 工具成功率</span>
          <span className={readinessLabel === 'Attention' ? 'is-warn' : 'is-ok'}><b>{readinessLabel}</b> 巡检</span>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar panel">
          <Settings
            userEmail={user!.email}
            onLogout={onLogout}
            modelOptions={ui.modelOptions}
            toolStats={ui.toolStats}
            toolStatsLoading={ui.toolStatsLoading}
            releaseReport={ui.releaseReport}
            releaseReportLoading={ui.releaseReportLoading}
            toolStatsWindowHours={ui.toolStatsWindowHours}
            toolStatsScope={ui.toolStatsScope}
            contextTokenLimit={ui.contextTokenLimit}
            hasActiveSession={!!chat.activeSessionId}
            activeSession={activeSession}
            currentModelOption={currentModelOption}
            onRefreshToolStats={() => { void refreshWorkspaceDiagnostics(api, { sessionId: chat.activeSessionId || undefined }); }}
            onChangeToolStatsWindow={hours => { ui.setToolStatsWindowHours(hours); void refreshWorkspaceDiagnostics(api, { windowHours: hours, sessionId: chat.activeSessionId || undefined }); }}
            onChangeToolStatsScope={scope => { ui.setToolStatsScope(scope); void refreshWorkspaceDiagnostics(api, { scope, sessionId: chat.activeSessionId || undefined }); }}
            onExportToolStatsJson={() => { void onExportToolStats('json'); }}
            onExportToolStatsMarkdown={() => { void onExportToolStats('markdown'); }}
            onExportReleaseReportJson={() => { void onExportReleaseReport('json'); }}
            onExportReleaseReportMarkdown={() => { void onExportReleaseReport('markdown'); }}
            onChangeContextTokenLimit={onChangeContextTokenLimit}
            onPersistContextTokenLimit={onPersistContextTokenLimit}
            onCreateSession={onCreateSession}
            onNavigateToCoach={() => navigate('/coach')}
          />
          <ChatList sessions={chat.sessions} activeSessionId={chat.activeSessionId} onSelectSession={onSelectSession} />
        </aside>
        <MessageContainer
          activeSession={activeSession}
          messages={chat.messages}
          prompt={chat.prompt}
          setPrompt={chat.setPrompt}
          sending={chat.sending}
          loading={chat.loading}
          error={chat.error}
          streamState={chat.streamState}
          exporting={chat.exporting}
          currentModelOption={currentModelOption}
          toolStats={ui.toolStats}
          toolStatsScope={ui.toolStatsScope}
          toolStatsLoading={ui.toolStatsLoading}
          releaseReport={ui.releaseReport}
          diagnosticsLoading={ui.releaseReportLoading}
          canRetry={!!chat.lastFailedMessage && !chat.sending && chat.errorKind !== 'rate_limit'}
          errorActionLabel={
            chat.errorKind === 'auth_expired'
              ? '重新登录'
              : chat.errorKind === 'model_unreachable'
              ? '切换备用模型'
              : chat.errorKind === 'rate_limit' && !!chat.lastFailedMessage
              ? chat.rateLimitRetryInSec && chat.rateLimitRetryInSec > 0
                ? `${chat.rateLimitRetryInSec}s后自动重试`
                : '立即重试'
              : undefined
          }
          onErrorAction={
            chat.errorKind === 'auth_expired'
              ? onLogout
              : chat.errorKind === 'model_unreachable'
              ? () => { void onSwitchFallbackSession(defaultModel); }
              : chat.errorKind === 'rate_limit' && !!chat.lastFailedMessage
              ? () => { chat.setRateLimitRetryArmed(false); chat.setRateLimitRetryInSec(null); void onRetryLast(); }
              : undefined
          }
          onExportJson={() => { void onExportSession('json'); }}
          onExportMarkdown={() => { void onExportSession('markdown'); }}
          onRetryLast={onRetryLast}
          onSendMessage={() => { void sendMessage(chat.prompt); }}
        />
      </div>
      <footer className="workspace-statusbar">
        <span>{activeSession ? `session://${activeSession.id.slice(0, 8)}` : 'session://none'}</span>
        <span>{currentModelOption?.displayName || currentModelOption?.model || activeSession?.model || 'model:auto'}</span>
        <span>{ui.contextTokenLimit ? `context:${ui.contextTokenLimit}` : 'context:default'}</span>
      </footer>
    </div>
  );
}
