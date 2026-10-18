#!/usr/bin/env bash
set -euo pipefail

valhalla_url="${VALHALLA_URL:-http://127.0.0.1:5006}"
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

for costing in auto motorcycle bicycle; do
  request="$(printf '{"locations":[{"lat":12.9716,"lon":77.5946},{"lat":12.9141,"lon":74.8560}],"costing":"%s","units":"kilometers"}' "$costing")"
  status="$(curl --fail-with-body -sS \
    -H 'Content-Type: application/json' \
    --data "$request" \
    -o "$response_file" \
    -w '%{http_code}' \
    "$valhalla_url/route")"
  if [[ "$status" != "200" ]]; then
    echo "Valhalla returned HTTP $status for $costing" >&2
    exit 1
  fi

  python3 - "$response_file" "$costing" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as response_file:
    trip = json.load(response_file)["trip"]

summary = trip["summary"]
if trip.get("status") != 0 or not trip.get("legs"):
    raise SystemExit(f"Valhalla returned an invalid {sys.argv[2]} route")
if summary["length"] <= 0 or summary["time"] <= 0:
    raise SystemExit(f"Valhalla returned non-positive {sys.argv[2]} route metrics")

print(
    f"{sys.argv[2]}: {summary['length']:.1f} km, "
    f"{summary['time'] / 3600:.2f} h, {len(trip['legs'])} leg(s)"
)
PY
done
