#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_NAME="${1:-dev}"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/env/${ENV_NAME}.env"
ENV_EXAMPLE_FILE="${ROOT_DIR}/env/${ENV_NAME}.env.example"

SKIP_BACKEND_TESTS="${RELEASE_CHECK_SKIP_BACKEND_TESTS:-false}"
SKIP_DESKTOP_BUILD="${RELEASE_CHECK_SKIP_DESKTOP_BUILD:-false}"
SKIP_COMPOSE_CONFIG="${RELEASE_CHECK_SKIP_COMPOSE_CONFIG:-false}"
SKIP_NPM_AUDIT="${RELEASE_CHECK_SKIP_NPM_AUDIT:-false}"
PACKAGE_DESKTOP="${RELEASE_CHECK_PACKAGE_DESKTOP:-false}"
DESKTOP_DISTRIBUTABLE="${RELEASE_CHECK_DESKTOP_DISTRIBUTABLE:-false}"
REUSE_DESKTOP_DISTRIBUTABLE="${RELEASE_CHECK_REUSE_DESKTOP_DISTRIBUTABLE:-false}"
PREPARE_DESKTOP_BACKEND="${RELEASE_CHECK_PREPARE_DESKTOP_BACKEND:-false}"
ALLOW_UNSUPPORTED_NODE="${RELEASE_CHECK_ALLOW_UNSUPPORTED_NODE:-false}"
REQUIRE_MAC_SIGNING="${RELEASE_CHECK_REQUIRE_MAC_SIGNING:-false}"
REQUIRE_MAC_GATEKEEPER="${RELEASE_CHECK_REQUIRE_MAC_GATEKEEPER:-false}"
WRITE_RELEASE_MANIFEST="${RELEASE_CHECK_WRITE_MANIFEST:-true}"
DESKTOP_PACKAGE_TIMEOUT_SECONDS="${RELEASE_CHECK_DESKTOP_PACKAGE_TIMEOUT_SECONDS:-600}"
DESKTOP_DISTRIBUTION_TIMEOUT_SECONDS="${RELEASE_CHECK_DESKTOP_DISTRIBUTION_TIMEOUT_SECONDS:-900}"

log() {
  echo "[release-check] $*"
}

fail() {
  echo "[release-check] $*" >&2
  exit 1
}

rel_path() {
  local path="$1"
  echo "${path#"${ROOT_DIR}"/}"
}

normalize_bool() {
  local value="${1:-}"
  value="$(echo "${value}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${value}" == "1" || "${value}" == "true" || "${value}" == "yes" || "${value}" == "on" ]]; then
    echo "true"
    return
  fi
  echo "false"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    fail "missing required command: ${cmd}"
  fi
}

run() {
  log "$*"
  "$@"
}

run_in() {
  local dir="$1"
  shift
  log "(cd $(rel_path "${dir}") && $*)"
  (cd "${dir}" && "$@")
}

run_in_with_timeout() {
  local dir="$1"
  local timeout_seconds="$2"
  shift 2
  log "(cd $(rel_path "${dir}") && timeout ${timeout_seconds}s $*)"
  if command -v timeout >/dev/null 2>&1; then
    (cd "${dir}" && timeout "${timeout_seconds}" "$@")
    return
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    (cd "${dir}" && gtimeout "${timeout_seconds}" "$@")
    return
  fi
  (cd "${dir}" && perl -e 'alarm shift @ARGV; exec @ARGV' "${timeout_seconds}" "$@")
}

resolve_env_file() {
  if [[ -f "${ENV_FILE}" ]]; then
    echo "${ENV_FILE}"
    return
  fi

  if [[ "${ENV_NAME}" == "prod" ]]; then
    fail "prod release requires env/prod.env; refusing to use env/prod.env.example"
  fi

  if [[ -f "${ENV_EXAMPLE_FILE}" ]]; then
    echo "${ENV_EXAMPLE_FILE}"
    return
  fi

  fail "missing env file: env/${ENV_NAME}.env (or .env.example)"
}

