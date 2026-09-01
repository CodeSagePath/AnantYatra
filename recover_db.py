#!/usr/bin/env python3
import sys
import re
import json

def recover_sqlite_db(file_path):
    print(f"==================================================")
    print(f"  AnantYatra Data Recovery Tool")
    print(f"  Scanning file: {file_path}")
    print(f"==================================================\n")

    with open(file_path, 'rb') as f:
        raw_data = f.read()

    # 1. Recover Emails
    emails = sorted(list(set([
        e.decode('utf-8', errors='ignore') 
        for e in re.findall(rb'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', raw_data)
        if len(e) < 60 and not e.startswith(b'cms')
    ])))

    print(f"[+] Found {len(emails)} Unique Email Addresses:")
    for email in emails:
        print(f"    - {email}")

    # 2. Recover Waypoint JSON Arrays
    # Matches JSON array strings containing waypoints
    waypoint_patterns = [
        rb'\[\s*\{[^{}]*"(?:lat|latitude|lng|lon|name)"[^{}]*\}\s*(?:,\s*\{[^{}]*"(?:lat|latitude|lng|lon|name)"[^{}]*\}\s*)*\]',
        rb'\[\s*\{[^{}]*"name"[^{}]*"lat"[^{}]*\}\s*(?:,\s*\{[^{}]*"name"[^{}]*"lat"[^{}]*\}\s*)*\]'
    ]

    found_waypoints = []
    seen = set()

    for pattern in waypoint_patterns:
        for m in re.findall(pattern, raw_data):
            try:
                decoded = m.decode('utf-8', errors='ignore')
                if decoded not in seen:
                    seen.add(decoded)
                    parsed = json.loads(decoded)
                    if isinstance(parsed, list) and len(parsed) >= 1:
                        found_waypoints.append(parsed)
            except Exception:
                continue

    print(f"\n[+] Recovered {len(found_waypoints)} Raw Waypoint Assemblies:")
    for idx, wp in enumerate(found_waypoints, 1):
        print(f"\n  --- Waypoint Set #{idx} ({len(wp)} stops) ---")
        for stop in wp:
            name = stop.get('name', 'Unnamed Stop')
            lat = stop.get('lat') or stop.get('latitude')
            lon = stop.get('lon') or stop.get('lng') or stop.get('longitude')
            print(f"    * {name} ({lat}, {lon})")

    # 3. Recover CUID tokens / IDs
    cuids = sorted(list(set([
        c.decode('utf-8', errors='ignore')
        for c in re.findall(rb'\bcm[a-z0-9]{23}\b', raw_data)
    ])))

    print(f"\n[+] Recovered {len(cuids)} Database CUID Identifiers:")
    for c in cuids[:10]:
        print(f"    - {c}")
    if len(cuids) > 10:
        print(f"    ... and {len(cuids) - 10} more.")

    # Dump JSON recovery file
    output_filename = "recovered_anantyatra_data.json"
    recovery_payload = {
        "emails": emails,
        "cuids": cuids,
        "recovered_waypoint_sets": found_waypoints
    }
    with open(output_filename, "w") as out:
        json.dump(recovery_payload, out, indent=2)

    print(f"\n==================================================")
    print(f" SUCCESS: Full extraction saved to '{output_filename}'")
    print(f"==================================================")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 recover_db.py <path_to_db_file>")
        sys.exit(1)
    recover_sqlite_db(sys.argv[1])
