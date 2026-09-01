#!/usr/bin/env python3
import sys
import json
import re

def recover_sqlite_fast(file_path):
    print(f"[*] Reading file: {file_path}")
    with open(file_path, 'rb') as f:
        data = f.read()

    print(f"[*] File size: {len(data) / 1024 / 1024:.2f} MB")

    # 1. Extract Emails instantly
    email_regex = re.compile(rb'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
    raw_emails = set(email_regex.findall(data))
    emails = sorted([
        e.decode('utf-8', errors='ignore') 
        for e in raw_emails 
        if len(e) < 50 and not e.startswith(b'cms')
    ])

    print(f"\n[+] Found {len(emails)} Unique Email Addresses:")
    for email in emails:
        print(f"  - {email}")

    # 2. Extract JSON waypoints using fast substring index scan (sub-second)
    routes = []
    pos = 0
    data_len = len(data)
    
    while pos < data_len:
        idx = data.find(b'[{"', pos)
        if idx == -1:
            break
        end_idx = data.find(b']', idx)
        if end_idx != -1 and (end_idx - idx) < 100000:
            chunk = data[idx:end_idx + 1]
            try:
                decoded = chunk.decode('utf-8', errors='ignore')
                parsed = json.loads(decoded)
                if isinstance(parsed, list) and len(parsed) >= 1:
                    routes.append(parsed)
            except Exception:
                pass
            pos = end_idx + 1
        else:
            pos = idx + 3

    print(f"\n[+] Found {len(routes)} Valid Waypoint Sets:")
    for idx, r in enumerate(routes, 1):
        print(f"  - Set #{idx}: {len(r)} waypoints (First stop: {r[0].get('name', 'N/A')})")

    # 3. Save payload
    output_filename = "recovered_anantyatra_data.json"
    with open(output_filename, "w") as out:
        json.dump({"emails": emails, "routes": routes}, out, indent=2)

    print(f"\n[✓] DONE! Extraction complete in < 1 second. Saved to '{output_filename}'")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 recover_db.py <path_to_db_file>")
        sys.exit(1)
    recover_sqlite_fast(sys.argv[1])
