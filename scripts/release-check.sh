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
REQUIRE_CLEAN_SOURCE="${RELEASE_CHECK_REQUIRE_CLEAN_SOURCE:-}"
REQUIRE_VERSION_TAG="${RELEASE_CHECK_REQUIRE_VERSION_TAG:-false}"
REQUIRE_MAIN_ANCESTRY="${RELEASE_CHECK_REQUIRE_MAIN_ANCESTRY:-false}"
RELEASE_MAIN_BRANCH="${RELEASE_CHECK_MAIN_BRANCH:-main}"
RELEASE_TAG="${RELEASE_CHECK_RELEASE_TAG:-}"
WRITE_RELEASE_MANIFEST="${RELEASE_CHECK_WRITE_MANIFEST:-true}"
DESKTOP_PACKAGE_TIMEOUT_SECONDS="${RELEASE_CHECK_DESKTOP_PACKAGE_TIMEOUT_SECONDS:-600}"
DESKTOP_DISTRIBUTION_TIMEOUT_SECONDS="${RELEASE_CHECK_DESKTOP_DISTRIBUTION_TIMEOUT_SECONDS:-900}"
NPM_AUDIT_TIMEOUT_SECONDS="${RELEASE_CHECK_NPM_AUDIT_TIMEOUT_SECONDS:-30}"
MAVEN_SETTINGS_FILE="${RELEASE_CHECK_MAVEN_SETTINGS_FILE:-${ROOT_DIR}/.mvn/settings.xml}"
MOUNTED_DMG_MOUNTPOINT=""
MACOS_BUNDLE_ID=""
MACOS_BUNDLE_SHORT_VERSION=""
MACOS_BUNDLE_VERSION=""

log() {
  echo "[release-check] $*"
}

fail() {
  echo "[release-check] $*" >&2
  exit 1
}

detach_mounted_dmg() {
  local mountpoint="${MOUNTED_DMG_MOUNTPOINT:-}"
  if [[ -z "${mountpoint}" ]]; then
    return 0
  fi

  if hdiutil detach "${mountpoint}" >/dev/null 2>&1; then
    MOUNTED_DMG_MOUNTPOINT=""
    log "detached temporary DMG mount: ${mountpoint}"
    return 0
  fi

  log "warning: could not detach temporary DMG mount: ${mountpoint}"
  return 1
}

# The mountpoint is intentionally left as an empty temporary directory after
# detaching. Removing it is unnecessary and makes cleanup needlessly destructive.
trap 'detach_mounted_dmg || true' EXIT

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

require_release_bool() {
  local name="$1"
  local value="$2"
  if [[ "$(normalize_bool "${value}")" == "true" ]]; then
    return
  fi
  fail "formal macOS release requires ${name}=true"
}

check_formal_macos_release_contract() {
  if [[ "$(normalize_bool "${REQUIRE_MAC_SIGNING}")" != "true" \
    && "$(normalize_bool "${REQUIRE_MAC_GATEKEEPER}")" != "true" ]]; then
    return
  fi

  # Signed distribution verification is an all-or-nothing contract. Keep
  # diagnostic skip/reuse switches from turning the canonical release command
  # into a successful no-op.
  require_release_bool "RELEASE_CHECK_DESKTOP_DISTRIBUTABLE" "${DESKTOP_DISTRIBUTABLE}"
  require_release_bool "RELEASE_CHECK_PREPARE_DESKTOP_BACKEND" "${PREPARE_DESKTOP_BACKEND}"
  require_release_bool "RELEASE_CHECK_REQUIRE_CLEAN_SOURCE" "${REQUIRE_CLEAN_SOURCE}"
  require_release_bool "RELEASE_CHECK_REQUIRE_VERSION_TAG" "${REQUIRE_VERSION_TAG}"
  require_release_bool "RELEASE_CHECK_REQUIRE_MAIN_ANCESTRY" "${REQUIRE_MAIN_ANCESTRY}"
  require_release_bool "RELEASE_CHECK_REQUIRE_MAC_SIGNING" "${REQUIRE_MAC_SIGNING}"
  require_release_bool "RELEASE_CHECK_REQUIRE_MAC_GATEKEEPER" "${REQUIRE_MAC_GATEKEEPER}"

  if [[ "$(normalize_bool "${SKIP_BACKEND_TESTS}")" == "true" \
    || "$(normalize_bool "${SKIP_DESKTOP_BUILD}")" == "true" \
    || "$(normalize_bool "${SKIP_NPM_AUDIT}")" == "true" \
    || "$(normalize_bool "${REUSE_DESKTOP_DISTRIBUTABLE}")" == "true" \
    || "$(normalize_bool "${ALLOW_UNSUPPORTED_NODE}")" == "true" ]]; then
    fail "formal macOS release does not allow skip, reuse, or unsupported-Node overrides"
  fi
  if [[ "$(normalize_bool "${WRITE_RELEASE_MANIFEST}")" != "true" ]]; then
    fail "formal macOS release requires RELEASE_CHECK_WRITE_MANIFEST=true"
  fi
  if [[ "${RELEASE_MAIN_BRANCH}" != "main" ]]; then
    fail "formal macOS release must verify ancestry against origin/main"
  fi
  if [[ "${MAVEN_SETTINGS_FILE}" != "${ROOT_DIR}/.mvn/settings.xml" ]]; then
    fail "formal macOS release must use the repository Maven settings file"
  fi
}