reject_placeholder_value() {
  local key="$1"
  local file="$2"
  local line
  line="$(grep -E "^${key}=" "${file}" || true)"
  if [[ -z "${line}" ]]; then
    fail "missing required prod env key: ${key}"
  fi

  local value="${line#*=}"
  if [[ -z "${value}" ]]; then
    fail "empty prod env key: ${key}"
  fi

  if [[ "${value}" =~ (change-me|replace-|placeholder|inject-via-runtime-secret|yourcompany|example\.com|sk-placeholder) ]]; then
    fail "prod env key still uses a placeholder: ${key}"
  fi
}

check_prod_env() {
  local file="$1"
  if [[ "${ENV_NAME}" != "prod" ]]; then
    return
  fi

  reject_placeholder_value "POSTGRES_PASSWORD" "${file}"
  reject_placeholder_value "REDIS_PASSWORD" "${file}"
  reject_placeholder_value "JWT_SECRET" "${file}"
  reject_placeholder_value "OPENAI_BASE_URL" "${file}"
  reject_placeholder_value "OPENAI_API_KEY" "${file}"
  reject_placeholder_value "OPENAI_MODEL" "${file}"
  reject_placeholder_value "CORS_ALLOWED_ORIGINS" "${file}"
}

check_node_modules() {
  local dir="$1"
  if [[ ! -d "${dir}/node_modules" ]]; then
    fail "missing dependencies in $(rel_path "${dir}"); run npm install or npm ci first"
  fi
}

check_desktop_runtime_bundle() {
  local bundle_dir="${ROOT_DIR}/desktop/backend-jre"
  local missing=()

  [[ -f "${bundle_dir}/backend.jar" ]] || missing+=("backend-jre/backend.jar")
  [[ -x "${bundle_dir}/jre/bin/java" ]] || missing+=("backend-jre/jre/bin/java")
  [[ -f "${bundle_dir}/ts-cli/dist/index.js" ]] || missing+=("backend-jre/ts-cli/dist/index.js")
  [[ -f "${bundle_dir}/local-service/dist/index.js" ]] || missing+=("backend-jre/local-service/dist/index.js")

  if [[ ${#missing[@]} -eq 0 ]]; then
    return
  fi

  if [[ "$(normalize_bool "${PREPARE_DESKTOP_BACKEND}")" == "true" ]]; then
    run "${ROOT_DIR}/desktop/scripts/build-backend.sh"
    return
  fi

  fail "desktop runtime bundle is incomplete: ${missing[*]}; run desktop/scripts/build-backend.sh or set RELEASE_CHECK_PREPARE_DESKTOP_BACKEND=true"
}

check_desktop_package_node_version() {
  local node_major
  node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if [[ "${node_major}" -ge 18 && "${node_major}" -le 22 ]]; then
    return
  fi
  if [[ "$(normalize_bool "${ALLOW_UNSUPPORTED_NODE}")" == "true" ]]; then
    log "warning: packaging with unsupported Node.js $(node -v); expected Node.js 18-22"
    return
  fi
  fail "desktop packaging requires Node.js 18-22; current $(node -v). Use Node.js 22 or set RELEASE_CHECK_ALLOW_UNSUPPORTED_NODE=true to force a local diagnostic run"
}

audit_npm_runtime_dependencies() {
  if [[ "$(normalize_bool "${SKIP_NPM_AUDIT}")" == "true" ]]; then
    log "skipping npm production audit"
    return
  fi

  local dirs=(
    "${ROOT_DIR}/desktop"
    "${ROOT_DIR}/desktop/src/renderer"
    "${ROOT_DIR}/ts-cli"
    "${ROOT_DIR}/local-service"
  )

  for dir in "${dirs[@]}"; do
    run_npm_audit_with_retry "${dir}"
  done
}

run_npm_audit_with_retry() {
  local dir="$1"
  local attempt
  for attempt in 1 2 3; do
    log "(cd $(rel_path "${dir}") && npm audit --omit=dev --audit-level=moderate) attempt ${attempt}/3"
    if (cd "${dir}" && npm audit --omit=dev --audit-level=moderate); then
      return
    fi
    if [[ "${attempt}" -lt 3 ]]; then
      sleep "${attempt}"
    fi
  done
  fail "npm production audit failed after 3 attempts: $(rel_path "${dir}")"
}

check_desktop_packaged_output() {
  local release_dir="${ROOT_DIR}/desktop/release"
  local app_asar
  app_asar="$(find "${release_dir}" -path "*/app.asar" -type f | head -n1)"
  if [[ -z "${app_asar}" ]]; then
    fail "desktop package missing app.asar under desktop/release"
  fi

  local required_runtime_files=(
    "backend.jar"
    "jre/bin/java"
    "ts-cli/dist/index.js"
    "local-service/dist/index.js"
  )
  local required
  for required in "${required_runtime_files[@]}"; do
    if ! find "${release_dir}" -path "*/backend-jre/${required}" -type f | grep -q .; then
      fail "desktop package missing backend-jre/${required}"
    fi
  done

  local asar_bin="${ROOT_DIR}/desktop/node_modules/@electron/asar/bin/asar.js"
  if [[ ! -f "${asar_bin}" ]]; then
    log "warning: cannot inspect app.asar contents; @electron/asar binary not found"
    return
  fi

  local forbidden
  forbidden="$(
    node "${asar_bin}" list "${app_asar}" \
      | grep -E '^/node_modules/(electron-builder|app-builder-lib|@electron/rebuild|node-gyp)(/|$)' \
      || true
  )"
  if [[ -n "${forbidden}" ]]; then
    echo "${forbidden}" >&2
    fail "desktop package includes build-time dependencies in app.asar"
  fi
}

check_desktop_distributable_platform() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail "desktop distributable check currently requires macOS"
  fi
  check_desktop_package_node_version
}

desktop_arch_suffix() {
  case "$(uname -m)" in
    arm64|aarch64)
      echo "arm64"
      ;;
    x86_64|amd64)
      echo "x64"
      ;;
    *)
      fail "unsupported desktop distribution architecture: $(uname -m)"
      ;;
  esac
}

