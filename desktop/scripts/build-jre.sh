#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../backend-jre"

echo "=== Building minimal JRE with jlink ==="

if ! command -v java &>/dev/null; then
    echo "ERROR: java not found. Please install JDK 21."
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -1 | sed -n 's/.*version "\([0-9]*\).*/\1/p')
if [ "$JAVA_VERSION" != "21" ]; then
    echo "WARNING: Expected JDK 21, found JDK $JAVA_VERSION"
fi

rm -rf "$OUTPUT_DIR/jre"
mkdir -p "$OUTPUT_DIR"

jlink \
    --add-modules java.base,java.sql,java.naming,java.management,java.security.jgss,java.instrument,java.desktop,jdk.unsupported \
    --output "$OUTPUT_DIR/jre" \
    --strip-debug \
    --no-header-files \
    --no-man-pages \
    --compress=2

echo "JRE built at: $OUTPUT_DIR/jre"
du -sh "$OUTPUT_DIR/jre"
