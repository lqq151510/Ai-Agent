#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# sanitize-course-materials.sh
#
# 用途：处置课程材料里的第三方个人信息（学号 / 真实姓名 / 微信 wxid）。
#       属于 t9 审计（docs/release/pre-release-hygiene-audit.md）A1/A2/A3 项的
#       “待用户批准”执行器。**本脚本自身不硬编码任何真实姓名/学号**。
#
# 设计原则：
#   1) 默认 dry-run：不带 --apply 时只打印将要执行的动作，不修改任何文件。
#   2) 待脱敏值全部在运行时从目标文件派生，脚本本身不会成为新的 PII 载体。
#   3) 不 commit、不 push、不 tag：脚本只做文件/索引层改动，提交由人执行。
#   4) redact 模式先备份到仓库外的 --dest 目录，便于回滚。
#   5) 兼容 macOS 自带 bash 3.2（不使用 mapfile / 关联数组）。
#
# 用法：
#   bash scripts/sanitize-course-materials.sh                          # dry-run（默认 move）
#   bash scripts/sanitize-course-materials.sh --mode=redact            # dry-run 预览脱敏
#   bash scripts/sanitize-course-materials.sh --mode=move   --apply
#   bash scripts/sanitize-course-materials.sh --mode=redact --apply --dest=~/backup
#
# 选项：
#   --mode=move|redact    处置策略（默认 move）
#                           move   ：把命中文件移出仓库（git rm --cached + mv 到 --dest）
#                           redact ：原地脱敏（学号→XXXXXXXXXXX1、姓名→同学A、wxid→wxid_REDACTED）
#   --apply               真正执行；缺省为 dry-run
#   --dest=DIR            备份/移出目录（默认 ~/ai-agent-course-materials-archive/<时间戳>）
#   --files=a,b,c         只处理指定文件（默认自动检测）
#   --id-regex=RE         学号正则核心（默认 5[0-9]{11}；自动加数字边界，避免长数字串误报）
#   --wxid-regex=RE       wxid 正则（默认 wxid_[A-Za-z0-9_]+）
#   --extra-names=名1,名2 手动补充姓名（自动派生不到时使用）
#   --show-values         预览里显示原值（默认打码，如 5423072501**、刘*）
#   -h, --help            帮助
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="move"
APPLY=0
SHOW_VALUES=0
DEST=""
FILES_OPT=""
ID_REGEX='5[0-9]{11}'
WXID_REGEX='wxid_[A-Za-z0-9_]+'
EXTRA_NAMES=""
LABEL_REGEX='学生姓名'

# 学号匹配必须排除“长数字串内部”的误报（例如 32 位 JWT 测试密钥里的 12 位片段）：
#   python 侧用 lookaround；grep -E 不支持 lookaround，用等价的边界分组
ID_GREP="(^|[^0-9])(${ID_REGEX})([^0-9]|$)"

usage() {
  cat <<'EOF'
sanitize-course-materials.sh — 课程材料 PII 处置（默认 dry-run）

用法：
  bash scripts/sanitize-course-materials.sh                          # dry-run（默认 move）
  bash scripts/sanitize-course-materials.sh --mode=redact            # dry-run 预览脱敏
  bash scripts/sanitize-course-materials.sh --mode=move   --apply
  bash scripts/sanitize-course-materials.sh --mode=redact --apply --dest=~/backup

选项：
  --mode=move|redact    move=移出仓库（git rm --cached + mv 到 --dest）；
                        redact=原地脱敏（学号→XXXXXXXXXXX1、姓名→同学A、wxid→wxid_REDACTED）
  --apply               真正执行；缺省为 dry-run
  --dest=DIR            备份/移出目录（默认 ~/ai-agent-course-materials-archive/<时间戳>）
  --files=a,b,c         只处理指定文件（默认自动检测）
  --id-regex=RE         学号正则（默认 5[0-9]{11}）
  --wxid-regex=RE       wxid 正则（默认 wxid_[A-Za-z0-9_]+）
  --extra-names=名1,名2 手动补充姓名
  --show-values         预览里显示原值（默认打码）
  -h, --help            本帮助

脚本不会执行 git commit/push/tag。
EOF
}

