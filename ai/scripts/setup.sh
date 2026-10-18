#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV="${PROJECT_ROOT}/ai/.venv"
export HF_HOME="${PROJECT_ROOT}/ai/model-cache"

if [[ ! -x "${VENV}/bin/python" ]]; then
    python3 -m venv "${VENV}"
fi
"${VENV}/bin/python" -m pip install --upgrade pip
if [[ -f "${PROJECT_ROOT}/ai/requirements-gpu.lock.txt" ]]; then
    "${VENV}/bin/python" -m pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cu130 \
        --extra-index-url https://pypi.org/simple \
        -r "${PROJECT_ROOT}/ai/requirements-gpu.lock.txt"
else
    "${VENV}/bin/python" -m pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cu130 \
        --extra-index-url https://pypi.org/simple \
        torch
    "${VENV}/bin/python" -m pip install --no-cache-dir \
        -r "${PROJECT_ROOT}/ai/requirements-gpu.txt"
fi
"${VENV}/bin/python" -m pip freeze > "${PROJECT_ROOT}/ai/requirements-gpu.lock.txt"
