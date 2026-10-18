#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_INPUT="${1:-${PROJECT_ROOT}/ai/configs/karnataka-qlora.toml}"
if [[ "${CONFIG_INPUT}" = /* ]]; then
    CONFIG="${CONFIG_INPUT}"
else
    CONFIG="${PROJECT_ROOT}/${CONFIG_INPUT#./}"
fi
export HF_HOME="${PROJECT_ROOT}/ai/model-cache"
shift || true
exec "${PROJECT_ROOT}/ai/.venv/bin/python" "${PROJECT_ROOT}/ai/scripts/train.py" --config "${CONFIG}" "$@"
