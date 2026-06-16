import React from "react";
import { Virtuoso } from "react-virtuoso";
import {
  Message,
  ModelOption,
  Session,
  SessionTaskStatus,
  SessionTaskType,
  ToolStatsResponse,
} from "../types";
import { MessageItem } from "./MessageItem";
import { SkeletonMessage } from "./Skeleton";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Bug,
  FileArchive,
  Loader2,
  MessageSquare,
  RefreshCw,
  Route,
  Send,
  Sparkles,
  Target,
} from "lucide-react";
import type { StreamState } from "../stores/chatStore";
import {
  getTaskModeDefinition,
  getTaskStatusLabel,
  type TaskModeDefinition,
} from "../taskModes";

interface MessageContainerProps {
  activeSession: Session | null;
  messages: Message[];
  prompt: string;
  setPrompt: (val: string) => void;
  sending: boolean;
  loading: boolean;
  error: string;
  streamState: StreamState;
  currentModelOption: ModelOption | null;
  toolStats: ToolStatsResponse | null;
  toolStatsLoading: boolean;
  taskModes: TaskModeDefinition[];
  activeTaskType: SessionTaskType;
  activeTaskStatus: SessionTaskStatus;
  taskGoal: string;
  workflowSaving: boolean;
  onTaskModeSelect: (taskType: SessionTaskType) => void;
  onTaskGoalChange: (goal: string) => void;
  onTaskGoalSave: () => void;
  onTaskStatusChange: (taskStatus: SessionTaskStatus) => void;
  onOpenCoach: () => void;
  onCreateTaskSession: (taskType: SessionTaskType) => void;
  canRetry: boolean;
  errorActionLabel?: string;
  onErrorAction?: () => void;
  onRetryLast: () => void;
  onSendMessage: () => void;
}

