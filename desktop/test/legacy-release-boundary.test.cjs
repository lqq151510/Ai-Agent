const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const legacyDevtoolsGuard = /!app\.isPackaged\s*&&\s*process\.env\.AI_AGENT_ENABLE_LEGACY_DEVTOOLS\s*===\s*['"]1['"]/;

test('packaged builds cannot activate legacy Computer Use IPC through an environment variable', () => {
  const mainSource = fs.readFileSync(
    path.join(__dirname, '../src/main/index.ts'),
    'utf8',
  );
  const ipcRegistrySource = fs.readFileSync(
    path.join(__dirname, '../src/main/ipc-registry.ts'),
    'utf8',
  );

  assert.match(mainSource, legacyDevtoolsGuard);
  assert.match(ipcRegistrySource, legacyDevtoolsGuard);
});
