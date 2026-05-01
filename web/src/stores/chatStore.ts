import { create } from 'zustand';
import type { Message, Session } from '../types';

type StreamState = 'idle' | 'connecting' | 'streaming' | 'error';
type ErrorKind = 'rate_limit' | 'auth_expired' | 'model_unreachable' | 'generic';

interface ChatState {
  sessions: Session[];
  activeSessionId: string;
  messages: Message[];
  prompt: string;
  sending: boolean;
  loading: boolean;
  exporting: boolean;
  streamState: StreamState;
  error: string;
  errorKind: ErrorKind | null;
  lastFailedMessage: string;
  rateLimitRetryInSec: number | null;
  rateLimitRetryArmed: boolean;
  setSessions: (sessions: Session[]) => void;
  setActiveSessionId: (sessionId: string) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setPrompt: (prompt: string) => void;
  setSending: (sending: boolean) => void;
  setLoading: (loading: boolean) => void;
  setExporting: (exporting: boolean) => void;
  setStreamState: (streamState: StreamState) => void;
  setError: (error: string) => void;
  setErrorKind: (kind: ErrorKind | null) => void;
  setLastFailedMessage: (message: string) => void;
  setRateLimitRetryInSec: (seconds: number | null | ((prev: number | null) => number | null)) => void;
  setRateLimitRetryArmed: (armed: boolean) => void;
  clearError: () => void;
  resetChat: () => void;
}

const initialState = {
  sessions: [],
  activeSessionId: '',
  messages: [],
  prompt: '',
  sending: false,
  loading: false,
  exporting: false,
  streamState: 'idle' as StreamState,
  error: '',
  errorKind: null as ErrorKind | null,
  lastFailedMessage: '',
  rateLimitRetryInSec: null as number | null,
  rateLimitRetryArmed: false
};

export const useChatStore = create<ChatState>(set => ({
  ...initialState,
  setSessions: sessions => set({ sessions }),
  setActiveSessionId: activeSessionId => set({ activeSessionId }),
  setMessages: messages => set(state => ({ messages: typeof messages === 'function' ? messages(state.messages) : messages })),
  setPrompt: prompt => set({ prompt }),
  setSending: sending => set({ sending }),
  setLoading: loading => set({ loading }),
  setExporting: exporting => set({ exporting }),
  setStreamState: streamState => set({ streamState }),
  setError: error => set({ error }),
  setErrorKind: errorKind => set({ errorKind }),
  setLastFailedMessage: lastFailedMessage => set({ lastFailedMessage }),
  setRateLimitRetryInSec: rateLimitRetryInSec =>
    set(state => ({
      rateLimitRetryInSec:
        typeof rateLimitRetryInSec === 'function'
          ? rateLimitRetryInSec(state.rateLimitRetryInSec)
          : rateLimitRetryInSec
    })),
  setRateLimitRetryArmed: rateLimitRetryArmed => set({ rateLimitRetryArmed }),
  clearError: () =>
    set({
      error: '',
      errorKind: null,
      rateLimitRetryInSec: null,
      rateLimitRetryArmed: false
    }),
  resetChat: () => set({ ...initialState })
}));

export type { StreamState, ErrorKind };
