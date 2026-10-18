#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON="${PROJECT_ROOT}/ai/.venv/bin/python"
CONFIG=""
ARGS=("$@")

while (($#)); do
    case "$1" in
        --config)
            CONFIG="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

if [[ -z "${CONFIG}" ]]; then
    echo "--config is required" >&2
    exit 2
fi
if [[ ! -x "${PYTHON}" ]]; then
    echo "Training environment is missing. Run ./ai/scripts/setup.sh first." >&2
    exit 1
fi

GATE_STATUS=0
"${PYTHON}" "${PROJECT_ROOT}/ai/scripts/retraining_gate.py" "${ARGS[@]}" || GATE_STATUS=$?
if [[ "${GATE_STATUS}" -eq 3 ]]; then
    echo "Retraining deferred by the reviewed decision."
    exit 0
fi
if [[ "${GATE_STATUS}" -ne 0 ]]; then
    exit "${GATE_STATUS}"
fi

if [[ "${CONFIG}" != /* ]]; then
    CONFIG="${PROJECT_ROOT}/${CONFIG}"
fi
exec "${PYTHON}" "${PROJECT_ROOT}/ai/scripts/train.py" --config "${CONFIG}"
