#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON="${PROJECT_ROOT}/ai/.venv/bin/python"

if [[ ! -x "${PYTHON}" ]]; then
    echo "GPU training environment is missing. Run ./ai/scripts/setup.sh first." >&2
    exit 1
fi

export PYTHONPATH="${PROJECT_ROOT}/ai/planner${PYTHONPATH:+:${PYTHONPATH}}"
exec "${PYTHON}" "${PROJECT_ROOT}/ai/planner/retrieval_cli.py" "$@"
