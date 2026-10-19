#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export HF_HOME="${PROJECT_ROOT}/ai/models/cache/huggingface"
exec "${PROJECT_ROOT}/ai/.venv/bin/python" "${PROJECT_ROOT}/ai/scripts/gpu_smoke.py" "$@"
