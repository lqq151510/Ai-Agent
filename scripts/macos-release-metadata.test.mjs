import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMacosReleaseMetadata } from './macos-release-metadata.mjs';

function sample({ version = '0.1.0-beta.1', shortVersion = '0.1.0', bundleVersion = '1' } = {}) {
  return {
    packageJson: { version },
    builderConfig: [
      'appId: com.agent.aiagent',
      'mac:',
      '  bundleShortVersion: "' + shortVersion + '"',
      '  bundleVersion: "' + bundleVersion + '"',
    ].join('\n'),
  };
}

test('maps an npm prerelease to Apple numeric bundle metadata', () => {
  assert.deepEqual(resolveMacosReleaseMetadata(sample()), {
    version: '0.1.0-beta.1',
    appId: 'com.agent.aiagent',
    bundleShortVersion: '0.1.0',
    bundleVersion: '1',
  });
});

test('rejects a prerelease suffix in CFBundleShortVersionString', () => {
  assert.throws(
    () => resolveMacosReleaseMetadata(sample({ shortVersion: '0.1.0-beta.1' })),
    /must contain only three numeric dot-separated components/,
  );
});

test('requires the configured short version to match the npm version core', () => {
  assert.throws(
    () => resolveMacosReleaseMetadata(sample({ shortVersion: '0.1.1' })),
    /must equal the numeric core 0\.1\.0/,
  );
});

test('rejects a non-numeric CFBundleVersion', () => {
  assert.throws(
    () => resolveMacosReleaseMetadata(sample({ bundleVersion: 'beta.1' })),
    /must contain only one to three numeric dot-separated components/,
  );
});
