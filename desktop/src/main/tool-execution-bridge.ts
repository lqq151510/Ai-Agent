// ToolExecutionBridge
//
// Bridges the gap between the backend agent loop and local desktop capabilities.
// When the backend's AgentService emits a client_tool_call (SSE event),
// this bridge:
//   1. Intercepts the event in the desktop main process
//   2. Evaluates it against the ApprovalEngine
//   3. Executes the tool locally (via PTY, local-service HTTP, or filesystem)
//   4. Submits the result back to the backend via POST /tool_result
//
// This is what makes the agent "autonomous" on the desktop — it can read files,
// run commands, and observe results without manual copy-paste.

import { PtyPool } from './pty-pool';
import { ApprovalEngine, type ToolApprovalRequest, type ApprovalMode } from './approval-engine';
import { ComputerUseManager } from './computer-use-manager';

// --------------- Types ---------------

export type BackendToolCall = {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

export type ToolResultPayload = {
  toolCallId: string;
  output: string;
  status: 'success' | 'error' | 'rejected';
};

export type ToolExecutionEvent = {
  type: 'tool:start' | 'tool:done' | 'tool:error' | 'tool:awaiting-approval';
  toolCallId: string;
  toolName: string;
  threadId: string;
  message?: string;
  result?: ToolResultPayload;
  toolCall?: BackendToolCall;
};

export type ToolExecutionCallback = (event: ToolExecutionEvent) => void;

// --------------- Constants ---------------

/** Default timeout per tool execution (ms) */
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/** Commands treated as read-only shell access */
const READ_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'echo', 'pwd', 'which', 'whoami', 'date',
  'git status', 'git log', 'git diff', 'git branch',
]);

// --------------- ToolExecutionBridge ---------------

export class ToolExecutionBridge {
  constructor(
    private ptyPool: PtyPool,
    private approvalEngine: ApprovalEngine,
    private localServicePort: () => number,
    private localServiceToken: () => string,
    private backendPort: () => number,
    private authToken: () => string | Promise<string>,
    private currentMode: () => ApprovalMode,
    private computerUseManager?: ComputerUseManager,
  ) {}

  /**
   * Execute a tool call in the context of a thread.
   *
   * Flow:
   * 1. Evaluate approval policy → auto-approve / request / deny
   * 2. If approved, execute (PTY, local-service, or direct)
   * 3. Submit result to backend
   * 4. Return the result payload
   */
  public async execute(
    toolCall: BackendToolCall,
    threadId: string,
    onEvent?: ToolExecutionCallback,
  ): Promise<ToolResultPayload> {
    const { toolCallId, toolName, arguments: args } = toolCall;
    const mode = this.currentMode();

    // 1. Approval check
    const approvalRequest: ToolApprovalRequest = {
      toolCallId,
      toolName,
      args: args as Record<string, unknown>,
      resourceType: this.classifyTool(toolName, args),
      description: this.describeToolCall(toolName, args),
      threadId,
      mode,
    };

    const approval = this.approvalEngine.evaluate(approvalRequest);

    if (approval.decision === 'rejected') {
      const result: ToolResultPayload = {
        toolCallId,
        output: '[Tool execution denied by policy]',
        status: 'rejected',
      };
      await this.submitResult(result).catch(err => {
        console.error('[tool-bridge] failed to submit rejected result:', err);
      });
      onEvent?.({ type: 'tool:error', toolCallId, toolName, threadId, message: 'Denied by policy', result });
      return result;
    }

    if (approval.decision === 'requires-approval') {
      // Needs user approval — emit event and wait (caller should show dialog)
      onEvent?.({
        type: 'tool:awaiting-approval',
        toolCallId,
        toolName,
        threadId,
        message: this.describeToolCall(toolName, args),
        toolCall,
      });
      // Caller should re-invoke executeApproved/reject through IPC after user responds.
      return { toolCallId, output: '', status: 'error' };
    }

    // 2. Execute
    onEvent?.({ type: 'tool:start', toolCallId, toolName, threadId });

    try {
      const output = await this.execTool(toolCall, threadId);
      const result: ToolResultPayload = {
        toolCallId,
        output,
        status: 'success',
      };

      // 3. Submit to backend
      await this.submitResult(result).catch(err => {
        console.error('[tool-bridge] failed to submit result:', err);
      });

      onEvent?.({ type: 'tool:done', toolCallId, toolName, threadId, result });
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const result: ToolResultPayload = {
        toolCallId,
        output: `[Error] ${errorMsg}`,
        status: 'error',
      };

      await this.submitResult(result).catch(() => {});

      onEvent?.({ type: 'tool:error', toolCallId, toolName, threadId, message: errorMsg, result });
      return result;
    }
  }

