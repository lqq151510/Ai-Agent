const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageDir = process.env.DESKTOP_PACKAGE_DIR;

const findAppBundle = (directory) => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) return entryPath;
    if (entry.isDirectory()) {
      const nested = findAppBundle(entryPath);
      if (nested) return nested;
    }
  }
  return null;
};

test('development package keeps the local runtime outside app.asar', () => {
  assert.ok(packageDir, 'DESKTOP_PACKAGE_DIR must point at electron-builder output');
  const appBundle = findAppBundle(packageDir);
  assert.ok(appBundle, 'electron-builder output must contain one .app bundle');

  const resources = path.join(appBundle, 'Contents', 'Resources');
  const appAsar = path.join(resources, 'app.asar');
  const backendJar = path.join(resources, 'backend-jre', 'backend.jar');
  const packagedJava = path.join(resources, 'backend-jre', 'jre', 'bin', 'java');

  assert.ok(fs.statSync(appAsar).size > 0, 'renderer and main process must be packaged in app.asar');
  assert.ok(fs.statSync(backendJar).size > 0, 'the bundled backend JAR must be present');
  assert.ok(fs.statSync(packagedJava).isFile(), 'the bundled JRE must contain java');
  assert.ok(
    (fs.statSync(packagedJava).mode & 0o111) !== 0,
    'the bundled JRE java binary must remain executable',
  );
});
