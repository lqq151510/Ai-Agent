import React from "react";
import type {
  ModelOption,
  Provider,
  SessionTaskStatus,
  SessionTaskType,
  UserProfile,
} from "../types";
import {
  LogOut,
  Zap,
  Settings as SettingsIcon,
  User,
  Brain,
} from "lucide-react";
import { NewSessionForm } from "./settings/NewSessionForm";
import { UserConfigModal } from "./settings/UserConfigModal";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface SettingsProps {
  api: any;
  user: UserProfile;
  onUserUpdate: (user: UserProfile) => void;
  onLogout: () => void;
  modelOptions: ModelOption[];
  contextTokenLimit: number | null;
  onCreateSession: (
    provider: Provider,
    model: string,
    title?: string,
    contextTokenLimit?: number | null,
    workflow?: {
      taskType?: SessionTaskType;
      taskGoal?: string | null;
      taskStatus?: SessionTaskStatus;
    },
  ) => void;
  onNavigateToCoach: () => void;
  ui?: any;
  onOpenMemory: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  api,
  user,
  onUserUpdate,
  onLogout,
  modelOptions,
  contextTokenLimit,
  onCreateSession,
  onNavigateToCoach,
  ui,
  onOpenMemory,
}) => {
  const [showConfig, setShowConfig] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <header className="sidebar-top">
        <div className="user-info">
          <div className="user-avatar">
            {user.email.charAt(0).toUpperCase()}
          </div>
          <div className="user-details">
            <p className="badge">已登录</p>
            <h2>{user.email}</h2>
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            className="icon-button"
            onClick={() => navigate("/user/profile")}
            aria-label="用户中心"
            title="用户中心"
          >
            <User size={17} />
          </button>
          <button
            className="icon-button"
            onClick={() => setShowConfig(true)}
            aria-label="模型设置"
            title="自定义模型网关"
          >
            <SettingsIcon size={17} />
          </button>
          <button
            className="icon-button logout-btn"
            onClick={onLogout}
            aria-label="退出登录"
            title="退出登录"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <div
        className="coach-nav-card"
        onClick={onNavigateToCoach}
        style={{ cursor: "pointer" }}
      >
        <div className="coach-nav-icon">
          <Zap size={16} />
        </div>
        <div className="coach-nav-body">
          <h3>AI + Java 开发陪跑器</h3>
          <p>需求拆解、脚手架与日志诊断</p>
        </div>
      </div>

      <div
        style={{
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--bg-tertiary)",
          margin: "0 1rem 1rem 1rem",
          borderRadius: "8px",
          border: "1px solid var(--border-color)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: (ui as any)?.useLocalAi ? "#10b981" : "#6b7280",
            }}
          ></div>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
          >
            Local AI 模式
          </span>
        </div>
        <button
          onClick={() => (ui as any)?.setUseLocalAi(!(ui as any)?.useLocalAi)}
          style={{
            background: (ui as any)?.useLocalAi
              ? "var(--primary-color)"
              : "transparent",
            border: `1px solid ${(ui as any)?.useLocalAi ? "var(--primary-color)" : "var(--border-color)"}`,
            color: (ui as any)?.useLocalAi ? "#fff" : "var(--text-secondary)",
            padding: "2px 8px",
            borderRadius: "12px",
            fontSize: "11px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {(ui as any)?.useLocalAi ? "ON" : "OFF"}
        </button>
      </div>

      <div style={{ padding: "0px 1rem 1rem 1rem" }}>
        <button
          type="button"
          className="memory-capsule-btn glow-primary-hover"
          onClick={onOpenMemory}
          style={{ width: "100%" }}
        >
          <Brain size={14} className="text-primary animate-pulse-slow" />
          <span style={{ marginLeft: "6px" }}>Agent 记忆胶囊库</span>
        </button>
      </div>

      <NewSessionForm
        modelOptions={modelOptions}
        contextTokenLimit={contextTokenLimit}
        onCreateSession={onCreateSession}
      />

      <UserConfigModal
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        api={api}
        user={user}
        onSaveSuccess={onUserUpdate}
      />
    </>
  );
};
