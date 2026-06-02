import type {
  ApiError,
  AuthState,
  ChatResponse,
  Message,
  PageResult,
  ReleaseReportResponse,
  Session,
  Tokens,
  ToolStatsResponse,
  UserProfile,
} from './types.js';

type TokenAccessor = {
  getState: () => AuthState;
  setState: (state: AuthState) => void;
};

type RequestInitWithRetry = RequestInit & {
  allowRetry?: boolean;
};

type ChatInput = {
  sessionId: string;
  message: string;
  provider?: 'OPENAI';
  model?: string;
  maxContextTokens?: number;
  systemContext?: string;
};

type StreamHandlers = {
  onMeta?: (payload: ChatResponse) => void;
  onChunk?: (chunk: string) => void;
  onDone?: (payload: ChatResponse) => void;
  onError?: (message: string) => void;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const error = payload as ApiError;
    const requestId = error.requestId ? ` (requestId: ${error.requestId})` : '';
    if (error.message?.trim()) {
      return `${error.message}${requestId}`;
    }
    if (error.code?.trim()) {
      return `${error.code}${requestId}`;
    }
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  return `Request failed (${status})`;
}

export function createApiClient(baseUrl: string, tokenAccessor: TokenAccessor) {
  const safeBaseUrl = normalizeBaseUrl(baseUrl);

  async function tryRefreshToken(): Promise<boolean> {
    const current = tokenAccessor.getState();
    if (!current.refreshToken) {
      tokenAccessor.setState({});
      return false;
    }

    const response = await fetch(`${safeBaseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });

    const payload = await parseBody(response);
    if (!response.ok || !payload || typeof payload !== 'object') {
      tokenAccessor.setState({});
      return false;
    }

    const next = payload as Tokens;
    if (!next.accessToken || !next.refreshToken) {
      tokenAccessor.setState({});
      return false;
    }

    tokenAccessor.setState({
      ...tokenAccessor.getState(),
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
    });
    return true;
  }

  async function request<T>(path: string, init: RequestInitWithRetry = {}, auth = true): Promise<T> {
    const headers = new Headers(init.headers || {});
    const hasBody = init.body !== undefined && init.body !== null;
    const allowRetry = init.allowRetry !== false;

    if (hasBody && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (auth) {
      const accessToken = tokenAccessor.getState().accessToken;
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }
    }

    const response = await fetch(`${safeBaseUrl}${path}`, { ...init, headers });

    if (response.status === 401 && auth && allowRetry) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request<T>(path, { ...init, allowRetry: false }, auth);
      }
    }

    const payload = await parseBody(response);
    if (!response.ok) {
      throw new Error(toErrorMessage(payload, response.status));
    }

    return payload as T;
  }

  async function parseSseStream(body: ReadableStream<Uint8Array>, handlers: StreamHandlers) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    function emitBlock(block: string) {
      const lines = block.split(/\r?\n/);
      const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
      const data = lines
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n');

      if (!data) {
        return;
      }

      if (event === 'chunk') {
        handlers.onChunk?.(data);
        return;
      }

      if (event === 'heartbeat') {
        return;
      }

      const payload = JSON.parse(data) as ChatResponse | ApiError;
      if (event === 'meta') {
        handlers.onMeta?.(payload as ChatResponse);
        return;
      }
      if (event === 'done') {
        handlers.onDone?.(payload as ChatResponse);
        return;
      }
      if (event === 'error') {
        const message = (payload as ApiError).message || 'Stream failed';
        handlers.onError?.(message);
        throw new Error(message);
      }
    }

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');

      let delimiter = buffer.indexOf('\n\n');
      while (delimiter >= 0) {
        const block = buffer.slice(0, delimiter).trim();
        buffer = buffer.slice(delimiter + 2);
        if (block) {
          emitBlock(block);
        }
        delimiter = buffer.indexOf('\n\n');
      }

      if (done) {
        const tail = buffer.trim();
        if (tail) {
          emitBlock(tail);
        }
        return;
      }
    }
  }

  async function streamChatRequest(input: ChatInput, handlers: StreamHandlers, allowRetry = true): Promise<void> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const accessToken = tokenAccessor.getState().accessToken;
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const response = await fetch(`${safeBaseUrl}/api/v1/agent/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });

    if (response.status === 401 && allowRetry) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return streamChatRequest(input, handlers, false);
      }
    }

    if (!response.ok) {
      const payload = await parseBody(response);
      throw new Error(toErrorMessage(payload, response.status));
    }

    if (!response.body) {
      throw new Error('Streaming response body is empty');
    }

    await parseSseStream(response.body, handlers);
  }

  return {
    login(email: string, password: string) {
      return request<Tokens>(
        '/api/v1/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        },
        false,
      );
    },

    logout(refreshToken: string) {
      return request<void>(
        '/api/v1/auth/logout',
        {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        },
        true,
      );
    },

    me() {
      return request<UserProfile>('/api/v1/auth/me', { method: 'GET' }, true);
    },

    async listSessions() {
      const payload = await request<Session[] | PageResult<Session>>('/api/v1/sessions', { method: 'GET' }, true);
      return Array.isArray(payload) ? payload : payload.content ?? [];
    },

    createSession(input: {
      title?: string;
      provider?: 'OPENAI';
      model?: string;
      contextTokenLimit?: number;
    }) {
      return request<Session>(
        '/api/v1/sessions',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        true,
      );
    },

    listMessages(sessionId: string) {
      return request<Message[]>(`/api/v1/sessions/${sessionId}/messages`, { method: 'GET' }, true);
    },

    chat(input: ChatInput) {
      return request<ChatResponse>(
        '/api/v1/agent/chat',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        true,
      );
    },

    streamChat(input: ChatInput, handlers: StreamHandlers) {
      return streamChatRequest(input, handlers);
    },

    toolStats(windowHours = 24, sessionId?: string) {
      const query = new URLSearchParams({ windowHours: String(windowHours) });
      if (sessionId) {
        query.set('sessionId', sessionId);
      }
      return request<ToolStatsResponse>(`/api/v1/system/tool-stats?${query.toString()}`, { method: 'GET' }, true);
    },

    exportToolStats(windowHours = 24, format: 'json' | 'markdown' = 'json', sessionId?: string) {
      const query = new URLSearchParams({ windowHours: String(windowHours), format });
      if (sessionId) {
        query.set('sessionId', sessionId);
      }
      return request<ToolStatsResponse | string>(
        `/api/v1/system/tool-stats/export?${query.toString()}`,
        { method: 'GET' },
        true,
      );
    },

    releaseReport(windowHours = 24, sessionId?: string) {
      const query = new URLSearchParams({ windowHours: String(windowHours) });
      if (sessionId) {
        query.set('sessionId', sessionId);
      }
      return request<ReleaseReportResponse>(
        `/api/v1/system/release-report?${query.toString()}`,
        { method: 'GET' },
        true,
      );
    },

    exportReleaseReport(windowHours = 24, format: 'json' | 'markdown' = 'markdown', sessionId?: string) {
      const query = new URLSearchParams({ windowHours: String(windowHours), format });
      if (sessionId) {
        query.set('sessionId', sessionId);
      }
      return request<ReleaseReportResponse | string>(
        `/api/v1/system/release-report/export?${query.toString()}`,
        { method: 'GET' },
        true,
      );
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
