// --------------- Types ---------------

export type ApprovalMode = 'suggest' | 'auto-edit' | 'full-auto';

export type ResourceType =
  | 'file:write'
  | 'file:read-external'
  | 'computer'
  | 'computer:screenshot'
  | 'network'
  | 'shell:command'
  | 'shell:install'
  | 'shell:read';

export type ApprovalLevel = 'allow' | 'request' | 'deny';

export type ToolApprovalRequest = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  resourceType: ResourceType;
  description: string;
  threadId: string;
  mode: ApprovalMode;
};

export type ApprovalDecision = 'auto-approved' | 'requires-approval' | 'rejected';

export type ApprovalResult = {
  decision: ApprovalDecision;
  approvedAt?: number;
};

export type ApprovalRule = {
  resource: ResourceType;
  pattern?: string;   // glob-style match, e.g. "~/.ssh/*" → deny
  level: ApprovalLevel;
  comment?: string;
};

export type ApprovalPolicy = {
  rules: ApprovalRule[];
  defaultLevel: ApprovalLevel;
};

// --------------- Built-in Rules ---------------

const BUILTIN_RULES: ApprovalRule[] = [
  // File operations: project-local edits auto-allow in auto-edit mode
  { resource: 'file:write', level: 'allow', comment: 'Project-local file writes' },

  // Shell commands: routine read-only commands auto-allow
  { resource: 'shell:read', level: 'allow', comment: 'Read-only shell commands (ls, cat, pwd, git status)' },

  // Shell commands: install/network commands need approval in auto-edit
  { resource: 'shell:command', level: 'request', comment: 'Non-read shell commands' },
  { resource: 'shell:install', level: 'request', comment: 'Package installs (npm install, pip install, etc.)' },

  // Network: always requires approval in auto-edit
  { resource: 'network', level: 'request', comment: 'Network access' },
  { resource: 'computer:screenshot', level: 'allow', comment: 'Screenshots auto-approved when Computer Use is enabled' },
  { resource: 'computer', level: 'request', comment: 'Computer Use actions (click, type, key, scroll)' },

  // Reads outside workspace: deny by default
  { resource: 'file:read-external', pattern: '~/.ssh/*', level: 'deny', comment: 'SSH keys' },
  { resource: 'file:read-external', pattern: '~/.aws/*', level: 'deny', comment: 'AWS credentials' },
  { resource: 'file:read-external', pattern: '~/.config/gcloud/*', level: 'deny', comment: 'GCloud credentials' },
];

// --------------- ApprovalEngine ---------------

/**
 * Evaluates tool call requests against an approval policy and the current mode.
 *
 * Three modes:
 * - suggest    → all actions require explicit user approval
 * - auto-edit  → file edits auto-approved, shell commands need confirmation
 * - full-auto  → everything auto-approved (audit-only)
 */
export class ApprovalEngine {
  private policy: ApprovalPolicy;

  constructor(customRules?: ApprovalRule[]) {
    this.policy = {
      rules: [...BUILTIN_RULES, ...(customRules ?? [])],
      defaultLevel: 'request',
    };
  }

  /**
   * Evaluate whether a tool call should be auto-approved, needs user approval,
   * or should be denied — based on mode + policy.
   */
  public evaluate(request: ToolApprovalRequest): ApprovalResult {
    // full-auto: everything auto-approved
    if (request.mode === 'full-auto') {
      return { decision: 'auto-approved', approvedAt: Date.now() };
    }

    // suggest: always request user approval
    if (request.mode === 'suggest') {
      return { decision: 'requires-approval' };
    }

    // auto-edit: evaluate against policy
    if (request.mode === 'auto-edit') {
      return this.evaluateAgainstPolicy(request);
    }

    // Unknown mode: fall back to request
    return { decision: 'requires-approval' };
  }

  /**
   * Check if the given resource type + target should be auto-approved, denied,
   * or needs user interaction.
   */
  public checkPermission(resourceType: ResourceType, target: string): ApprovalLevel {
    for (const rule of this.policy.rules) {
      if (rule.resource !== resourceType) continue;
      if (rule.pattern) {
        // Simple glob match — expand later if needed
        const regex = new RegExp(
          '^' + rule.pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
        );
        if (!regex.test(target)) continue;
      }
      return rule.level;
    }
    return this.policy.defaultLevel;
  }

  /**
   * Add or override a rule at runtime.
   */
  public addRule(rule: ApprovalRule): void {
    this.policy.rules.push(rule);
  }

  /**
   * Replace the full rule set (e.g. loaded from config).
   */
  public setRules(rules: ApprovalRule[]): void {
    this.policy.rules = [...BUILTIN_RULES, ...rules];
  }

  /**
   * Get the current policy (for UI display).
   */
  public getPolicy(): ApprovalPolicy {
    return { ...this.policy, rules: [...this.policy.rules] };
  }

  // ---- Private ----

  private evaluateAgainstPolicy(request: ToolApprovalRequest): ApprovalResult {
    const level = this.checkPermission(request.resourceType, this.describeTarget(request));

    switch (level) {
      case 'allow':
        return { decision: 'auto-approved', approvedAt: Date.now() };
      case 'deny':
        return { decision: 'rejected' };
      case 'request':
      default:
        return { decision: 'requires-approval' };
    }
  }

  private describeTarget(request: ToolApprovalRequest): string {
    const { toolName, args } = request;

    if (toolName === 'execute_cli_command' || toolName === 'cli') {
      const cmd = String(args.command || args.cmd || '');
      if (/^npm\s+install|^pip\s+install|^brew\s+install|^cargo\s+install/.test(cmd)) {
        return cmd;
      }
      if (/^(ls|cat|head|tail|echo|pwd|which|whoami|date)/.test(cmd)) {
        return 'shell:read';
      }
      return cmd;
    }

    if (toolName === 'readFile' || toolName === 'writeFile') {
      return String(args.path || '');
    }

    if (toolName === 'searchCode' || toolName === 'listRepoTree') {
      return 'shell:read';
    }

    if (toolName === 'computer_use') {
      return String(args.action || 'computer');
    }

    return String(args.command || args.path || args.url || '');
  }
}
