export type Provider = 'OPENAI';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds?: number;
}

export interface AuthState {
  accessToken?: string;
  refreshToken?: string;
  activeSessionId?: string;
}

export interface ApiError {
  code?: string;
  message?: string;
  requestId?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  createdAt: string;
}

export interface Session {
  id: string;
  title: string;
  provider: Provider;
  model: string;
  contextTokenLimit?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  toolTrace?: string;
  provider: string;
  model: string;
  createdAt: string;
}

export interface ToolExecutionResult {
  toolName: string;
  argsJson: string;
  status: string;
  durationMs: number;
  output: string;
}

export interface ChatResponse {
  sessionId: string;
  provider: Provider;
  model: string;
  reply: string;
  latencyMs: number;
  toolTraces: ToolExecutionResult[];
  execution?: {
    maxContextTokens?: number;
    maxToolSteps?: number;
    historyMessagesUsed?: number;
    historyTruncated?: boolean;
    toolRounds?: number;
    stopReason?: string;
  };
}

export interface ToolDurationBucket {
  label: string;
  count: number;
}

export interface ToolStatsByName {
  toolName: string;
  runs: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  averageDurationMs: number;
  p95DurationMs: number;
}

export interface ToolStatsResponse {
  windowHours: number;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  durationBuckets: ToolDurationBucket[];
  topTools: ToolStatsByName[];
  generatedAt: string;
}

export interface ReleaseReportResponse {
  windowHours: number;
  sessionId?: string | null;
  readiness: {
    ready: boolean;
    checks: Array<{ name: string; ok: boolean; detail: string }>;
    timestamp: string;
  };
  models: {
    defaultProvider: Provider;
    defaultModel: string;
  };
  toolStats: ToolStatsResponse;
  generatedAt: string;
}

export interface PageResult<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
