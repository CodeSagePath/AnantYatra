#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODEL_PYTHON="${AI_MODEL_PYTHON_BIN:-${PROJECT_ROOT}/ai/.venv/bin/python}"
PLANNER_PYTHON="${AI_PYTHON_BIN:-${PROJECT_ROOT}/ai/data-tools/.venv/bin/python}"

if [[ "$#" -ne 5 ]]; then
    echo "Usage: $0 REQUEST ROUTE POIS SOURCES OUTPUT" >&2
    exit 2
fi

REQUEST="$1"
ROUTE="$2"
POIS="$3"
SOURCES="$4"
OUTPUT="$5"
MODEL_OUTPUT="$(mktemp)"
trap 'rm -f "${MODEL_OUTPUT}"' EXIT

cd "${PROJECT_ROOT}"
export HF_HOME="${HF_HOME:-${PROJECT_ROOT}/ai/model-cache}"
export PYTHONPATH="${PROJECT_ROOT}/ai/planner${PYTHONPATH:+:${PYTHONPATH}}"
MODEL_ARGS=(
    "${PROJECT_ROOT}/ai/planner/model_cli.py"
    --request "${REQUEST}"
    --route "${ROUTE}"
    --pois "${POIS}"
    --sources "${SOURCES}"
    --output "${MODEL_OUTPUT}"
)
if [[ -n "${AI_MODEL_ID:-}" ]]; then MODEL_ARGS+=(--model "${AI_MODEL_ID}"); fi
if [[ -n "${AI_MODEL_REVISION:-}" ]]; then MODEL_ARGS+=(--revision "${AI_MODEL_REVISION}"); fi
if [[ -n "${AI_MODEL_ADAPTER:-}" ]]; then MODEL_ARGS+=(--adapter "${AI_MODEL_ADAPTER}"); fi

"${MODEL_PYTHON}" "${MODEL_ARGS[@]}"
"${PLANNER_PYTHON}" "${PROJECT_ROOT}/ai/planner/cli.py" \
    --request "${REQUEST}" \
    --route "${ROUTE}" \
    --pois "${POIS}" \
    --sources "${SOURCES}" \
    --model-plan "${MODEL_OUTPUT}" \
    --validate-route-legs \
    --output "${OUTPUT}"
