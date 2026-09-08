#!/usr/bin/env bash
#
# Flyway 迁移血统守卫（与 backend 的 MigrationLineageParityTest 同源）。
#
# 校验两件事：
#   1. db/migration（服务端 PostgreSQL 血统）与 db/h2（桌面版 H2 血统）的版本号集合必须一致；
#      单侧分叉必须显式登记在 ALLOW_ONE_SIDED 中，并同步 docs/arch/005-database-migration-strategy.md。
#   2. 每个已发布迁移文件的 SHA-256 必须与 migration-checksums.txt 基线一致。
#      Flyway 对已应用迁移的 checksum mismatch 会让用户端直接启动失败，因此旧迁移只能新增、不能改。
#
# 用法：
#   scripts/check-migration-parity.sh            # 校验，失败退出码 1
#   scripts/check-migration-parity.sh --update   # 重新生成校验和基线（新增迁移后执行）
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$REPO_ROOT/backend/src/main/resources"
BASELINE="$REPO_ROOT/backend/src/test/resources/migration-checksums.txt"
PG_DIR="$RESOURCES_DIR/db/migration"
H2_DIR="$RESOURCES_DIR/db/h2"

# 允许只存在于单侧血统的版本号（空格分隔）。新增分叉前必须同时更新本变量、Java 测试与 005 文档。
ALLOW_ONE_SIDED=""

sha256_of() {
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        sha256sum "$1" | awk '{print $1}'
    fi
}

relative_migrations() {
    (cd "$RESOURCES_DIR" && find db/h2 db/migration -type f -name '*.sql' | sort)
}

versions_of() {
    local dir="$1"
    [ -d "$dir" ] || return 0
    ls "$dir" | sed -nE 's/^(V[0-9]+)__.*\.sql$/\1/p' | sort -V
}

write_baseline_header() {
    cat <<'EOF'
# Flyway 迁移校验和基线（由 scripts/check-migration-parity.sh --update 生成）
#
# 规则：
#   1. 本文件记录 backend/src/main/resources 下每个已发布迁移文件的 SHA-256。
#   2. 已发布迁移文件一旦被任何用户执行过，其内容与文件名都不可再修改
#      （Flyway 会因 checksum mismatch 拒绝启动）。确需变更时：
#      - 新增一个 V<N+1>__*.sql，而不是改旧的；
#      - 运行 scripts/check-migration-parity.sh --update 并随提交更新本基线。
#   3. MigrationLineageParityTest 会在 CI 中比对本文件与实际文件。
#
# 格式：<相对 backend/src/main/resources 的路径> <sha256>
EOF
}

generate_baseline() {
    write_baseline_header > "$BASELINE"
    while IFS= read -r relative; do
        printf '%s %s\n' "$relative" "$(sha256_of "$RESOURCES_DIR/$relative")" >> "$BASELINE"
    done < <(relative_migrations)
    echo "已更新基线：$BASELINE"
}

check_versions() {
    local failures=0
    local pg h2 only_pg only_h2
    pg="$(versions_of "$PG_DIR")"
    h2="$(versions_of "$H2_DIR")"

    only_pg="$(comm -23 <(printf '%s\n' "$pg") <(printf '%s\n' "$h2") || true)"
    only_h2="$(comm -13 <(printf '%s\n' "$pg") <(printf '%s\n' "$h2") || true)"

    for allowed in $ALLOW_ONE_SIDED; do
        only_pg="$(printf '%s\n' "$only_pg" | grep -vx "$allowed" || true)"
        only_h2="$(printf '%s\n' "$only_h2" | grep -vx "$allowed" || true)"
    done

    if [ -n "$only_pg" ]; then
        echo "❌ db/migration 中这些版本在 db/h2 缺失：" >&2
        printf '   %s\n' $only_pg >&2
        failures=1
    fi
    if [ -n "$only_h2" ]; then
        echo "❌ db/h2 中这些版本在 db/migration 缺失：" >&2
        printf '   %s\n' $only_h2 >&2
        failures=1
    fi
    if [ "$failures" -eq 0 ]; then
        echo "✅ 版本号集合对齐：$(printf '%s ' $pg)"
    fi
    return "$failures"
}

check_checksums() {
    local failures=0
    [ -f "$BASELINE" ] || { echo "❌ 找不到基线文件：$BASELINE" >&2; return 1; }

    while read -r relative expected; do
        case "$relative" in ''|'#'*) continue ;; esac
        local actual
        if [ ! -f "$RESOURCES_DIR/$relative" ]; then
            echo "❌ 基线登记但文件不存在：$relative" >&2
            failures=1
            continue
        fi
        actual="$(sha256_of "$RESOURCES_DIR/$relative")"
        if [ "$actual" != "$expected" ]; then
            echo "❌ 已发布迁移被修改：$relative" >&2
            echo "   baseline=$expected" >&2
            echo "   actual  =$actual" >&2
            failures=1
        fi
    done < "$BASELINE"

    while IFS= read -r relative; do
        if ! grep -qE "^${relative//./\\.} " "$BASELINE"; then
            echo "❌ 新增迁移未登记进基线：$relative（执行 scripts/check-migration-parity.sh --update）" >&2
            failures=1
        fi
    done < <(relative_migrations)

    if [ "$failures" -eq 0 ]; then
        echo "✅ 校验和基线一致：$(grep -cvE '^#|^$' "$BASELINE") 个迁移文件"
    fi
    return "$failures"
}

case "${1:-}" in
    --update)
        generate_baseline
        ;;
    ""|--check)
        status=0
        check_versions || status=1
        check_checksums || status=1
        if [ "$status" -ne 0 ]; then
            echo "" >&2
            echo "提示：详见 docs/arch/005-database-migration-strategy.md" >&2
        fi
        exit "$status"
        ;;
    *)
        echo "用法：$0 [--check|--update]" >&2
        exit 2
        ;;
esac
