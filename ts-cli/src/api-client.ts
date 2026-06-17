import type {
  AgentEvent,
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
  onEvent?: (event: AgentEvent) => void;
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
      // Spring WebFlux SSE outputs 'data:' lines. 
      // Sometimes it outputs 'event: message' or just 'data:'.
      const dataLines = lines
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart());

      if (dataLines.length === 0) return;
      
      const dataStr = dataLines.join('');
      try {
        const payload = JSON.parse(dataStr) as AgentEvent;
        handlers.onEvent?.(payload);
        if (payload.type === 'ERROR') {
          handlers.onError?.(payload.content || 'Stream failed');
        }
      } catch (e) {
        // Maybe partial chunk
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

  async function submitTaskRequest(prompt: string): Promise<string> {
    const response = await fetch(`${safeBaseUrl}/api/v1/agent/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const payload = await parseBody(response);
      throw new Error(toErrorMessage(payload, response.status));
    }

    return response.text(); // returns taskId directly as plain string
  }

  async function streamTaskEvents(taskId: string, handlers: StreamHandlers): Promise<void> {
    const response = await fetch(`${safeBaseUrl}/api/v1/agent/stream/${taskId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const payload = await parseBody(response);
      throw new Error(toErrorMessage(payload, response.status));
    }

    if (!response.body) {
      throw new Error('Streaming response body is empty');
    }

    await parseSseStream(response.body, handlers);
  }

  async function approvePlanRequest(taskId: string, approved: boolean): Promise<void> {
    const response = await fetch(`${safeBaseUrl}/api/v1/agent/task/${taskId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
    });

    if (!response.ok) {
      const payload = await parseBody(response);
      throw new Error(toErrorMessage(payload, response.status));
    }
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

    submitTask(prompt: string) {
      return submitTaskRequest(prompt);
    },

    streamTask(taskId: string, handlers: StreamHandlers) {
      return streamTaskEvents(taskId, handlers);
    },

    approvePlan(taskId: string, approved: boolean) {
      return approvePlanRequest(taskId, approved);
    },

    submitToolResult(callId: string, result: string) {
      return request<void>(
        '/api/v1/agent/chat/tool_result',
        {
          method: 'POST',
          body: JSON.stringify({ callId, result }),
        },
        true,
      );
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

    executeMultiAgentTask(input: { taskPrompt: string }) {
      return request<{ result: string }>(
        '/api/v1/coach/execute-multi-agent',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        true,
      );
    },

    async subscribeToSentinelAlerts(
      signal: AbortSignal,
      handlers: { onAlert: (alert: { rootCause: string; suggestedFix: string }) => void; onError?: (message: string) => void },
      allowRetry = true
    ): Promise<void> {
      const headers = new Headers();
      const accessToken = tokenAccessor.getState().accessToken;
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }

      try {
        const response = await fetch(`${safeBaseUrl}/api/v1/sentinel/alerts`, {
          method: 'GET',
          headers,
          signal,
        });

        if (response.status === 401 && allowRetry) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            return this.subscribeToSentinelAlerts(signal, handlers, false);
          }
        }

        if (!response.ok) {
          const payload = await parseBody(response);
          handlers.onError?.(toErrorMessage(payload, response.status));
          return;
        }

        if (!response.body) {
          handlers.onError?.('Empty response body');
          return;
        }

        await parseSseStream(response.body, handlers);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        handlers.onError?.(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
