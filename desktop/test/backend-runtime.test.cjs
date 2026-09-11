const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const runtimeModulePath = '../dist/main/main/backend-runtime.js';

const loadRuntimeModule = () => {
  delete require.cache[require.resolve(runtimeModulePath)];
  return require(runtimeModulePath);
};

const SECRETS = { jwtSecret: 'unit-test-jwt-secret', dbEncryptionKey: 'unit-test-db-key' };

const writeFile = (target, contents = 'binary') => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  fs.chmodSync(target, 0o755);
};

const withResourceRoot = (callback) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-runtime-'));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test('defaults to the Java baseline when no configuration is present', () => {
  withResourceRoot((resourceRoot) => {
    const { resolveBackendRuntime, getJavaRuntimePaths } = loadRuntimeModule();
    const resolution = resolveBackendRuntime({
      resourceRoot,
      isPackaged: true,
      env: {},
      platform: 'darwin',
    });

    assert.equal(resolution.runtime.kind, 'java');
    assert.equal(resolution.source, 'default');
    const expected = getJavaRuntimePaths(resourceRoot, 'darwin');
    assert.equal(resolution.runtime.command, expected.command);
    assert.deepEqual(resolution.missingArtifacts, [expected.command, expected.jarPath]);
  });
});

test('build config selects the Python runtime', () => {
  withResourceRoot((resourceRoot) => {
    fs.writeFileSync(
      path.join(resourceRoot, 'backend-runtime.json'),
      JSON.stringify({ backendRuntime: 'python' }),
    );
    const executable = path.join(
      resourceRoot,
      'backend-python',
      'knowledge-desk-backend',
      'knowledge-desk-backend',
    );
    writeFile(executable);

    const { resolveBackendRuntime } = loadRuntimeModule();
    const resolution = resolveBackendRuntime({
      resourceRoot,
      isPackaged: true,
      env: {},
      platform: 'darwin',
    });

    assert.equal(resolution.runtime.kind, 'python');
    assert.equal(resolution.source, 'build-config');
    assert.equal(resolution.runtime.command, executable);
    assert.deepEqual(resolution.missingArtifacts, []);
  });
});

test('an unreadable build config falls back to the default with a notice', () => {
  withResourceRoot((resourceRoot) => {
    fs.writeFileSync(path.join(resourceRoot, 'backend-runtime.json'), '{ not json');
    const { resolveBackendRuntime } = loadRuntimeModule();
    const resolution = resolveBackendRuntime({
      resourceRoot,
      isPackaged: true,
      env: {},
      platform: 'darwin',
    });

    assert.equal(resolution.runtime.kind, 'java');
    assert.match(resolution.notice ?? '', /unreadable/);
  });
});

test('an unknown runtime value is ignored with a notice', () => {
  withResourceRoot((resourceRoot) => {
    fs.writeFileSync(
      path.join(resourceRoot, 'backend-runtime.json'),
      JSON.stringify({ backendRuntime: 'ruby' }),
    );
    const { resolveBackendRuntime } = loadRuntimeModule();
    const resolution = resolveBackendRuntime({
      resourceRoot,
      isPackaged: true,
      env: {},
      platform: 'darwin',
    });

    assert.equal(resolution.runtime.kind, 'java');
    assert.match(resolution.notice ?? '', /must be "java" or "python"/);
  });
});

test('the environment override wins in development only', () => {
  withResourceRoot((resourceRoot) => {
    const { resolveBackendRuntime } = loadRuntimeModule();

    const development = resolveBackendRuntime({
      resourceRoot,
      isPackaged: false,
      env: { KD_BACKEND_RUNTIME: 'python' },
      platform: 'darwin',
    });
    assert.equal(development.runtime.kind, 'python');
    assert.equal(development.source, 'env');

    const packaged = resolveBackendRuntime({
      resourceRoot,
      isPackaged: true,
      env: { KD_BACKEND_RUNTIME: 'python' },
      platform: 'darwin',
    });
    assert.equal(packaged.runtime.kind, 'java');
    assert.match(packaged.notice ?? '', /Ignoring KD_BACKEND_RUNTIME/);
  });
});