check_desktop_distributable_output() {
  local arch="$1"
  local release_dir="${ROOT_DIR}/desktop/release"
  local dmg_count
  dmg_count="$(find "${release_dir}" -maxdepth 1 -type f -name "*-mac-${arch}.dmg" | wc -l | tr -d ' ')"
  local zip_count
  zip_count="$(find "${release_dir}" -maxdepth 1 -type f -name "*-mac-${arch}.zip" | wc -l | tr -d ' ')"

  if [[ "${dmg_count}" -lt 1 ]]; then
    fail "desktop distributable missing mac ${arch} dmg under desktop/release"
  fi
  if [[ "${zip_count}" -lt 1 ]]; then
    fail "desktop distributable missing mac ${arch} zip under desktop/release"
  fi
}

find_desktop_app_for_arch() {
  local arch="$1"
  local release_dir="${ROOT_DIR}/desktop/release/mac-${arch}"
  find "${release_dir}" -maxdepth 1 -type d -name "*.app" -print -quit 2>/dev/null || true
}

check_macos_release_trust() {
  local arch="$1"
  local app_path
  app_path="$(find_desktop_app_for_arch "${arch}")"
  if [[ -z "${app_path}" ]]; then
    fail "desktop distributable missing mac ${arch} .app under desktop/release/mac-${arch}"
  fi

  local codesign_output
  if codesign_output="$(codesign --verify --deep --strict --verbose=2 "${app_path}" 2>&1)"; then
    log "codesign verification passed for $(rel_path "${app_path}")"
  elif [[ "$(normalize_bool "${REQUIRE_MAC_SIGNING}")" == "true" ]]; then
    echo "${codesign_output}" >&2
    fail "codesign verification failed for $(rel_path "${app_path}")"
  else
    log "warning: codesign verification failed for $(rel_path "${app_path}"): ${codesign_output}"
  fi

  local gatekeeper_status
  gatekeeper_status="$(spctl --status 2>&1 || true)"
  if echo "${gatekeeper_status}" | grep -qi "disabled"; then
    if [[ "$(normalize_bool "${REQUIRE_MAC_GATEKEEPER}")" == "true" ]]; then
      fail "Gatekeeper assessment is disabled on this machine; cannot enforce notarization/gatekeeper trust"
    fi
    log "warning: Gatekeeper assessment is disabled; spctl acceptance is not release evidence"
  fi

  local spctl_output
  if spctl_output="$(spctl --assess --type execute --verbose=4 "${app_path}" 2>&1)"; then
    log "Gatekeeper assessment completed for $(rel_path "${app_path}"): ${spctl_output}"
  elif [[ "$(normalize_bool "${REQUIRE_MAC_GATEKEEPER}")" == "true" ]]; then
    echo "${spctl_output}" >&2
    fail "Gatekeeper assessment failed for $(rel_path "${app_path}")"
  else
    log "warning: Gatekeeper assessment failed for $(rel_path "${app_path}"): ${spctl_output}"
  fi
}

