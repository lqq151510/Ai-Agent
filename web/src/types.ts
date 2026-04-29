export type Provider = 'OPENAI' | 'OLLAMA';

export interface ApiError {
  code?: string;
  message?: string;
  requestId?: string;
  timestamp?: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds?: number;
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
}

export interface ModelOption {
  provider: Provider;
  model: string;
  isDefault: boolean;
}

export interface ModelsResponse {
  defaultProvider: Provider;
  defaultModel: string;
  options: ModelOption[];
  timestamp: string;
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

export interface SessionExportResponse {
  session: Session;
  messages: Message[];
  exportedAt: string;
}

export interface ReleaseReportResponse {
  windowHours: number;
  sessionId?: string;
  readiness: {
    ready: boolean;
    checks: { name: string; ok: boolean; detail: string }[];
    timestamp: string;
  };
  models: ModelsResponse;
  toolStats: ToolStatsResponse;
  generatedAt: string;
}
