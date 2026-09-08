#!/usr/bin/env bash
#
# check-offline-build.sh — 校验 FlexAgent 依赖是否已缓存到本地 m2，并打印离线构建建议命令。
#
# 背景：backend/pom.xml 依赖 org.flexagent:flexagent-langchain4j（GitHub Packages 私有源），
# 没有 token 的机器必须依赖本地 m2 缓存才能用 `mvn -o` 构建。本脚本只做只读校验，不联网、不改文件。
#
# 用法：
#   bash scripts/check-offline-build.sh            # 校验缓存并打印离线构建建议命令
#   bash scripts/check-offline-build.sh --deep     # 校验通过后真正跑一次 mvn -o 编译
#   bash scripts/check-offline-build.sh -q         # 只输出结论与建议命令
#   bash scripts/check-offline-build.sh --help
#
# 可覆盖的环境变量：
#   MAVEN_REPO_LOCAL    本地仓库路径，默认 ~/.m2/repository
#   FLEXAGENT_VERSION   要校验的版本，默认从 backend/pom.xml 的 <flexagent.version> 读取
#
# 退出码：0 = 缓存齐全；1 = 缓存缺失或离线构建失败；2 = 用法/环境错误。
#
# 详见 docs/offline-build.md。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MAVEN_REPO_LOCAL="${MAVEN_REPO_LOCAL:-${HOME}/.m2/repository}"
DEEP=0
QUIET=0

usage() {
    sed -n '3,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h | --help)
            usage
            exit 0
            ;;
        --deep)
            DEEP=1
            ;;
        -q | --quiet)
            QUIET=1
            ;;
        --repo-local)
            shift
            if [ "$#" -eq 0 ]; then
                echo "用法错误：--repo-local 需要一个路径" >&2
                exit 2
            fi
            MAVEN_REPO_LOCAL="$1"
            ;;
        *)
            echo "用法错误：未知参数 $1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

detect_flexagent_version() {
    if [ -n "${FLEXAGENT_VERSION:-}" ]; then
        printf '%s' "${FLEXAGENT_VERSION}"
        return 0
    fi
    local pom="${REPO_ROOT}/backend/pom.xml"
    if [ ! -f "${pom}" ]; then
        echo "环境错误：找不到 ${pom}，请设置 FLEXAGENT_VERSION" >&2
        return 1
    fi
    local version
    version="$(sed -n 's/.*<flexagent\.version>\([^<]*\)<\/flexagent\.version>.*/\1/p' "${pom}" | head -n 1)"
    if [ -z "${version}" ]; then
        echo "环境错误：${pom} 中没有 <flexagent.version>，请设置 FLEXAGENT_VERSION" >&2
        return 1
    fi
    printf '%s' "${version}"
}

# jar 是否为合法 zip（magic number "PK"）。
is_zip() {
    local magic
    magic="$(head -c 2 "$1" 2>/dev/null || true)"
    [ "${magic}" = "PK" ]
}

FAILURES=0

# check_file <artifact> <version> <kind:jar|pom> <path> <require_zip>
check_file() {
    local artifact="$1" version="$2" kind="$3" path="$4" require_zip="$5"
    local coord="org.flexagent:${artifact}:${version}"

    if [ ! -e "${path}" ]; then
        printf 'FAIL %s  %s  缺失 %s\n' "${coord}" "${kind}" "${path}"
        FAILURES=$((FAILURES + 1))
        return 0
    fi
    if [ ! -f "${path}" ]; then
        printf 'FAIL %s  %s  不是普通文件 %s\n' "${coord}" "${kind}" "${path}"
        FAILURES=$((FAILURES + 1))
        return 0
    fi
    if [ ! -s "${path}" ]; then
        printf 'FAIL %s  %s  文件为空 %s\n' "${coord}" "${kind}" "${path}"
        FAILURES=$((FAILURES + 1))
        return 0
    fi
    if [ "${require_zip}" = "yes" ] && ! is_zip "${path}"; then
        printf 'FAIL %s  %s  不是合法 jar/zip %s\n' "${coord}" "${kind}" "${path}"
        FAILURES=$((FAILURES + 1))
        return 0
    fi

    if [ "${QUIET}" -eq 0 ]; then
        printf 'OK   %s  %s  %s\n' "${coord}" "${kind}" "${path}"
    fi
}

# FlexAgent 1.2.0 及其传递依赖 flexagent-core 必须同时在本地仓库里。
check_artifact() {
    local artifact="$1" version="$2"
    local base="${MAVEN_REPO_LOCAL}/org/flexagent/${artifact}/${version}"
    check_file "${artifact}" "${version}" "jar" "${base}/${artifact}-${version}.jar" "yes"
    check_file "${artifact}" "${version}" "pom" "${base}/${artifact}-${version}.pom" "no"
}

main() {
    local version
    version="$(detect_flexagent_version)" || exit 2

    echo "本地仓库: ${MAVEN_REPO_LOCAL}"
    echo "校验坐标: org.flexagent:flexagent-langchain4j:${version} (+ 传递依赖 flexagent-core)"
    echo

    check_artifact "flexagent-langchain4j" "${version}"
    check_artifact "flexagent-core" "${version}"

    echo
    if [ "${FAILURES}" -gt 0 ]; then
        echo "结果：FAIL —— ${FAILURES} 项缺失或不可用，离线构建（mvn -o）会失败。"
        echo
        echo "修复：见 docs/offline-build.md"
        echo "  场景 A（有 token）：配置 ~/.m2/settings.xml 的 <id>github</id>（用户名 + read:packages token），"
        echo "                     或用仓库内占位符 settings："
        echo "                     GITHUB_ACTOR=<user> GITHUB_TOKEN=<token> mvn --settings .mvn/settings.xml -pl backend -am -DskipTests compile"
        echo "  场景 B（无 token）：从已有缓存的机器导入 tar 包，解包后目录必须是 <本地仓库>/org/flexagent/..."
        echo "                     或改用内网 Nexus/Artifactory 代理 https://maven.pkg.github.com/lqq151510/flexagent"
        exit 1
    fi

    echo "结果：OK —— FlexAgent ${version} 已缓存，可以离线构建。"
    echo
    echo "离线构建建议命令："
    echo "  cd ${REPO_ROOT}"
    echo "  mvn -o -pl backend -am -DskipTests compile"
    echo
    echo "完整验证（含测试，较慢）："
    echo "  mvn -o -pl backend -am clean verify"
    echo
    echo "依赖树核对："
    echo "  mvn -o -pl backend dependency:tree -Dincludes=org.flexagent"

    if [ "${DEEP}" -eq 1 ]; then
        echo
        if ! command -v mvn >/dev/null 2>&1; then
            echo "FAIL 未找到 mvn，无法执行 --deep。请把 Maven 加入 PATH（例如 export PATH=\"/opt/homebrew/bin:\$PATH\"）" >&2
            exit 1
        fi
        echo "执行 --deep: mvn -o -pl backend -am -DskipTests compile"
        if (cd "${REPO_ROOT}" && mvn -o -pl backend -am -DskipTests compile); then
            echo "结果：OK —— 离线构建通过。"
        else
            echo "结果：FAIL —— 离线构建失败，见上方 Maven 输出与 docs/offline-build.md 第 4.5 节。" >&2
            exit 1
        fi
    fi

    exit 0
}

main "$@"
