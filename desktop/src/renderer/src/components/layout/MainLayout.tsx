import { useState, useCallback, useEffect, useRef } from 'react';
import { SessionList } from './SessionList';
import { ChatArea } from './ChatArea';
import { ContextPanel } from './ContextPanel';
import { PlanApprovalDialog } from './PlanApprovalDialog';
import { ThreadTabs } from './ThreadTabs';
import { ReviewPanel } from '../review/ReviewPanel';
import { SkillsPanel } from '../skills/SkillsPanel';
import { ComputerUsePanel } from '../computer-use/ComputerUsePanel';

// --------------- Types ---------------

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  branch: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system' | 'error';
  content: string;
  time: string;
}

interface ThreadSummary {
  id: string;
  name: string;
  status: string;
  mode: string;
  branch: string;
  projectName: string;
  updatedAt: number;
}

type StreamState = {
  requestId: string;
  sessionId: string;
  assistantMessageId: string;
} | null;

type TaskStreamState = {
  taskId: string;
  assistantMessageId: string;
} | null;

// --------------- Component ---------------

export function MainLayout() {
  // ---- Existing state ----
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [computerOpen, setComputerOpen] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>(null);
  const [taskStreamState, setTaskStreamState] = useState<TaskStreamState>(null);
  const [pendingPlan, setPendingPlan] = useState<{ taskId: string; content: string } | null>(null);

  // ---- Thread state (Phase 1 multi-agent) ----
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [creatingThread, setCreatingThread] = useState(false);
  const streamStateRef = useRef<StreamState>(null);
  const pendingAssistantMessageIdRef = useRef<string | null>(null);

  // ---- Init ----

  useEffect(() => {
    refreshSessions();
    refreshThreads();
    // Update skill scan paths when workspace changes
    if (workspacePath) {
      window.electronAPI?.skill?.setProjectPaths(workspacePath, workspacePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath]);

  useEffect(() => {
    refreshSessions();
    refreshThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshSessions = useCallback(async () => {
    const data = await window.electronAPI?.invoke('chat:get-sessions');
    if (Array.isArray(data)) {
      setSessions(data);
    }
  }, []);

  const refreshThreads = useCallback(async () => {
    const data = await window.electronAPI?.thread?.list();
    if (Array.isArray(data)) {
      setThreads(data);
    }
  }, []);

  const handleToolStreamEvent = useCallback(async (event: any) => {
    const type = String(event.type || '');
    const data = event.data || {};
    const description = event.message || data.message || data.toolName || 'tool';

    if (type === 'tool:awaiting-approval') {
      setMessages(prev => [
        ...prev,
        {
          id: `tool-approval-${Date.now()}`,
          role: 'system',
          content: `工具请求审批: ${description}`,
          time: new Date().toLocaleTimeString(),
        },
      ]);

      const toolCall = data.toolCall || {};
      const approved = window.confirm(`允许执行工具？\n${description}`);
      if (approved) {
        const result = await window.electronAPI?.tool?.approve({
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          arguments: toolCall.arguments || {},
          threadId: data.threadId,
        });
        setMessages(prev => [
          ...prev,
          {
            id: `tool-approved-${Date.now()}`,
            role: result?.status === 'error' ? 'error' : 'system',
            content: result?.status === 'error'
              ? `工具执行失败: ${result.output || 'unknown error'}`
              : `工具已执行: ${data.toolName}`,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      } else {
        await window.electronAPI?.tool?.reject({ toolCallId: data.toolCallId });
        setMessages(prev => [
          ...prev,
          {
            id: `tool-rejected-${Date.now()}`,
            role: 'system',
            content: `已拒绝工具: ${data.toolName}`,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      }
      return;
    }

    if (type === 'tool:done') {
      setMessages(prev => [
        ...prev,
        {
          id: `tool-done-${Date.now()}`,
          role: 'system',
          content: `工具已完成: ${data.toolName}`,
          time: new Date().toLocaleTimeString(),
        },
      ]);
      return;
    }

    if (type === 'tool:error') {
      setMessages(prev => [
        ...prev,
        {
          id: `tool-error-${Date.now()}`,
          role: 'error',
          content: `工具失败: ${description}`,
          time: new Date().toLocaleTimeString(),
        },
      ]);
    }
  }, []);

  // Listen for thread events pushed from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI?.thread?.onEvent?.((_thread: any) => {
      void refreshThreads();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [refreshThreads]);

  useEffect(() => {
    streamStateRef.current = streamState;
  }, [streamState]);

  // ---- Stream event handling (same as original) ----

  useEffect(() => {
    const unsubscribe = window.electronAPI?.chat?.onStreamEvent?.((event: any) => {
      const eventType = String(event.type || '');
      const currentStream = streamStateRef.current;
      if (eventType === 'started' && !currentStream && pendingAssistantMessageIdRef.current) {
        setActiveSessionId(event.sessionId);
        setStreamState({
          requestId: event.requestId,
          sessionId: event.sessionId,
          assistantMessageId: pendingAssistantMessageIdRef.current,
        });
        return;
      }

      if (eventType.startsWith('tool:') && currentStream?.requestId === event.requestId) {
        void handleToolStreamEvent(event);
        return;
      }

      setStreamState(current => {
        if (!current || current.requestId !== event.requestId) {
          return current;
        }

        if (event.type === 'chunk') {
          setMessages(prev =>
            prev.map(message =>
              message.id === current.assistantMessageId
                ? { ...message, content: `${message.content}${event.chunk ?? ''}` }
                : message,
            ),
          );
          return current;
        }

        if (event.type === 'done') {
          const reply = typeof event.reply === 'string' ? event.reply : '';
          pendingAssistantMessageIdRef.current = null;
          setMessages(prev =>
            prev.map(message =>
              message.id === current.assistantMessageId
                ? { ...message, content: reply || message.content || '已完成，但无文本输出。' }
                : message,
            ),
          );
          void refreshSessions();
          return null;
        }

        if (event.type === 'error') {
          pendingAssistantMessageIdRef.current = null;
          setMessages(prev =>
            prev.map(message =>
              message.id === current.assistantMessageId
                ? { ...message, role: 'error', content: event.message || '流式请求失败' }
                : message,
            ),
          );
          return null;
        }

        return current;
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [handleToolStreamEvent, refreshSessions]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.agent?.onTaskEvent?.((event: any) => {
      setTaskStreamState(current => {
        if (!current || current.taskId !== event.taskId) {
          return current;
        }

        if (event.type === 'CHUNK') {
          setMessages(prev =>
            prev.map(message =>
              message.id === current.assistantMessageId
                ? { ...message, content: `${message.content}${event.content ?? ''}` }
                : message,
            ),
          );
          return current;
        }

        if (event.type === 'PLAN_GENERATED') {
          setPendingPlan({ taskId: event.taskId, content: event.content ?? '' });
          setMessages(prev => [
            ...prev,
            {
              id: `system-plan-${Date.now()}`,
              role: 'system',
              content: '检测到执行计划，等待审批。',
              time: new Date().toLocaleTimeString(),
            },
          ]);
          return current;
        }

        if (event.type === 'DONE') {
          setMessages(prev =>
            prev.map(message =>
              message.id === current.assistantMessageId
                ? { ...message, content: event.content || message.content || '任务执行完成。' }
                : message,
            ),
          );
          setPendingPlan(null);
          return null;
        }

        if (event.type === 'ERROR') {
          setMessages(prev =>
            prev.map(message =>
              message.id === current.assistantMessageId
                ? { ...message, role: 'error', content: event.content || '任务执行失败。' }
                : message,
            ),
          );
          setPendingPlan(null);
          return null;
        }

        return current;
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // ---- Session handlers (existing) ----

  const handleSelectSession = useCallback(async (id: string) => {
    setActiveSessionId(id);
    const session = await window.electronAPI?.invoke('chat:get-session', id);
    if (session) {
      setMessages(session.messages || []);
    }
  }, []);

  const handleNewSession = useCallback(async () => {
    const session = await window.electronAPI?.invoke('chat:create-session', 'main');
    if (session) {
      setSessions(prev => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([]);
      void refreshSessions();
    }
  }, [refreshSessions]);

  // ---- Thread handlers (Phase 1 new) ----

  const handleCreateThread = useCallback(async () => {
    if (creatingThread) return;
    if (!workspacePath) {
      // If no workspace selected, prompt user to select one first
      alert('请先选择一个工作区目录');
      return;
    }

    setCreatingThread(true);
    try {
      const name = `thread-${Date.now() % 100000}`;
      const thread = await window.electronAPI?.thread?.create({
        name,
        projectPath: workspacePath,
        mode: 'worktree',
      });
      if (thread?.id) {
        setActiveThreadId(thread.id);
        // Create a backend session for the thread
        const session = await window.electronAPI?.invoke('chat:create-session', thread.branch);
        if (session) {
          setSessions(prev => [session, ...prev]);
          setActiveSessionId(session.id);
          setMessages([]);
        }
        void refreshThreads();
      }
    } catch (err) {
      console.error('[main-layout] failed to create thread:', err);
    } finally {
      setCreatingThread(false);
    }
  }, [workspacePath, creatingThread, refreshThreads]);

  const handleSwitchThread = useCallback(async (id: string) => {
    setActiveThreadId(id);
    await window.electronAPI?.thread?.switch(id);

    // Update workspace to match the thread's project
    const threadDetail = await window.electronAPI?.thread?.get(id);
    if (threadDetail?.projectPath) {
      setWorkspacePath(threadDetail.projectPath);
    }
    if (threadDetail?.backendSession?.id) {
      const session = await window.electronAPI?.invoke('chat:get-session', threadDetail.backendSession.id);
      if (session) {
        setActiveSessionId(session.id);
        setMessages(session.messages || []);
      } else {
        setActiveSessionId(null);
        setMessages([]);
      }
    }
    void refreshSessions();
  }, []);

  const handleCloseThread = useCallback(async (id: string) => {
    await window.electronAPI?.thread?.remove(id);
    if (activeThreadId === id) {
      setActiveThreadId(null);
      setActiveSessionId(null);
      setMessages([]);
    }
    void refreshThreads();
  }, [activeThreadId, refreshThreads]);

  // ---- Chat handlers (existing, unchanged) ----

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streamState || taskStreamState) return;

    const now = new Date().toLocaleTimeString();
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      time: now,
    };
    const assistantMsg: ChatMessage = {
      id: `agent-${Date.now()}`,
      role: 'agent',
      content: '',
      time: now,
    };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    pendingAssistantMessageIdRef.current = assistantMsg.id;

    try {
      const result = await window.electronAPI?.chat?.streamWithContext({
        message: text,
        workspacePath: workspacePath ?? undefined,
        selectedFiles,
        sessionId: activeSessionId ?? undefined,
      });
      if (!result?.requestId || !result?.sessionId) {
        throw new Error('stream request did not return identifiers');
      }
      setActiveSessionId(result.sessionId);
      setStreamState({
        requestId: result.requestId,
        sessionId: result.sessionId,
        assistantMessageId: assistantMsg.id,
      });
    } catch (err) {
      pendingAssistantMessageIdRef.current = null;
      setMessages(prev =>
        prev.map(message =>
          message.id === assistantMsg.id
            ? {
                ...message,
                role: 'error',
                content: `发送失败: ${err instanceof Error ? err.message : String(err)}`,
              }
            : message,
        ),
      );
      setStreamState(null);
    }
  }, [activeSessionId, workspacePath, selectedFiles, streamState, taskStreamState, refreshSessions]);

  const handleSubmitTask = useCallback(async (text: string) => {
    if (!text.trim() || streamState || taskStreamState) return;

    const now = new Date().toLocaleTimeString();
    const userMsg: ChatMessage = {
      id: `user-task-${Date.now()}`,
      role: 'user',
      content: `[计划执行]\n${text}`,
      time: now,
    };
    const assistantMsg: ChatMessage = {
      id: `task-${Date.now()}`,
      role: 'agent',
      content: '',
      time: now,
    };
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      const result = await window.electronAPI?.agent?.submitTask(text);
      if (!result?.taskId) {
        throw new Error('task request did not return taskId');
      }
      setTaskStreamState({
        taskId: result.taskId,
        assistantMessageId: assistantMsg.id,
      });
    } catch (err) {
      setMessages(prev =>
        prev.map(message =>
          message.id === assistantMsg.id
            ? {
                ...message,
                role: 'error',
                content: `任务启动失败: ${err instanceof Error ? err.message : String(err)}`,
              }
            : message,
        ),
      );
      setTaskStreamState(null);
    }
  }, [streamState, taskStreamState]);

  const handleApprovePlan = useCallback(async (approved: boolean) => {
    if (!pendingPlan) return;
    await window.electronAPI?.agent?.approvePlan(pendingPlan.taskId, approved);
    setMessages(prev => [
      ...prev,
      {
        id: `plan-${approved ? 'approve' : 'reject'}-${Date.now()}`,
        role: 'system',
        content: approved ? '已批准执行计划。' : '已拒绝执行计划。',
        time: new Date().toLocaleTimeString(),
      },
    ]);
    setPendingPlan(null);
  }, [pendingPlan]);

  // ---- Render ----

  return (
    <div className="main-layout">
      {/* Left: Session List + Thread list */}
      <aside className="main-layout__sidebar">
        {/* Threads section */}
        <div className="sidebar-section">
          <div className="sidebar-section__header">
            <span className="sidebar-section__title">线程</span>
            <button
              className="sidebar-section__action"
              onClick={() => void handleCreateThread()}
              disabled={creatingThread}
              title="新建线程"
            >
              + {creatingThread ? '...' : ''}
            </button>
          </div>
          {threads.length === 0 && (
            <div className="sidebar-section__empty">暂无线程</div>
          )}
          {threads.map(t => (
            <div
              key={t.id}
              className={`sidebar-item${t.id === activeThreadId ? ' sidebar-item--active' : ''}`}
              onClick={() => void handleSwitchThread(t.id)}
            >
              <span className="sidebar-item__dot" data-status={t.status} />
              <span className="sidebar-item__name">{t.name}</span>
              <span className="sidebar-item__branch">{t.branch}</span>
            </div>
          ))}
        </div>

        {/* Sessions (existing, below threads) */}
        <SessionList
          sessions={sessions}
          setSessions={setSessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      </aside>

      {/* Center: Chat Area + Terminal Tabs */}
      <main className="main-layout__chat">
        <ChatArea
          messages={messages}
          onSendMessage={handleSendMessage}
          onSubmitTask={handleSubmitTask}
          terminalOpen={terminalOpen}
          onToggleTerminal={() => setTerminalOpen(v => !v)}
          workspacePath={workspacePath}
          selectedFiles={selectedFiles}
          taskRunning={Boolean(taskStreamState)}
        />

        {/* Bottom terminal tabs bar */}
        <ThreadTabs
          threads={threads}
          activeThreadId={activeThreadId}
          terminalOpen={terminalOpen}
          onSwitchThread={handleSwitchThread}
          onCloseThread={handleCloseThread}
          onToggleTerminal={() => setTerminalOpen(v => !v)}
        />
      </main>

      {/* Right: Review / Skills toggle buttons */}
      <div className="review-toggle-bar">
        <button
          className={`review-toggle-bar__btn${reviewOpen ? ' active' : ''}`}
          onClick={() => { setReviewOpen(v => !v); setSkillsOpen(false); setComputerOpen(false); }}
          title="切换审查面板"
          disabled={!workspacePath}
        >
          {reviewOpen ? '✕ 审查' : '审查'}
        </button>
        <button
          className={`review-toggle-bar__btn${skillsOpen ? ' active' : ''}`}
          onClick={() => { setSkillsOpen(v => !v); setReviewOpen(false); setComputerOpen(false); }}
          title="切换技能面板"
        >
          {skillsOpen ? '✕ 技能' : '技能'}
        </button>
        <button
          className={`review-toggle-bar__btn${computerOpen ? ' active' : ''}`}
          onClick={() => { setComputerOpen(v => !v); setReviewOpen(false); setSkillsOpen(false); }}
          title="切换 Computer Use 面板"
        >
          {computerOpen ? '✕ 电脑' : '电脑'}
        </button>
      </div>

      {/* Right: Review Panel / Skills Panel / Context Panel */}
      <aside className="main-layout__context">
        {reviewOpen && workspacePath ? (
          <ReviewPanel
            projectPath={workspacePath}
            onClose={() => setReviewOpen(false)}
          />
        ) : skillsOpen ? (
          <SkillsPanel onClose={() => setSkillsOpen(false)} />
        ) : computerOpen ? (
          <ComputerUsePanel onClose={() => setComputerOpen(false)} />
        ) : (
          <ContextPanel
            workspacePath={workspacePath}
            onSelectWorkspace={setWorkspacePath}
            selectedFiles={selectedFiles}
            onToggleFile={(path) => {
              setSelectedFiles(prev =>
                prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
              );
            }}
          />
        )}
      </aside>

      {pendingPlan ? (
        <PlanApprovalDialog
          planJson={pendingPlan.content}
          onApprove={() => void handleApprovePlan(true)}
          onReject={() => void handleApprovePlan(false)}
        />
      ) : null}
    </div>
  );
}
