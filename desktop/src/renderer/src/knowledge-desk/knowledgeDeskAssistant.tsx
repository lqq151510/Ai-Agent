import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Bot,
  CheckCircle2,
  Download,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  SendHorizontal,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  canExportLocalAssistantSession,
  canUseLocalAssistant,
  deleteLocalAssistantSession,
  exportLocalAssistantSession,
  listLocalAssistantMessages,
  listLocalAssistantSessions,
  sendLocalAssistantMessage,
  subscribeLocalAssistantStream,
  type LocalAssistantMessage,
  type LocalAssistantSession,
  type ModelProvider,
} from './knowledgeDeskApi';
import { EmptyBlock } from './knowledgeDeskShared';

type LocalAssistantPageProps = {
  defaultModelSourceId?: string | null;
  initialDraft?: { id: number; text: string } | null;
  modelProviders: ModelProvider[];
  onConsumeInitialDraft?: (id: number) => void;
  onOpenModelSettings: () => void;
  onSaveAssistantMessage?: (message: LocalAssistantMessage) => Promise<void>;
};

type ActiveStream = {
  requestId: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
};

const isUsableLocalModel = (provider: ModelProvider) => (
  provider.providerType === 'local_compatible'
  && provider.enabled
  && provider.lastCheckStatus === 'ok'
  && provider.model.trim().length > 0
);

const localTitleFromMessage = (message: string) => (
  message.replace(/\s+/g, ' ').trim().slice(0, 120) || '新对话'
);

