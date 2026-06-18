import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const execRouter = Router();

const execFileAsync = promisify(execFile);

// Strict whitelist of allowed commands (prefix-based)
const ALLOWED_COMMANDS: Array<{ cmd: string; args?: string[] }> = [
  { cmd: 'git', args: ['status'] },
  { cmd: 'git', args: ['log'] },
  { cmd: 'git', args: ['diff'] },
  { cmd: 'git', args: ['branch'] },
  { cmd: 'git', args: ['stash', 'list'] },
  { cmd: 'ls' },
  { cmd: 'cat' },
  { cmd: 'find' },
  { cmd: 'grep' },
  { cmd: 'echo' },
  { cmd: 'pwd' },
  { cmd: 'node', args: ['--version'] },
  { cmd: 'npm', args: ['--version'] },
  { cmd: 'java', args: ['-version'] },
  { cmd: 'mvn', args: ['--version'] },
];

function isAllowed(cmd: string, args: string[]): boolean {
  for (const allowed of ALLOWED_COMMANDS) {
    if (cmd !== allowed.cmd) continue;
    if (!allowed.args) return true; // cmd-only whitelist, all args ok
    // Check that args start with the whitelisted prefix
    const prefix = allowed.args;
    const match = prefix.every((a, i) => args[i] === a);
    if (match) return true;
  }
  return false;
}

interface ExecBody {
  cmd: string;
  args?: string[];
  cwd?: string;
}

// POST /exec
// Body: { cmd: "git", args: ["status"], cwd: "/path/to/project" }
execRouter.post('/', async (req, res) => {
  const { cmd, args = [], cwd } = req.body as ExecBody;

  if (!cmd) {
    return res.status(400).json({ error: 'cmd is required' });
  }

  if (!isAllowed(cmd, args)) {
    return res.status(403).json({
      error: 'command not in whitelist',
      hint: 'Only read-only git / ls / grep commands are permitted',
    });
  }

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: cwd || process.cwd(),
      timeout: 5000,
      maxBuffer: 256 * 1024,
    });
    return res.json({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 });
  } catch (err: any) {
    return res.status(500).json({
      error: 'command failed',
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || String(err),
      exitCode: err.code ?? 1,
    });
  }
});