export const MessageContainer: React.FC<MessageContainerProps> = ({
  activeSession,
  messages,
  prompt,
  setPrompt,
  sending,
  loading,
  error,
  streamState,
  currentModelOption,
  toolStats,
  toolStatsLoading,
  taskModes,
  activeTaskType,
  activeTaskStatus,
  taskGoal,
  workflowSaving,
  onTaskModeSelect,
  onTaskGoalChange,
  onTaskGoalSave,
  onTaskStatusChange,
  onOpenCoach,
  onCreateTaskSession,
  canRetry,
  errorActionLabel,
  onErrorAction,
  onRetryLast,
  onSendMessage,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      onSendMessage();
    }
  };

  const statusText = (() => {
    if (streamState === "connecting") return "连接中";
    if (streamState === "streaming") return "生成中";
    if (streamState === "error") return "错误";
    return activeSession ? "就绪" : "空闲";
  })();

  const statusColor = (() => {
    if (streamState === "streaming") return "status-streaming";
    if (streamState === "connecting") return "status-connecting";
    if (streamState === "error") return "status-error";
    return "status-idle";
  })();

  const totalTraceCount = React.useMemo(() => {
    return messages.reduce((sum, message) => {
      const raw = message.toolTrace;
      if (!raw) return sum;
      try {
        const parsed = JSON.parse(raw);
        return sum + (Array.isArray(parsed) ? parsed.length : 0);
      } catch {
        return sum + (raw.trim() ? 1 : 0);
      }
    }, 0);
  }, [messages]);
  const assistantTurns = messages.filter(
    (message) => message.role === "assistant",
  ).length;
  const activeTaskDefinition = getTaskModeDefinition(activeTaskType);
  const modelCapabilities = [
    currentModelOption?.supportsTools ? "Tools" : null,
    currentModelOption?.supportsReasoning ? "Reasoning" : null,
    currentModelOption?.supportsVision ? "Vision" : null,
    currentModelOption?.supportsStreaming ? "Streaming" : null,
    ...(currentModelOption?.capabilities ?? []),
  ]
    .filter(
      (value, index, array): value is string =>
        Boolean(value) && array.indexOf(value) === index,
    )
    .slice(0, 5);
  const workspaceStatus = (() => {
    if (streamState === "streaming") return "任务执行中";
    if (streamState === "connecting") return "等待模型响应";
    if (streamState === "error") return "需要人工关注";
    if (messages.length > 0) return "上下文已就绪";
    return activeSession ? "待输入任务" : "未选择会话";
  })();
  const composerPlaceholder = activeSession
    ? activeTaskDefinition.promptTemplate
    : "先选择一个会话";

  return (
    <main className="chat panel">
      <header className="chat-header">
        <div className="chat-header-main">
          <div className="chat-header-info">
            <p className="badge">{activeSession ? "当前会话" : "未选择会话"}</p>
            <h2>{activeSession?.title || "选择或创建会话"}</h2>
            {activeSession && (
              <div className="chat-header-meta">
                <span className="meta-badge">{activeSession.provider}</span>
                <span className="meta-badge">{activeSession.model}</span>
                <span className="meta-badge">
                  #{activeSession.id.slice(0, 8)}
                </span>
                <span className="meta-badge">
                  {new Date(activeSession.updatedAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
          </div>
          <div className={`live-pill ${statusColor}`}>
            <span className="live-dot" />
            {statusText}
          </div>
        </div>
      </header>

      <section className="workspace-summary-grid">
        <article className="workspace-summary-card">
          <div className="workspace-summary-label">任务态势</div>
          <strong>
            {activeSession
              ? `${activeTaskDefinition.label} / ${getTaskStatusLabel(activeTaskStatus)}`
              : workspaceStatus}
          </strong>
          <p>
            {activeSession?.taskGoal ||
              activeSession?.summary ||
              activeSession?.lastMessagePreview ||
              (activeSession
                ? "给这个会话设一个明确目标，后续陪跑结果会更聚焦。"
                : "先从左侧创建或选择一个会话。")}
          </p>
        </article>
        <article className="workspace-summary-card">
          <div className="workspace-summary-label">执行轨迹</div>
          <strong>
            {toolStatsLoading ? "同步中..." : `${totalTraceCount} 次工具调用`}
          </strong>
          <p>
            {assistantTurns} 条 assistant 响应，
            {toolStats ? `成功率 ${toolStats.successRate}%` : "等待统计数据"}。
          </p>
        </article>
        <article className="workspace-summary-card">
          <div className="workspace-summary-label">模型视图</div>
          <strong>
            {currentModelOption?.displayName ||
              currentModelOption?.label ||
              activeSession?.model ||
              "未绑定模型"}
          </strong>
          <p>
            {currentModelOption?.description ||
              currentModelOption?.owner ||
              `${activeSession?.provider || "OPENAI"} provider`}
          </p>
          {modelCapabilities.length ? (
            <div className="summary-chip-row">
              {modelCapabilities.map((capability) => (
                <span key={capability} className="summary-chip">
                  {capability}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      </section>

      <section className="task-lane">
        <div className="task-mode-strip" aria-label="任务入口">
          {taskModes.map((task) => (
            <button
              key={task.type}
              type="button"
              className={
                activeTaskType === task.type
                  ? "task-mode-chip active"
                  : "task-mode-chip"
              }
              onClick={() => onTaskModeSelect(task.type)}
            >
              <span>{iconForTask(task.type)}</span>
              <strong>{task.shortLabel}</strong>
            </button>
          ))}
        </div>

        <article className="task-control-card">
          <div className="task-control-head">
            <div>
              <div className="workspace-summary-label">任务卡片</div>
              <strong>{activeTaskDefinition.label}</strong>
              <p>
                {activeSession
                  ? "把会话目标和状态显式写出来，聊天才会更像在推进任务。"
                  : "先创建一个任务型会话，再开始聊天或进入开发陪跑器。"}
              </p>
            </div>
            {activeSession && activeTaskDefinition.coachTab ? (
              <button
                type="button"
                className="ghost task-open-coach"
                onClick={onOpenCoach}
              >
                <ArrowRight size={14} />
                带入陪跑器
              </button>
            ) : null}
          </div>

          {activeSession ? (
            <div className="task-control-grid">
              <label htmlFor="task-goal">当前目标</label>
              <textarea
                id="task-goal"
                value={taskGoal}
                onChange={(event) => onTaskGoalChange(event.target.value)}
                rows={2}
                placeholder="例如：先定位启动报错，再补最小修复和验证命令"
              />
              <label htmlFor="task-status">任务状态</label>
              <div className="task-status-row">
                <select
                  id="task-status"
                  value={activeTaskStatus}
                  onChange={(event) =>
                    onTaskStatusChange(event.target.value as SessionTaskStatus)
                  }
                >
                  <option value="planned">待开始</option>
                  <option value="in_progress">进行中</option>
                  <option value="blocked">卡住了</option>
                  <option value="done">已完成</option>
                </select>
                <button
                  type="button"
                  className="primary task-save-btn"
                  onClick={onTaskGoalSave}
                  disabled={workflowSaving}
                >
                  {workflowSaving ? "保存中..." : "保存任务卡片"}
                </button>
              </div>
            </div>
          ) : (
            <div className="task-quickstart-grid">
              {taskModes.map((task) => (
                <button
                  key={task.type}
                  type="button"
                  className="task-quickstart-card"
                  onClick={() => onCreateTaskSession(task.type)}
                >
                  <span>{iconForTask(task.type)}</span>
                  <strong>{task.label}</strong>
                  <p>{task.goal}</p>
                </button>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="message-list">
        {loading && messages.length === 0 ? (
          <div className="skeleton-container">
            <SkeletonMessage />
            <SkeletonMessage />
            <SkeletonMessage />
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              {activeSession ? (
                <Sparkles size={32} />
              ) : (
                <MessageSquare size={32} />
              )}
            </div>
            <h3>{activeSession ? "开始一次 agent 任务" : "选择或创建会话"}</h3>
            <p>
              {activeSession
                ? "先选任务模式，再发送第一条请求；陪跑器结果也可以继续带回当前会话。"
                : "创建会话后，这里会成为你的主工作台和任务中枢。"}
            </p>
          </div>
        ) : (
          <Virtuoso
            className="message-virtual-list"
            data={messages}
            followOutput="smooth"
            itemContent={(_, msg) => (
              <div className="message-row" key={msg.id}>
                <MessageItem message={msg} />
              </div>
            )}
          />
        )}
        {loading && messages.length > 0 && (
          <div className="loading-indicator">
            <Loader2 className="animate-spin" size={20} />
            <span>加载消息中...</span>
          </div>
        )}
      </section>

      <footer className="composer">
        {error ? (
          <div className="inline-error">
            <div className="error-content">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
            <div className="error-actions">
              {canRetry ? (
                <button
                  type="button"
                  className="ghost retry-btn"
                  onClick={onRetryLast}
                >
                  <RefreshCw size={14} />
                  重试
                </button>
              ) : null}
              {errorActionLabel && onErrorAction ? (
                <button
                  type="button"
                  className="ghost retry-btn"
                  onClick={onErrorAction}
                >
                  <RefreshCw size={14} />
                  {errorActionLabel}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="composer-inner">
          <Bot size={18} className="composer-mark" />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={composerPlaceholder}
            rows={2}
          />
          <div className="composer-actions">
            <span className="muted text-xs">Cmd + Enter 发送</span>
            <button
              className="primary send-btn"
              onClick={onSendMessage}
              disabled={sending || !activeSession || !prompt.trim()}
            >
              {sending ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  生成中...
                </>
              ) : (
                <>
                  <Send size={16} />
                  发送
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
};

function iconForTask(taskType: SessionTaskType) {
  switch (taskType) {
    case "requirements":
      return <Route size={14} />;
    case "scaffold":
      return <FileArchive size={14} />;
    case "logs":
      return <Bug size={14} />;
    case "chat":
    default:
      return <Target size={14} />;
  }
}
