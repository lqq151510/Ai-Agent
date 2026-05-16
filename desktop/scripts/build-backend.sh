#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../backend-jre"
BACKEND_MVN_ARGS="${DESKTOP_BACKEND_MVN_ARGS:-}"
CLI_MVN_ARGS="${DESKTOP_CLI_MVN_ARGS:-}"

echo "=== Building backend JAR (desktop profile) ==="

cd "$PROJECT_ROOT/backend"
mvn package -Pdesktop -DskipTests -q ${BACKEND_MVN_ARGS}

mkdir -p "$OUTPUT_DIR"
cp target/backend-0.1.0-SNAPSHOT.jar "$OUTPUT_DIR/backend.jar"
echo "Backend JAR copied to: $OUTPUT_DIR/backend.jar"

echo "=== Building CLI JAR ==="
cd "$PROJECT_ROOT/cli"
mvn package -DskipTests -q ${CLI_MVN_ARGS}
cp target/cli-0.1.0-SNAPSHOT.jar "$OUTPUT_DIR/cli.jar"
echo "CLI JAR copied to: $OUTPUT_DIR/cli.jar"

echo "=== Building JRE ==="
bash "$SCRIPT_DIR/build-jre.sh"

echo "=== Backend build complete ==="
ls -lh "$OUTPUT_DIR/"
