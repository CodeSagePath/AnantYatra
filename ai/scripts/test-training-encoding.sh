#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec "${PROJECT_ROOT}/ai/.venv/bin/python" -m unittest \
    discover -s "${PROJECT_ROOT}/ai/scripts" -p 'test_train_encoding.py' -v
