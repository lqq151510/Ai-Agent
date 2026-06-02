#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../backend-jre"
BACKEND_MVN_ARGS="${DESKTOP_BACKEND_MVN_ARGS:-}"

echo "=== Building backend JAR (desktop profile) ==="

cd "$PROJECT_ROOT/backend"
mvn package -Pdesktop -DskipTests -q ${BACKEND_MVN_ARGS}

mkdir -p "$OUTPUT_DIR"
cp target/backend-0.1.0-SNAPSHOT.jar "$OUTPUT_DIR/backend.jar"
echo "Backend JAR copied to: $OUTPUT_DIR/backend.jar"
rm -f "$OUTPUT_DIR/cli.jar"

echo "=== Building TS CLI bundle ==="
cd "$PROJECT_ROOT/ts-cli"
npm ci
npm run build
rm -rf "$OUTPUT_DIR/ts-cli"
mkdir -p "$OUTPUT_DIR/ts-cli"
cp -R dist "$OUTPUT_DIR/ts-cli/dist"
cp package.json "$OUTPUT_DIR/ts-cli/package.json"
cp -R node_modules "$OUTPUT_DIR/ts-cli/node_modules"
echo "TS CLI copied to: $OUTPUT_DIR/ts-cli/dist/index.js"

echo "=== Building JRE ==="
bash "$SCRIPT_DIR/build-jre.sh"

echo "=== Backend build complete ==="
ls -lh "$OUTPUT_DIR/"
