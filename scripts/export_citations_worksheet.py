#!/usr/bin/env python3
"""Export Arabic questions to CSV for filling book_page and source_quote.

Usage:
  python3 scripts/export_citations_worksheet.py
  python3 scripts/export_citations_worksheet.py --missing-pages-only
  python3 scripts/export_citations_worksheet.py -o extracted/my_worksheet.csv

Uses the public anon key (read-only). Open the CSV in Excel/Numbers, fill
book_page and improved source_quote, then copy rows into book_citations.json
and run scripts/apply_book_citations.py with SUPABASE_KEY.
"""
from __future__ import annotations

import csv
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "extracted" / "book_citations_worksheet.csv"
BASE = "https://smcyaqwxbmhshhhhdece.supabase.co/rest/v1/questions"
ANON = "sb_publishable_4OhSsWwIfV4QxGRf1fujLA_TjE111eU"


def fetch_all() -> list[dict]:
    headers = {"apikey": ANON, "Authorization": f"Bearer {ANON}"}
    rows: list[dict] = []
    offset = 0
    while True:
        params = {
            "select": "id,book,level,question_text,source_quote,book_page",
            "language": "eq.ar",
            "order": "book.asc,level.asc,id.asc",
            "limit": "1000",
            "offset": str(offset),
        }
        q = urllib.parse.urlencode(params)
        req = urllib.request.Request(f"{BASE}?{q}", headers=headers)
        with urllib.request.urlopen(req, timeout=60) as resp:
            chunk = json.loads(resp.read())
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows


def main() -> int:
    missing_pages_only = "--missing-pages-only" in sys.argv
    out_path = DEFAULT_OUT
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if "-o" in sys.argv:
        idx = sys.argv.index("-o")
        if idx + 1 < len(sys.argv):
            out_path = Path(sys.argv[idx + 1])

    rows = fetch_all()
    if missing_pages_only:
        rows = [r for r in rows if r.get("book_page") is None]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "id",
            "book",
            "level",
            "question_text",
            "source_quote_current",
            "book_page_NEW",
            "source_quote_NEW",
            "notes",
        ])
        for r in rows:
            w.writerow([
                r.get("id", ""),
                r.get("book", ""),
                r.get("level", ""),
                (r.get("question_text") or "").replace("\n", " "),
                (r.get("source_quote") or "").replace("\n", " "),
                r.get("book_page") or "",
                "",
                "",
            ])

    by_book: dict[str, int] = {}
    for r in rows:
        by_book[r.get("book", "?")] = by_book.get(r.get("book", "?"), 0) + 1

    print(f"Wrote {len(rows)} rows → {out_path}")
    for book in sorted(by_book):
        print(f"  {book}: {by_book[book]}")
    print("\nNext: fill book_page_NEW / source_quote_NEW, build book_citations.json, run apply_book_citations.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
