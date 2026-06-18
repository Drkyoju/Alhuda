#!/usr/bin/env python3
"""Apply sync results to Supabase via REST API."""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get("SUPABASE_URL", "https://smcyaqwxbmhshhhhdece.supabase.co") + "/rest/v1/questions"
KEY = os.environ.get("SUPABASE_KEY")
if not KEY:
    sys.exit("ERROR: set SUPABASE_KEY (and optionally SUPABASE_URL) in the environment or a local .env file. Aborting.")
HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def request(method: str, url: str, body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    report = json.loads((ROOT / "extracted/sync_report.json").read_text(encoding="utf-8"))
    to_add = json.loads((ROOT / "extracted/questions_to_add.json").read_text(encoding="utf-8"))
    to_update = json.loads((ROOT / "extracted/questions_to_update.json").read_text(encoding="utf-8"))
    db_dupes = report.get("db_dupe_samples", [])

    deleted = 0
    for d in db_dupes:
        code, body = request("DELETE", f"{URL}?id=eq.{d['id_remove']}")
        if code in (200, 204):
            deleted += 1
        else:
            print("DELETE fail", d["id_remove"], code, body[:200])

    updated = 0
    for q in to_update:
        payload = {
            "chapter": q["chapter"],
            "level": q["level"],
            "type": "mc",
            "question_text": q["question_text"],
            "options": q["options"],
            "correct_index": q["correct_index"],
            "explanation": q["explanation"],
            "is_true": None,
        }
        code, body = request("PATCH", f"{URL}?id=eq.{q['id']}", payload)
        if code in (200, 204):
            updated += 1
        else:
            print("UPDATE fail", q["id"], code, body[:200])

    inserted = 0
    batch_size = 50
    for i in range(0, len(to_add), batch_size):
        batch = []
        for q in to_add[i : i + batch_size]:
            batch.append(
                {
                    "book": q["book"],
                    "chapter": q["chapter"],
                    "level": q["level"],
                    "type": "mc",
                    "question_text": q["question_text"],
                    "options": q["options"],
                    "correct_index": q["correct_index"],
                    "explanation": q["explanation"],
                    "language": "ar",
                }
            )
        code, body = request("POST", URL, batch)
        if code in (200, 201):
            inserted += len(batch)
        else:
            print("INSERT batch fail", i, code, body[:300])
            break

    # verify count
    code, body = request("GET", f"{URL}?select=id&language=eq.ar")
    count = len(json.loads(body)) if code == 200 else "?"

    result = {
        "deleted_dupes": deleted,
        "updated": updated,
        "inserted": inserted,
        "final_count": count,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
