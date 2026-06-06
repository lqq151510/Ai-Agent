import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthPanel } from '../components/AuthPanel';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useUiStore } from '../stores/uiStore';
import { useAuthSubmit } from '../hooks/useAuthSubmit';
import { useWorkspaceDiagnostics } from '../hooks/useWorkspaceDiagnostics';
import { defaultModel } from '../utils';

interface LoginPageProps {
  api: any;
  updateTokens: (tokens: any) => void;
  applyError: (raw: unknown) => string;
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

export const LoginPage: React.FC<LoginPageProps> = ({ api, updateTokens, applyError }) => {
  const authStore = useAuthStore();
  const { tokens, authMode, email, password, setAuthMode, setEmail, setPassword, setUser } = authStore;
  const chat = useChatStore();
  const ui = useUiStore();
  const navigate = useNavigate();

  const { loadModels, refreshWorkspaceDiagnostics } = useWorkspaceDiagnostics(
    api, chat, ui, () => [{ provider: 'OPENAI', model: defaultModel('OPENAI'), isDefault: true }]
  );

  const { onAuthSubmit } = useAuthSubmit(
    api, API_BASE, chat, authStore, updateTokens, setUser, navigate, applyError, loadModels, refreshWorkspaceDiagnostics, ui
  );

  return (
    <AuthPanel
      tokens={tokens}
      loading={chat.loading}
      error={chat.error}
      authMode={authMode}
      setAuthMode={setAuthMode}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      onAuthSubmit={onAuthSubmit}
    />
  );
};
