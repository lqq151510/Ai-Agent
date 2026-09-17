const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('managed backend starts from its writable runtime directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-backend-runtime-'));
  const runtimeDirectory = path.join(root, 'runtime');
  const childProcess = require('node:child_process');
  const originalSpawn = childProcess.spawn;
  const originalGet = http.get;
  let spawnOptions;

  childProcess.spawn = (_command, _args, options) => {
    spawnOptions = options;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 12345;
    child.kill = () => {
      child.emit('close', 0);
      return true;
    };
    return child;
  };
  http.get = (_url, callback) => {
    process.nextTick(() => callback({ statusCode: 200, resume() {} }));
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

  try {
    delete require.cache[require.resolve('../dist/main/main/backend-manager.js')];
    const { BackendManager } = require('../dist/main/main/backend-manager.js');
    const manager = new BackendManager('/runtime/java', '/runtime/backend.jar', runtimeDirectory, 18080, {
      secrets: {
        jwtSecret: 'test-jwt-secret',
        dbEncryptionKey: 'test-db-encryption-key',
      },
      startupTimeoutMs: 100,
      healthCheckIntervalMs: 1,
    });

    await manager.start();

    assert.equal(spawnOptions.cwd, runtimeDirectory);
    assert.equal(manager.getStatus().status, 'running');
    await manager.stop();
  } finally {
    childProcess.spawn = originalSpawn;
    http.get = originalGet;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
