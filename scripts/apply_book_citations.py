#!/usr/bin/env python3
"""Apply book_page and source_quote updates from a JSON file to live Supabase.

Usage:
  export SUPABASE_KEY=your-service-role-key
  python3 scripts/apply_book_citations.py
  python3 scripts/apply_book_citations.py extracted/book_citations_seed.json
  python3 scripts/apply_book_citations.py --dry-run extracted/book_citations.json

JSON format (see extracted/book_citations.template.json):
  { "updates": [ { "id": "uuid", "book_page": 12, "source_quote": "«...»" }, ... ] }

Only include fields you want to change. Omit book_page to leave it unchanged.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JSON = ROOT / "extracted" / "book_citations.json"
FALLBACK_JSON = ROOT / "extracted" / "book_citations_seed.json"
URL = os.environ.get("SUPABASE_URL", "https://smcyaqwxbmhshhhhdece.supabase.co") + "/rest/v1/questions"
KEY = os.environ.get("SUPABASE_KEY")


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def headers() -> dict[str, str]:
    return {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def patch_question(qid: str, body: dict) -> None:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{URL}?id=eq.{qid}",
        data=data,
        headers=headers(),
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status not in (200, 204):
            raise RuntimeError(f"Unexpected status {resp.status} for {qid}")


def main() -> int:
    load_env()
    global KEY
    KEY = os.environ.get("SUPABASE_KEY")
    if not KEY:
        sys.exit("ERROR: set SUPABASE_KEY (service role) in .env or environment.")

    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dry_run = "--dry-run" in sys.argv[1:]

    json_path = Path(args[0]) if args else DEFAULT_JSON
    if not json_path.is_file():
        if json_path == DEFAULT_JSON and FALLBACK_JSON.is_file():
            json_path = FALLBACK_JSON
        else:
            sys.exit(f"ERROR: file not found: {json_path}")

    payload = json.loads(json_path.read_text(encoding="utf-8"))
    updates = payload.get("updates") or payload
    if not isinstance(updates, list):
        sys.exit("ERROR: JSON must contain an 'updates' array.")

    ok = 0
    skipped = 0
    for i, row in enumerate(updates, 1):
        qid = row.get("id")
        if not qid:
            print(f"[{i}] skip — missing id")
            skipped += 1
            continue

        body: dict = {}
        if "book_page" in row and row["book_page"] is not None:
            body["book_page"] = int(row["book_page"])
        if "source_quote" in row and row["source_quote"] is not None:
            body["source_quote"] = str(row["source_quote"]).strip()

        if not body:
            note = row.get("note", "no fields to update")
            print(f"[{i}] skip {qid[:8]}… — {note}")
            skipped += 1
            continue

        label = row.get("book", "?")
        page = body.get("book_page", "—")
        quote = (body.get("source_quote") or "")[:50]
        print(f"[{i}] {'DRY ' if dry_run else ''}PATCH {label} {qid[:8]}… page={page} quote={quote!r}")

        if dry_run:
            ok += 1
            continue

        try:
            patch_question(qid, body)
            ok += 1
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            print(f"    FAIL HTTP {e.code}: {err[:200]}", file=sys.stderr)
        except Exception as e:
            print(f"    FAIL: {e}", file=sys.stderr)

    print(f"\nDone: {ok} updated, {skipped} skipped, {len(updates)} total.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
