#!/usr/bin/env node
/**
 * Acceptance check for a packaged (electron-builder --dir) build that ships the
 * Python backend baseline.
 *
 *   DESKTOP_PACKAGE_DIR=release/mac-arm64 node scripts/verify-packaged-python-runtime.cjs
 *
 * Verifies, without opening a GUI window:
 *  1. the .app carries the PyInstaller bundle and the runtime selector;
 *  2. the packaged app resolves exactly to the bundled runtime (no env vars);
 *  3. the packaged binary starts through the real launcher path and answers
 *     the readiness probe, creating its SQLite database inside dataDir;
 *  4. the packaged renderer references its assets relatively (file:// safe).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const desktopRoot = path.join(__dirname, '..');
const packageDir = process.env.DESKTOP_PACKAGE_DIR || path.join(desktopRoot, 'release', 'mac-arm64');

const findAppBundle = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) return entryPath;
    if (entry.isDirectory()) {
      const nested = findAppBundle(entryPath);
      if (nested) return nested;
    }
  }
  return null;
};

const appBundle = findAppBundle(packageDir);
if (!appBundle) {
  console.error(`FAIL no .app bundle under ${packageDir} — run "npm run pack" first`);
  process.exit(1);
}

const resources = path.join(appBundle, 'Contents', 'Resources');
const pythonExecutable = path.join(
  resources,
  'backend-python',
  'knowledge-desk-backend',
  'knowledge-desk-backend',
);
const runtimeConfig = path.join(resources, 'backend-runtime.json');

const step = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) process.exitCode = 1;
};

const main = async () => {
  console.log(`app bundle: ${appBundle}`);

  step(
    'packaged python runtime present',
    fs.existsSync(pythonExecutable) && fs.statSync(pythonExecutable).isFile(),
    pythonExecutable,
  );
  step(
    'python runtime is executable',
    fs.existsSync(pythonExecutable) && (fs.statSync(pythonExecutable).mode & 0o111) !== 0,
  );
  step(
    'runtime selector shipped',
    fs.existsSync(runtimeConfig) && JSON.parse(fs.readFileSync(runtimeConfig, 'utf8')).backendRuntime === 'python',
  );

  const { resolveBackendRuntime } = require('../dist/main/main/backend-runtime.js');
  const resolution = resolveBackendRuntime({
    resourceRoot: resources,
    isPackaged: true,
    env: {},
    platform: process.platform,
  });
  step(
    'packaged app resolves to the bundled python runtime',
    resolution.runtime.kind === 'python' && resolution.runtime.command === pythonExecutable,
    `source=${resolution.source}`,
  );
  step(
    'no missing artifacts',
    resolution.missingArtifacts.length === 0,
    resolution.missingArtifacts.join(', '),
  );

  const { BackendManager } = require('../dist/main/main/backend-manager.js');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-packaged-python-'));
  const manager = new BackendManager(resolution.runtime, dataDir, 18399, {
    startupTimeoutMs: 60_000,
    secrets: {
      jwtSecret: 'packaged-verify-jwt-secret-32-characters',
      dbEncryptionKey: 'packaged-verify-encryption-key',
    },
  });

  try {
    await manager.start();
    const status = manager.getStatus();
    step(
      'launcher reports ready',
      status.status === 'running' && status.runtimeKind === 'python',
      `pid=${status.pid}`,
    );

    const response = await fetch(`${manager.getBaseUrl()}/api/v1/system/health/ready`);
    const payload = await response.json();
    step(
      'packaged binary readiness 200',
      response.status === 200 && payload.status === 'ready',
      JSON.stringify(payload),
    );
    step(
      'SQLite database created inside dataDir',
      fs.existsSync(path.join(dataDir, 'knowledge-desk.sqlite3')),
    );
  } catch (error) {
    step('packaged backend start', false, error instanceof Error ? error.message : String(error));
  } finally {
    await manager.stop();
    console.log(`final status: ${manager.getStatus().status}`);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  const asar = require('@electron/asar');
  const appAsar = path.join(resources, 'app.asar');
  const rendererIndex = asar.extractFile(appAsar, 'dist/renderer/index.html').toString('utf8');
  step(
    'renderer references assets relatively',
    /(?:src|href)="\.\/assets\//.test(rendererIndex)
      && !/(?:src|href)="\/assets\//.test(rendererIndex),
  );

  console.log(process.exitCode ? '\nPACKAGED PYTHON RUNTIME: FAILED' : '\nPACKAGED PYTHON RUNTIME: PASSED');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
