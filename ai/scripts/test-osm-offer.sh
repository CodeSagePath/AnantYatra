#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON="${ROOT}/ai/.venv/bin/python"
if [[ ! -x "${PYTHON}" ]]; then
  PYTHON=python3
fi

"${PYTHON}" -m unittest discover \
  -s "${ROOT}/ai/scripts" \
  -p 'test_package_osm_offer.py' \
  -v
