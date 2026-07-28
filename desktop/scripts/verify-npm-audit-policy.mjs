#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');

function inputError(message) {
  console.error(`[npm-audit-policy] ${message}`);
  process.exit(2);
}

function parseArgs(args) {
  const values = {
    policy: path.join(desktopDir, 'npm-audit-policy.json'),
    lockfile: path.join(desktopDir, 'package-lock.json'),
    packageJson: path.join(desktopDir, 'package.json'),
    today: new Date().toISOString().slice(0, 10),
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!['--audit-report', '--policy', '--lockfile', '--package-json', '--today'].includes(argument)) {
      inputError(`unknown argument: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      inputError(`missing value for ${argument}`);
    }
    values[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }

  if (!values.auditReport) {
    inputError('missing required --audit-report <path>');
  }
  return values;
}

function readJson(filePath, label) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    inputError(`cannot read ${label} ${filePath}: ${error.message}`);
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    inputError(`cannot parse ${label} ${filePath}: ${error.message}`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function sortedUniqueStrings(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    return undefined;
  }
  const sorted = [...value].sort();
  return new Set(sorted).size === sorted.length ? sorted : undefined;
}

function canonicalAdvisory(advisory) {
  return JSON.stringify({
    vulnerabilityName: advisory.vulnerabilityName,
    name: advisory.name,
    url: advisory.url,
    severity: advisory.severity,
    range: advisory.range,
  });
}

function dependencyNames(packageEntry) {
  const names = new Set();
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (isPlainObject(packageEntry[field])) {
      for (const dependencyName of Object.keys(packageEntry[field])) {
        names.add(dependencyName);
      }
    }
  }
  return [...names];
}

function resolveDependencyPath(packages, parentPath, dependencyName) {
  const candidates = [`${parentPath}/node_modules/${dependencyName}`];
  const segments = parentPath.split('/');
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index] === 'node_modules') {
      candidates.push(`${segments.slice(0, index + 1).join('/')}/${dependencyName}`);
    }
  }
  return candidates.find((candidate) => Object.hasOwn(packages, candidate));
}

function buildReachableDependencyPaths(packages, rootPath) {
  const reachable = new Set([rootPath]);
  const queue = [rootPath];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    const currentPackage = packages[currentPath];
    for (const dependencyName of dependencyNames(currentPackage)) {
      const dependencyPath = resolveDependencyPath(packages, currentPath, dependencyName);
      if (dependencyPath && !reachable.has(dependencyPath)) {
        reachable.add(dependencyPath);
        queue.push(dependencyPath);
      }
    }
  }

  return reachable;
}

function validatePolicyShape(policy, errors) {
  if (!isPlainObject(policy) || policy.schemaVersion !== 1) {
    errors.push('policy schemaVersion must equal 1');
    return;
  }
  if (!isDate(policy.expiresOn)) {
    errors.push('policy expiresOn must be a valid YYYY-MM-DD date');
  }
  if (!Number.isInteger(policy.lockfileVersion)) {
    errors.push('policy lockfileVersion must be an integer');
  }
  if (typeof policy.packageName !== 'string' || policy.packageName.length === 0) {
    errors.push('policy packageName must be a non-empty string');
  }
  if (!isPlainObject(policy.buildRoot)) {
    errors.push('policy buildRoot must be an object');
  } else {
    for (const field of ['name', 'path', 'packageJsonSpec', 'lockedVersion']) {
      if (typeof policy.buildRoot[field] !== 'string' || policy.buildRoot[field].length === 0) {
        errors.push(`policy buildRoot.${field} must be a non-empty string`);
      }
    }
  }
  if (typeof policy.allowedSeverity !== 'string' || policy.allowedSeverity.length === 0) {
    errors.push('policy allowedSeverity must be a non-empty string');
  }
  if (!sortedUniqueStrings(policy.allowedVulnerabilityNames)) {
    errors.push('policy allowedVulnerabilityNames must be a unique string array');
  }
  if (!Array.isArray(policy.allowedAdvisories) || policy.allowedAdvisories.length === 0) {
    errors.push('policy allowedAdvisories must be a non-empty array');
  } else {
    for (const advisory of policy.allowedAdvisories) {
      if (!isPlainObject(advisory) || ['vulnerabilityName', 'name', 'url', 'severity', 'range'].some((field) => typeof advisory[field] !== 'string' || advisory[field].length === 0)) {
        errors.push('each policy allowedAdvisories entry must contain non-empty vulnerabilityName, name, url, severity, and range strings');
      }
    }
  }
}

const options = parseArgs(process.argv.slice(2));
const policy = readJson(options.policy, 'policy');
const lockfile = readJson(options.lockfile, 'lockfile');
const packageJson = readJson(options.packageJson, 'package.json');
const report = readJson(options.auditReport, 'audit report');
const errors = [];
const safePolicy = isPlainObject(policy) ? policy : {};

validatePolicyShape(policy, errors);

if (!isDate(options.today)) {
  errors.push(`--today must be a valid YYYY-MM-DD date: ${options.today}`);
}
if (isDate(safePolicy.expiresOn) && isDate(options.today) && options.today > safePolicy.expiresOn) {
  errors.push(`temporary exception expired on ${safePolicy.expiresOn}; review or remove desktop/npm-audit-policy.json`);
}

if (!isPlainObject(lockfile) || lockfile.lockfileVersion !== safePolicy.lockfileVersion) {
  errors.push(`package-lock.json lockfileVersion must equal policy value ${safePolicy.lockfileVersion}`);
}
if (!isPlainObject(lockfile?.packages)) {
  errors.push('package-lock.json packages must be an object');
}
if (!isPlainObject(packageJson) || packageJson.name !== safePolicy.packageName) {
  errors.push(`package.json name must equal policy value ${safePolicy.packageName}`);
}

const root = isPlainObject(safePolicy.buildRoot) ? safePolicy.buildRoot : {};
const rootPackage = lockfile?.packages?.[root.path];
if (!isPlainObject(rootPackage)) {
  errors.push(`package-lock.json is missing build root ${root.path}`);
} else {
  if (rootPackage.version !== root.lockedVersion) {
    errors.push(`${root.path} must be locked to ${root.lockedVersion}; found ${rootPackage.version || 'missing'}`);
  }
  if (rootPackage.dev !== true) {
    errors.push(`${root.path} must remain dev-only`);
  }
}
if (packageJson?.devDependencies?.[root.name] !== root.packageJsonSpec) {
  errors.push(`package.json devDependencies.${root.name} must equal ${root.packageJsonSpec}`);
}

if (!isPlainObject(report) || report.auditReportVersion !== 2 || !isPlainObject(report.vulnerabilities) || !isPlainObject(report.metadata?.vulnerabilities)) {
  inputError('audit report must use npm auditReportVersion 2 with vulnerabilities and metadata.vulnerabilities objects');
}

const metadata = report.metadata.vulnerabilities;
const reportedNames = Object.keys(report.vulnerabilities).sort();
if (!Number.isInteger(metadata.total) || metadata.total !== reportedNames.length) {
  errors.push(`audit metadata total must equal reported vulnerability names (${reportedNames.length})`);
}
if (!Number.isInteger(metadata.high) || metadata.high !== reportedNames.length) {
  errors.push(`audit metadata high must equal reported vulnerability names (${reportedNames.length})`);
}
for (const severity of ['info', 'low', 'moderate', 'critical']) {
  if (metadata[severity] !== 0) {
    errors.push(`audit metadata ${severity} must be 0`);
  }
}

const allowedNames = new Set(sortedUniqueStrings(safePolicy.allowedVulnerabilityNames) || []);
const reachablePaths = isPlainObject(lockfile?.packages) && typeof root.path === 'string' && Object.hasOwn(lockfile.packages, root.path)
  ? buildReachableDependencyPaths(lockfile.packages, root.path)
  : new Set();
const observedAdvisories = [];

if (reportedNames.length > 0 && report.vulnerabilities[root.name]?.isDirect !== true) {
  errors.push(`audit exception must remain rooted at direct dev dependency ${root.name}`);
}

for (const vulnerabilityName of reportedNames) {
  const vulnerability = report.vulnerabilities[vulnerabilityName];
  if (!allowedNames.has(vulnerabilityName)) {
    errors.push(`unallowed vulnerability reported: ${vulnerabilityName}`);
  }
  if (!isPlainObject(vulnerability)) {
    errors.push(`vulnerability ${vulnerabilityName} must be an object`);
    continue;
  }
  if (vulnerability.severity !== safePolicy.allowedSeverity) {
    errors.push(`vulnerability ${vulnerabilityName} must have severity ${safePolicy.allowedSeverity}; found ${vulnerability.severity || 'missing'}`);
  }
  if (!Array.isArray(vulnerability.nodes) || vulnerability.nodes.length === 0) {
    errors.push(`vulnerability ${vulnerabilityName} must identify at least one installed node`);
  } else {
    for (const nodePath of vulnerability.nodes) {
      const installedPackage = lockfile?.packages?.[nodePath];
      if (!isPlainObject(installedPackage) || installedPackage.dev !== true) {
        errors.push(`vulnerability ${vulnerabilityName} is not dev-only at ${nodePath}`);
      }
      if (!reachablePaths.has(nodePath)) {
        errors.push(`vulnerability ${vulnerabilityName} is outside the ${root.name} build dependency chain at ${nodePath}`);
      }
    }
  }
  if (!Array.isArray(vulnerability.via)) {
    errors.push(`vulnerability ${vulnerabilityName} must include a via array`);
    continue;
  }
  for (const via of vulnerability.via) {
    if (typeof via === 'string') {
      continue;
    }
    if (!isPlainObject(via)) {
      errors.push(`vulnerability ${vulnerabilityName} contains an invalid advisory entry`);
      continue;
    }
    observedAdvisories.push({
      vulnerabilityName,
      name: via.name,
      url: via.url,
      severity: via.severity,
      range: via.range,
    });
  }
}

const expectedAdvisories = (Array.isArray(safePolicy.allowedAdvisories) ? safePolicy.allowedAdvisories : []).map(canonicalAdvisory).sort();
const actualAdvisories = observedAdvisories.map(canonicalAdvisory).sort();
if (reportedNames.length === 0) {
  if (actualAdvisories.length !== 0) {
    errors.push('a clear audit report must not include advisory entries');
  }
} else if (JSON.stringify(actualAdvisories) !== JSON.stringify(expectedAdvisories)) {
  errors.push('audit advisories do not exactly match the temporary exception policy');
}

if (errors.length > 0) {
  console.error('[npm-audit-policy] desktop full audit rejected:');
  for (const error of errors) {
    console.error(`[npm-audit-policy] - ${error}`);
  }
  process.exit(1);
}

if (reportedNames.length === 0) {
  console.log('[npm-audit-policy] desktop full audit is clear; temporary exception was not used');
} else {
  console.log(`[npm-audit-policy] accepted ${reportedNames.length} dev-only ${root.name}@${root.lockedVersion} build-chain findings through ${safePolicy.expiresOn}`);
}