test('a development checkout may point at a local Python backend', () => {
  withResourceRoot((resourceRoot) => {
    const { resolveBackendRuntime } = loadRuntimeModule();
    const local = path.join(resourceRoot, 'tools', 'knowledge-desk-backend');
    writeFile(local);

    const development = resolveBackendRuntime({
      resourceRoot,
      isPackaged: false,
      env: { KD_BACKEND_RUNTIME: 'python', KD_PYTHON_BACKEND_PATH: local },
      platform: 'darwin',
    });
    assert.equal(development.runtime.command, local);

    const packaged = resolveBackendRuntime({
      resourceRoot,
      isPackaged: true,
      env: { KD_PYTHON_BACKEND_PATH: local },
      platform: 'darwin',
    });
    assert.equal(packaged.runtime.kind, 'java');
  });
});

test('the Python runtime receives environment driven configuration and no arguments', () => {
  withResourceRoot((resourceRoot) => {
    const { createPythonRuntime } = loadRuntimeModule();
    const runtime = createPythonRuntime('/bundle/knowledge-desk-backend', 'darwin');
    const context = {
      port: 18080,
      dataDir: '/tmp/kd-data',
      secrets: SECRETS,
    };

    assert.deepEqual(runtime.resolveArgs(context), []);
    assert.deepEqual(runtime.resolveEnv(context), {
      KD_DATA_DIR: '/tmp/kd-data',
      KD_HOST: '127.0.0.1',
      KD_PORT: '18080',
      KD_DESKTOP_MODE: 'true',
      KD_JWT_SECRET: SECRETS.jwtSecret,
      KD_DB_ENCRYPTION_KEY: SECRETS.dbEncryptionKey,
      PYTHONUNBUFFERED: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    });
    assert.equal(runtime.describe(), 'python (knowledge-desk-backend)');
  });
});

test('the Java runtime keeps the Spring Boot argument and environment contract', () => {
  withResourceRoot((resourceRoot) => {
    const { createJavaRuntime } = loadRuntimeModule();
    const runtime = createJavaRuntime('/bundle/jre/bin/java', '/bundle/backend.jar', 'darwin');
    const context = { port: 18099, dataDir: '/tmp/kd-data', secrets: SECRETS };

    assert.deepEqual(runtime.resolveArgs(context), [
      '-jar',
      '/bundle/backend.jar',
      '--spring.profiles.active=desktop',
      '--server.port=18099',
      '--server.address=127.0.0.1',
      '--app.data-dir=/tmp/kd-data',
    ]);
    assert.deepEqual(runtime.resolveEnv(context), {
      SPRING_OUTPUT_ANSI_ENABLED: 'never',
      APP_DESKTOP_MODE: 'true',
      JWT_SECRET: SECRETS.jwtSecret,
      SECURITY_DB_ENCRYPTION_KEY: SECRETS.dbEncryptionKey,
    });
    assert.equal(runtime.describe(), 'java (java -jar backend.jar)');
  });
});

test('windows executables use the .exe suffix', () => {
  withResourceRoot((resourceRoot) => {
    const { resolveBackendRuntime, getJavaRuntimePaths } = loadRuntimeModule();
    assert.ok(getJavaRuntimePaths(resourceRoot, 'win32').command.endsWith('java.exe'));

    fs.writeFileSync(
      path.join(resourceRoot, 'backend-runtime.json'),
      JSON.stringify({ backendRuntime: 'python' }),
    );
    const resolution = resolveBackendRuntime({
      resourceRoot,
      isPackaged: true,
      env: {},
      platform: 'win32',
    });
    assert.ok(resolution.runtime.command.endsWith('knowledge-desk-backend.exe'));
  });
});

test('missing artifacts are reported instead of silently switching baseline', () => {
  withResourceRoot((resourceRoot) => {
    fs.writeFileSync(
      path.join(resourceRoot, 'backend-runtime.json'),
      JSON.stringify({ backendRuntime: 'python' }),
    );
    const { describeMissingArtifacts, resolveBackendRuntime } = loadRuntimeModule();
    const resolution = resolveBackendRuntime({
      resourceRoot,
      isPackaged: true,
      env: {},
      platform: 'darwin',
    });

    assert.equal(resolution.runtime.kind, 'python');
    assert.equal(resolution.missingArtifacts.length, 1);
    assert.match(resolution.missingArtifacts[0], /backend-python/);
    assert.match(describeMissingArtifacts(resolution) ?? '', /runtime "python" is incomplete/);
  });
});
