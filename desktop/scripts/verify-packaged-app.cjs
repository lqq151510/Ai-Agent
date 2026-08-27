#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const desktopDir = path.resolve(__dirname, '..');
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-desktop-package-'));
const keepArtifacts = process.env.DESKTOP_KEEP_PACKAGE_ARTIFACTS === 'true';
const electronBuilder = path.join(
  desktopDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder',
);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: desktopDir,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with status ${result.status ?? 'unknown'}`);
  }
};

try {
  if (!fs.existsSync(electronBuilder)) {
    throw new Error('electron-builder is not installed; run npm ci in desktop/ first.');
  }

  run(electronBuilder, [
    '--dir',
    '--mac',
    '--config.mac.notarize=false',
    `-c.directories.output=${outputDir}`,
  ], {
    env: {
      ...process.env,
      // A package-layout test is intentionally unsigned and is never a release candidate.
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
  });

  run(process.execPath, ['--test', 'test/packaged/packaged-app-layout.test.cjs'], {
    env: {
      ...process.env,
      DESKTOP_PACKAGE_DIR: outputDir,
    },
  });
} finally {
  if (keepArtifacts) {
    console.log(`Retained package-layout artifacts: ${outputDir}`);
  } else {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}
