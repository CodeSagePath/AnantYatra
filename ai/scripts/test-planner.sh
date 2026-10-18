#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON="${PROJECT_ROOT}/ai/data-tools/.venv/bin/python"

if [[ ! -x "${PYTHON}" ]]; then
    echo "Planner environment is missing. Run ./ai/scripts/setup-data-tools.sh first." >&2
    exit 1
fi

export PYTHONPATH="${PROJECT_ROOT}/ai/planner${PYTHONPATH:+:${PYTHONPATH}}"
exec "${PYTHON}" -m unittest discover \
    -s "${PROJECT_ROOT}/ai/planner" \
    -p 'test_*.py' \
    -v
