#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/render-release-report.sh --input-json <path> --output-dir <dir> [--base-name <name>] [--title <title>] [--pdf]

Description:
  Render a release-report JSON payload into LaTeX.
  If --pdf is set and tectonic is available, also compile a PDF.
EOF
}

INPUT_JSON=""
OUTPUT_DIR=""
BASE_NAME="release-report"
TITLE="AI Agent Release Report"
GENERATE_PDF="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input-json)
      INPUT_JSON="${2:-}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --base-name)
      BASE_NAME="${2:-}"
      shift 2
      ;;
    --title)
      TITLE="${2:-}"
      shift 2
      ;;
    --pdf)
      GENERATE_PDF="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[report] unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${INPUT_JSON}" || -z "${OUTPUT_DIR}" ]]; then
  echo "[report] --input-json and --output-dir are required" >&2
  usage >&2
  exit 1
fi

if [[ ! -f "${INPUT_JSON}" ]]; then
  echo "[report] input JSON not found: ${INPUT_JSON}" >&2
  exit 1
fi

PYTHON_BIN="${PYTHON_BIN:-}"
if [[ -z "${PYTHON_BIN}" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    echo "[report] python runtime not found" >&2
    exit 1
  fi
fi

mkdir -p "${OUTPUT_DIR}"
TEX_FILE="${OUTPUT_DIR%/}/${BASE_NAME}.tex"
PDF_FILE="${OUTPUT_DIR%/}/${BASE_NAME}.pdf"

"${PYTHON_BIN}" - "${INPUT_JSON}" "${TEX_FILE}" "${TITLE}" <<'PY'
import json
import sys

input_path, output_path, title = sys.argv[1:4]
with open(input_path, "r", encoding="utf-8") as infile:
    report = json.load(infile)

def esc(value):
    if value is None:
        return ""
    text = str(value).replace("\r", "").replace("\n", " ")
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(ch, ch) for ch in text)

def bool_text(value):
    return "Yes" if bool(value) else "No"

readiness = report.get("readiness", {}) or {}
checks = readiness.get("checks", []) or []
models = report.get("models", {}) or {}
model_options = models.get("options", []) or []
tool_stats = report.get("toolStats", {}) or {}
duration_buckets = tool_stats.get("durationBuckets", []) or []
top_tools = tool_stats.get("topTools", []) or []
session_scope = report.get("sessionId") or "global"

lines = [
    r"\documentclass[11pt]{article}",
    r"\usepackage[margin=1in]{geometry}",
    r"\usepackage[T1]{fontenc}",
    r"\usepackage[utf8]{inputenc}",
    r"\usepackage{booktabs}",
    r"\usepackage{longtable}",
    r"\usepackage{array}",
    r"\usepackage[hidelinks]{hyperref}",
    r"\setlength{\parindent}{0pt}",
    r"\begin{document}",
    rf"\section*{{{esc(title)}}}",
    r"\begin{tabular}{p{0.28\linewidth} p{0.64\linewidth}}",
    rf"Generated At & {esc(report.get('generatedAt'))} \\",
    rf"Stats Window & {esc(report.get('windowHours'))}h \\",
    rf"Session Scope & {esc(session_scope)} \\",
    rf"Ready & {esc(bool_text(readiness.get('ready')))} \\",
    rf"Default Model & {esc(models.get('defaultProvider'))} / {esc(models.get('defaultModel'))} \\",
    rf"Tool Success Rate & {esc(tool_stats.get('successRate'))}\% \\",
    rf"Tool Avg / P95 & {esc(tool_stats.get('averageDurationMs'))}ms / {esc(tool_stats.get('p95DurationMs'))}ms \\",
    r"\end{tabular}",
    r"",
    r"\section*{Readiness Checks}",
    r"\begin{longtable}{p{0.22\linewidth} p{0.08\linewidth} p{0.60\linewidth}}",
    r"\toprule",
    r"Check & OK & Detail \\",
    r"\midrule",
    r"\endhead",
]

for check in checks:
    lines.append(
        rf"{esc(check.get('name'))} & {esc(bool_text(check.get('ok')))} & {esc(check.get('detail'))} \\"
    )

lines.extend([
    r"\bottomrule",
    r"\end{longtable}",
    r"",
    r"\section*{Model Inventory}",
    r"\begin{longtable}{p{0.18\linewidth} p{0.56\linewidth} p{0.14\linewidth}}",
    r"\toprule",
    r"Provider & Model & Default \\",
    r"\midrule",
    r"\endhead",
])

for option in model_options:
    lines.append(
        rf"{esc(option.get('provider'))} & {esc(option.get('model'))} & {esc(bool_text(option.get('isDefault')))} \\"
    )

lines.extend([
    r"\bottomrule",
    r"\end{longtable}",
    r"",
    r"\section*{Tool Duration Buckets}",
    r"\begin{longtable}{p{0.50\linewidth} p{0.20\linewidth}}",
    r"\toprule",
    r"Bucket & Count \\",
    r"\midrule",
    r"\endhead",
])

for bucket in duration_buckets:
    lines.append(rf"{esc(bucket.get('label'))} & {esc(bucket.get('count'))} \\")

lines.extend([
    r"\bottomrule",
    r"\end{longtable}",
    r"",
    r"\section*{Top Tools}",
    r"\begin{longtable}{p{0.28\linewidth} p{0.10\linewidth} p{0.14\linewidth} p{0.12\linewidth} p{0.12\linewidth}}",
    r"\toprule",
    r"Tool & Runs & Success Rate & Avg Ms & P95 Ms \\",
    r"\midrule",
    r"\endhead",
])

for tool in top_tools:
    lines.append(
        rf"{esc(tool.get('toolName'))} & {esc(tool.get('runs'))} & {esc(tool.get('successRate'))}\% & {esc(tool.get('averageDurationMs'))} & {esc(tool.get('p95DurationMs'))} \\"
    )

lines.extend([
    r"\bottomrule",
    r"\end{longtable}",
    r"\end{document}",
    "",
])

with open(output_path, "w", encoding="utf-8") as outfile:
    outfile.write("\n".join(lines))
PY

echo "[report] wrote LaTeX: ${TEX_FILE}"

if [[ "${GENERATE_PDF}" != "true" ]]; then
  exit 0
fi

TECTONIC_BIN="${TECTONIC_BIN:-}"
if [[ -z "${TECTONIC_BIN}" ]]; then
  if command -v tectonic >/dev/null 2>&1; then
    TECTONIC_BIN="tectonic"
  else
    echo "[report] tectonic not found; skipped PDF compilation. Set TECTONIC_BIN or install tectonic." >&2
    exit 0
  fi
fi

(
  cd "${OUTPUT_DIR}"
  "${TECTONIC_BIN}" "${BASE_NAME}.tex"
)

echo "[report] wrote PDF: ${PDF_FILE}"
