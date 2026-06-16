import React, { useEffect, useState } from "react";
import {
  ModelOption,
  MemoryItem,
  Session,
  SessionTaskStatus,
  SessionTaskType,
} from "../types";
import { Settings } from "./Settings";
import { ChatList } from "./ChatList";
import { MessageContainer } from "./MessageContainer";
import { MemoryModal } from "./MemoryModal";
import { BrandMark } from "./BrandMark";
import {
  getTaskModeDefinition,
  TASK_MODE_DEFINITIONS,
  type TaskModeDefinition,
} from "../taskModes";

interface WorkspaceProps {
  api: any;
  user: any;
  onUserUpdate: (user: any) => void;
  ui: any;
  chat: any;
  activeSession: Session | null;
  currentModelOption: ModelOption | null;
  onLogout: () => void;
  onCreateSession: (
    provider: any,
    model: string,
    title?: string,
    contextTokenLimit?: number | null,
    workflow?: {
      taskType?: SessionTaskType;
      taskGoal?: string | null;
      taskStatus?: SessionTaskStatus;
    },
  ) => Promise<void>;
  navigate: any;
  onSelectSession: (sessionId: string) => void;
  onSwitchFallbackSession: (defaultModel: any) => void;
  onRetryLast: () => Promise<void>;
  sendMessage: (msg: string) => Promise<void>;
  defaultModel: any;
}

