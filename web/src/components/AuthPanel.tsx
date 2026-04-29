import React from 'react';
import type { Tokens } from '../types';
import { KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';

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
      <div className="auth-intro">
        <p className="eyebrow">Java AI Agent</p>
        <h1>Agent Control</h1>
        <p>统一管理会话、模型路由和工具执行记录，适合本地调试与日常 agent 工作流。</p>
        <div className="auth-proof">
          <span><ShieldCheck size={16} /> JWT Session</span>
          <span>LM Studio (OpenAI Compatible)</span>
          <span>Tool Trace</span>
        </div>
      </div>

      <div className="auth-panel panel">
        <div className="auth-header">
          <p className="badge">Console Access</p>
          <h2>{authMode === 'login' ? '登录控制台' : '创建账户'}</h2>
          <p className="muted">使用后端账号进入会话工作台。</p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="认证模式">
          <button
            className={authMode === 'login' ? 'tab active' : 'tab'}
            onClick={() => setAuthMode('login')}
          >
            登录
          </button>
          <button
            className={authMode === 'register' ? 'tab active' : 'tab'}
            onClick={() => setAuthMode('register')}
          >
            注册
          </button>
        </div>
        <label className="field-label" htmlFor="email">邮箱</label>
        <div className="input-shell">
          <Mail size={16} />
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <label className="field-label" htmlFor="password">密码</label>
        <div className="input-shell">
          <KeyRound size={16} />
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
          />
        </div>
        <button className="primary full-width" onClick={onAuthSubmit} disabled={loading || !email || !password}>
          {loading ? <Loader2 className="animate-spin" size={16} /> : null}
          {loading ? '处理中...' : authMode === 'login' ? '登录' : '注册并登录'}
        </button>
        {error ? <div className="error-box">{error}</div> : null}
      </div>
    </section>
  );
};
