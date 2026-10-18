#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGION="karnataka"
OUTPUT_DIR="${PROJECT_ROOT}/ai/data/raw/osm/${REGION}"
BASE_URL="https://download.openstreetmap.fr/extracts/asia/india"
STATE_INFO_PATH="${OUTPUT_DIR}/${REGION}.state.txt"
CHECKSUM_PATH="${OUTPUT_DIR}/${REGION}.osm.pbf.md5"
TEMP_PATH="${OUTPUT_DIR}/${REGION}.osm.pbf.part"

mkdir -p "${OUTPUT_DIR}"
curl --fail --location --retry 3 --retry-delay 2 \
    --output "${STATE_INFO_PATH}" "${BASE_URL}/${REGION}.state.txt"
curl --fail --location --retry 3 --retry-delay 2 \
    --output "${CHECKSUM_PATH}" "${BASE_URL}/${REGION}.osm.pbf.md5"
curl --fail --location --retry 3 --retry-delay 2 \
    --output "${TEMP_PATH}" "${BASE_URL}/${REGION}.osm.pbf"

EXPECTED_MD5="$(awk '{print $1}' "${CHECKSUM_PATH}")"
ACTUAL_MD5="$(md5sum "${TEMP_PATH}" | awk '{print $1}')"
if [[ "${EXPECTED_MD5}" != "${ACTUAL_MD5}" ]]; then
    echo "The Karnataka extract does not match its published MD5 checksum." >&2
    exit 1
fi

SNAPSHOT_DATE="$(sed -n 's/^timestamp=//p' "${STATE_INFO_PATH}" | cut -d T -f 1)"
if [[ ! "${SNAPSHOT_DATE}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "Could not read the source snapshot date." >&2
    exit 1
fi

OUTPUT_PATH="${OUTPUT_DIR}/${REGION}-${SNAPSHOT_DATE}.osm.pbf"
mv "${TEMP_PATH}" "${OUTPUT_PATH}"
sha256sum "${OUTPUT_PATH}" > "${OUTPUT_PATH}.sha256"
printf 'Downloaded %s\n' "${OUTPUT_PATH}"
cat "${OUTPUT_PATH}.sha256"
