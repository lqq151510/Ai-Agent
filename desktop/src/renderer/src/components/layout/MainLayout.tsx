import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatArea } from './ChatArea';
import { ContextPanel } from './ContextPanel';
import { PlanApprovalDialog } from './PlanApprovalDialog';
import { ThreadTabs } from './ThreadTabs';
import { ReviewPanel } from '../review/ReviewPanel';
import { SkillsPanel } from '../skills/SkillsPanel';
import { ComputerUsePanel } from '../computer-use/ComputerUsePanel';
import { MessageSquarePlus, Search, Blocks, Activity, Settings } from 'lucide-react';
import { SettingsLayout } from '../SettingsLayout';

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

const formatRelativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins <= 0 ? 1 : mins} 分`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.floor(hours / 24);
  return `${days} 天`;
};

// --------------- Component ---------------

export function MainLayout() {
  // ---- Existing state ----
  const [showSettings, setShowSettings] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
    const activeProvider = localStorage.getItem('codex_active_provider') || 'deepseek';
    if (activeProvider === 'local') {
      setSelectedModel('Qwen-3.5-Local');
    } else if (activeProvider === 'openai') {
      setSelectedModel('GPT-4o');
    } else {
      setSelectedModel('DeepSeek-V4');
    }
  }, []);

  const handleModelChange = useCallback((newModel: string) => {
    setSelectedModel(newModel);
    let provider = 'deepseek';
    if (newModel === 'Qwen-3.5-Local') {
      provider = 'local';
    } else if (newModel === 'GPT-4o') {
      provider = 'openai';
    } else if (newModel === 'DeepSeek-V4') {
      provider = 'deepseek';
    }
    localStorage.setItem('codex_active_provider', provider);
  }, []);

  // 初始化时加载并注入用户自定义的强调色及背景主题色
  useEffect(() => {
    const lightAccent = localStorage.getItem('codex_light_accent');
    const lightBg = localStorage.getItem('codex_light_bg');
    const lightFg = localStorage.getItem('codex_light_fg');

    if (lightAccent) document.documentElement.style.setProperty('--color-accent', lightAccent);
    if (lightBg) document.documentElement.style.setProperty('--color-bg-secondary', lightBg);
    if (lightFg) document.documentElement.style.setProperty('--color-text', lightFg);
  }, []);

  useEffect(() => {
    const activeProvider = localStorage.getItem('codex_active_provider') || 'deepseek';
    if (activeProvider === 'local') {
      setSelectedModel('Qwen-3.5-Local');
    } else if (activeProvider === 'openai') {
      setSelectedModel('GPT-4o');
    } else {
      setSelectedModel('DeepSeek-V4');
    }
  }, []);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>(null);
  const [taskStreamState, setTaskStreamState] = useState<TaskStreamState>(null);
  const [pendingPlan, setPendingPlan] = useState<{ taskId: string; content: string } | null>(null);

  // ---- Codex workspaces state & action ----
  const [workspaces, setWorkspaces] = useState<{ path: string; name: string }[]>([]);

  const refreshWorkspaces = useCallback(async () => {
    if (window.electronAPI?.workspace?.getAll) {
      try {
        const list = await window.electronAPI.workspace.getAll();
        if (Array.isArray(list)) {
          setWorkspaces(list);
        }
      } catch (err) {
        console.error('Failed to get workspaces:', err);
      }
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    const data = await window.electronAPI?.chat.getSessions();
    if (Array.isArray(data)) {
      setSessions(data);
    }
  }, []);

  const handleSelectWorkspaceNode = useCallback(async (wpPath: string) => {
    if (window.electronAPI?.workspace?.setActive) {
      await window.electronAPI.workspace.setActive(wpPath);
      setWorkspacePath(wpPath);
      void refreshSessions();
    }
  }, [refreshSessions]);

  // ---- Codex parameter states & double-bindings ----
  const [activeRightTab, setActiveRightTab] = useState<'files' | 'gitdiff' | 'params' | 'review' | 'skills' | 'computer'>('files');
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    const activeProvider = localStorage.getItem('codex_active_provider') || 'deepseek';
    if (activeProvider === 'local') return 'Qwen-3.5-Local';
    if (activeProvider === 'openai') return 'GPT-4o';
    return 'DeepSeek-V4';
  });
  const [reasoningLevel, setReasoningLevel] = useState('Low');
  const [approvalMode, setApprovalMode] = useState('request'); // request, auto, full
  const [temperature, setTemperature] = useState(0.5);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [topP, setTopP] = useState(0.9);
  const [systemPrompt, setSystemPrompt] = useState('You are an expert AI agent assisting the user with coding tasks.');
  const [gitDiff, setGitDiff] = useState('');

  // Fetch real approval policy mode from backend on mount
  useEffect(() => {
    if (window.electronAPI?.approval?.getMode) {
      window.electronAPI.approval.getMode().then((mode: string) => {
        if (mode) setApprovalMode(mode);
      }).catch(console.error);
    }
  }, []);

  // Update approval mode to backend when user changes it
  const handleApprovalModeChange = useCallback(async (newMode: string) => {
    setApprovalMode(newMode);
    if (window.electronAPI?.approval?.setMode) {
      try {
        await window.electronAPI.approval.setMode(newMode);
      } catch (err) {
        console.error('Failed to set approval mode on backend:', err);
      }
    }
  }, []);

  // Fetch Git Diff dynamically when active tab is 'gitdiff' or workspacePath changes
  const fetchGitDiff = useCallback(async () => {
    if (!workspacePath) {
      setGitDiff('');
      return;
    }
    if (window.electronAPI?.git?.getDiff) {
      try {
        const diff = await window.electronAPI.git.getDiff(workspacePath);
        setGitDiff(diff || '暂无未提交的 Git 变更差异。');
      } catch (err) {
        setGitDiff(`获取 Git Diff 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      setGitDiff('当前环境不支持 Git Diff API。');
    }
  }, [workspacePath]);

  useEffect(() => {
    if (activeRightTab === 'gitdiff') {
      void fetchGitDiff();
    }
  }, [activeRightTab, workspacePath, fetchGitDiff]);

  // Handle panel resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = document.body.clientWidth - e.clientX;
      if (newWidth > 240 && newWidth < 720) {
        setRightPanelWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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
    void refreshWorkspaces();
    // Update skill scan paths when workspace changes
    if (workspacePath) {
      window.electronAPI?.skill?.setProjectPaths(workspacePath, workspacePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath]);

  useEffect(() => {
    refreshSessions();
    refreshThreads();
    void refreshWorkspaces();
    
    // Fetch active workspace path from main process
    if (window.electronAPI?.workspace?.getActive) {
      window.electronAPI.workspace.getActive().then((p: string) => {
        if (p) setWorkspacePath(p);
      }).catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const refreshThreads = useCallback(async () => {
    const data = await window.electronAPI?.thread?.list();
    if (Array.isArray(data)) {
      setThreads(data);
    }
  }, []);

  const handleToolStreamEvent = useCallback(async (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
    const unsubscribe = window.electronAPI?.thread?.onEvent?.(() => {
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
    const unsubscribe = window.electronAPI?.chat?.onStreamEvent?.((event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
    const unsubscribe = window.electronAPI?.agent?.onTaskEvent?.((event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
    const session = await window.electronAPI?.chat.getSession(id);
    if (session) {
      setMessages(session.messages || []);
    }
  }, []);

  const handleNewSession = useCallback(async () => {
    const session = await window.electronAPI?.chat.createSession('main');
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
        const session = await window.electronAPI?.chat.createSession(thread.branch);
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
      const session = await window.electronAPI?.chat.getSession(threadDetail.backendSession.id);
      if (session) {
        setActiveSessionId(session.id);
        setMessages(session.messages || []);
      } else {
        setActiveSessionId(null);
        setMessages([]);
      }
    }
    void refreshSessions();
  }, [refreshSessions]);

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
      const provider = localStorage.getItem('codex_active_provider') || 'deepseek';
      const rawApiKey = localStorage.getItem(`codex_key_${provider}`) || '';
      const rawBaseUrl = localStorage.getItem(`codex_url_${provider}`) || '';
      const rawModel = localStorage.getItem(`codex_model_${provider}`) || '';

      const customApiKey = rawApiKey.trim() ? rawApiKey.trim() : undefined;
      const customBaseUrl = rawBaseUrl.trim() ? rawBaseUrl.trim() : undefined;
      const customModel = rawModel.trim() ? rawModel.trim() : undefined;

      const result = await window.electronAPI?.chat?.streamWithContext({
        message: text,
        workspacePath: workspacePath ?? undefined,
        selectedFiles,
        sessionId: activeSessionId ?? undefined,
        provider: provider.toUpperCase(),
        model: customModel,
        customBaseUrl,
        customApiKey,
        customInstructions: localStorage.getItem('codex_custom_instructions') || undefined,
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
  }, [activeSessionId, workspacePath, selectedFiles, streamState, taskStreamState]);

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
      {/* Left: Codex Navigation Sidebar */}
      <aside className="codex-sidebar">
        <div className="codex-sidebar__header">
          {/* macOS traffic light window dots */}
          <div className="codex-sidebar__window-controls">
            <span className="codex-sidebar__window-dot close" />
            <span className="codex-sidebar__window-dot minimize" />
            <span className="codex-sidebar__window-dot maximize" />
          </div>

          {/* Quick Actions */}
          <div className="codex-sidebar__quick-actions">
            <div className="codex-sidebar__nav-item active" onClick={() => void handleNewSession()}>
              <span className="codex-sidebar__nav-icon"><MessageSquarePlus size={16} /></span>
              <span>新对话</span>
            </div>
            <div className="codex-sidebar__nav-item">
              <span className="codex-sidebar__nav-icon"><Search size={16} /></span>
              <span>搜索</span>
            </div>
            <div className="codex-sidebar__nav-item" onClick={() => setActiveRightTab('skills')}>
              <span className="codex-sidebar__nav-icon"><Blocks size={16} /></span>
              <span>插件</span>
            </div>
            <div className="codex-sidebar__nav-item" onClick={() => setActiveRightTab('computer')}>
              <span className="codex-sidebar__nav-icon"><Activity size={16} /></span>
              <span>自动化</span>
            </div>
          </div>
        </div>

        {/* Project & Sessions Folders list */}
        <div className="codex-sidebar__project-tree">
          <div className="codex-sidebar__section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>项目</span>
            <button 
              onClick={() => void handleCreateThread()}
              disabled={creatingThread}
              style={{ background: 'transparent', border: 'none', color: '#8c959f', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', padding: '0 4px' }}
              title="新建线程"
            >
              {creatingThread ? '...' : '+'}
            </button>
          </div>
          
          {workspaces.map(wp => {
            const isCurrent = workspacePath === wp.path;
            const folderName = wp.name;

            return (
              <div key={wp.path} className="codex-project-node">
                <div 
                  className={`codex-project-node__header${isCurrent ? ' active' : ''}`}
                  onClick={() => void handleSelectWorkspaceNode(wp.path)}
                >
                  <span className={`codex-project-node__arrow${isCurrent ? ' open' : ''}`}>▶</span>
                  <span className="codex-project-node__icon" style={{ marginLeft: '4px', marginRight: '4px' }}>📁</span>
                  <span className="codex-project-node__name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {folderName}
                  </span>
                </div>

                {isCurrent && (
                  <div className="codex-project-node__sessions">
                    {sessions.length === 0 && (
                      <div className="sidebar-section__empty" style={{ margin: '4px 10px', fontSize: '11px' }}>
                        暂无对话，点击上方“新对话”新建
                      </div>
                    )}
                    {sessions.map(session => {
                      const isActive = session.id === activeSessionId;
                      return (
                        <div
                          key={session.id}
                          className={`codex-session-item${isActive ? ' active' : ''}`}
                          onClick={() => void handleSelectSession(session.id)}
                          title={session.title}
                        >
                          <span className="codex-session-item__title">
                            {session.title || '新对话'}
                          </span>
                          <span className="codex-session-item__time">
                            {formatRelativeTime(session.updatedAt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Settings */}
        <div className="codex-sidebar__footer">
          <div className="codex-sidebar__setting-btn" onClick={() => setShowSettings(true)}>
            <Settings size={15} style={{ marginRight: '4px' }} />
            <span>设置</span>
          </div>
        </div>
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
          selectedModel={selectedModel}
          setSelectedModel={handleModelChange}
          reasoningLevel={reasoningLevel}
          setReasoningLevel={setReasoningLevel}
          approvalMode={approvalMode}
          setApprovalMode={handleApprovalModeChange}
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

      {/* Resizable handle */}
      <div
        className={`main-layout__resize-handle${isResizing ? ' active' : ''}`}
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Right Resizable Aside: environment & parameter tabs */}
      <aside 
        className="main-layout__context" 
        style={{ width: rightPanelWidth, minWidth: rightPanelWidth, maxWidth: rightPanelWidth }}
      >
        {/* Tab buttons bar */}
        <div className="context-panel__tab-header">
          <button
            className={`context-tab-btn${activeRightTab === 'files' ? ' active' : ''}`}
            onClick={() => setActiveRightTab('files')}
            title="查看项目文件树"
          >
            文件
          </button>
          <button
            className={`context-tab-btn${activeRightTab === 'gitdiff' ? ' active' : ''}`}
            onClick={() => setActiveRightTab('gitdiff')}
            title="查看 Git 差异对比"
          >
            Git Diff
          </button>
          <button
            className={`context-tab-btn${activeRightTab === 'params' ? ' active' : ''}`}
            onClick={() => setActiveRightTab('params')}
            title="调节智能体参数"
          >
            参数
          </button>
          <button
            className={`context-tab-btn${activeRightTab === 'review' ? ' active' : ''}`}
            onClick={() => setActiveRightTab('review')}
            title="审查建议"
            disabled={!workspacePath}
          >
            审查
          </button>
          <button
            className={`context-tab-btn${activeRightTab === 'skills' ? ' active' : ''}`}
            onClick={() => setActiveRightTab('skills')}
            title="技能管理"
          >
            技能
          </button>
          <button
            className={`context-tab-btn${activeRightTab === 'computer' ? ' active' : ''}`}
            onClick={() => setActiveRightTab('computer')}
            title="电脑控制"
          >
            电脑
          </button>
        </div>

        {/* Tab contents block */}
        <div className="context-panel__tab-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeRightTab === 'files' && (
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

          {activeRightTab === 'gitdiff' && (
            <div className="context-panel__gitdiff-container">
              <div className="gitdiff-header">
                <span>Git 变更 Diff</span>
                <button 
                  onClick={() => void fetchGitDiff()} 
                  className="gitdiff-refresh-btn" 
                  title="刷新 Git 变更"
                >
                  ↻
                </button>
              </div>
              <pre className="gitdiff-content">{gitDiff || '未检测到 Git 差异。'}</pre>
            </div>
          )}

          {activeRightTab === 'params' && (
            <div className="context-panel__params-container">
              <div className="params-header">Playground 参数调谐</div>
              
              <div className="param-item">
                <div className="param-item__label">
                  <span>Temperature (多样性)</span>
                  <span className="param-item__value">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.05"
                  value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                  className="param-slider"
                />
              </div>

              <div className="param-item">
                <div className="param-item__label">
                  <span>Max Completion Tokens</span>
                  <span className="param-item__value">{maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="256"
                  max="8192"
                  step="128"
                  value={maxTokens}
                  onChange={e => setMaxTokens(parseInt(e.target.value))}
                  className="param-slider"
                />
              </div>

              <div className="param-item">
                <div className="param-item__label">
                  <span>Top P (核采样)</span>
                  <span className="param-item__value">{topP}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.05"
                  value={topP}
                  onChange={e => setTopP(parseFloat(e.target.value))}
                  className="param-slider"
                />
              </div>

              <div className="param-item">
                <div className="param-item__label">System Prompt (系统指令)</div>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  className="param-textarea"
                  rows={8}
                />
              </div>
            </div>
          )}

          {activeRightTab === 'review' && workspacePath && (
            <ReviewPanel
              projectPath={workspacePath}
              onClose={() => setActiveRightTab('files')}
            />
          )}

          {activeRightTab === 'skills' && (
            <SkillsPanel onClose={() => setActiveRightTab('files')} />
          )}

          {activeRightTab === 'computer' && (
            <ComputerUsePanel onClose={() => setActiveRightTab('files')} />
          )}
        </div>
      </aside>

      {pendingPlan ? (
        <PlanApprovalDialog
          planJson={pendingPlan.content}
          onApprove={() => void handleApprovePlan(true)}
          onReject={() => void handleApprovePlan(false)}
        />
      ) : null}

      {showSettings && (
        <div className="settings-overlay">
          <SettingsLayout onBack={handleSettingsClose} workspacePath={workspacePath} />
        </div>
      )}
    </div>
  );
}