export function Workspace({
  api,
  user,
  onUserUpdate,
  ui,
  chat,
  activeSession,
  currentModelOption,
  onLogout,
  onCreateSession,
  navigate,
  onSelectSession,
  onSwitchFallbackSession,
  onRetryLast,
  sendMessage,
  defaultModel,
}: WorkspaceProps) {
  const [prompt, setPrompt] = useState("");
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [taskGoalDraft, setTaskGoalDraft] = useState("");
  const [workflowSaving, setWorkflowSaving] = useState(false);

  const activeTaskDefinition: TaskModeDefinition = getTaskModeDefinition(
    activeSession?.taskType,
  );
  const activeTaskStatus: SessionTaskStatus =
    activeSession?.taskStatus ?? "planned";

  useEffect(() => {
    setTaskGoalDraft(activeSession?.taskGoal ?? "");
  }, [activeSession?.id, activeSession?.taskGoal]);

  const loadMemories = async () => {
    setMemoriesLoading(true);
    try {
      const data = await api.listMemories();
      setMemories(data || []);
    } catch (err) {
      console.error("Failed to load memories", err);
    } finally {
      setMemoriesLoading(false);
    }
  };

  const handleOpenMemory = () => {
    setIsMemoryOpen(true);
    void loadMemories();
  };

  const handleUpdateMemory = async (id: string, text: string) => {
    await api.updateMemory(id, text);
    setMemories((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text } : item)),
    );
  };

  const handleDeleteMemory = async (id: string) => {
    await api.deleteMemory(id);
    setMemories((prev) => prev.filter((item) => item.id !== id));
  };

  const replaceSession = (updated: Session) => {
    chat.setSessions(
      chat.sessions.map((item: Session) =>
        item.id === updated.id ? updated : item,
      ),
    );
  };

  const updateSessionWorkflow = async (
    patch: {
      taskType?: SessionTaskType;
      taskGoal?: string | null;
      taskStatus?: SessionTaskStatus;
    },
    silent = false,
  ) => {
    if (!activeSession) return;
    if (!silent) {
      setWorkflowSaving(true);
    }
    try {
      const updated = await api.updateSessionWorkflow(activeSession.id, patch);
      replaceSession(updated);
      setTaskGoalDraft(updated.taskGoal ?? "");
    } catch (error) {
      chat.setError(
        error instanceof Error ? error.message : "保存任务卡片失败",
      );
      chat.setErrorKind("generic");
    } finally {
      if (!silent) {
        setWorkflowSaving(false);
      }
    }
  };

  const openCoachForTask = () => {
    const params = new URLSearchParams();
    const task = getTaskModeDefinition(activeSession?.taskType);
    const seedText =
      prompt.trim() || taskGoalDraft.trim() || activeSession?.title || "";

    if (task.coachTab) {
      params.set("tab", task.coachTab);
    }

    if (task.type === "requirements" && seedText) {
      params.set("requirement", seedText);
    }

    if (task.type === "logs") {
      if (seedText) {
        params.set("logContent", seedText);
      }
      params.set(
        "logContext",
        activeSession?.title || "Chat workspace handoff",
      );
    }

    if (task.type === "scaffold") {
      params.set(
        "projectName",
        toProjectSlug(activeSession?.title || task.title),
      );
      params.set("basePackage", "com.example.agent");
    }

    navigate(`/coach${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const applyTaskMode = async (taskType: SessionTaskType) => {
    const definition = getTaskModeDefinition(taskType);
    setPrompt(definition.promptTemplate);
    if (!activeSession) return;

    await updateSessionWorkflow(
      {
        taskType,
        taskGoal: activeSession.taskGoal?.trim()
          ? activeSession.taskGoal
          : definition.goal,
        taskStatus:
          activeSession.taskStatus === "done"
            ? "in_progress"
            : activeTaskStatus,
      },
      true,
    );
  };

  const createTaskSession = async (taskType: SessionTaskType) => {
    const definition = getTaskModeDefinition(taskType);
    await onCreateSession(
      "OPENAI",
      currentModelOption?.model || defaultModel("OPENAI"),
      definition.title,
      ui.contextTokenLimit,
      {
        taskType,
        taskGoal: definition.goal,
        taskStatus: "planned",
      },
    );
    setTaskGoalDraft(definition.goal);
    setPrompt(definition.promptTemplate);
  };

  const handleSendMessage = async () => {
    const outgoing = prompt.trim();
    if (!outgoing) return;

    if (activeSession) {
      await updateSessionWorkflow(
        {
          taskType: activeSession.taskType ?? "chat",
          taskGoal: activeSession.taskGoal?.trim()
            ? activeSession.taskGoal
            : outgoing.slice(0, 80),
          taskStatus:
            activeTaskStatus === "planned" ? "in_progress" : activeTaskStatus,
        },
        true,
      );
    }

    await sendMessage(outgoing);
    setPrompt("");
  };

  return (
    <div className="workspace-shell">
      <header className="workspace-chrome">
        <div className="chrome-brand">
          <span className="chrome-mark">
            <BrandMark size={38} title={null} />
          </span>
          <div>
            <strong>AI + Java Dev Coach</strong>
            <span>Agent workspace / RAG cockpit</span>
          </div>
        </div>
        <nav className="chrome-nav" aria-label="主工作区">
          <button type="button" className="chrome-nav-item active">
            工作台
          </button>
          <button
            type="button"
            className="chrome-nav-item"
            onClick={() => navigate("/coach")}
          >
            开发陪跑器
          </button>
        </nav>
      </header>
      <div className="workspace">
        <aside className="sidebar panel">
          <Settings
            api={api}
            user={user}
            onUserUpdate={onUserUpdate}
            onLogout={onLogout}
            modelOptions={ui.modelOptions}
            contextTokenLimit={ui.contextTokenLimit}
            onCreateSession={onCreateSession}
            onNavigateToCoach={() => navigate("/coach")}
            ui={ui}
            onOpenMemory={handleOpenMemory}
          />
          <ChatList
            sessions={chat.sessions}
            activeSessionId={chat.activeSessionId}
            onSelectSession={onSelectSession}
          />
        </aside>
        <MessageContainer
          activeSession={activeSession}
          messages={chat.messages}
          prompt={prompt}
          setPrompt={setPrompt}
          sending={chat.sending}
          loading={chat.loading}
          error={chat.error}
          streamState={chat.streamState}
          currentModelOption={currentModelOption}
          toolStats={ui.toolStats}
          toolStatsLoading={ui.toolStatsLoading}
          canRetry={
            !!chat.lastFailedMessage &&
            !chat.sending &&
            chat.errorKind !== "rate_limit"
          }
          taskModes={TASK_MODE_DEFINITIONS}
          activeTaskType={activeTaskDefinition.type}
          activeTaskStatus={activeTaskStatus}
          taskGoal={taskGoalDraft}
          workflowSaving={workflowSaving}
          onTaskModeSelect={(taskType) => {
            void applyTaskMode(taskType);
          }}
          onTaskGoalChange={setTaskGoalDraft}
          onTaskGoalSave={() => {
            void updateSessionWorkflow({
              taskType: activeTaskDefinition.type,
              taskGoal: taskGoalDraft,
              taskStatus: activeTaskStatus,
            });
          }}
          onTaskStatusChange={(taskStatus) => {
            void updateSessionWorkflow({
              taskType: activeTaskDefinition.type,
              taskGoal: taskGoalDraft,
              taskStatus,
            });
          }}
          onOpenCoach={() => openCoachForTask()}
          onCreateTaskSession={(taskType) => {
            void createTaskSession(taskType);
          }}
          errorActionLabel={
            chat.errorKind === "auth_expired"
              ? "重新登录"
              : chat.errorKind === "model_unreachable"
                ? "切换备用模型"
                : chat.errorKind === "rate_limit" && !!chat.lastFailedMessage
                  ? chat.rateLimitRetryInSec && chat.rateLimitRetryInSec > 0
                    ? `${chat.rateLimitRetryInSec}s后自动重试`
                    : "立即重试"
                  : undefined
          }
          onErrorAction={
            chat.errorKind === "auth_expired"
              ? onLogout
              : chat.errorKind === "model_unreachable"
                ? () => {
                    void onSwitchFallbackSession(defaultModel);
                  }
                : chat.errorKind === "rate_limit" && !!chat.lastFailedMessage
                  ? () => {
                      chat.setRateLimitRetryArmed(false);
                      chat.setRateLimitRetryInSec(null);
                      void onRetryLast();
                    }
                  : undefined
          }
          onRetryLast={onRetryLast}
          onSendMessage={() => {
            void handleSendMessage();
          }}
        />
      </div>
      <footer className="workspace-statusbar">
        <span>
          {activeSession
            ? `session://${activeSession.id.slice(0, 8)}`
            : "session://none"}
        </span>
        <span>
          {currentModelOption?.displayName ||
            currentModelOption?.model ||
            activeSession?.model ||
            "model:auto"}
        </span>
        <span>
          {ui.contextTokenLimit
            ? `context:${ui.contextTokenLimit}`
            : "context:default"}
        </span>
      </footer>

      <MemoryModal
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        memories={memories}
        loading={memoriesLoading}
        onUpdateMemory={handleUpdateMemory}
        onDeleteMemory={handleDeleteMemory}
      />
    </div>
  );
}

function toProjectSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "java-agent-demo";
}
