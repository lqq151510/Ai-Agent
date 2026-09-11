const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const childProcess = require('node:child_process');

const SECRETS = {
  jwtSecret: 'unit-test-jwt-secret-value',
  dbEncryptionKey: 'unit-test-db-encryption-key',
};

const loadBackendManager = () => {
  delete require.cache[require.resolve('../dist/main/main/backend-manager.js')];
  return require('../dist/main/main/backend-manager.js').BackendManager;
};

const loadRuntimeModule = () => {
  delete require.cache[require.resolve('../dist/main/main/backend-runtime.js')];
  return require('../dist/main/main/backend-runtime.js');
};

const createFakeExecutable = (target) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '#!/bin/sh\n');
  fs.chmodSync(target, 0o755);
};

/** Stub `spawn` with a child that records how it was launched. */
const stubSpawn = (record) => {
  const original = childProcess.spawn;
  childProcess.spawn = (command, args, options) => {
    record.command = command;
    record.args = args;
    record.options = options;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 4242;
    child.kill = (signal) => {
      record.killSignal = signal;
      child.emit('close', 0);
      return true;
    };
    record.child = child;
    return child;
  };
  return () => {
    childProcess.spawn = original;
  };
};

const stubHealth = (statusCode) => {
  const original = http.get;
  http.get = (_url, callback) => {
    process.nextTick(() => callback({ statusCode, resume() {} }));
    return {
      on() {
        return this;
      },
      setTimeout() {
        return this;
      },
      destroy() {},
    };
  };
  return () => {
    http.get = original;
  };
};

