const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  getLocalBackendEndpoint,
  localBackendRequestUrl,
  parseLocalBackendEndpoint,
} = require('../dist/main/main/utils/local-backend-endpoint.js');
const { BackendManager } = require('../dist/main/main/backend-manager.js');

function createTemporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-attached-backend-'));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function requestStatus(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      const { statusCode = 0 } = response;
      response.resume();
      response.once('end', () => resolve(statusCode));
    }).once('error', reject);
  });
}

test('local backend attachment accepts only exact loopback HTTP origins', () => {
  assert.deepEqual(parseLocalBackendEndpoint('http://127.0.0.1:18080/'), {
    baseUrl: 'http://127.0.0.1:18080',
    port: 18080,
  });
  assert.deepEqual(parseLocalBackendEndpoint('http://[::1]:18081'), {
    baseUrl: 'http://[::1]:18081',
    port: 18081,
  });
  assert.equal(getLocalBackendEndpoint(undefined), null);
  assert.equal(
    localBackendRequestUrl('http://127.0.0.1:18080/', '/api/v1/system/health/ready'),
    'http://127.0.0.1:18080/api/v1/system/health/ready',
  );
  assert.throws(() => localBackendRequestUrl('http://127.0.0.1:18080', '//unexpected'), /one slash/);

  for (const value of [
    'https://127.0.0.1:18080',
    'http://192.168.1.10:18080',
    'http://127.0.0.1:18080/api',
    'http://user:password@127.0.0.1:18080',
    'http://localhost:18080/?target=remote',
  ]) {
    assert.throws(() => parseLocalBackendEndpoint(value), /DESKTOP_BACKEND_URL/);
  }
});

test('attached BackendManager reconnects without spawning or stopping the external backend', async () => {
  const root = createTemporaryRoot();
  let healthChecks = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/api/v1/system/health/ready') {
      healthChecks += 1;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"status":"UP"}');
      return;
    }
    response.writeHead(404);
    response.end();
  });

  try {
    const address = await listen(server);
    const endpoint = parseLocalBackendEndpoint(`http://127.0.0.1:${address.port}`);
    const manager = new BackendManager(
      '/not-used/when-attached/java',
      '/not-used/when-attached/backend.jar',
      path.join(root, 'runtime'),
      endpoint.port,
      {
        attachedBackend: endpoint,
        startupTimeoutMs: 500,
        healthCheckIntervalMs: 10,
      },
    );

    await manager.start();
    assert.deepEqual(
      {
        status: manager.getStatus().status,
        mode: manager.getStatus().mode,
        pid: manager.getStatus().pid,
        healthUrl: manager.getStatus().healthUrl,
      },
      {
        status: 'running',
        mode: 'attached',
        pid: null,
        healthUrl: `${endpoint.baseUrl}/api/v1/system/health/ready`,
      },
    );

    await manager.restart();
    assert.ok(healthChecks >= 2, 'restart must reconnect to the existing server');
    await manager.stop();
    assert.equal(await requestStatus(manager.getStatus().healthUrl), 200);
  } finally {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