write_release_manifest() {
  if [[ "$(normalize_bool "${WRITE_RELEASE_MANIFEST}")" != "true" ]]; then
    log "skipping release manifest generation"
    return
  fi

  require_cmd node
  run "${ROOT_DIR}/scripts/release-manifest.sh"
}

RESOLVED_ENV_FILE="$(resolve_env_file)"
log "env=${ENV_NAME}"
log "using env file: $(rel_path "${RESOLVED_ENV_FILE}")"

check_prod_env "${RESOLVED_ENV_FILE}"

require_cmd mvn
require_cmd npm

run "${ROOT_DIR}/scripts/check-consistency.sh"
audit_npm_runtime_dependencies

if [[ "$(normalize_bool "${SKIP_COMPOSE_CONFIG}")" != "true" ]]; then
  require_cmd docker
  log "docker compose config --quiet"
  docker compose --env-file "${RESOLVED_ENV_FILE}" -f "${COMPOSE_FILE}" config --quiet
fi

if [[ "$(normalize_bool "${SKIP_BACKEND_TESTS}")" != "true" ]]; then
  run_in "${ROOT_DIR}" mvn -pl backend test
else
  log "skipping backend tests"
fi

if [[ "$(normalize_bool "${SKIP_DESKTOP_BUILD}")" != "true" ]]; then
  check_node_modules "${ROOT_DIR}/desktop"
  check_node_modules "${ROOT_DIR}/desktop/src/renderer"
  run_in "${ROOT_DIR}/desktop/src/renderer" npm run lint
  run_in "${ROOT_DIR}/desktop/src/renderer" npm run build
  run_in "${ROOT_DIR}/desktop" npm run build
  if [[ "$(normalize_bool "${PACKAGE_DESKTOP}")" == "true" ]]; then
    check_desktop_package_node_version
    check_desktop_runtime_bundle
    run_in_with_timeout "${ROOT_DIR}/desktop" "${DESKTOP_PACKAGE_TIMEOUT_SECONDS}" npm run pack
    check_desktop_packaged_output
  fi
  if [[ "$(normalize_bool "${DESKTOP_DISTRIBUTABLE}")" == "true" ]]; then
    check_desktop_distributable_platform
    check_desktop_runtime_bundle
    desktop_arch="$(desktop_arch_suffix)"
    if [[ "$(normalize_bool "${REUSE_DESKTOP_DISTRIBUTABLE}")" == "true" ]]; then
      log "reusing existing desktop distributable artifacts for mac ${desktop_arch}"
    else
      run_in_with_timeout "${ROOT_DIR}/desktop" "${DESKTOP_DISTRIBUTION_TIMEOUT_SECONDS}" npm run "dist:mac:${desktop_arch}"
    fi
    check_desktop_distributable_output "${desktop_arch}"
    check_macos_release_trust "${desktop_arch}"
    write_release_manifest
  fi
else
  log "skipping desktop build"
fi

log "release preflight passed"
