#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG="${1:-ai/configs/karnataka-osm-extract.toml}"
if [[ "${CONFIG}" != /* ]]; then
    CONFIG="${PROJECT_ROOT}/${CONFIG#./}"
fi

exec "${PROJECT_ROOT}/ai/data-tools/.venv/bin/python" \
    "${PROJECT_ROOT}/ai/scripts/extract_osm_pois.py" \
    --config "${CONFIG}"