test('managed Java backend starts from its writable runtime directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-backend-runtime-'));
  const runtimeDirectory = path.join(root, 'runtime');
  const javaPath = path.join(root, 'jre', 'bin', 'java');
  const jarPath = path.join(root, 'backend.jar');
  createFakeExecutable(javaPath);
  fs.writeFileSync(jarPath, 'jar');

  const record = {};
  const restoreSpawn = stubSpawn(record);
  const restoreHealth = stubHealth(200);

  try {
    const BackendManager = loadBackendManager();
    const manager = new BackendManager(javaPath, jarPath, runtimeDirectory, 18080, {
      secrets: SECRETS,
      startupTimeoutMs: 100,
      healthCheckIntervalMs: 1,
    });

    await manager.start();

    assert.equal(record.command, javaPath);
    assert.deepEqual(record.args, [
      '-jar',
      jarPath,
      '--spring.profiles.active=desktop',
      '--server.port=18080',
      '--server.address=127.0.0.1',
      `--app.data-dir=${runtimeDirectory}`,
    ]);
    assert.equal(record.options.cwd, runtimeDirectory);
    assert.equal(record.options.env.JWT_SECRET, SECRETS.jwtSecret);
    assert.equal(record.options.env.SECURITY_DB_ENCRYPTION_KEY, SECRETS.dbEncryptionKey);

    const status = manager.getStatus();
    assert.equal(status.status, 'running');
    assert.equal(status.runtimeKind, 'java');
    assert.equal(status.pid, 4242);

    const log = fs.readFileSync(path.join(runtimeDirectory, 'logs', 'desktop-runtime.log'), 'utf8');
    assert.match(log, /Backend ready/);

    await manager.stop();
    assert.equal(manager.getStatus().status, 'stopped');
  } finally {
    restoreSpawn();
    restoreHealth();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed Python backend is launched with environment configuration only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-python-backend-'));
  const runtimeDirectory = path.join(root, 'runtime');
  const executable = path.join(root, 'backend-python', 'knowledge-desk-backend', 'knowledge-desk-backend');
  createFakeExecutable(executable);

  const record = {};
  const restoreSpawn = stubSpawn(record);
  const restoreHealth = stubHealth(200);

  try {
    const BackendManager = loadBackendManager();
    const { createPythonRuntime } = loadRuntimeModule();
    const manager = new BackendManager(
      createPythonRuntime(executable, 'darwin'),
      runtimeDirectory,
      18099,
      { secrets: SECRETS, startupTimeoutMs: 100, healthCheckIntervalMs: 1 },
    );

    await manager.start();

    assert.equal(record.command, executable);
    assert.deepEqual(record.args, []);
    assert.equal(record.options.env.KD_DATA_DIR, runtimeDirectory);
    assert.equal(record.options.env.KD_PORT, '18099');
    assert.equal(record.options.env.KD_HOST, '127.0.0.1');
    assert.equal(record.options.env.KD_DESKTOP_MODE, 'true');
    assert.equal(record.options.env.KD_JWT_SECRET, SECRETS.jwtSecret);
    assert.equal(record.options.env.KD_DB_ENCRYPTION_KEY, SECRETS.dbEncryptionKey);
    assert.equal(record.options.env.PYTHONUNBUFFERED, '1');

    const status = manager.getStatus();
    assert.equal(status.status, 'running');
    assert.equal(status.runtimeKind, 'python');
    assert.match(status.runtimeLabel, /^python \(/);
    assert.equal(status.port, 18099);

    const log = fs.readFileSync(path.join(runtimeDirectory, 'logs', 'desktop-runtime.log'), 'utf8');
    assert.match(log, /Starting managed backend \(python/);
    assert.match(log, /Backend ready/);

    await manager.stop();
  } finally {
    restoreSpawn();
    restoreHealth();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a timeout is reported without falling back to another runtime', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-python-timeout-'));
  const runtimeDirectory = path.join(root, 'runtime');
  const executable = path.join(root, 'backend-python', 'knowledge-desk-backend', 'knowledge-desk-backend');
  createFakeExecutable(executable);

  const record = {};
  const restoreSpawn = stubSpawn(record);
  const restoreHealth = stubHealth(503);

  try {
    const BackendManager = loadBackendManager();
    const { createPythonRuntime } = loadRuntimeModule();
    const manager = new BackendManager(
      createPythonRuntime(executable, 'darwin'),
      runtimeDirectory,
      18080,
      { secrets: SECRETS, startupTimeoutMs: 20, healthCheckIntervalMs: 1 },
    );

    await assert.rejects(() => manager.start(), /did not become ready/);

    const status = manager.getStatus();
    assert.equal(status.status, 'error');
    assert.equal(status.runtimeKind, 'python');
    assert.match(status.lastError ?? '', /did not become ready/);
    assert.equal(record.killSignal, 'SIGKILL');
    assert.equal(manager.getBaseUrl(), 'http://127.0.0.1:18080');
  } finally {
    restoreSpawn();
    restoreHealth();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a missing runtime artifact fails fast with an actionable message', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-python-missing-'));
  const runtimeDirectory = path.join(root, 'runtime');
  const executable = path.join(root, 'backend-python', 'knowledge-desk-backend', 'knowledge-desk-backend');

  const record = {};
  const restoreSpawn = stubSpawn(record);

  try {
    const BackendManager = loadBackendManager();
    const { createPythonRuntime } = loadRuntimeModule();
    const manager = new BackendManager(
      createPythonRuntime(executable, 'darwin'),
      runtimeDirectory,
      18080,
      { secrets: SECRETS, startupTimeoutMs: 100, healthCheckIntervalMs: 1 },
    );

    await assert.rejects(() => manager.start(), /runtime "python" is incomplete/);

    assert.equal(record.command, undefined, 'nothing must be spawned');
    const status = manager.getStatus();
    assert.equal(status.status, 'error');
    assert.match(status.lastError ?? '', /missing: .*knowledge-desk-backend/);
  } finally {
    restoreSpawn();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('restart replays the same runtime invocation and counts the attempt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-python-restart-'));
  const runtimeDirectory = path.join(root, 'runtime');
  const executable = path.join(root, 'backend-python', 'knowledge-desk-backend', 'knowledge-desk-backend');
  createFakeExecutable(executable);

  const record = { spawnCount: 0 };
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = (command, args, options) => {
    record.spawnCount += 1;
    record.command = command;
    record.args = args;
    record.options = options;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 5000 + record.spawnCount;
    child.kill = (signal) => {
      record.killSignal = signal;
      child.emit('close', 0);
      return true;
    };
    return child;
  };
  const restoreHealth = stubHealth(200);

  try {
    const BackendManager = loadBackendManager();
    const { createPythonRuntime } = loadRuntimeModule();
    const manager = new BackendManager(
      createPythonRuntime(executable, 'darwin'),
      runtimeDirectory,
      18080,
      { secrets: SECRETS, startupTimeoutMs: 100, healthCheckIntervalMs: 1 },
    );

    await manager.start();
    await manager.restart();

    assert.equal(record.spawnCount, 2);
    assert.equal(record.args.length, 0);
    assert.equal(manager.getStatus().restartCount, 1);
    assert.equal(manager.getStatus().status, 'running');
  } finally {
    childProcess.spawn = originalSpawn;
    restoreHealth();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
