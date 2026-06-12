import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it('should initialize with default values', () => {
    const state = useAuthStore.getState();
    expect(state.tokens).toBeNull();
    expect(state.user).toBeNull();
    expect(state.authMode).toBe('login');
  });

  it('should set tokens correctly', () => {
    const tokens = { accessToken: 'access', refreshToken: 'refresh', expiresInSeconds: 3600 };
    useAuthStore.getState().setTokens(tokens);
    expect(useAuthStore.getState().tokens).toEqual(tokens);
  });

  it('should clear authentication correctly', () => {
    useAuthStore.getState().setAuthMode('register');
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().authMode).toBe('login');
    expect(useAuthStore.getState().tokens).toBeNull();
  });
});
