import React, { useState } from 'react';
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
  apiBase: string;
  updateTokens: (tokens: any) => void;
  applyError: (raw: unknown) => string;
}

export const LoginPage: React.FC<LoginPageProps> = ({ api, apiBase, updateTokens, applyError }) => {
  const authStore = useAuthStore();
  const { tokens, authMode, setAuthMode, setUser } = authStore;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const chat = useChatStore();
  const ui = useUiStore();
  const navigate = useNavigate();

  const { loadModels, refreshWorkspaceDiagnostics } = useWorkspaceDiagnostics(
    api, chat, ui, () => [{ provider: 'OPENAI', model: defaultModel('OPENAI'), isDefault: true }]
  );

  const { onAuthSubmit } = useAuthSubmit(
    api, apiBase, chat, updateTokens, setUser, navigate, applyError, loadModels, refreshWorkspaceDiagnostics, ui
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
      onAuthSubmit={() => onAuthSubmit(authMode, email, password, setPassword)}
    />
  );
};
