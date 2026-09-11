const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const desktopRoot = path.join(__dirname, '..');
const projectRoot = path.join(desktopRoot, '..');

const read = (relativePath) => fs.readFileSync(path.join(desktopRoot, relativePath), 'utf8');

test('electron-builder ships both backend runtimes and the runtime selector', () => {
  const builderConfig = read('electron-builder.yml');

  assert.match(
    builderConfig,
    /-\s+from:\s*backend-jre\s*\n\s+to:\s*backend-jre/,
    'the Java baseline must stay packaged',
  );
  assert.match(
    builderConfig,
    /-\s+from:\s*backend-python\s*\n\s+to:\s*backend-python/,
    'the Python baseline must be packaged as an extraResource',
  );
  assert.match(
    builderConfig,
    /-\s+from:\s*backend-runtime\.json\s*\n\s+to:\s*backend-runtime\.json/,
    'the runtime selector must be packaged so the launcher can read it',
  );
});

test('the packaged runtime selector defaults to the Java baseline', () => {
  const config = JSON.parse(read('backend-runtime.json'));
  assert.equal(config.backendRuntime, 'java');
});

test('the python backend build is exposed as an explicit, non-default step', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['build:python-backend'], 'bash scripts/build-python-backend.sh');
  assert.match(packageJson.scripts.clean, /backend-python\/knowledge-desk-backend/);

  // The default build path must not build or select the Python runtime implicitly.
  for (const script of ['build', 'pack', 'dist', 'dist:mac']) {
    assert.doesNotMatch(
      packageJson.scripts[script] ?? '',
      /build-python-backend|backend-runtime\.json/,
      `${script} must not switch the backend baseline implicitly`,
    );
  }
});

test('the python build script verifies the produced binary and prunes dev artefacts', () => {
  const buildScript = fs.readFileSync(
    path.join(projectRoot, 'python-backend', 'scripts', 'build-binary.sh'),
    'utf8',
  );

  assert.match(buildScript, /--extra build/, 'the PyInstaller extra must be installed');
  assert.match(buildScript, /BUNDLE_NAME="knowledge-desk-backend"/, 'the bundle name must be pinned');
  assert.match(buildScript, /\$BUNDLE_NAME\.spec/, 'the spec file drives the build');
  assert.match(
    buildScript,
    /EXECUTABLE="\$BUNDLE\/\$BUNDLE_NAME"/,
    'the bundle executable must be resolved before verification',
  );

  // Acceptance steps that must not silently disappear.
  assert.match(buildScript, /\.venv/, 'the bundle must be checked for a stray virtualenv');
  assert.match(buildScript, /site-packages/, 'the bundle must be checked for stray site-packages');
  assert.match(buildScript, /health\/ready/, 'the binary must be verified through the readiness probe');
  assert.match(buildScript, /--noproxy/, 'the readiness probe must bypass proxy settings');

  const spec = fs.readFileSync(
    path.join(projectRoot, 'python-backend', 'knowledge-desk-backend.spec'),
    'utf8',
  );
  assert.match(spec, /knowledge_desk\/migrations/, 'Alembic scripts must be bundled as data');
  assert.match(spec, /pdfplumber/, 'lazily imported parsers need explicit hidden imports');
  assert.match(spec, /"pytest"/, 'development dependencies must be excluded');
});
