import { create } from 'zustand';
import type { Tokens, UserProfile } from '../types';

type AuthMode = 'login' | 'register';

interface AuthState {
  tokens: Tokens | null;
  user: UserProfile | null;
  authMode: AuthMode;
  email: string;
  password: string;
  setTokens: (tokens: Tokens | null) => void;
  setUser: (user: UserProfile | null) => void;
  setAuthMode: (mode: AuthMode) => void;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  resetAuthForm: () => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
  tokens: null,
  user: null,
  authMode: 'login',
  email: '',
  password: '',
  setTokens: tokens => set({ tokens }),
  setUser: user => set({ user }),
  setAuthMode: authMode => set({ authMode }),
  setEmail: email => set({ email }),
  setPassword: password => set({ password }),
  resetAuthForm: () => set({ email: '', password: '', authMode: 'login' }),
  clearAuth: () =>
    set({
      tokens: null,
      user: null,
      email: '',
      password: '',
      authMode: 'login'
    })
}));
