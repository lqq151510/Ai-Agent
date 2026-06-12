import { create } from 'zustand';
import type { Tokens, UserProfile } from '../types';

type AuthMode = 'login' | 'register';

interface AuthState {
  tokens: Tokens | null;
  user: UserProfile | null;
  authMode: AuthMode;
  setTokens: (tokens: Tokens | null) => void;
  setUser: (user: UserProfile | null) => void;
  setAuthMode: (mode: AuthMode) => void;
  resetAuthForm: () => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
  tokens: null,
  user: null,
  authMode: 'login',
  setTokens: tokens => set({ tokens }),
  setUser: user => set({ user }),
  setAuthMode: authMode => set({ authMode }),
  resetAuthForm: () => set({ authMode: 'login' }),
  clearAuth: () =>
    set({
      tokens: null,
      user: null,
      authMode: 'login'
    })
}));