for arg in "$@"; do
  case "$arg" in
    --mode=*)        MODE="${arg#--mode=}" ;;
    --apply)         APPLY=1 ;;
    --dry-run)       APPLY=0 ;;
    --show-values)   SHOW_VALUES=1 ;;
    --dest=*)        DEST="${arg#--dest=}" ;;
    --files=*)       FILES_OPT="${arg#--files=}" ;;
    --id-regex=*)    ID_REGEX="${arg#--id-regex=}" ;;
    --wxid-regex=*)  WXID_REGEX="${arg#--wxid-regex=}" ;;
    --extra-names=*) EXTRA_NAMES="${arg#--extra-names=}" ;;
    -h|--help)       usage; exit 0 ;;
    *) echo "[sanitize] 未知参数：$arg" >&2; usage >&2; exit 2 ;;
  esac
done

case "$MODE" in
  move|redact) ;;
  *) echo "[sanitize] --mode 只支持 move 或 redact，收到：$MODE" >&2; exit 2 ;;
esac

if [ -z "$DEST" ]; then
  DEST="${HOME}/ai-agent-course-materials-archive/$(date +%Y%m%d-%H%M%S)"
fi

command -v python3 >/dev/null 2>&1 || { echo "[sanitize] 需要 python3" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "[sanitize] 需要 git" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1) 派生待脱敏值（不硬编码）：学号、姓名、wxid
# ---------------------------------------------------------------------------
derive_values() {
  python3 - "$ID_REGEX" "$WXID_REGEX" "$LABEL_REGEX" "$EXTRA_NAMES" <<'PY'
import re, subprocess, sys

id_regex, wxid_regex, label_regex, extra = sys.argv[1:5]

def git_grep(pattern):
    p = subprocess.run(["git", "grep", "-h", "-I", "-E", pattern, "--", "."],
                       capture_output=True, text=True)
    return p.stdout

text = git_grep(r".")
id_pattern = r"(?<![0-9])" + id_regex + r"(?![0-9])"
ids = sorted(set(re.findall(id_pattern, text)))
wxids = sorted(set(re.findall(wxid_regex, text)))

names = []
# 来源一：'学生姓名：A、B、C' 这类标签行
for line in git_grep(label_regex).splitlines():
    for tok in re.split(r"[、，,；;\s\"'“”（）()：:]+", line):
        if 2 <= len(tok) <= 4 and re.fullmatch(r"[\u4e00-\u9fa5]+", tok):
            if tok not in ("学生姓名", "姓名", "学号", "编写", "负责", "等"):
                names.append(tok)
# 来源二：('姓名', '12位学号') 元组
for m in re.finditer(r"[\"']([\u4e00-\u9fa5]{2,4})[\"']\s*,\s*[\"'](" + id_regex + r")[\"']", text):
    names.append(m.group(1))
# 来源三：CLI 补充
for tok in extra.split(","):
    if tok.strip():
        names.append(tok.strip())

seen, ordered = set(), []
for n in names:
    if n not in seen:
        seen.add(n)
        ordered.append(n)

for i in ids:
    print("ID\t" + i)
for n in ordered:
    print("NAME\t" + n)
for w in wxids:
    print("WXID\t" + w)
PY
}

IDS=(); NAMES=(); WXIDS=()
ID_COUNT=0; NAME_COUNT=0; WXID_COUNT=0
while IFS= read -r row; do
  [ -n "$row" ] || continue
  case "$row" in
    ID*)   IDS+=("${row#ID$'\t'}");     ID_COUNT=$((ID_COUNT+1)) ;;
    NAME*) NAMES+=("${row#NAME$'\t'}"); NAME_COUNT=$((NAME_COUNT+1)) ;;
    WXID*) WXIDS+=("${row#WXID$'\t'}"); WXID_COUNT=$((WXID_COUNT+1)) ;;
  esac
done < <(derive_values)

if [ "$ID_COUNT" -eq 0 ] && [ "$NAME_COUNT" -eq 0 ] && [ "$WXID_COUNT" -eq 0 ]; then
  echo "[sanitize] 未发现任何学号 / 姓名 / wxid 命中，无需处理。"
  exit 0
fi

# ---------------------------------------------------------------------------
# 2) 目标文件（默认自动检测：命中任一类型即入选）
# ---------------------------------------------------------------------------
TARGET_FILES=()
FILE_COUNT=0
if [ -n "$FILES_OPT" ]; then
  _ifs_backup="$IFS"; IFS=','
  for f in $FILES_OPT; do
    if [ -n "$f" ]; then TARGET_FILES+=("$f"); FILE_COUNT=$((FILE_COUNT+1)); fi
  done
  IFS="$_ifs_backup"
