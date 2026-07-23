#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../backend-jre"
BACKEND_MVN_ARGS="${DESKTOP_BACKEND_MVN_ARGS:-}"
MAVEN_SETTINGS_FILE="${DESKTOP_BACKEND_MAVEN_SETTINGS_FILE:-$PROJECT_ROOT/.mvn/settings.xml}"

echo "=== Building backend JAR (desktop profile) ==="

if [[ ! -f "$MAVEN_SETTINGS_FILE" ]]; then
    echo "ERROR: Maven settings file not found: $MAVEN_SETTINGS_FILE" >&2
    exit 1
fi

cd "$PROJECT_ROOT"
# shellcheck disable=SC2086 # BACKEND_MVN_ARGS 需要按空格拆分为多个参数
mvn --settings "$MAVEN_SETTINGS_FILE" -pl backend -am clean package -Pdesktop -DskipTests -q ${BACKEND_MVN_ARGS}

mkdir -p "$OUTPUT_DIR"
BACKEND_JAR="$(find "$PROJECT_ROOT/backend/target" -maxdepth 1 -type f -name 'backend-*.jar' ! -name '*.original' -print -quit)"
if [[ -z "$BACKEND_JAR" ]]; then
    echo "ERROR: backend package did not produce a runnable JAR" >&2
    exit 1
fi
cp "$BACKEND_JAR" "$OUTPUT_DIR/backend.jar"
echo "Backend JAR copied to: $OUTPUT_DIR/backend.jar"
rm -f "$OUTPUT_DIR/cli.jar"

echo "=== Building TS CLI bundle ==="
cd "$PROJECT_ROOT/ts-cli"
npm ci --no-audit --no-fund
npm run build
rm -rf "$OUTPUT_DIR/ts-cli"
mkdir -p "$OUTPUT_DIR/ts-cli"
cp -R dist "$OUTPUT_DIR/ts-cli/dist"
cp package.json "$OUTPUT_DIR/ts-cli/package.json"
cp -R node_modules "$OUTPUT_DIR/ts-cli/node_modules"
echo "TS CLI copied to: $OUTPUT_DIR/ts-cli/dist/index.js"

echo "=== Building Local Service bundle ==="
cd "$PROJECT_ROOT/local-service"
npm ci --no-audit --no-fund
npm run build
rm -rf "$OUTPUT_DIR/local-service"
mkdir -p "$OUTPUT_DIR/local-service"
cp -R dist "$OUTPUT_DIR/local-service/dist"
cp package.json "$OUTPUT_DIR/local-service/package.json"
cp -R node_modules "$OUTPUT_DIR/local-service/node_modules"
echo "Local Service copied to: $OUTPUT_DIR/local-service/dist/index.js"

echo "=== Building JRE ==="
bash "$SCRIPT_DIR/build-jre.sh"

echo "=== Backend build complete ==="
ls -lh "$OUTPUT_DIR/"