  /**
   * Execute a user-approved tool call (called after user clicks "Allow").
   */
  public async executeApproved(
    toolCall: BackendToolCall,
    threadId: string,
    onEvent?: ToolExecutionCallback,
  ): Promise<ToolResultPayload> {
    const { toolCallId, toolName, arguments: args } = toolCall;

    onEvent?.({ type: 'tool:start', toolCallId, toolName, threadId });

    try {
      const output = await this.execTool(toolCall, threadId);
      const result: ToolResultPayload = { toolCallId, output, status: 'success' };
      await this.submitResult(result).catch(() => {});
      onEvent?.({ type: 'tool:done', toolCallId, toolName, threadId, result });
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const result: ToolResultPayload = {
        toolCallId,
        output: `[Error] ${errorMsg}`,
        status: 'error',
      };
      await this.submitResult(result).catch(() => {});
      onEvent?.({ type: 'tool:error', toolCallId, toolName, threadId, message: errorMsg, result });
      return result;
    }
  }

  // ---- Tool Execution ----

  private async execTool(toolCall: BackendToolCall, threadId: string): Promise<string> {
    const { toolName, arguments: args } = toolCall;

    switch (toolName) {
      case 'execute_cli_command':
      case 'cli':
        return this.execCli(args, threadId);

      case 'readFile':
        return this.execReadFile(args);

      case 'writeFile':
        return this.execWriteFile(args, threadId);

      case 'searchCode':
        return this.execSearchCode(args, threadId);

      case 'listRepoTree':
        return this.execListTree(args);

      case 'computer_use':
        return this.execComputerUse(args);

      default:
        // Unknown tool — try executing as a raw shell command
        const cmd = String(args.command || args.cmd || '');
        if (cmd) return this.execCli({ command: cmd, description: '' }, threadId);
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async execCli(args: Record<string, unknown>, threadId: string): Promise<string> {
    const command = String(args.command || args.cmd || args.script || '');
    const timeoutMs = Number(args.timeout) || DEFAULT_TOOL_TIMEOUT_MS;

    if (!command) throw new Error('No command provided');

    const terminal = this.ptyPool.findByThreadId(threadId);

    // For read-only commands, collect output directly
    if (this.isReadOnlyCommand(command)) {
      return this.collectOutput(command, terminal?.cwd ?? process.cwd(), timeoutMs);
    }

    if (!terminal) throw new Error(`No terminal found for thread ${threadId}`);

    // Write command to the PTY
    return new Promise<string>((resolve) => {
      const outputBuffer: string[] = [];
      const startMarker = `__TOOL_START_${Date.now()}__`;
      const endMarker = `__TOOL_END_${Date.now()}__`;
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const finish = (output: string) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        if (timer) clearTimeout(timer);
        resolve(output);
      };

      const unsubscribe = this.ptyPool.onData(terminal.id, (data: string) => {
        outputBuffer.push(data);

        if (data.includes(endMarker)) {
          // Extract output between markers
          const fullOutput = outputBuffer.join('');
          const match = fullOutput.match(new RegExp(`${startMarker}([\\s\\S]*)${endMarker}`));
          const result = match
            ? match[1].trim()
            : fullOutput.replace(new RegExp(`${startMarker}|${endMarker}`, 'g'), '').trim();
          finish(result || '(command completed with no output)');
        }
      });

      // Safety timeout
      timer = setTimeout(() => {
        const fullOutput = outputBuffer.join('');
        const result = fullOutput.replace(new RegExp(`${startMarker}|${endMarker}`, 'g'), '').trim();
        finish(result || `(command timed out after ${timeoutMs}ms)`);
      }, timeoutMs);

      // Write the command with markers
      terminal.process.write(`echo "${startMarker}" && ${command} && echo "${endMarker}" || echo "${endMarker}"\n`);
    });
  }

  private async execReadFile(args: Record<string, unknown>): Promise<string> {
    const filePath = String(args.path || '');
    if (!filePath) throw new Error('No file path provided');

    const port = this.localServicePort();
    const token = this.localServiceToken();
    const resp = await fetch(`http://127.0.0.1:${port}/file?path=${encodeURIComponent(filePath)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`readFile failed: ${resp.status} ${await resp.text()}`);
    const data = await resp.json() as { content?: string; error?: string };
    if (data.error) throw new Error(data.error);
    return data.content ?? '';
  }

  private async execWriteFile(args: Record<string, unknown>, threadId: string): Promise<string> {
    // WriteFile is handled by the backend tool via local filesystem
    // For now, delegate to the PTY using cat / tee
    const filePath = String(args.path || '');
    const content = String(args.content || '');
    if (!filePath) throw new Error('No file path provided');

    const escapedPath = filePath.replace(/'/g, "'\\''");
    return this.execCli({
      command: `cat > '${escapedPath}' << 'ENDOFFILE'\n${content}\nENDOFFILE`,
    }, threadId);
  }

  private async execSearchCode(args: Record<string, unknown>, threadId: string): Promise<string> {
    const query = String(args.query || '');
    const path = String(args.path || '.');

    if (!query) throw new Error('No search query provided');

    // Use ripgrep if available, fall back to grep
    const cmd = `rg -n --context 1 '${query.replace(/'/g, "'\\''")}' '${path}' 2>/dev/null || grep -rn --context 1 '${query.replace(/'/g, "'\\''")}' '${path}' 2>/dev/null || echo '(no matches found)'`;
    return this.execCli({ command: cmd }, threadId);
  }

  private async execListTree(args: Record<string, unknown>): Promise<string> {
    const dirPath = String(args.path || '.');
    const depth = Number(args.depth) || 2;

    const port = this.localServicePort();
    const token = this.localServiceToken();
    const resp = await fetch(`http://127.0.0.1:${port}/workspace/tree?path=${encodeURIComponent(dirPath)}&depth=${depth}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`listRepoTree failed: ${resp.status}`);
    const data = await resp.json() as { tree?: unknown };
    return JSON.stringify(data.tree ?? [], null, 2);
  }

  private async execComputerUse(args: Record<string, unknown>): Promise<string> {
    if (!this.computerUseManager) {
      throw new Error('Computer Use manager is not available');
    }
    const result = await this.computerUseManager.execute(args);
    return JSON.stringify(result, null, 2);
  }

  // ---- Backend Result Submission ----

  private async submitResult(result: ToolResultPayload): Promise<void> {
    const port = this.backendPort();
    const token = await this.authToken();
    const resp = await fetch(`http://127.0.0.1:${port}/api/v1/agent/chat/tool_result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        toolCallId: result.toolCallId,
        output: result.output,
        status: result.status,
      }),
    });
    if (!resp.ok) {
      throw new Error(`submitResult failed: ${resp.status}`);
    }
  }

  // ---- Utilities ----

  private classifyTool(toolName: string, args: Record<string, unknown>): import('./approval-engine').ResourceType {
    if (toolName === 'execute_cli_command' || toolName === 'cli') {
      const cmd = String(args.command || args.cmd || '');
      if (/^(npm|pip|brew|cargo|apt|yum|gem)\s+(install|add|update)/.test(cmd)) {
        return 'shell:install';
      }
      if (this.isReadOnlyCommand(cmd)) {
        return 'shell:read';
      }
      return 'shell:command';
    }
    if (toolName === 'writeFile') return 'file:write';
    if (toolName === 'readFile') {
      const p = String(args.path || '');
      if (p.startsWith('~/.ssh') || p.startsWith('~/.aws') || p.startsWith('/etc/') || p.startsWith('~/.config')) {
        return 'file:read-external';
      }
      return 'shell:read'; // project-local file reads are safe-read ops
    }
    if (toolName === 'computer_use') {
      const action = String(args.action || '');
      if (action === 'screenshot') return 'computer:screenshot';
      return 'computer';
    }
    return 'shell:command';
  }

  private isReadOnlyCommand(cmd: string): boolean {
    const firstWord = cmd.trim().split(/\s+/)[0] || '';
    if (READ_COMMANDS.has(firstWord)) return true;
    if (/^git\s+(status|log|diff|branch|show|ls-files)/.test(cmd)) return true;
    return false;
  }

  private describeToolCall(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case 'execute_cli_command':
      case 'cli':
        return `运行命令: ${args.command || args.cmd || ''}`;
      case 'readFile':
        return `读取文件: ${args.path || ''}`;
      case 'writeFile':
        return `写入文件: ${args.path || ''}`;
      case 'searchCode':
        return `搜索代码: ${args.query || ''}`;
      case 'listRepoTree':
        return `浏览目录: ${args.path || '.'}`;
      case 'computer_use':
        return `电脑操作: ${args.action || 'unknown'}${args.action === 'click' ? ` (${args.x}, ${args.y})` : ''}${args.action === 'type' ? ` text="${String(args.text || '').slice(0, 40)}"` : ''}${args.action === 'keypress' ? ` key="${args.key}"` : ''}`;
      default:
        return `${toolName}: ${JSON.stringify(args)}`;
    }
  }

  private collectOutput(command: string, cwd: string, _timeoutMs: number): Promise<string> {
    // For simple read-only commands, execute via child_process directly
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    return execAsync(command, { timeout: _timeoutMs, cwd })
      .then((r: { stdout: string; stderr: string }) => {
        const output = r.stdout || r.stderr || '';
        return output.trim() || '(no output)';
      })
      .catch((err: { stdout?: string; stderr?: string; message: string }) => {
        return err.stdout || err.stderr || err.message;
      });
  }
}
