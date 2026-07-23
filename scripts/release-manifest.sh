#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_DIR="${1:-${ROOT_DIR}/desktop/release}"
MANIFEST_FILE="${RELEASE_DIR}/release-manifest.json"
CHECKSUM_FILE="${RELEASE_DIR}/SHA256SUMS"

log() {
  echo "[release-manifest] $*"
}

fail() {
  echo "[release-manifest] $*" >&2
  exit 1
}

rel_path() {
  local path="$1"
  echo "${path#"${ROOT_DIR}"/}"
}

if [[ ! -d "${RELEASE_DIR}" ]]; then
  fail "release directory does not exist: ${RELEASE_DIR}"
fi

if ! command -v node >/dev/null 2>&1; then
  fail "missing required command: node"
fi

ROOT_DIR="${ROOT_DIR}" \
RELEASE_DIR="${RELEASE_DIR}" \
MANIFEST_FILE="${MANIFEST_FILE}" \
CHECKSUM_FILE="${CHECKSUM_FILE}" \
node <<'NODE'
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const rootDir = process.env.ROOT_DIR;
const releaseDir = process.env.RELEASE_DIR;
const manifestFile = process.env.MANIFEST_FILE;
const checksumFile = process.env.CHECKSUM_FILE;
const artifactPattern = /\.(dmg|zip|exe|appimage|deb)$/i;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    ...options,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  };
}

function gitValue(args) {
  const result = run('git', args);
  return result.ok ? result.stdout.trim() : null;
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function toRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readElectronBuilderProductName() {
  const builderConfigPath = path.join(rootDir, 'desktop/electron-builder.yml');
  if (!fs.existsSync(builderConfigPath)) {
    return null;
  }

  const builderConfig = fs.readFileSync(builderConfigPath, 'utf8');
  const match = builderConfig.match(/^productName:\s*["']?(.+?)["']?\s*$/m);
  return match ? match[1] : null;
}

function collectArtifacts() {
  return fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && artifactPattern.test(entry.name))
    .map((entry) => {
      const absolutePath = path.join(releaseDir, entry.name);
      const stat = fs.statSync(absolutePath);
      return {
        fileName: entry.name,
        path: entry.name,
        sizeBytes: stat.size,
        sha256: sha256(absolutePath),
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function collectMacApps() {
  if (process.platform !== 'darwin') {
    return [];
  }

  const appRoots = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('mac-'))
    .map((entry) => path.join(releaseDir, entry.name));

  const apps = [];
  for (const appRoot of appRoots) {
    const entries = fs.existsSync(appRoot)
      ? fs.readdirSync(appRoot, { withFileTypes: true })
      : [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith('.app')) {
        continue;
      }

      const appPath = path.join(appRoot, entry.name);
      const codesign = run('codesign', [
        '--verify',
        '--deep',
        '--strict',
        '--verbose=2',
        appPath,
      ]);
      const assessmentStatus = run('spctl', ['--status']);
      const gatekeeper = run('spctl', [
        '--assess',
        '--type',
        'execute',
        '--verbose=4',
        appPath,
      ]);

      apps.push({
        path: toRelative(appPath),
        codesign: {
          ok: codesign.ok,
          output: codesign.output,
        },
        gatekeeper: {
          ok: gatekeeper.ok,
          assessmentsEnabled: !/disabled/i.test(assessmentStatus.output),
          statusOutput: assessmentStatus.output,
          output: gatekeeper.output,
        },
      });
    }
  }

  return apps.sort((a, b) => a.path.localeCompare(b.path));
}

const artifacts = collectArtifacts();
if (artifacts.length === 0) {
  console.error('[release-manifest] no distributable artifacts found under desktop/release');
  process.exit(1);
}

const desktopPackage = readJson(path.join(rootDir, 'desktop/package.json'));
const productName = readElectronBuilderProductName()
  || desktopPackage.productName
  || desktopPackage.name
  || 'AI Agent';
const status = run('git', ['status', '--porcelain', '--untracked-files=no']);
const manifest = {
  schemaVersion: 1,
  project: productName,
  version: desktopPackage.version || null,
  generatedAt: new Date().toISOString(),
  git: {
    branch: gitValue(['rev-parse', '--abbrev-ref', 'HEAD']),
    commit: gitValue(['rev-parse', 'HEAD']),
    trackedDirty: status.ok ? status.stdout.trim().length > 0 : null,
  },
  artifacts,
  applications: collectMacApps(),
};

const checksumLines = artifacts.map((artifact) => `${artifact.sha256}  ${artifact.fileName}`);

fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(checksumFile, `${checksumLines.join('\n')}\n`);
NODE

log "wrote $(rel_path "${MANIFEST_FILE}")"
log "wrote $(rel_path "${CHECKSUM_FILE}")"
