#!/usr/bin/env node
/**
 * End-to-end check for the Python backend baseline:
 * Electron launcher -> packaged PyInstaller executable -> readiness probe.
 *
 * Run after `npm run build:python-backend`:
 *
 *   node scripts/verify-python-runtime.cjs
 *
 * Exits 0 with SKIP when the PyInstaller bundle is absent, so a Java-only
 * checkout is never blocked by this check.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const desktopRoot = path.join(__dirname, '..');
const binary = path.join(
  desktopRoot,
  'backend-python',
  'knowledge-desk-backend',
  'knowledge-desk-backend',
);

if (!fs.existsSync(binary) || !fs.statSync(binary).isFile()) {
  console.log(`SKIP python runtime not built (expected at ${binary})`);
  process.exit(0);
}

const { BackendManager } = require('../dist/main/main/backend-manager.js');
const { createPythonRuntime, resolveBackendRuntime } = require('../dist/main/main/backend-runtime.js');

const main = async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-python-runtime-'));
  const port = Number(process.env.KD_BINARY_VERIFY_PORT || 18299);
  const failed = (message) => {
    console.error(`FAIL ${message}`);
    fs.rmSync(dataDir, { recursive: true, force: true });
    process.exit(1);
  };

  const resolution = resolveBackendRuntime({
    resourceRoot: desktopRoot,
    isPackaged: false,
    env: { KD_BACKEND_RUNTIME: 'python', KD_PYTHON_BACKEND_PATH: binary },
    platform: process.platform,
  });
  console.log(
    `runtime=${resolution.runtime.kind} source=${resolution.source} command=${resolution.runtime.command}`,
  );
  if (resolution.runtime.kind !== 'python') {
    failed('runtime resolution did not select the Python baseline');
  }
  if (resolution.missingArtifacts.length > 0) {
    failed(`missing artifacts: ${resolution.missingArtifacts.join(', ')}`);
  }

  const manager = new BackendManager(
    createPythonRuntime(binary, process.platform),
    dataDir,
    port,
    {
      startupTimeoutMs: 60_000,
      secrets: {
        jwtSecret: 'verify-python-runtime-jwt-secret-32-chars',
        dbEncryptionKey: 'verify-python-runtime-encryption-key',
      },
    },
  );

  try {
    await manager.start();
    const status = manager.getStatus();
    console.log(
      `PASS launcher reported ready (status=${status.status}, pid=${status.pid}, kind=${status.runtimeKind})`,
    );

    const response = await fetch(`${manager.getBaseUrl()}/api/v1/system/health/ready`);
    if (response.status !== 200) {
      failed(`readiness endpoint returned ${response.status}`);
    }
    const payload = await response.json();
    console.log(`PASS readiness endpoint 200 (${JSON.stringify(payload)})`);

    const databaseFile = path.join(dataDir, 'knowledge-desk.sqlite3');
    if (!fs.existsSync(databaseFile)) {
      failed('the managed process did not create its SQLite database');
    }
    console.log('PASS SQLite database created inside dataDir');
    console.log(`log: ${status.logPath}`);
  } catch (error) {
    failed(error instanceof Error ? error.message : String(error));
  } finally {
    await manager.stop();
    console.log(`final status: ${manager.getStatus().status}`);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
