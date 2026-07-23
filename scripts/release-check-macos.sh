#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

fail() {
  echo "[release-check-macos] $*" >&2
  exit 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "macOS is required to build and verify a signed macOS release candidate"
fi

required_secrets=(
  CSC_LINK
  CSC_KEY_PASSWORD
  APPLE_ID
  APPLE_APP_SPECIFIC_PASSWORD
  APPLE_TEAM_ID
)

for secret_name in "${required_secrets[@]}"; do
  if [[ -z "${!secret_name:-}" ]]; then
    fail "missing required signing/notarization environment variable: ${secret_name}"
  fi
done

# The desktop candidate has a separate server deployment gate: the tag
# workflow requires compose-release-config before this macOS job starts.
exec env \
  RELEASE_CHECK_SKIP_COMPOSE_CONFIG=true \
  RELEASE_CHECK_SKIP_BACKEND_TESTS=false \
  RELEASE_CHECK_SKIP_DESKTOP_BUILD=false \
  RELEASE_CHECK_SKIP_NPM_AUDIT=false \
  RELEASE_CHECK_REUSE_DESKTOP_DISTRIBUTABLE=false \
  RELEASE_CHECK_ALLOW_UNSUPPORTED_NODE=false \
  RELEASE_CHECK_WRITE_MANIFEST=true \
  RELEASE_CHECK_DESKTOP_DISTRIBUTABLE=true \
  RELEASE_CHECK_PREPARE_DESKTOP_BACKEND=true \
  RELEASE_CHECK_REQUIRE_MAC_SIGNING=true \
  RELEASE_CHECK_REQUIRE_MAC_GATEKEEPER=true \
  RELEASE_CHECK_REQUIRE_CLEAN_SOURCE=true \
  RELEASE_CHECK_REQUIRE_VERSION_TAG=true \
  RELEASE_CHECK_REQUIRE_MAIN_ANCESTRY=true \
  RELEASE_CHECK_MAIN_BRANCH=main \
  RELEASE_CHECK_MAVEN_SETTINGS_FILE="${ROOT_DIR}/.mvn/settings.xml" \
  "${ROOT_DIR}/scripts/release-check.sh" dev
