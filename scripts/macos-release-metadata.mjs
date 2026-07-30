#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(SCRIPT_PATH), '..');

function fail(message) {
  throw new Error('[macos-release-metadata] ' + message);
}

function normalizeYamlScalar(value, fieldName) {
  const withoutComment = value.replace(/\s+#.*$/, '').trim();
  if (!withoutComment) {
    fail('missing value for ' + fieldName);
  }

  const quote = withoutComment[0];
  if (quote === '"' || quote === "'") {
    if (withoutComment.length < 2 || withoutComment.at(-1) !== quote) {
      fail('unterminated quoted value for ' + fieldName);
    }
    return withoutComment.slice(1, -1);
  }

  return withoutComment;
}

function rootYamlScalar(yaml, key) {
  const match = yaml.match(new RegExp('^' + key + ':\\s*(.*?)\\s*$', 'm'));
  if (!match) {
    fail('missing top-level ' + key + ' in desktop/electron-builder.yml');
  }
  return normalizeYamlScalar(match[1], key);
}

function macYamlScalar(yaml, key) {
  const lines = yaml.split(/\r?\n/);
  let inMacBlock = false;

  for (const line of lines) {
    if (!inMacBlock) {
      if (/^mac:\s*(?:#.*)?$/.test(line)) {
        inMacBlock = true;
      }
      continue;
    }

    if (/^[^\s#]/.test(line)) {
      break;
    }

    const match = line.match(new RegExp('^\\s+' + key + ':\\s*(.*?)\\s*$'));
    if (match) {
      return normalizeYamlScalar(match[1], 'mac.' + key);
    }
  }

  fail('missing mac.' + key + ' in desktop/electron-builder.yml');
}

function semverCore(version) {
  const identifier = '(?:0|[1-9]\\d*)';
  const match = version.match(new RegExp(
    '^(' + identifier + '\\.' + identifier + '\\.' + identifier
      + ')(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z.-]+)?$',
  ));
  if (!match) {
    fail('desktop package version is not a supported semantic version: ' + version);
  }
  return match[1];
}

function validateBundleIdentifier(appId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$/.test(appId)) {
    fail('appId must be a reverse-DNS identifier: ' + appId);
  }
}

function validateAppleNumericVersion(value, fieldName, componentCount) {
  const pattern = componentCount === 3
    ? /^[0-9]+(?:\.[0-9]+){2}$/
    : /^[0-9]+(?:\.[0-9]+){0,2}$/;
  if (!pattern.test(value)) {
    const expectedComponents = componentCount === 3 ? 'three' : 'one to three';
    fail(fieldName + ' must contain only ' + expectedComponents
      + ' numeric dot-separated components: ' + value);
  }
}

export function resolveMacosReleaseMetadata({ packageJson, builderConfig }) {
  if (!packageJson || typeof packageJson.version !== 'string') {
    fail('desktop/package.json must contain a string version');
  }

  const version = packageJson.version;
  const versionCore = semverCore(version);
  const appId = rootYamlScalar(builderConfig, 'appId');
  const bundleShortVersion = macYamlScalar(builderConfig, 'bundleShortVersion');
  const bundleVersion = macYamlScalar(builderConfig, 'bundleVersion');

  validateBundleIdentifier(appId);
  validateAppleNumericVersion(bundleShortVersion, 'mac.bundleShortVersion', 3);
  validateAppleNumericVersion(bundleVersion, 'mac.bundleVersion', 1);
  if (bundleShortVersion !== versionCore) {
    fail('mac.bundleShortVersion ' + bundleShortVersion
      + ' must equal the numeric core ' + versionCore
      + ' of desktop version ' + version);
  }

  return {
    version,
    appId,
    bundleShortVersion,
    bundleVersion,
  };
}

export function loadMacosReleaseMetadata(rootDir = ROOT_DIR) {
  const packagePath = path.join(rootDir, 'desktop/package.json');
  const builderConfigPath = path.join(rootDir, 'desktop/electron-builder.yml');
  return resolveMacosReleaseMetadata({
    packageJson: JSON.parse(fs.readFileSync(packagePath, 'utf8')),
    builderConfig: fs.readFileSync(builderConfigPath, 'utf8'),
  });
}

function shellOutput(metadata) {
  const values = {
    MACOS_BUNDLE_ID: metadata.appId,
    MACOS_BUNDLE_SHORT_VERSION: metadata.bundleShortVersion,
    MACOS_BUNDLE_VERSION: metadata.bundleVersion,
  };
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Za-z0-9.-]+$/.test(value)) {
      fail('cannot safely emit ' + key + ' for shell consumption');
    }
  }
  return Object.entries(values).map(([key, value]) => key + '=' + value).join('\n');
}

function main(args) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--json' && args[0] !== '--shell')) {
    fail('usage: node scripts/macos-release-metadata.mjs [--json|--shell]');
  }

  const metadata = loadMacosReleaseMetadata();
  if (args[0] === '--shell') {
    process.stdout.write(shellOutput(metadata) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify(metadata) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