else
  pattern="$ID_GREP|$WXID_REGEX"
  for n in "${NAMES[@]}"; do pattern="${pattern}|${n}"; done
  while IFS= read -r f; do
    if [ -n "$f" ]; then TARGET_FILES+=("$f"); FILE_COUNT=$((FILE_COUNT+1)); fi
  done < <(git grep -l -I -E "$pattern" -- . 2>/dev/null | sort -u)
fi

if [ "$FILE_COUNT" -eq 0 ]; then
  echo "[sanitize] 未匹配到目标文件。"
  exit 0
fi

# ---------------------------------------------------------------------------
# 3) 构造脱敏映射（确定性：学号按字典序、姓名按派生顺序）
# ---------------------------------------------------------------------------
ID_FROM=(); ID_TO=(); NAME_FROM=(); NAME_TO=(); WXID_FROM=(); WXID_TO=()
i=0
for v in "${IDS[@]}"; do
  i=$((i+1))
  ID_FROM+=("$v")
  ID_TO+=("$(printf 'XXXXXXXXXXX%d' "$i")")   # 保持 12 位长度，tex/docx 安全
done
i=0
for v in "${NAMES[@]}"; do
  i=$((i+1))
  NAME_FROM+=("$v")
  if [ "$i" -le 26 ]; then
    NAME_TO+=("同学$(printf "\\$(printf '%03o' $((64+i)))")")
  else
    NAME_TO+=("同学$i")
  fi
done
for v in "${WXIDS[@]}"; do
  WXID_FROM+=("$v")
  WXID_TO+=("wxid_REDACTED")
done

mask() {
  local v="$1"
  if [ "$SHOW_VALUES" -eq 1 ]; then printf '%s' "$v"
  else printf '%s**' "${v:0:6}"; fi
}

echo "=========================================================="
echo "[sanitize] 模式：$MODE   执行：$([ "$APPLY" -eq 1 ] && echo 'APPLY（会修改文件）' || echo 'DRY-RUN（不修改任何文件）')"
echo "[sanitize] 仓库：$ROOT_DIR"
echo "[sanitize] 目标目录：$DEST"
echo "=========================================================="
echo "[sanitize] 待处理值：学号 $ID_COUNT 个、姓名 $NAME_COUNT 个、wxid $WXID_COUNT 个"
if [ "$ID_COUNT" -gt 0 ]; then
  for idx in "${!ID_FROM[@]}"; do echo "   学号  $(mask "${ID_FROM[$idx]}")  ->  ${ID_TO[$idx]}"; done
fi
if [ "$NAME_COUNT" -gt 0 ]; then
  for idx in "${!NAME_FROM[@]}"; do echo "   姓名  $(mask "${NAME_FROM[$idx]}")  ->  ${NAME_TO[$idx]}"; done
fi
if [ "$WXID_COUNT" -gt 0 ]; then
  for idx in "${!WXID_FROM[@]}"; do echo "   wxid  $(mask "${WXID_FROM[$idx]}")  ->  ${WXID_TO[$idx]}"; done
fi
echo
echo "[sanitize] 目标文件（$FILE_COUNT 个）："
for f in "${TARGET_FILES[@]}"; do
  n_id=0; n_name=0; n_wx=0
  if [ "$ID_COUNT" -gt 0 ]; then
    for v in "${ID_FROM[@]}"; do n_id=$((n_id + $(grep -c -F -- "$v" "$f" 2>/dev/null || true))); done
  fi
  if [ "$NAME_COUNT" -gt 0 ]; then
    for v in "${NAME_FROM[@]}"; do n_name=$((n_name + $(grep -c -F -- "$v" "$f" 2>/dev/null || true))); done
  fi
  if [ "$WXID_COUNT" -gt 0 ]; then
    for v in "${WXID_FROM[@]}"; do n_wx=$((n_wx + $(grep -c -F -- "$v" "$f" 2>/dev/null || true))); done
  fi
  printf '   %-58s 学号×%s 姓名×%s wxid×%s\n' "$f" "$n_id" "$n_name" "$n_wx"
done
echo

echo "[sanitize] 预览（默认打码；--show-values 显示原值）："
for f in "${TARGET_FILES[@]}"; do
  pattern=""
  if [ "$ID_COUNT" -gt 0 ]; then
    for v in "${ID_FROM[@]}"; do pattern="${pattern:+$pattern|}$v"; done
  fi
  if [ "$NAME_COUNT" -gt 0 ]; then
    for v in "${NAME_FROM[@]}"; do pattern="${pattern:+$pattern|}$v"; done
  fi
  if [ "$WXID_COUNT" -gt 0 ]; then
    for v in "${WXID_FROM[@]}"; do pattern="${pattern:+$pattern|}$v"; done
  fi
  [ -n "$pattern" ] || continue
  grep -n -E "$pattern" "$f" 2>/dev/null | head -3 | while IFS= read -r line; do
    if [ "$SHOW_VALUES" -eq 0 ]; then
      for v in "${ID_FROM[@]}" "${NAME_FROM[@]}" "${WXID_FROM[@]}"; do
        line="${line//$v/$(mask "$v")}"
      done
    fi
    printf '   %s:%s\n' "$f" "$line"
  done
