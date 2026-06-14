import React from 'react';
import type { Tokens } from '../types';
import { Braces, CheckCircle2, Cpu, KeyRound, Layers3, Loader2, Mail, ShieldCheck, TerminalSquare, Zap } from 'lucide-react';

interface AuthPanelProps {
  tokens: Tokens | null;
  loading: boolean;
  error: string;
  authMode: 'login' | 'register';
  setAuthMode: (mode: 'login' | 'register') => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (pw: string) => void;
  onAuthSubmit: () => void;
}

export const AuthPanel: React.FC<AuthPanelProps> = ({
  loading,
  error,
  authMode,
  setAuthMode,
  email,
  setEmail,
  password,
  setPassword,
  onAuthSubmit,
}) => {
  return (
    <section className="auth-layout animate-rise">
      <div className="auth-bg-aurora" aria-hidden="true">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>
      <div className="auth-intro glass-layer">
        <div className="auth-brand">
          <div className="brand-icon">
            <Braces size={28} />
          </div>
          <h1>AI + Java Dev Coach</h1>
        </div>
        <p className="auth-tagline">把需求拆解、RAG/Agent 调试、脚手架生成和日志定位放进一个日常可用的工程工作台。</p>
        <div className="auth-features">
          <div className="feature-item">
            <TerminalSquare size={18} />
            <span>Agent 工作台</span>
          </div>
          <div className="feature-item">
            <Layers3 size={18} />
            <span>Dev Coach 三流程</span>
          </div>
          <div className="feature-item">
            <ShieldCheck size={18} />
            <span>会话与巡检沉淀</span>
          </div>
        </div>
        <div className="auth-product-preview" aria-hidden="true">
          <div className="preview-toolbar">
            <i />
            <i />
            <i />
            <span />
          </div>
          <div className="preview-grid">
            <div className="preview-rail">
              {Array.from({ length: 7 }).map((_, index) => <span key={index} />)}
            </div>
            <div className="preview-main">
              <b />
              <span />
              <span />
              <span className="wide" />
              <span />
              <span className="accent" />
            </div>
            <div className="preview-side">
              <Cpu size={18} />
              <span />
              <span />
              <CheckCircle2 size={18} />
            </div>
          </div>
        </div>
      </div>

      <form
        className="auth-panel panel"
        onSubmit={(event) => {
          event.preventDefault();
          onAuthSubmit();
        }}
      >
        <div className="auth-header">
          <p className="badge">{authMode === 'login' ? 'Workspace Access' : 'Create Workspace'}</p>
          <h2>{authMode === 'login' ? '进入工程工作台' : '创建你的陪跑空间'}</h2>
          <p className="muted">{authMode === 'login' ? '继续你的会话、工具轨迹和开发陪跑记录。' : '注册后即可创建 Agent 会话与 Dev Coach 任务。'}</p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="认证模式">
          <button
            type="button"
            className={authMode === 'login' ? 'tab active' : 'tab'}
            onClick={() => setAuthMode('login')}
          >
            登录
          </button>
          <button
            type="button"
            className={authMode === 'register' ? 'tab active' : 'tab'}
            onClick={() => setAuthMode('register')}
          >
            注册
          </button>
        </div>
        <label className="field-label" htmlFor="email">邮箱</label>
        <div className="input-shell">
          <Mail size={16} />
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <label className="field-label" htmlFor="password">密码</label>
        <div className="input-shell">
          <KeyRound size={16} />
          <input
            id="password"
            type="password"
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
          />
        </div>
        <button className="primary full-width" type="submit" disabled={loading || !email || !password}>
          {loading ? <Loader2 className="animate-spin" size={16} /> : null}
          {loading ? '处理中...' : authMode === 'login' ? '进入工作台' : '注册并进入'}
        </button>
        {error ? <div className="error-box">{error}</div> : null}
      </form>
    </section>
  );
};
