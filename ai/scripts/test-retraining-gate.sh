#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON="${PROJECT_ROOT}/ai/data-tools/.venv/bin/python"

exec "${PYTHON}" -m unittest discover \
    -s "${PROJECT_ROOT}/ai/scripts" \
    -p 'test_retraining_gate.py' \
    -v