done
echo

# ---------------------------------------------------------------------------
# 4) 执行（仅 --apply）
# ---------------------------------------------------------------------------
if [ "$APPLY" -eq 0 ]; then
  echo "[sanitize] DRY-RUN 结束：未修改任何文件。"
  case "$MODE" in
    move)   echo "[sanitize] 将执行：对每个文件先 'git rm --cached' 再 mv 到 $DEST/<原相对路径>，并写 MANIFEST（不 commit）。" ;;
    redact) echo "[sanitize] 将执行：备份到 $DEST/backup/<原相对路径> 后原地替换（不 commit）。" ;;
  esac
  echo "[sanitize] 确认无误后加 --apply 执行。"
  exit 0
fi

mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
MANIFEST="$DEST/MANIFEST-$STAMP.txt"
{
  echo "# sanitize-course-materials 处置记录"
  echo "# 时间：$STAMP"
  echo "# 模式：$MODE"
  echo "# 仓库：$ROOT_DIR"
  echo "# 说明：学号/姓名/wxid 一律以打码形式记录，避免本文件二次泄漏"
} > "$MANIFEST"

if [ "$MODE" = "move" ]; then
  for f in "${TARGET_FILES[@]}"; do
    if [ ! -f "$f" ]; then echo "[sanitize] 跳过（不存在）：$f"; continue; fi
    mkdir -p "$DEST/$(dirname "$f")"
    git rm --cached -- "$f" >/dev/null
    mv "$f" "$DEST/$f"
    echo "MOVED  $f -> $DEST/$f" | tee -a "$MANIFEST"
  done
  echo "[sanitize] 完成（move）。下一步由人执行（脚本不提交）："
  echo "    git status --porcelain"
  echo "    git commit -m 'chore(privacy): move course materials with PII out of the repository'"
else
  mkdir -p "$DEST/backup"
  MAPFILE_TMP="$(mktemp)"
  : > "$MAPFILE_TMP"
  if [ "$ID_COUNT" -gt 0 ]; then
    for idx in "${!ID_FROM[@]}"; do printf 'ID\t%s\t%s\n' "${ID_FROM[$idx]}" "${ID_TO[$idx]}" >> "$MAPFILE_TMP"; done
  fi
  if [ "$NAME_COUNT" -gt 0 ]; then
    for idx in "${!NAME_FROM[@]}"; do printf 'NAME\t%s\t%s\n' "${NAME_FROM[$idx]}" "${NAME_TO[$idx]}" >> "$MAPFILE_TMP"; done
  fi
  if [ "$WXID_COUNT" -gt 0 ]; then
    for idx in "${!WXID_FROM[@]}"; do printf 'WXID\t%s\t%s\n' "${WXID_FROM[$idx]}" "${WXID_TO[$idx]}" >> "$MAPFILE_TMP"; done
  fi

  python3 - "$MAPFILE_TMP" "$DEST/backup" "${TARGET_FILES[@]}" <<'PY'
import os, shutil, sys
mapfile, backup_root, files = sys.argv[1], sys.argv[2], sys.argv[3:]
rules = []
with open(mapfile, encoding="utf-8") as fh:
    for line in fh:
        parts = line.rstrip("\n").split("\t")
        if len(parts) == 3:
            rules.append((parts[1], parts[2]))
for path in files:
    if not os.path.isfile(path):
        print("SKIP   " + path)
        continue
    dst = os.path.join(backup_root, path)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(path, dst)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    count = 0
    for src, rep in rules:
        n = text.count(src)
        if n:
            text = text.replace(src, rep)
            count += n
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("REDACT %s（替换 %d 处，备份 %s）" % (path, count, dst))
PY
  rm -f "$MAPFILE_TMP"
  echo "[sanitize] 完成（redact）。回滚：cp -a $DEST/backup/. ."
  echo "[sanitize] 下一步由人执行（脚本不提交）：git status --porcelain && git diff --stat"
fi

echo "[sanitize] 注意：脚本不会执行任何 git commit/push/tag。"
