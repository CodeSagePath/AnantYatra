#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOLS_DIR="${PROJECT_ROOT}/ai/data-tools"
VENV="${TOOLS_DIR}/.venv"

if [[ ! -x "${VENV}/bin/python" ]]; then
    python3 -m venv "${VENV}"
fi

if [[ -f "${TOOLS_DIR}/requirements.lock.txt" ]]; then
    "${VENV}/bin/python" -m pip install -r "${TOOLS_DIR}/requirements.lock.txt"
fi

"${VENV}/bin/python" -m pip install -r "${TOOLS_DIR}/requirements.txt"
"${VENV}/bin/python" -m pip freeze > "${TOOLS_DIR}/requirements.lock.txt"