check_release_source_identity() {
  if [[ -z "${REQUIRE_CLEAN_SOURCE}" && "${ENV_NAME}" == "prod" ]]; then
    REQUIRE_CLEAN_SOURCE="true"
  fi

  if [[ "$(normalize_bool "${REQUIRE_CLEAN_SOURCE}")" == "true" ]]; then
    local source_status
    source_status="$(git -C "${ROOT_DIR}" status --porcelain --untracked-files=all)"
    if [[ -n "${source_status}" ]]; then
      echo "${source_status}" >&2
      fail "release source is not clean; commit, stash, or remove every tracked/untracked change before a production release"
    fi
  fi

  if [[ "$(normalize_bool "${REQUIRE_MAIN_ANCESTRY}")" == "true" \
    && "$(normalize_bool "${REQUIRE_VERSION_TAG}")" != "true" ]]; then
    fail "release tag ancestry verification requires RELEASE_CHECK_REQUIRE_VERSION_TAG=true"
  fi
  if [[ "$(normalize_bool "${REQUIRE_VERSION_TAG}")" != "true" ]]; then
    return
  fi

  local tag="${RELEASE_TAG}"
  if [[ -z "${tag}" ]]; then
    tag="$(git -C "${ROOT_DIR}" tag --points-at HEAD --format='%(refname:strip=2)' | head -n1)"
  fi
  if [[ -z "${tag}" ]]; then
    fail "release must run from an exact Git tag; set RELEASE_CHECK_RELEASE_TAG only when it names HEAD"
  fi

  local points_at_head
  points_at_head="$(git -C "${ROOT_DIR}" tag --points-at HEAD --format='%(refname:strip=2)' | grep -Fx "${tag}" || true)"
  if [[ -z "${points_at_head}" ]]; then
    fail "release tag ${tag} does not point at HEAD"
  fi

  local desktop_version
  desktop_version="$(node -p "require('${ROOT_DIR}/desktop/package.json').version")"
  if [[ "${tag}" != "v${desktop_version}" ]]; then
    fail "release tag ${tag} must equal desktop package version v${desktop_version}"
  fi

  if [[ "$(normalize_bool "${REQUIRE_MAIN_ANCESTRY}")" != "true" ]]; then
    return
  fi

  local main_ref="refs/remotes/origin/${RELEASE_MAIN_BRANCH}"
  if ! git -C "${ROOT_DIR}" fetch --no-tags origin "+refs/heads/${RELEASE_MAIN_BRANCH}:${main_ref}"; then
    fail "could not fetch origin/${RELEASE_MAIN_BRANCH} to verify release tag ancestry"
  fi
  if ! git -C "${ROOT_DIR}" merge-base --is-ancestor "${tag}^{commit}" "${main_ref}"; then
    fail "release tag ${tag} must point to a commit reachable from origin/${RELEASE_MAIN_BRANCH}"
  fi
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

verify_flexagent_package_access() {
  require_cmd curl

  local flexagent_version
  flexagent_version="$(sed -n 's|.*<flexagent.version>\([^<][^<]*\)</flexagent.version>.*|\1|p' "${ROOT_DIR}/backend/pom.xml")"
  if [[ -z "${flexagent_version}" || "${flexagent_version}" == *$'\n'* ]]; then
    fail "could not determine the exact FlexAgent version from backend/pom.xml"
  fi

  local package_url="https://maven.pkg.github.com/lqq151510/flexagent/org/flexagent/flexagent-langchain4j/${flexagent_version}/flexagent-langchain4j-${flexagent_version}.pom"
  local http_status
  log "verifying GitHub Packages access for org.flexagent:flexagent-langchain4j:${flexagent_version}"
  if ! http_status="$(curl --silent --show-error --location --connect-timeout 10 --max-time 30 \
    --output /dev/null --write-out '%{http_code}' --user "${GITHUB_ACTOR}:${GITHUB_TOKEN}" "${package_url}")"; then
    fail "could not reach the FlexAgent GitHub Package; check GitHub network connectivity and package access"
  fi
  if [[ "${http_status}" != "200" ]]; then
    fail "FlexAgent GitHub Package returned HTTP ${http_status}; local tokens need read:packages, and Actions needs packages: read plus package access for this repository"
  fi
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
  reject_placeholder_value "SECURITY_DB_ENCRYPTION_KEY" "${file}"
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

  if [[ "$(normalize_bool "${PREPARE_DESKTOP_BACKEND}")" == "true" ]]; then
    log "rebuilding desktop runtime bundle because RELEASE_CHECK_PREPARE_DESKTOP_BACKEND=true"
    run "${ROOT_DIR}/desktop/scripts/build-backend.sh"
  fi

  local missing=()

  [[ -f "${bundle_dir}/backend.jar" ]] || missing+=("backend-jre/backend.jar")
  [[ -x "${bundle_dir}/jre/bin/java" ]] || missing+=("backend-jre/jre/bin/java")
  [[ -f "${bundle_dir}/ts-cli/dist/index.js" ]] || missing+=("backend-jre/ts-cli/dist/index.js")
  [[ -f "${bundle_dir}/local-service/dist/index.js" ]] || missing+=("backend-jre/local-service/dist/index.js")

  if [[ ${#missing[@]} -eq 0 ]]; then
    return
  fi

  fail "desktop runtime bundle is incomplete: ${missing[*]}; run desktop/scripts/build-backend.sh or set RELEASE_CHECK_PREPARE_DESKTOP_BACKEND=true"
}

check_desktop_package_node_version() {
  local node_major
  local node_minor
  read -r node_major node_minor < <(node -p "process.versions.node.split('.').slice(0, 2).join(' ')")
  if [[ "${node_major}" -eq 22 && "${node_minor}" -ge 12 ]]; then
    return
  fi
  if [[ "$(normalize_bool "${ALLOW_UNSUPPORTED_NODE}")" == "true" ]]; then
    log "warning: packaging with unsupported Node.js $(node -v); expected Node.js >=22.12.0 <23"
    return
  fi
  fail "desktop packaging requires Node.js >=22.12.0 <23; current $(node -v). Use Node.js 22 or set RELEASE_CHECK_ALLOW_UNSUPPORTED_NODE=true to force a local diagnostic run"
}

audit_npm_runtime_dependencies() {
  if [[ "$(normalize_bool "${SKIP_NPM_AUDIT}")" == "true" ]]; then
    log "skipping npm dependency audits"
    return
  fi

  local desktop_dir="${ROOT_DIR}/desktop"
  run_npm_audit_with_retry "${desktop_dir}" "production" --omit=dev
  run_desktop_full_audit_with_policy "${desktop_dir}"

  local dirs=(
    "${ROOT_DIR}/desktop/src/renderer"
    "${ROOT_DIR}/ts-cli"
    "${ROOT_DIR}/local-service"
  )

  for dir in "${dirs[@]}"; do
    run_npm_audit_with_retry "${dir}" "production" --omit=dev
    run_npm_audit_with_retry "${dir}" "full"
  done
}

run_desktop_full_audit_with_policy() {
  local dir="$1"
  local policy_script="${ROOT_DIR}/desktop/scripts/verify-npm-audit-policy.mjs"
  local audit_report
  audit_report="$(mktemp "${TMPDIR:-/tmp}/ai-agent-desktop-npm-audit.XXXXXX")" || fail "could not create temporary desktop npm audit report"

  if [[ ! -f "${policy_script}" ]]; then
    rm -f "${audit_report}"
    fail "desktop full audit policy verifier is missing: $(rel_path "${policy_script}")"
  fi

  local attempt
  for attempt in 1 2 3; do
    local audit_exit=0
    log "(cd $(rel_path "${dir}") && npm audit --audit-level=moderate --json) scope=full-policy attempt ${attempt}/3 timeout=${NPM_AUDIT_TIMEOUT_SECONDS}s"
    if (
      cd "${dir}"
      if command -v timeout >/dev/null 2>&1; then
        timeout "${NPM_AUDIT_TIMEOUT_SECONDS}" npm audit --audit-level=moderate --json > "${audit_report}"
      elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout "${NPM_AUDIT_TIMEOUT_SECONDS}" npm audit --audit-level=moderate --json > "${audit_report}"
      else
        perl -e 'alarm shift @ARGV; exec @ARGV' "${NPM_AUDIT_TIMEOUT_SECONDS}" npm audit --audit-level=moderate --json > "${audit_report}"
      fi
    ); then
      audit_exit=0
    else
      audit_exit=$?
    fi

    if [[ "${audit_exit}" -eq 0 || "${audit_exit}" -eq 1 ]]; then
      if node "${policy_script}" --audit-report "${audit_report}"; then
        rm -f "${audit_report}"
        return
      else
        local verifier_exit=$?
        if [[ "${verifier_exit}" -eq 1 ]]; then
          rm -f "${audit_report}"
          fail "desktop full audit violated its versioned temporary exception policy"
        fi
        log "warning: desktop full audit did not produce a valid policy-verifiable report"
      fi
    else
      log "warning: desktop full audit command exited ${audit_exit} before policy verification"
    fi

    if [[ "${attempt}" -lt 3 ]]; then
      sleep "${attempt}"
    fi
  done

  rm -f "${audit_report}"
  fail "desktop full audit failed after 3 attempts"
}

run_npm_audit_with_retry() {
  local dir="$1"
  local audit_scope="$2"
  shift 2
  local attempt
  for attempt in 1 2 3; do
    log "(cd $(rel_path "${dir}") && npm audit --audit-level=moderate $*) scope=${audit_scope} attempt ${attempt}/3 timeout=${NPM_AUDIT_TIMEOUT_SECONDS}s"
    if (
      cd "${dir}"
      if command -v timeout >/dev/null 2>&1; then
        timeout "${NPM_AUDIT_TIMEOUT_SECONDS}" npm audit --audit-level=moderate "$@"
      elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout "${NPM_AUDIT_TIMEOUT_SECONDS}" npm audit --audit-level=moderate "$@"
      else
        perl -e 'alarm shift @ARGV; exec @ARGV' "${NPM_AUDIT_TIMEOUT_SECONDS}" npm audit --audit-level=moderate "$@"
      fi
    ); then
      return
    fi
    if [[ "${attempt}" -lt 3 ]]; then
      sleep "${attempt}"
    fi
  done
  fail "npm ${audit_scope} audit failed after 3 attempts: $(rel_path "${dir}")"
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
  local desktop_version
  desktop_version="$(node -p "require('${ROOT_DIR}/desktop/package.json').version")"
  local dmg_count
  dmg_count="$(find "${release_dir}" -maxdepth 1 -type f -name "*-${desktop_version}-mac-${arch}.dmg" | wc -l | tr -d ' ')"
  local zip_count
  zip_count="$(find "${release_dir}" -maxdepth 1 -type f -name "*-${desktop_version}-mac-${arch}.zip" | wc -l | tr -d ' ')"

  if [[ "${dmg_count}" -lt 1 ]]; then
    fail "desktop distributable missing version ${desktop_version} mac ${arch} dmg under desktop/release"
  fi
  if [[ "${zip_count}" -lt 1 ]]; then
    fail "desktop distributable missing version ${desktop_version} mac ${arch} zip under desktop/release"
  fi
}

check_reused_distributable_is_diagnostic_only() {
  if [[ "$(normalize_bool "${REUSE_DESKTOP_DISTRIBUTABLE}")" != "true" ]]; then
    return
  fi

  if [[ "${ENV_NAME}" == "prod" \
    || "$(normalize_bool "${REQUIRE_VERSION_TAG}")" == "true" \
    || "$(normalize_bool "${REQUIRE_MAC_SIGNING}")" == "true" \
    || "$(normalize_bool "${REQUIRE_MAC_GATEKEEPER}")" == "true" ]]; then
    fail "reusing existing desktop distributables is allowed only for a non-release dev diagnostic; rebuild from the current source for tagged, signed, Gatekeeper, or prod verification"
  fi
}

find_desktop_app_for_arch() {
  local arch="$1"
  local release_dir="${ROOT_DIR}/desktop/release/mac-${arch}"
  find_single_macos_app "${release_dir}" "staging mac ${arch} app"
}

find_single_macos_app() {
  local app_dir="$1"
  local label="$2"
  local apps=()
  local app_path

  if [[ ! -d "${app_dir}" ]]; then
    echo "${label} directory is missing: ${app_dir}" >&2
    return 1
  fi

  while IFS= read -r -d '' app_path; do
    apps+=("${app_path}")
  done < <(find "${app_dir}" -maxdepth 1 -type d -name "*.app" -print0)

  if [[ ${#apps[@]} -eq 0 ]]; then
    echo "${label} is missing a .app bundle under ${app_dir}" >&2
    return 1
  fi
  if [[ ${#apps[@]} -gt 1 ]]; then
    printf '%s\n' "${apps[@]}" >&2
    echo "${label} contains multiple .app bundles; cannot prove which one is released" >&2
    return 1
  fi

  printf '%s\n' "${apps[0]}"
}

find_desktop_distributable_for_arch() {
  local arch="$1"
  local extension="$2"
  local release_dir="${ROOT_DIR}/desktop/release"
  local desktop_version
  desktop_version="$(node -p "require('${ROOT_DIR}/desktop/package.json').version")"
  local artifacts=()
  local artifact

  while IFS= read -r -d '' artifact; do
    artifacts+=("${artifact}")
  done < <(find "${release_dir}" -maxdepth 1 -type f -name "*-${desktop_version}-mac-${arch}.${extension}" -print0)

  if [[ ${#artifacts[@]} -eq 0 ]]; then
    echo "missing mac ${arch} ${extension} distributable for version ${desktop_version}" >&2
    return 1
  fi
  if [[ ${#artifacts[@]} -gt 1 ]]; then
    printf '%s\n' "${artifacts[@]}" >&2
    echo "multiple mac ${arch} ${extension} distributables match version ${desktop_version}; cannot prove which one is released" >&2
    return 1
  fi

  printf '%s\n' "${artifacts[0]}"
}

check_formal_macos_artifact_set() {
  local arch="$1"
  local dmg_path="$2"
  local zip_path="$3"

  if ! mac_signing_is_required; then
    return
  fi

  local release_dir="${ROOT_DIR}/desktop/release"
  local unexpected_staging=()
  local staging_dir
  while IFS= read -r -d '' staging_dir; do
    if [[ "${staging_dir}" != "${release_dir}/mac-${arch}" ]]; then
      unexpected_staging+=("${staging_dir}")
    fi
  done < <(find "${release_dir}" -mindepth 1 -maxdepth 1 -type d -name 'mac-*' -print0)

  if [[ ${#unexpected_staging[@]} -gt 0 ]]; then
    printf '%s\n' "${unexpected_staging[@]}" >&2
    fail "formal macOS release output contains stale or unexpected macOS staging directories; only mac-${arch} may exist for this candidate"
  fi

  local unexpected=()
  local artifact
  while IFS= read -r -d '' artifact; do
    if [[ "${artifact}" != "${dmg_path}" && "${artifact}" != "${zip_path}" ]]; then
      unexpected+=("${artifact}")
    fi
  done < <(find "${release_dir}" -maxdepth 1 -type f \( \
    -iname "*.dmg" -o -iname "*.zip" -o -iname "*.exe" -o \
    -iname "*.appimage" -o -iname "*.deb" \) -print0)

  if [[ ${#unexpected[@]} -gt 0 ]]; then
    printf '%s\n' "${unexpected[@]}" >&2
    fail "formal macOS release output contains stale or unexpected installer artifacts; use a clean desktop/release directory without deleting unverified existing files"
  fi
}

assert_formal_macos_release_output_is_empty() {
  if ! mac_signing_is_required; then
    return
  fi

  local release_dir="${ROOT_DIR}/desktop/release"
  [[ -d "${release_dir}" ]] || return

  local existing=()
  local entry
  while IFS= read -r -d '' entry; do
    existing+=("${entry}")
  done < <(find "${release_dir}" -mindepth 1 -maxdepth 1 -print0)

  if [[ ${#existing[@]} -gt 0 ]]; then
    printf '%s\n' "${existing[@]}" >&2
    fail "formal macOS release requires desktop/release to be empty before building; archive or verify existing output manually without deleting it automatically"
  fi
}

mac_signing_is_required() {
  [[ "$(normalize_bool "${REQUIRE_MAC_SIGNING}")" == "true" \
    || "$(normalize_bool "${REQUIRE_MAC_GATEKEEPER}")" == "true" ]]
}

mac_gatekeeper_is_required() {
  [[ "$(normalize_bool "${REQUIRE_MAC_GATEKEEPER}")" == "true" ]]
}

load_macos_release_metadata() {
  if [[ -n "${MACOS_BUNDLE_ID}" && -n "${MACOS_BUNDLE_SHORT_VERSION}" && -n "${MACOS_BUNDLE_VERSION}" ]]; then
    return
  fi

  require_cmd node
  local metadata_output
  if ! metadata_output="$(node "${ROOT_DIR}/scripts/macos-release-metadata.mjs" --shell)"; then
    fail "could not load validated macOS release metadata"
  fi

  local key
  local value
  local saw_bundle_id=false
  local saw_short_version=false
  local saw_bundle_version=false
  while IFS='=' read -r key value; do
    case "${key}" in
      MACOS_BUNDLE_ID)
        [[ "${saw_bundle_id}" == false ]] || fail "macOS release metadata contains duplicate ${key}"
        MACOS_BUNDLE_ID="${value}"
        saw_bundle_id=true
        ;;
      MACOS_BUNDLE_SHORT_VERSION)
        [[ "${saw_short_version}" == false ]] || fail "macOS release metadata contains duplicate ${key}"
        MACOS_BUNDLE_SHORT_VERSION="${value}"
        saw_short_version=true
        ;;
      MACOS_BUNDLE_VERSION)
        [[ "${saw_bundle_version}" == false ]] || fail "macOS release metadata contains duplicate ${key}"
        MACOS_BUNDLE_VERSION="${value}"
        saw_bundle_version=true
        ;;
      *)
        fail "macOS release metadata emitted an unexpected key: ${key}"
        ;;
    esac
  done <<< "${metadata_output}"

  if [[ "${saw_bundle_id}" != true || "${saw_short_version}" != true || "${saw_bundle_version}" != true \
    || -z "${MACOS_BUNDLE_ID}" || -z "${MACOS_BUNDLE_SHORT_VERSION}" || -z "${MACOS_BUNDLE_VERSION}" ]]; then
    fail "macOS release metadata is incomplete"
  fi
}

find_macos_main_executable() {
  local app_path="$1"
  local info_plist="${app_path}/Contents/Info.plist"
  local executable_name

  if [[ ! -f "${info_plist}" ]]; then
    echo "missing app Info.plist: ${info_plist}" >&2
    return 1
  fi
  if ! executable_name="$(plutil -extract CFBundleExecutable raw -o - "${info_plist}" 2>/dev/null)"; then
    echo "could not read CFBundleExecutable from ${info_plist}" >&2
    return 1
  fi
  if [[ -z "${executable_name}" || "${executable_name}" == *"/"* || "${executable_name}" == "." || "${executable_name}" == ".." ]]; then
    echo "invalid CFBundleExecutable in ${info_plist}: ${executable_name}" >&2
    return 1
  fi

  local executable_path="${app_path}/Contents/MacOS/${executable_name}"
  if [[ ! -f "${executable_path}" || ! -x "${executable_path}" ]]; then
    echo "app main executable is missing or not executable: ${executable_path}" >&2
    return 1
  fi
  printf '%s\n' "${executable_path}"
}

verify_macho_arm64() {
  local binary_path="$1"
  local label="$2"
  local file_output

  if [[ ! -f "${binary_path}" ]]; then
    fail "${label} is missing: ${binary_path}"
  fi
  if ! file_output="$(file -b "${binary_path}" 2>&1)"; then
    echo "${file_output}" >&2
    fail "could not inspect ${label} architecture: ${binary_path}"
  fi
  if [[ "${file_output}" != *"Mach-O"* || "${file_output}" != *"arm64"* ]]; then
    echo "${file_output}" >&2
    fail "${label} is not a Mach-O arm64 binary: ${binary_path}"
  fi
  log "Mach-O arm64 verification passed for ${label}: $(rel_path "${binary_path}")"
}

verify_macos_node_modules_arm64() {
  local app_path="$1"
  local source_label="$2"
  local node_files=()
  local node_file

  while IFS= read -r -d '' node_file; do
    node_files+=("${node_file}")
  done < <(find "${app_path}" -type f -name "*.node" -print0)

  if [[ ${#node_files[@]} -eq 0 ]]; then
    log "no native .node modules found in ${source_label}: $(rel_path "${app_path}")"
    return
  fi

  for node_file in "${node_files[@]}"; do
    local relative_path="${node_file#"${app_path}"/}"
    local prebuild_target=""
    if [[ "${relative_path}" =~ /prebuilds/([^/]+)/ ]]; then
      prebuild_target="${BASH_REMATCH[1]}"
    fi

    if [[ -n "${prebuild_target}" ]]; then
      case "${prebuild_target}" in
        darwin|darwin-arm64|darwin-arm64-*)
          verify_macho_arm64 "${node_file}" "${source_label} Darwin native module"
          ;;
        darwin-*|win32-*|linux-*|android-*|freebsd-*|openbsd-*|sunos-*|aix-*)
          log "skipping non-arm64 or non-macOS prebuilt native module: $(rel_path "${node_file}")"
          ;;
        *)
          fail "cannot determine whether prebuilt native module targets macOS arm64: ${relative_path} (target ${prebuild_target})"
          ;;
      esac
      continue
    fi

    verify_macho_arm64 "${node_file}" "${source_label} directly loaded native module"
  done
}

verify_macos_app_architecture() {
  local app_path="$1"
  local source_label="$2"
  local main_executable

  if ! main_executable="$(find_macos_main_executable "${app_path}")"; then
    fail "cannot resolve main executable for ${source_label}: $(rel_path "${app_path}")"
  fi
  verify_macho_arm64 "${main_executable}" "${source_label} app main executable"
  verify_macho_arm64 "${app_path}/Contents/Resources/backend-jre/jre/bin/java" "${source_label} embedded JRE"
  verify_macos_node_modules_arm64 "${app_path}" "${source_label}"
}

verify_macos_bundle_metadata() {
  local app_path="$1"
  local source_label="$2"
  local info_plist="${app_path}/Contents/Info.plist"
  local bundle_id
  local bundle_short_version
  local bundle_version

  load_macos_release_metadata
  if [[ ! -f "${info_plist}" ]]; then
    fail "${source_label} is missing Info.plist: ${info_plist}"
  fi
  if ! bundle_id="$(plutil -extract CFBundleIdentifier raw -o - "${info_plist}" 2>/dev/null)"; then
    fail "could not read CFBundleIdentifier from ${source_label}: $(rel_path "${info_plist}")"
  fi
  if ! bundle_short_version="$(plutil -extract CFBundleShortVersionString raw -o - "${info_plist}" 2>/dev/null)"; then
    fail "could not read CFBundleShortVersionString from ${source_label}: $(rel_path "${info_plist}")"
  fi
  if ! bundle_version="$(plutil -extract CFBundleVersion raw -o - "${info_plist}" 2>/dev/null)"; then
    fail "could not read CFBundleVersion from ${source_label}: $(rel_path "${info_plist}")"
  fi

  if [[ "${bundle_id}" != "${MACOS_BUNDLE_ID}" ]]; then
    fail "${source_label} CFBundleIdentifier ${bundle_id} does not match expected ${MACOS_BUNDLE_ID}"
  fi
  if [[ "${bundle_short_version}" != "${MACOS_BUNDLE_SHORT_VERSION}" ]]; then
    fail "${source_label} CFBundleShortVersionString ${bundle_short_version} does not match expected ${MACOS_BUNDLE_SHORT_VERSION}"
  fi
  if [[ "${bundle_version}" != "${MACOS_BUNDLE_VERSION}" ]]; then
    fail "${source_label} CFBundleVersion ${bundle_version} does not match expected ${MACOS_BUNDLE_VERSION}"
  fi
}

verify_macos_codesign() {
  local app_path="$1"
  local source_label="$2"
  local codesign_output

  if ! command -v codesign >/dev/null 2>&1; then
    if mac_signing_is_required; then
      fail "codesign is required to validate ${source_label} but is unavailable"
    fi
    log "warning: codesign is unavailable; cannot validate ${source_label}"
    return
  fi

  if codesign_output="$(codesign --verify --deep --strict --verbose=2 "${app_path}" 2>&1)"; then
    log "codesign verification passed for ${source_label}: $(rel_path "${app_path}")"
  elif mac_signing_is_required; then
    echo "${codesign_output}" >&2
    fail "codesign verification failed for ${source_label}: $(rel_path "${app_path}")"
  else
    log "warning: codesign verification failed for ${source_label}: ${codesign_output}"
  fi
}

verify_macos_signing_identity() {
  local app_path="$1"
  local source_label="$2"
  local codesign_details

  if ! mac_signing_is_required; then
    return
  fi

  load_macos_release_metadata
  if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
    fail "APPLE_TEAM_ID is required to verify the Developer ID signing identity"
  fi
  if ! codesign_details="$(codesign -dv --verbose=4 "${app_path}" 2>&1)"; then
    echo "${codesign_details}" >&2
    fail "could not inspect the signing identity for ${source_label}: $(rel_path "${app_path}")"
  fi
  if ! grep -Fqx "Identifier=${MACOS_BUNDLE_ID}" <<< "${codesign_details}"; then
    echo "${codesign_details}" >&2
    fail "Developer ID signing identifier does not match ${MACOS_BUNDLE_ID} for ${source_label}"
  fi
  if ! grep -Fqx "TeamIdentifier=${APPLE_TEAM_ID}" <<< "${codesign_details}"; then
    echo "${codesign_details}" >&2
    fail "Developer ID signing team does not match APPLE_TEAM_ID for ${source_label}"
  fi
  if ! grep -Fq "Authority=Developer ID Application:" <<< "${codesign_details}"; then
    echo "${codesign_details}" >&2
    fail "formal macOS release requires a Developer ID Application authority for ${source_label}"
  fi
}

check_macos_gatekeeper_status() {
  local gatekeeper_status
  local gatekeeper_status_exit=0

  if ! command -v spctl >/dev/null 2>&1; then
    if mac_gatekeeper_is_required; then
      fail "spctl is required to validate Gatekeeper but is unavailable"
    fi
    log "warning: spctl is unavailable; Gatekeeper assessment is diagnostic only"
    return
  fi

  gatekeeper_status="$(spctl --status 2>&1)" || gatekeeper_status_exit=$?
  if echo "${gatekeeper_status}" | grep -qi "disabled"; then
    if mac_gatekeeper_is_required; then
      fail "Gatekeeper assessment is disabled on this machine; cannot enforce notarization/gatekeeper trust"
    fi
    log "warning: Gatekeeper assessment is disabled; spctl acceptance is not release evidence"
    return
  fi
  if [[ "${gatekeeper_status_exit}" -ne 0 ]]; then
    if mac_gatekeeper_is_required; then
      echo "${gatekeeper_status}" >&2
      fail "could not determine whether Gatekeeper assessments are enabled"
    fi
    log "warning: could not determine whether Gatekeeper assessments are enabled: ${gatekeeper_status}"
    return
  fi
  log "Gatekeeper assessments are enabled"
}

verify_macos_gatekeeper() {
  local app_path="$1"
  local source_label="$2"
  local spctl_output

  if ! command -v spctl >/dev/null 2>&1; then
    if mac_gatekeeper_is_required; then
      fail "spctl is required to validate ${source_label} but is unavailable"
    fi
    log "warning: spctl is unavailable; cannot validate ${source_label}"
    return
  fi

  if spctl_output="$(spctl --assess --type execute --verbose=4 "${app_path}" 2>&1)"; then
    log "Gatekeeper assessment completed for ${source_label}: ${spctl_output}"
  elif mac_gatekeeper_is_required; then
    echo "${spctl_output}" >&2
    fail "Gatekeeper assessment failed for ${source_label}: $(rel_path "${app_path}")"
  else
    log "warning: Gatekeeper assessment failed for ${source_label}: ${spctl_output}"
  fi
}

verify_macos_stapler() {
  local artifact_path="$1"
  local source_label="$2"
  local stapler_output

  if ! command -v xcrun >/dev/null 2>&1; then
    if mac_gatekeeper_is_required; then
      fail "xcrun stapler is required to validate ${source_label} but xcrun is unavailable"
    fi
    log "warning: xcrun is unavailable; cannot validate stapled notarization for ${source_label}"
    return
  fi

  if stapler_output="$(xcrun stapler validate "${artifact_path}" 2>&1)"; then
    log "stapler validation passed for ${source_label}: $(rel_path "${artifact_path}")"
  elif mac_gatekeeper_is_required; then
    echo "${stapler_output}" >&2
    fail "stapler validation failed for ${source_label}: $(rel_path "${artifact_path}")"
  else
    log "warning: stapler validation failed for ${source_label}: ${stapler_output}"
  fi
}

verify_macos_dmg_gatekeeper() {
  local dmg_path="$1"
  local source_label="$2"
  local spctl_output

  if ! command -v spctl >/dev/null 2>&1; then
    if mac_gatekeeper_is_required; then
      fail "spctl is required to validate ${source_label} but is unavailable"
    fi
    log "warning: spctl is unavailable; cannot validate ${source_label}"
    return
  fi

  if spctl_output="$(spctl --assess --type open --verbose=4 "${dmg_path}" 2>&1)"; then
    log "Gatekeeper DMG assessment completed for ${source_label}: ${spctl_output}"
  elif mac_gatekeeper_is_required; then
    echo "${spctl_output}" >&2
    fail "Gatekeeper DMG assessment failed for ${source_label}: $(rel_path "${dmg_path}")"
  else
    log "warning: Gatekeeper DMG assessment failed for ${source_label}: ${spctl_output}"
  fi
}

notarize_macos_dmg() {
  local dmg_path="$1"
  local required_secret

  if ! mac_signing_is_required; then
    return
  fi

  require_cmd xcrun
  for required_secret in APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID; do
    if [[ -z "${!required_secret:-}" ]]; then
      fail "missing required notarization environment variable: ${required_secret}"
    fi
  done

  # Do not use run/run_in_with_timeout here: those helpers log all arguments,
  # while notarytool receives the app-specific password as an argument.
  log "submitting final DMG for notarization: $(rel_path "${dmg_path}")"
  if ! xcrun notarytool submit "${dmg_path}" \
    --apple-id "${APPLE_ID}" \
    --password "${APPLE_APP_SPECIFIC_PASSWORD}" \
    --team-id "${APPLE_TEAM_ID}" \
    --wait; then
    fail "Apple notarization failed for final DMG: $(rel_path "${dmg_path}")"
  fi
  log "stapling final DMG notarization ticket: $(rel_path "${dmg_path}")"
  if ! xcrun stapler staple "${dmg_path}"; then
    fail "could not staple final DMG notarization ticket: $(rel_path "${dmg_path}")"
  fi
}

notarize_macos_dmg_for_arch() {
  local arch="$1"
  local dmg_path

  if ! mac_signing_is_required; then
    return
  fi
  if ! dmg_path="$(find_desktop_distributable_for_arch "${arch}" dmg)"; then
    fail "desktop distributable missing an unambiguous mac ${arch} DMG for final notarization"
  fi
  notarize_macos_dmg "${dmg_path}"
}

verify_macos_app_release_evidence() {
  local app_path="$1"
  local source_label="$2"

  verify_macos_bundle_metadata "${app_path}" "${source_label}"
  verify_macos_app_architecture "${app_path}" "${source_label}"
  verify_macos_codesign "${app_path}" "${source_label}"
  verify_macos_signing_identity "${app_path}" "${source_label}"
  verify_macos_gatekeeper "${app_path}" "${source_label}"
  verify_macos_stapler "${app_path}" "${source_label}"
}

check_macos_dmg_release_artifact() {
  local dmg_path="$1"
  local mount_dir
  mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/release-check-dmg.XXXXXX")" || fail "could not create a temporary DMG mount directory"

  log "verifying DMG release artifact: $(rel_path "${dmg_path}")"
  if ! hdiutil verify "${dmg_path}"; then
    fail "DMG release artifact verification failed: $(rel_path "${dmg_path}")"
  fi
  verify_macos_stapler "${dmg_path}" "outer DMG"
  verify_macos_dmg_gatekeeper "${dmg_path}" "outer DMG"
  if ! hdiutil attach "${dmg_path}" -readonly -nobrowse -mountpoint "${mount_dir}" >/dev/null; then
    fail "could not mount DMG release artifact: $(rel_path "${dmg_path}")"
  fi
  MOUNTED_DMG_MOUNTPOINT="${mount_dir}"

  local mounted_app
  if ! mounted_app="$(find_single_macos_app "${mount_dir}" "mounted DMG app")"; then
    fail "mounted DMG release artifact does not contain exactly one .app: $(rel_path "${dmg_path}")"
  fi
  verify_macos_app_release_evidence "${mounted_app}" "DMG-mounted app"

  if ! detach_mounted_dmg; then
    fail "could not detach mounted DMG release artifact: $(rel_path "${dmg_path}")"
  fi
}

check_macos_zip_release_artifact() {
  local zip_path="$1"
  local extract_dir
  extract_dir="$(mktemp -d "${TMPDIR:-/tmp}/release-check-zip.XXXXXX")" || fail "could not create a temporary ZIP extraction directory"

  if ! ditto -x -k "${zip_path}" "${extract_dir}"; then
    fail "could not extract ZIP release artifact: $(rel_path "${zip_path}")"
  fi

  local extracted_app
  if ! extracted_app="$(find_single_macos_app "${extract_dir}" "extracted ZIP app")"; then
    fail "extracted ZIP release artifact does not contain exactly one .app: $(rel_path "${zip_path}")"
  fi
  verify_macos_app_release_evidence "${extracted_app}" "ZIP-extracted app"
}

check_macos_release_trust() {
  local arch="$1"
  local staging_app
  if ! staging_app="$(find_desktop_app_for_arch "${arch}")"; then
    fail "desktop distributable missing exactly one mac ${arch} .app under desktop/release/mac-${arch}"
  fi

  require_cmd file
  require_cmd plutil
  require_cmd hdiutil
  require_cmd ditto
  check_macos_gatekeeper_status
  verify_macos_app_release_evidence "${staging_app}" "staging app"

  local dmg_path
  if ! dmg_path="$(find_desktop_distributable_for_arch "${arch}" dmg)"; then
    fail "desktop distributable missing an unambiguous mac ${arch} DMG"
  fi
  local zip_path
  if ! zip_path="$(find_desktop_distributable_for_arch "${arch}" zip)"; then
    fail "desktop distributable missing an unambiguous mac ${arch} ZIP"
  fi
  check_formal_macos_artifact_set "${arch}" "${dmg_path}" "${zip_path}"
  check_macos_dmg_release_artifact "${dmg_path}"
  check_macos_zip_release_artifact "${zip_path}"
}

write_release_manifest() {
  local arch="${1:-}"

  if [[ "$(normalize_bool "${WRITE_RELEASE_MANIFEST}")" != "true" ]]; then
    log "skipping release manifest generation"
    return
  fi

  require_cmd node
  if [[ -z "${arch}" ]]; then
    run "${ROOT_DIR}/scripts/release-manifest.sh"
    return
  fi
  case "${arch}" in
    arm64|x64) ;;
    *) fail "unsupported macOS architecture for release manifest: ${arch}" ;;
  esac
  log "generating release manifest for macOS ${arch}"
  RELEASE_MANIFEST_MACOS_ARCH="${arch}" "${ROOT_DIR}/scripts/release-manifest.sh"
}

RESOLVED_ENV_FILE="$(resolve_env_file)"
log "env=${ENV_NAME}"
log "using env file: $(rel_path "${RESOLVED_ENV_FILE}")"

check_prod_env "${RESOLVED_ENV_FILE}"

require_cmd mvn
require_cmd npm
require_cmd git

check_formal_macos_release_contract

if [[ ! -f "${MAVEN_SETTINGS_FILE}" ]]; then
  fail "missing Maven settings file: $(rel_path "${MAVEN_SETTINGS_FILE}")"
fi
if [[ -z "${GITHUB_TOKEN:-}" || -z "${GITHUB_ACTOR:-}" ]]; then
  fail "GITHUB_ACTOR and GITHUB_TOKEN are required to resolve the FlexAgent GitHub Package in a clean release build"
fi
verify_flexagent_package_access

check_release_source_identity
run "${ROOT_DIR}/scripts/check-release-version.sh"
run "${ROOT_DIR}/scripts/check-consistency.sh"
audit_npm_runtime_dependencies

if [[ "$(normalize_bool "${SKIP_COMPOSE_CONFIG}")" != "true" ]]; then
  require_cmd docker
  log "docker compose config --quiet"
  docker compose --env-file "${RESOLVED_ENV_FILE}" -f "${COMPOSE_FILE}" config --quiet
fi

if [[ "$(normalize_bool "${SKIP_BACKEND_TESTS}")" != "true" ]]; then
  run_in "${ROOT_DIR}" mvn --settings "${MAVEN_SETTINGS_FILE}" -pl backend -am test
else
  log "skipping backend tests"
fi

if [[ "$(normalize_bool "${SKIP_DESKTOP_BUILD}")" != "true" ]]; then
  check_node_modules "${ROOT_DIR}/desktop"
  check_node_modules "${ROOT_DIR}/desktop/src/renderer"
  check_node_modules "${ROOT_DIR}/ts-cli"
  check_node_modules "${ROOT_DIR}/local-service"
  run_in "${ROOT_DIR}/desktop/src/renderer" npm run lint
  run_in "${ROOT_DIR}/desktop/src/renderer" npm run test
  run_in "${ROOT_DIR}/desktop/src/renderer" npm run build
  run_in "${ROOT_DIR}/desktop" npm run test:main
  run_in "${ROOT_DIR}/ts-cli" npm run typecheck
  run_in "${ROOT_DIR}/ts-cli" npm run build
  run_in "${ROOT_DIR}/local-service" npm run build
  run_in "${ROOT_DIR}/desktop" npm run build
  if [[ "$(normalize_bool "${PREPARE_DESKTOP_BACKEND}")" == "true" \
    || "$(normalize_bool "${PACKAGE_DESKTOP}")" == "true" \
    || "$(normalize_bool "${DESKTOP_DISTRIBUTABLE}")" == "true" ]]; then
    check_desktop_runtime_bundle
  fi
  if [[ "$(normalize_bool "${PACKAGE_DESKTOP}")" == "true" ]]; then
    check_desktop_package_node_version
    run_in_with_timeout "${ROOT_DIR}/desktop" "${DESKTOP_PACKAGE_TIMEOUT_SECONDS}" npm run pack
    check_desktop_packaged_output
  fi
  if [[ "$(normalize_bool "${DESKTOP_DISTRIBUTABLE}")" == "true" ]]; then
    check_desktop_package_node_version
    check_desktop_distributable_platform
    desktop_arch="$(desktop_arch_suffix)"
    check_reused_distributable_is_diagnostic_only
    if [[ "$(normalize_bool "${REUSE_DESKTOP_DISTRIBUTABLE}")" == "true" ]]; then
      log "reusing existing desktop distributable artifacts for mac ${desktop_arch}"
    else
      assert_formal_macos_release_output_is_empty
      run_in_with_timeout "${ROOT_DIR}/desktop" "${DESKTOP_DISTRIBUTION_TIMEOUT_SECONDS}" npm run "dist:mac:${desktop_arch}"
    fi
    check_desktop_distributable_output "${desktop_arch}"
    notarize_macos_dmg_for_arch "${desktop_arch}"
    check_macos_release_trust "${desktop_arch}"
    write_release_manifest "${desktop_arch}"
  fi
else
  log "skipping desktop build"
fi

log "release preflight passed"
