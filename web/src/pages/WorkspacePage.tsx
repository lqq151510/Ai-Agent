import React, { useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Workspace } from '../components/Workspace';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useUiStore } from '../stores/uiStore';
import { defaultModel } from '../utils';
import { useSessionManager } from '../hooks/useSessionManager';
import { useChatActions } from '../hooks/useChatActions';
import { useChatStreaming } from '../hooks/useChatStreaming';
import { useWorkspaceDiagnostics } from '../hooks/useWorkspaceDiagnostics';

interface WorkspacePageProps {
  api: any;
  applyError: (raw: unknown) => string;
  onLogout: () => void;
  armRateLimitAutoRetry: (messageToRetry?: string) => void;
}

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  api,
  applyError,
  onLogout,
  armRateLimitAutoRetry,
}) => {
  const { user, tokens } = useAuthStore();
  const chat = useChatStore();
  const ui = useUiStore();
  const navigate = useNavigate();
  const { urlSessionId } = useParams<{ urlSessionId: string }>();

  const activeSession = useMemo(() => chat.sessions.find(s => s.id === chat.activeSessionId) ?? null, [chat.sessions, chat.activeSessionId]);
  const currentModelOption = useMemo(
    () =>
      activeSession
        ? ui.modelOptions.find(option => option.provider === activeSession.provider && option.model === activeSession.model) ?? null
        : null,
    [activeSession, ui.modelOptions]
  );

  const { refreshWorkspaceDiagnostics } = useWorkspaceDiagnostics(
    api, chat, ui, () => [{ provider: 'OPENAI', model: defaultModel('OPENAI'), isDefault: true }]
  );

  const { reloadSessions, onCreateSession, onSelectSession, selectSession } = useSessionManager(
    api, chat, ui, applyError, navigate, refreshWorkspaceDiagnostics
  );

  const {
    onExportSession,
    onExportToolStats,
    onExportReleaseReport,
    onSwitchFallbackSession
  } = useChatActions(api, chat, ui, activeSession, applyError, onCreateSession);

  const { sendMessage, onRetryLast } = useChatStreaming(
    api, chat, activeSession, ui.contextTokenLimit, applyError, armRateLimitAutoRetry, reloadSessions
  );

  useEffect(() => {
    if (!chat.rateLimitRetryArmed || chat.errorKind !== 'rate_limit' || !chat.lastFailedMessage) return;
    if (chat.rateLimitRetryInSec === null) {
      chat.setRateLimitRetryInSec(6); // RATE_LIMIT_AUTO_RETRY_SECONDS
      return;
    }
    if (chat.rateLimitRetryInSec <= 0) {
      chat.setRateLimitRetryArmed(false);
      chat.setRateLimitRetryInSec(null);
      void onRetryLast();
      return;
    }
    const timer = window.setTimeout(() => chat.setRateLimitRetryInSec(prev => (prev === null ? null : prev - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [chat.rateLimitRetryArmed, chat.rateLimitRetryInSec, chat.errorKind, chat.lastFailedMessage, onRetryLast]);

  useEffect(() => {
    if (!tokens || !user) return;
    if (urlSessionId) {
      if (urlSessionId !== chat.activeSessionId) {
        void selectSession(urlSessionId);
      }
    } else {
      if (chat.sessions.length > 0) {
        const targetId = chat.activeSessionId || chat.sessions[0].id;
        navigate(`/chat/sessions/${targetId}`, { replace: true });
      }
    }
  }, [urlSessionId, chat.sessions, tokens, user]);

  function onChangeContextTokenLimit(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      ui.setContextTokenLimit(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      return;
    }
    const normalized = Math.max(500, Math.min(32768, parsed));
    ui.setContextTokenLimit(normalized);
  }

  async function onPersistContextTokenLimit() {
    if (!chat.activeSessionId) {
      return;
    }
    try {
      const updated = await api.updateSessionContextTokenLimit(chat.activeSessionId, ui.contextTokenLimit ?? null);
      chat.setSessions(chat.sessions.map(session =>
        session.id === updated.id
          ? { ...session, contextTokenLimit: updated.contextTokenLimit ?? null }
          : session
      ));
    } catch (e) {
      applyError(e);
    }
  }

  return (
    <Workspace
      user={user}
      api={api}
      ui={ui}
      chat={chat}
      activeSession={activeSession}
      currentModelOption={currentModelOption}
      onLogout={onLogout}
      refreshWorkspaceDiagnostics={refreshWorkspaceDiagnostics}
      onExportToolStats={onExportToolStats}
      onExportReleaseReport={onExportReleaseReport}
      onCreateSession={onCreateSession}
      navigate={navigate}
      onSelectSession={onSelectSession}
      onSwitchFallbackSession={onSwitchFallbackSession}
      onRetryLast={onRetryLast}
      onExportSession={onExportSession}
      sendMessage={sendMessage}
      onChangeContextTokenLimit={onChangeContextTokenLimit}
      onPersistContextTokenLimit={onPersistContextTokenLimit}
      defaultModel={defaultModel}
    />
  );
};
