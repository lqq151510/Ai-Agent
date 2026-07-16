const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isReadOnlyCommand,
  parseCommandArgv,
} = require('../dist/main/main/command-policy.js');
const { ToolExecutionBridge } = require('../dist/main/main/tool-execution-bridge.js');
const {
  isPathWithinRoot,
  normalizeTreeDepth,
  resolveAuthorizedRoot,
} = require('../dist/main/main/workspace-access.js');

test('parseCommandArgv preserves quoted, escaped and empty arguments', () => {
  assert.deepEqual(parseCommandArgv('cat "my file.txt"'), ['cat', 'my file.txt']);
  assert.deepEqual(parseCommandArgv('cat my\\ file.txt'), ['cat', 'my file.txt']);
  assert.deepEqual(parseCommandArgv('echo ""'), ['echo', '']);
  assert.equal(parseCommandArgv('cat "unfinished'), null);
});

test('isReadOnlyCommand accepts only non-mutating git branch forms', () => {
  assert.equal(isReadOnlyCommand('git branch'), true);
  assert.equal(isReadOnlyCommand('git branch --show-current'), true);
  assert.equal(isReadOnlyCommand('git branch feature/new'), false);
  assert.equal(isReadOnlyCommand('git branch -D feature/old'), false);
  assert.equal(isReadOnlyCommand('git branch -m renamed'), false);
});

test('isReadOnlyCommand rejects shell chaining and external git execution', () => {
  assert.equal(isReadOnlyCommand('git status'), true);
  assert.equal(isReadOnlyCommand('cat "notes file.txt"'), true);
  assert.equal(isReadOnlyCommand('git status && rm -rf .'), false);
  assert.equal(isReadOnlyCommand('git diff --ext-diff'), false);
  assert.equal(isReadOnlyCommand('git diff --output=/tmp/leak.patch'), false);
  assert.equal(isReadOnlyCommand('git --paginate log'), false);
  assert.equal(isReadOnlyCommand('cat package.json', process.cwd()), true);
  assert.equal(isReadOnlyCommand('cat /etc/passwd', process.cwd()), false);
  assert.equal(isReadOnlyCommand('head ~/.ssh/id_rsa', process.cwd()), true);
  assert.equal(isReadOnlyCommand('date +%s'), true);
  assert.equal(isReadOnlyCommand('date -s 2030-01-01'), false);
  assert.equal(isReadOnlyCommand('git status --help'), false);
});

test('workspace access rejects escaped paths and normalizes depth', () => {
  assert.equal(resolveAuthorizedRoot(process.cwd(), [process.cwd()]), process.cwd());
  assert.equal(resolveAuthorizedRoot('/tmp', [process.cwd()]), null);
  assert.equal(isPathWithinRoot('package.json', process.cwd()), true);
  assert.equal(isPathWithinRoot('/etc/passwd', process.cwd()), false);
  assert.equal(normalizeTreeDepth(Number.NaN), 2);
  assert.equal(normalizeTreeDepth(99), 5);
  assert.equal(normalizeTreeDepth(-3), 0);
});

test('tool approvals use the main-process pending call and cannot be replayed', async () => {
  const approvalEngine = {
    evaluate: () => ({ decision: 'requires-approval' }),
  };
  const bridge = new ToolExecutionBridge(
    { findByThreadId: () => ({ cwd: process.cwd() }) },
    approvalEngine,
    () => 8765,
    () => 'local-token',
    () => 18080,
    () => 'backend-token',
    () => 'auto-edit',
  );
  bridge.execTool = async toolCall => String(toolCall.arguments.command);
  bridge.submitResult = async () => {};

  await bridge.execute({
    toolCallId: 'call-1',
    toolName: 'execute_cli_command',
    arguments: { command: 'git status' },
  }, 'thread-1');

  const result = await bridge.executeApproved('call-1');
  assert.equal(result.output, 'git status');
  await assert.rejects(() => bridge.executeApproved('call-1'), /not pending/);
  await assert.rejects(() => bridge.executeApproved('forged-call'), /not pending/);
});