const sessionTime = (value?: string) => {
  if (!value) return '';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '';
  return time.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

export const LocalAssistantPage = ({
  defaultModelSourceId,
  initialDraft,
  modelProviders,
  onConsumeInitialDraft,
  onOpenModelSettings,
  onSaveAssistantMessage,
}: LocalAssistantPageProps) => {
  const bridgeAvailable = canUseLocalAssistant();
  const exportAvailable = canExportLocalAssistantSession();
  const availableModels = useMemo(
    () => modelProviders.filter(isUsableLocalModel),
    [modelProviders],
  );
  const [selectedModelSourceId, setSelectedModelSourceId] = useState('');
  const [sessions, setSessions] = useState<LocalAssistantSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalAssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(() => new Set());
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const activeStreamRef = useRef<ActiveStream | null>(null);
  const pendingMessageIdsRef = useRef<Pick<ActiveStream, 'userMessageId' | 'assistantMessageId'> | null>(null);
  const messageLoadRequestRef = useRef(0);
  const appliedDraftSeedRef = useRef<number | null>(null);

  const selectedModel = availableModels.find((provider) => provider.id === selectedModelSourceId) ?? null;

  useEffect(() => {
    setSelectedModelSourceId((current) => {
      if (current && availableModels.some((provider) => provider.id === current)) return current;
      if (defaultModelSourceId && availableModels.some((provider) => provider.id === defaultModelSourceId)) {
        return defaultModelSourceId;
      }
      return availableModels[0]?.id ?? '';
    });
  }, [availableModels, defaultModelSourceId]);

  useEffect(() => {
    if (
      !initialDraft
      || !bridgeAvailable
      || availableModels.length === 0
      || isSending
      || appliedDraftSeedRef.current === initialDraft.id
    ) {
      return;
    }
    appliedDraftSeedRef.current = initialDraft.id;
    messageLoadRequestRef.current += 1;
    setActiveSessionId(null);
    setMessages([]);
    setDraft(initialDraft.text.slice(0, 8_000));
    setError(null);
    onConsumeInitialDraft?.(initialDraft.id);
  }, [availableModels.length, bridgeAvailable, initialDraft, isSending, onConsumeInitialDraft]);

  const loadMessages = useCallback(async (sessionId: string, showLoading = true) => {
    const requestId = messageLoadRequestRef.current + 1;
    messageLoadRequestRef.current = requestId;
    if (showLoading) setIsLoadingMessages(true);
    try {
      const nextMessages = await listLocalAssistantMessages(sessionId);
      if (messageLoadRequestRef.current !== requestId) return;
      setMessages(nextMessages);
    } catch (loadError) {
      if (messageLoadRequestRef.current !== requestId) return;
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      if (messageLoadRequestRef.current === requestId && showLoading) {
        setIsLoadingMessages(false);
      }
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!bridgeAvailable) return [];
    setIsLoadingSessions(true);
    try {
      const nextSessions = await listLocalAssistantSessions();
      setSessions(nextSessions);
      setActiveSessionId((current) => (
        current && nextSessions.some((session) => session.id === current)
          ? current
          : nextSessions[0]?.id ?? null
      ));
      return nextSessions;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      return [];
    } finally {
      setIsLoadingSessions(false);
    }
  }, [bridgeAvailable]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!bridgeAvailable || !activeSessionId || activeStreamRef.current?.sessionId === activeSessionId) {
      if (!activeSessionId) setMessages([]);
      return;
    }
    void loadMessages(activeSessionId);
  }, [activeSessionId, bridgeAvailable, loadMessages]);

  useEffect(() => {
    if (!bridgeAvailable) return undefined;
    return subscribeLocalAssistantStream((event) => {
      if (event.type === 'started') {
        const pending = pendingMessageIdsRef.current;
        if (!pending) return;
        activeStreamRef.current = {
          requestId: event.requestId,
          sessionId: event.sessionId,
          ...pending,
        };
        setActiveSessionId(event.sessionId);
        return;
      }

      const activeStream = activeStreamRef.current;
      if (!activeStream || activeStream.requestId !== event.requestId) return;

      if (event.type === 'chunk') {
        const chunk = event.chunk ?? '';
        setMessages((current) => current.map((message) => (
          message.id === activeStream.assistantMessageId
            ? { ...message, content: `${message.content}${chunk}`, pending: true }
            : message
        )));
        return;
      }

      if (event.type === 'done') {
        setMessages((current) => current.map((message) => (
          message.id === activeStream.assistantMessageId
            ? {
              ...message,
              content: event.reply || message.content || '本机模型没有返回文本。',
              pending: false,
            }
            : message
        )));
        activeStreamRef.current = null;
        pendingMessageIdsRef.current = null;
        setIsSending(false);
        void refreshSessions();
        void loadMessages(event.sessionId, false);
        return;
      }

      setError(event.message || '本机模型暂时无法响应。');
      setMessages((current) => current.filter((message) => (
        message.id !== activeStream.assistantMessageId || message.content.trim().length > 0
      )));
      activeStreamRef.current = null;
      pendingMessageIdsRef.current = null;
      setIsSending(false);
      void refreshSessions();
      void loadMessages(event.sessionId, false);
    });
  }, [bridgeAvailable, loadMessages, refreshSessions]);

  const startNewConversation = () => {
    if (isSending) return;
    messageLoadRequestRef.current += 1;
    setActiveSessionId(null);
    setMessages([]);
    setDraft('');
    setError(null);
    setExportMessage(null);
  };

  const selectSession = (sessionId: string) => {
    if (isSending || sessionId === activeSessionId) return;
    setError(null);
    setExportMessage(null);
    setActiveSessionId(sessionId);
  };

  const deleteSession = async (sessionId: string) => {
    if (isSending) return;
    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (!window.confirm(`删除“${session?.title ?? '这条对话'}”及其消息记录吗？此操作无法撤销。`)) return;

    setError(null);
    try {
      await deleteLocalAssistantSession(sessionId);
      const remaining = sessions.filter((candidate) => candidate.id !== sessionId);
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        messageLoadRequestRef.current += 1;
        setActiveSessionId(remaining[0]?.id ?? null);
        setMessages([]);
        setExportMessage(null);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const exportSession = async () => {
    if (!activeSessionId || isSending || isExporting) return;
    setError(null);
    setExportMessage(null);
    setIsExporting(true);
    try {
      const result = await exportLocalAssistantSession(activeSessionId);
      if (!result.canceled) {
        setExportMessage('已导出为 Markdown。');
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setIsExporting(false);
    }
  };

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || isSending) return;
    if (!selectedModel) {
      setError('请先在个人中心测试并选择一个本机模型。');
      return;
    }

    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userMessageId = `pending-user-${nonce}`;
    const assistantMessageId = `pending-assistant-${nonce}`;
    pendingMessageIdsRef.current = { userMessageId, assistantMessageId };
    setError(null);
    setExportMessage(null);
    setDraft('');
    setIsSending(true);
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: 'user', content: message, pending: true },
      { id: assistantMessageId, role: 'assistant', content: '', pending: true },
    ]);

    try {
      const sent = await sendLocalAssistantMessage({
        message,
        sessionId: activeSessionId ?? undefined,
        modelSourceId: selectedModel.id,
        model: selectedModel.model,
      });
      if (!activeStreamRef.current || activeStreamRef.current.requestId !== sent.requestId) {
        activeStreamRef.current = {
          requestId: sent.requestId,
          sessionId: sent.sessionId,
          userMessageId,
          assistantMessageId,
        };
      }
      setActiveSessionId(sent.sessionId);
      if (sent.isNewSession) {
        setSessions((current) => [
          {
            id: sent.sessionId,
            title: localTitleFromMessage(message),
            model: selectedModel.model,
          },
          ...current.filter((session) => session.id !== sent.sessionId),
        ]);
      }
    } catch (sendError) {
      setMessages((current) => current.filter((item) => (
        item.id !== userMessageId && item.id !== assistantMessageId
      )));
      pendingMessageIdsRef.current = null;
      activeStreamRef.current = null;
      setIsSending(false);
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    }
  };

  const onDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void sendMessage();
  };

  const saveAssistantMessage = async (message: LocalAssistantMessage) => {
    if (!onSaveAssistantMessage || message.pending || savingMessageId || savedMessageIds.has(message.id)) return;
    setSavingMessageId(message.id);
    setError(null);
    try {
      await onSaveAssistantMessage(message);
      setSavedMessageIds((current) => new Set(current).add(message.id));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingMessageId(null);
    }
  };

  if (!bridgeAvailable) {
    return (
      <div className="kd-assistant-page">
        <EmptyBlock
          action={{ label: '打开个人中心', onClick: onOpenModelSettings }}
          description="浏览器预览不会连接模型或伪造本机对话。请从桌面端启动知识工作台。"
          icon={MessageCircle}
          title="本机助手仅在桌面端可用"
        />
      </div>
    );
  }

  if (availableModels.length === 0) {
    return (
      <div className="kd-assistant-page">
        <EmptyBlock
          action={{ label: '配置本机模型', onClick: onOpenModelSettings }}
          description="先在个人中心添加并测试本机兼容模型。助手只会使用已保存且测试通过的模型配置。"
          icon={Settings2}
          title="还没有可用的本机模型"
        />
      </div>
    );
  }

  return (
    <div className="kd-assistant-page">
      <header className="kd-assistant-hero">
        <div>
          <p>本机助手</p>
          <h2>把阅读、想法和待办留在同一个私有工作台。</h2>
          <span><ShieldCheck size={14} /> 仅使用已保存的本机模型；不读取文件、不执行命令。</span>
        </div>
        <div className="kd-assistant-hero-actions">
          <label className="kd-assistant-model-select">
            <span>当前模型</span>
            <select
              aria-label="选择本机模型"
              onChange={(event) => setSelectedModelSourceId(event.target.value)}
              value={selectedModelSourceId}
            >
              {availableModels.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.provider} · {provider.model}</option>
              ))}
            </select>
          </label>
          <button className="kd-secondary-button" onClick={onOpenModelSettings} type="button">
            <Settings2 size={16} /> 管理模型
          </button>
        </div>
      </header>

      <div className="kd-assistant-layout">
        <aside className="kd-assistant-sessions" aria-label="本机助手对话列表">
          <div className="kd-assistant-sessions-header">
            <div>
              <span>对话记录</span>
              <strong>{sessions.length} 条</strong>
            </div>
            <button aria-label="新建对话" className="kd-icon-button" disabled={isSending} onClick={startNewConversation} type="button">
              <Plus size={17} />
            </button>
          </div>
          <button className="kd-assistant-new" disabled={isSending} onClick={startNewConversation} type="button">
            <Plus size={16} /> 新对话
          </button>
          <div className="kd-assistant-session-list">
            {isLoadingSessions ? <div className="kd-assistant-loading"><Loader2 className="kd-spin" size={17} /> 正在读取…</div> : null}
            {!isLoadingSessions && sessions.length === 0 ? (
              <p className="kd-assistant-empty-list">第一条消息会自动保存成新对话。</p>
            ) : null}
            {sessions.map((session) => (
              <div className={`kd-assistant-session ${activeSessionId === session.id ? 'is-active' : ''}`} key={session.id}>
                <button disabled={isSending} onClick={() => selectSession(session.id)} type="button">
                  <strong>{session.title}</strong>
                  <span>{session.model}{sessionTime(session.updatedAt) ? ` · ${sessionTime(session.updatedAt)}` : ''}</span>
                </button>
                <button
                  aria-label={`删除对话：${session.title}`}
                  className="kd-assistant-session-delete"
                  disabled={isSending}
                  onClick={() => void deleteSession(session.id)}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="kd-assistant-conversation" aria-label="本机助手对话">
          <header className="kd-assistant-conversation-header">
            <div>
              <Bot size={18} />
              <div>
                <strong>{activeSessionId ? sessions.find((session) => session.id === activeSessionId)?.title ?? '当前对话' : '新对话'}</strong>
                <span>{selectedModel?.provider} · {selectedModel?.model}</span>
              </div>
            </div>
            <div className="kd-assistant-conversation-actions">
              {exportAvailable ? (
                <button
                  className="kd-secondary-button"
                  disabled={!activeSessionId || isLoadingMessages || isSending || isExporting}
                  onClick={() => void exportSession()}
                  type="button"
                >
                  {isExporting ? <Loader2 className="kd-spin" size={15} /> : <Download size={15} />}
                  {isExporting ? '导出中' : '导出 Markdown'}
                </button>
              ) : null}
              <button className="kd-secondary-button" disabled={!activeSessionId || isLoadingMessages || isSending} onClick={() => {
                if (activeSessionId) void loadMessages(activeSessionId);
              }} type="button">
                <RefreshCw size={15} /> 刷新
              </button>
            </div>
          </header>

          <div className="kd-assistant-messages" aria-live="polite">
            {isLoadingMessages ? <div className="kd-assistant-loading"><Loader2 className="kd-spin" size={18} /> 正在读取对话…</div> : null}
            {!isLoadingMessages && messages.length === 0 ? (
              <div className="kd-assistant-welcome">
                <MessageCircle size={24} />
                <strong>从一句话开始</strong>
                <span>例如：帮我把今天读到的内容整理成三个要点。</span>
              </div>
            ) : null}
            {messages.map((message) => (
              <article className={`kd-assistant-message kd-assistant-message--${message.role}`} key={message.id}>
                <span className="kd-assistant-message-role">{message.role === 'user' ? '你' : '本机助手'}</span>
                <p>{message.content || (message.pending ? '正在思考…' : '')}</p>
                {message.pending && message.role === 'assistant' ? <Loader2 className="kd-spin" size={14} /> : null}
                {message.role === 'assistant'
                  && !message.pending
                  && !message.id.startsWith('pending-assistant-')
                  && message.content.trim()
                  && onSaveAssistantMessage ? (
                  <div className="kd-assistant-message-actions">
                    <button
                      disabled={savingMessageId !== null || savedMessageIds.has(message.id)}
                      onClick={() => void saveAssistantMessage(message)}
                      type="button"
                    >
                      {savingMessageId === message.id
                        ? <Loader2 className="kd-spin" size={13} />
                        : savedMessageIds.has(message.id)
                          ? <CheckCircle2 size={13} />
                          : <BookmarkPlus size={13} />}
                      {savedMessageIds.has(message.id) ? '已收进知识库' : '收进知识库'}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {error ? <p className="kd-assistant-error" role="alert">{error}</p> : null}
          {exportMessage ? <p className="kd-assistant-export-message" role="status">{exportMessage}</p> : null}
          <div className="kd-assistant-composer">
            <textarea
              aria-label="向本机助手发送消息"
              disabled={isSending}
              maxLength={8000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onDraftKeyDown}
              placeholder="写下一个问题、想法，或需要整理的内容…"
              value={draft}
            />
            <div>
              <span>Enter 发送 · Shift + Enter 换行</span>
              <button className="kd-primary-button" disabled={!draft.trim() || isSending} onClick={() => void sendMessage()} type="button">
                {isSending ? <Loader2 className="kd-spin" size={16} /> : <SendHorizontal size={16} />}
                {isSending ? '生成中' : '发送'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
