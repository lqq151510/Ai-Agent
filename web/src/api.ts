import type {
  ApiError,
  ChatResponse,
  Message,
  ModelsResponse,
  ReleaseReportResponse,
  SessionExportResponse,
  Session,
  ToolStatsResponse,
  Tokens,
  UserProfile
} from './types';

type TokenAccessor = {
  getTokens: () => Tokens | null;
  setTokens: (tokens: Tokens | null) => void;
};

type RegisterInput = {
  email: string;
  password: string;
};

type LoginInput = RegisterInput;

type CreateSessionInput = {
  title?: string;
  provider?: 'OPENAI';
  model?: string;
};

type ChatInput = {
  sessionId: string;
  message: string;
  provider?: 'OPENAI';
  model?: string;
};

type StreamHandlers = {
  onMeta?: (response: ChatResponse) => void;
  onChunk?: (chunk: string) => void;
  onDone?: (response: ChatResponse) => void;
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
    const err = payload as ApiError;
    const req = err.requestId ? ` (requestId: ${err.requestId})` : '';
    if (err.message && err.message.trim()) {
      return `${err.message}${req}`;
    }
    if (err.code && err.code.trim()) {
      return `${err.code}${req}`;
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
    const current = tokenAccessor.getTokens();
    if (!current?.refreshToken) {
      tokenAccessor.setTokens(null);
      return false;
    }

    const response = await fetch(`${safeBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken })
    });

    const payload = await parseBody(response);
    if (!response.ok || !payload || typeof payload !== 'object') {
      tokenAccessor.setTokens(null);
      return false;
    }

    const next = payload as Tokens;
    if (!next.accessToken || !next.refreshToken) {
      tokenAccessor.setTokens(null);
      return false;
    }

    tokenAccessor.setTokens(next);
    return true;
  }

  async function request<T>(
    path: string,
    init: RequestInit = {},
    auth = true,
    allowRetry = true
  ): Promise<T> {
    const headers = new Headers(init.headers || {});
    const hasBody = init.body !== undefined && init.body !== null;

    if (hasBody && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (auth) {
      const accessToken = tokenAccessor.getTokens()?.accessToken;
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }
    }

    const response = await fetch(`${safeBaseUrl}${path}`, {
      ...init,
      headers
    });

    if (response.status === 401 && auth && allowRetry) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request<T>(path, init, auth, false);
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

      try {
        const payload = JSON.parse(data);
        if (event === 'meta') {
          handlers.onMeta?.(payload as ChatResponse);
        } else if (event === 'done') {
          handlers.onDone?.(payload as ChatResponse);
        } else if (event === 'error') {
          const message = typeof payload?.message === 'string' ? payload.message : 'Stream failed';
          handlers.onError?.(message);
          throw new Error(message);
        }
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
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
    const accessToken = tokenAccessor.getTokens()?.accessToken;
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const response = await fetch(`${safeBaseUrl}/api/agent/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input)
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
    register(input: RegisterInput) {
      return request<UserProfile>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input)
      }, false);
    },

    login(input: LoginInput) {
      return request<Tokens>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(input)
      }, false);
    },

    me() {
      return request<UserProfile>('/api/auth/me', { method: 'GET' }, true);
    },

    listSessions() {
      return request<Session[]>('/api/sessions', { method: 'GET' }, true);
    },

    listModels() {
      return request<ModelsResponse>('/api/system/models', { method: 'GET' }, true);
    },

    toolStats(windowHours = 24, sessionId?: string) {
      const query = new URLSearchParams({ windowHours: String(windowHours) });
      if (sessionId) {
        query.set('sessionId', sessionId);
      }
      return request<ToolStatsResponse>(`/api/system/tool-stats?${query.toString()}`, { method: 'GET' }, true);
    },

    exportToolStats(windowHours = 24, format: 'json' | 'markdown' = 'json', sessionId?: string) {
      const query = new URLSearchParams({
        windowHours: String(windowHours),
        format
      });
      if (sessionId) {
        query.set('sessionId', sessionId);
      }
      return request<ToolStatsResponse | string>(`/api/system/tool-stats/export?${query.toString()}`, { method: 'GET' }, true);
    },

    releaseReport(windowHours = 24, sessionId?: string) {
      const query = new URLSearchParams({ windowHours: String(windowHours) });
      if (sessionId) {
        query.set('sessionId', sessionId);
      }
      return request<ReleaseReportResponse>(`/api/system/release-report?${query.toString()}`, { method: 'GET' }, true);
    },

    exportReleaseReport(windowHours = 24, format: 'json' | 'markdown' = 'markdown', sessionId?: string) {
      const query = new URLSearchParams({
        windowHours: String(windowHours),
        format
      });
      if (sessionId) {
        query.set('sessionId', sessionId);
      }
      return request<ReleaseReportResponse | string>(`/api/system/release-report/export?${query.toString()}`, { method: 'GET' }, true);
    },

    createSession(input: CreateSessionInput) {
      return request<Session>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(input)
      }, true);
    },

    listMessages(sessionId: string) {
      return request<Message[]>(`/api/sessions/${sessionId}/messages`, { method: 'GET' }, true);
    },

    exportSession(sessionId: string, format: 'json' | 'markdown') {
      return request<SessionExportResponse | string>(
        `/api/sessions/${sessionId}/export?format=${format}`,
        { method: 'GET' },
        true
      );
    },

    chat(input: ChatInput) {
      return request<ChatResponse>('/api/agent/chat', {
        method: 'POST',
        body: JSON.stringify(input)
      }, true);
    },

    streamChat(input: ChatInput, handlers: StreamHandlers) {
      return streamChatRequest(input, handlers);
    }
  };
}
