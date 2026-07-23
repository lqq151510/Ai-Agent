#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

fail() {
  echo "[release-version] $*" >&2
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  fail "missing required command: node"
fi

package_version() {
  local package_file="$1"
  node -p "require('${package_file}').version"
}

maven_project_version() {
  local pom_file="$1"
  node - "${pom_file}" <<'NODE'
const fs = require('fs');
const pomPath = process.argv[2];
let xml = fs.readFileSync(pomPath, 'utf8');
xml = xml.replace(/<!--[\s\S]*?-->/g, '');
xml = xml.replace(/<parent>[\s\S]*?<\/parent>/, '');
const match = xml.match(/<version>\s*([^<\s]+)\s*<\/version>/);
if (!match) {
  throw new Error(`cannot read project version from ${pomPath}`);
}
process.stdout.write(match[1]);
NODE
}

reference_version="$(package_version "${ROOT_DIR}/desktop/package.json")"
components=(
  "desktop|${reference_version}"
  "ts-cli|$(package_version "${ROOT_DIR}/ts-cli/package.json")"
  "local-service|$(package_version "${ROOT_DIR}/local-service/package.json")"
  "root-maven|$(maven_project_version "${ROOT_DIR}/pom.xml")"
  "backend|$(maven_project_version "${ROOT_DIR}/backend/pom.xml")"
  "bug-sentinel-starter|$(maven_project_version "${ROOT_DIR}/bug-sentinel-starter/pom.xml")"
)

for component in "${components[@]}"; do
  name="${component%%|*}"
  version="${component#*|}"
  if [[ "${version}" != "${reference_version}" ]]; then
    fail "${name} version ${version} does not match desktop version ${reference_version}"
  fi
done

echo "[release-version] all release components use ${reference_version}"
