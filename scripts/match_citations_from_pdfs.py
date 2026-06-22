#!/usr/bin/env python3
"""Match Supabase questions to page numbers in كتاب المعلم PDFs.

Reads teacher PDF paths from extracted/teacher_books.json (or env overrides).
Writes:
  - extracted/book_citations_from_pdfs.json
  - supabase_book_citations_from_pdfs.sql

Requires: .venv-pdf with pymupdf (see README).

Usage:
  python3 -m venv .venv-pdf && .venv-pdf/bin/pip install pymupdf
  .venv-pdf/bin/python3 scripts/match_citations_from_pdfs.py
  .venv-pdf/bin/python3 scripts/match_citations_from_pdfs.py --export-txt
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EX = ROOT / "extracted"
CONFIG = EX / "teacher_books.json"
OUT_JSON = EX / "book_citations_from_pdfs.json"
OUT_SQL = ROOT / "supabase_book_citations_from_pdfs.sql"
SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://smcyaqwxbmhshhhhdece.supabase.co"
)
ANON = os.environ.get(
    "SUPABASE_ANON_KEY", "sb_publishable_4OhSsWwIfV4QxGRf1fujLA_TjE111eU"
)

BAD_SNIPPET = (
    "أكملي الفراغ", "رتبي الكلمات", "اذكري معاني", "معاني كلمات",
    "كوني من", "ضعي الكلمة", "صلي الكلمات",
)

# Hand-tuned for questions that fuzzy-match poorly (hadith fragments).
MANUAL_PAGE_HINTS: list[tuple[str, str, int]] = [
    ("nawawi", "البدعة تنقسم", 41),
    ("tawheed", "الرقية بالقرآن والأدعية الصحيحة جائزة", 95),
    ("usool", "هل يرضى الله أن يُشرك", 8),
    ("nawawi", "من هاجر إلى الله ورسوله", 1),
    ("nawawi", "ينبغي للمسلم أن يعيش في الدنيا", 9),
    ("tawheed", "لا تعتذروا قد كفرتم", 120),
    ("tawheed", "من كان حالفاً فليحلف بالله", 88),
    ("nawawi", "احفظ الله", 35),
    ("nawawi", "دع ما يريبك", 40),
    ("nawawi", "أركان الإيمان الستة", 2),
    ("nawawi", "الطهور شطر الإيمان", 2),
    ("nawawi", "النية محلّها", 1),
    ("usool", "معرفة الله تكون بمعرفة", 11),
    ("tawheed", "لتركبُنّ سنن", 76),
    ("tawheed", "قال المنافق", 108),
    ("tawheed", "الواهنة", 112),
    ("tawheed", "لا تحلفوا", 88),
    ("tawheed", "الرقى المنهي عنها", 179),
    ("usool", "يا أيها المدّثر", 61),
    ("tawheed", "يعجب النبي", 90),
    ("tawheed", "منار الأرض", 32),
    ("tawheed", "القلائد في رقاب الإبل", 47),
    ("tawheed", "ذات أنواط", 125),
    ("usool", "اقرأ باسم ربك الذي خلق", 61),
]


def fix_pdf_ar(s: str) -> str:
    if not s:
        return ""
    repl = {
        "اهلل": "الله", "هللا": "الله", "هلل": "لله", "حممد": "محمد",
        "اإلسالم": "الإسلام", "امل": "الم", "احل": "الح", "ال  ": "ال",
        "تو حيد": "توحيد", "ال  ناس": "الناس",
    }
    for a, b in repl.items():
        s = s.replace(a, b)
    return s


def norm(s: str) -> str:
    s = fix_pdf_ar(s)
    s = re.sub(r"[\u064B-\u065F\u0670\uf000-\uf0ff]", "", s)
    s = (
        s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
        .replace("ى", "ي").replace("ة", "ه")
    )
    s = re.sub(r"[^\w\u0600-\u06FF\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def tokens(s: str, minlen: int = 3) -> list[str]:
    stop = {
        "ما", "من", "هل", "في", "على", "عن", "ذلك", "هذا", "هذه", "التي",
        "الذي", "كان", "كما", "كل", "لم", "لن", "ان", "قد", "مع", "بين",
        "او", "لا", "ليس", "غير", "بعد", "قبل", "ثم", "هو", "هي", "هم",
        "الله", "النبي", "قال", "قوله", "تعالى", "رواه", "حديث", "يعني",
    }
    return [t for t in norm(s).split() if len(t) >= minlen and t not in stop]


def printed_page(text: str, pdf_i: int) -> int:
    t = text[:1200]
    for pat in (
        r"(?:كتاب التوحيد|الأصول الثلاثة|الأربعون النووية)[^\d\n]{0,80}(\d{1,3})\s",
        r"(?:^|\n)\s*(\d{1,3})\s+باب\b",
        r"(?:^|\n)\s*(\d{1,3})\s+س\s*[:：]",
        r"(?:^|\n)\s*(\d{1,3})\s*\n",
    ):
        m = re.search(pat, t, re.M)
        if m:
            n = int(m.group(1))
            if 1 <= n <= 250:
                return n
    return pdf_i


def is_clean_quote(s: str) -> bool:
    if not s or len(s.strip()) < 18:
        return False
    if any(b in s for b in BAD_SNIPPET):
        return False
    if s.count("؟") > 2:
        return False
    if re.search(r"\d+\s*\)", s):
        return False
    if re.match(r"^\d{1,3}\s", s.strip()):
        return False
    if s.strip().startswith("الإجابة الصحيحة"):
        return False
    return True


def snippet_from_page(text: str, keys: list[str], max_len: int = 280) -> str:
    text = fix_pdf_ar(text)
    text = re.sub(r"\s+", " ", text).strip()

    for m in re.finditer(r"«([^»]{15,400})»", text):
        seg = re.sub(r"\s+", " ", m.group(1)).strip()
        if sum(1 for k in keys if k in norm(seg)) >= 1 and is_clean_quote(seg):
            q = f"«{seg}»"
            return q[:max_len] + "…»" if len(q) > max_len else q

    for m in re.finditer(r"ج\s*[:：]\s*([^؟\n]{20,400})", text):
        seg = re.sub(r"\s+", " ", m.group(1)).strip()
        if sum(1 for k in keys if k in norm(seg)) >= 2 and is_clean_quote(seg):
            return seg[:max_len]

    parts = re.split(r"[.؟!]\s+", text)
    best, best_sc = "", 0
    for p in parts:
        p = p.strip()
        if len(p) < 20 or not is_clean_quote(p):
            continue
        sc = sum(1 for k in keys if k in norm(p))
        if sc > best_sc:
            best_sc, best = sc, p
    if best_sc >= 2:
        return best[:max_len]
    return ""


def load_pdf_paths() -> dict[str, Path]:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    out = {}
    for book in ("tawheed", "usool", "nawawi"):
        env_key = f"TEACHER_PDF_{book.upper()}"
        path = Path(os.environ.get(env_key, cfg.get(book, "")))
        if not path.is_file():
            sys.exit(f"ERROR: PDF not found for {book}: {path}")
        out[book] = path
    return out


def index_pdfs(paths: dict[str, Path]) -> dict[str, list[dict]]:
    import fitz  # noqa: PLC0415

    pages: dict[str, list[dict]] = {}
    for book, path in paths.items():
        doc = fitz.open(path)
        pages[book] = []
        for i in range(doc.page_count):
            raw = doc[i].get_text("text")
            pages[book].append({
                "pdf": i + 1,
                "printed": printed_page(raw, i + 1),
                "text": raw,
                "norm": norm(raw),
                "toks": set(tokens(raw)),
            })
        doc.close()
        print(f"  {book}: {len(pages[book])} PDF pages indexed")
    return pages


def fetch_questions() -> list[dict]:
    headers = {"apikey": ANON, "Authorization": f"Bearer {ANON}"}
    rows: list[dict] = []
    offset = 0
    while True:
        params = urllib.parse.urlencode({
            "select": "id,book,question_text,explanation,source_quote,book_page",
            "language": "eq.ar",
            "limit": "1000",
            "offset": str(offset),
        })
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/questions?{params}", headers=headers
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            chunk = json.loads(resp.read())
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows


def manual_page(book: str, question: str) -> int | None:
    qn = norm(question)
    for b, frag, page in MANUAL_PAGE_HINTS:
        if b == book and norm(frag) in qn:
            return page
    return None


def match_question(row: dict, pages: list[dict]) -> dict | None:
    book = row["book"]
    qt = tokens(row.get("question_text", ""))
    et = tokens(row.get("explanation", "") or "")
    keys = list(dict.fromkeys(qt[:14] + et[:10]))
    qn = norm(row.get("question_text", ""))

    mp = manual_page(book, row.get("question_text", ""))
    if mp is not None:
        exact = next((p for p in pages if p["printed"] == mp), None)
        best_pg = exact or min(pages, key=lambda p: abs(p["printed"] - mp))
        return {"page": best_pg, "score": 99}

    if len(keys) < 2:
        return None

    best_sc, best_pg = 0, None
    for pg in pages:
        sc = sum(1 for k in keys if k in pg["toks"])
        if len(qn) > 18:
            for ln in (20, 30, 40, 55):
                if qn[:ln] in pg["norm"]:
                    sc += 6
                    break
        if sc > best_sc:
            best_sc, best_pg = sc, pg

    if not best_pg or best_sc < 2:
        return None
    return {"page": best_pg, "score": best_sc}


def choose_quote(row: dict, page_text: str, keys: list[str]) -> str | None:
    cur = (row.get("source_quote") or "").strip()
    if cur and is_clean_quote(cur) and len(cur) >= 25 and "«" in cur:
        return cur
    fresh = snippet_from_page(page_text, keys)
    if fresh and is_clean_quote(fresh):
        return fresh
    if cur and is_clean_quote(cur):
        return cur[:280]
    exp = (row.get("explanation") or "").strip()
    if exp and is_clean_quote(exp) and not exp.startswith("الإجابة الصحيحة"):
        return exp[:280]
    return None


def export_txt(paths: dict[str, Path]) -> None:
    import fitz  # noqa: PLC0415

    for book, path in paths.items():
        doc = fitz.open(path)
        parts = []
        for i in range(doc.page_count):
            parts.append(doc[i].get_text("text"))
        doc.close()
        out = EX / f"{book}.txt"
        out.write_text("\n\n".join(parts), encoding="utf-8")
        print(f"  wrote {out}")


def esc_sql(s: str) -> str:
    return (s or "").replace("'", "''")


def main() -> int:
    try:
        import fitz  # noqa: F401
    except ImportError:
        sys.exit(
            "ERROR: pymupdf required. Run:\n"
            "  python3 -m venv .venv-pdf && .venv-pdf/bin/pip install pymupdf\n"
            "  .venv-pdf/bin/python3 scripts/match_citations_from_pdfs.py"
        )

    export_txt_flag = "--export-txt" in sys.argv
    print("Loading PDFs…")
    paths = load_pdf_paths()
    if export_txt_flag:
        print("Exporting plain text…")
        export_txt(paths)

    print("Indexing pages…")
    pages = index_pdfs(paths)

    print("Fetching questions…")
    questions = fetch_questions()

    updates = []
    stats = {"matched": 0, "pages_only": 0, "manual": 0, "miss": 0}

    for row in questions:
        book = row.get("book")
        if book not in pages:
            stats["miss"] += 1
            continue

        hit = match_question(row, pages[book])
        if not hit:
            stats["miss"] += 1
            continue

        pg = hit["page"]
        keys = tokens(row.get("question_text", "")) + tokens(row.get("explanation", "") or "")
        quote = choose_quote(row, pg["text"], keys)

        stats["matched"] += 1
        if hit["score"] == 99:
            stats["manual"] += 1
        if not quote or quote == (row.get("source_quote") or "").strip():
            stats["pages_only"] += 1

        updates.append({
            "id": row["id"],
            "book": book,
            "book_page": pg["printed"],
            "pdf_page": pg["pdf"],
            "source_quote": quote,
            "match_score": hit["score"],
        })

    OUT_JSON.write_text(
        json.dumps({"updates": updates}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "-- Generated by scripts/match_citations_from_pdfs.py",
        "-- كتاب المعلم PDFs → book_page (+ source_quote when clean)",
        f"-- Matched {len(updates)} / {len(questions)} Arabic questions",
        "",
    ]
    for u in updates:
        sets = [f"book_page = {int(u['book_page'])}"]
        if u.get("source_quote"):
            sets.append(f"source_quote = '{esc_sql(u['source_quote'])}'")
        lines.append(
            f"update public.questions set {', '.join(sets)} where id = '{u['id']}';"
        )
    lines.extend([
        "",
        "-- تحقق:",
        "select book,",
        "  count(*) filter (where book_page is not null) as with_page,",
        "  count(*) filter (where source_quote is not null and trim(source_quote) <> '') as with_quote",
        "from public.questions where language = 'ar' group by book order by book;",
    ])
    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")

    print(f"\nMatched {stats['matched']} ({stats['manual']} manual hints), missed {stats['miss']}")
    print(f"Wrote {OUT_JSON.name} and {OUT_SQL.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
