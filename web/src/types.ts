export type Provider = 'OPENAI';

export interface ApiError {
  code?: string;
  message?: string;
  requestId?: string;
  timestamp?: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
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
  summary?: string;
  status?: string;
  taskCount?: number;
  lastMessagePreview?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  toolTrace?: string;
  provider: string;
  model: string;
  createdAt: string;
  status?: string;
  requestId?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
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
  label?: string;
  displayName?: string;
  description?: string;
  owner?: string;
  family?: string;
  endpoint?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsTools?: boolean;
  supportsStreaming?: boolean;
  supportsReasoning?: boolean;
  supportsVision?: boolean;
  capabilities?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
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
  sessionId: string;
  readiness: {
    ready: boolean;
    checks: { name: string; ok: boolean; detail: string }[];
    timestamp: string;
  };
  models: ModelsResponse;
  toolStats: ToolStatsResponse;
  generatedAt: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface CoachItem {
  name: string;
  description: string;
}

export interface CoachApiEndpointPlan {
  method: string;
  path: string;
  purpose: string;
}

export interface RequirementBreakdown {
  goal: string;
  modules: CoachItem[];
  dataStructures: CoachItem[];
  apiEndpoints: CoachApiEndpointPlan[];
  risks: CoachItem[];
  testPoints: string[];
}

export interface RequirementBreakdownResponse {
  runId: string;
  breakdown: RequirementBreakdown;
  rawText: string;
  parseWarning?: string | null;
}

export interface LogDiagnosis {
  symptom: string;
  rootCause: string;
  triggerCondition: string;
  minimalFix: string;
  verificationSteps: string[];
}

export interface LogDiagnosisResponse {
  runId: string;
  diagnosis: LogDiagnosis;
  rawText: string;
  parseWarning?: string | null;
}

export interface ScaffoldFilePreview {
  path: string;
  content: string;
}

export interface ScaffoldResponse {
  runId: string;
  preset: string;
  projectName: string;
  fileTree: string[];
  previews: ScaffoldFilePreview[];
  startCommands: string[];
  downloadUrl: string;
}

export interface CoachRunResponse {
  id: string;
  runType: string;
  title: string;
  inputText: string;
  outputJson: string;
  artifactPath?: string | null;
  createdAt: string;
}
