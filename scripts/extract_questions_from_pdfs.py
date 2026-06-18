#!/usr/bin/env python3
"""Extract Q&A from teacher PDF text files and build arranged Supabase import."""
import json
import random
import re
import uuid
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTRACTED = ROOT / "extracted"
random.seed(42)

SKIP_PREFIXES = (
    "اكتبي", "رتبي", "أكملي", "ضعي", "صلي", "اذكري مناسبة", "اكتبي مناسبة",
    "كوني من", "معاني الكلمات", "معنى", "بنو آدم، من",
)
SKIP_CONTAINS = ("رتبي الكلمات", "أكملي الفراغ", "ضعي الكلمة", "معاني كلمات")


def clean(text: str) -> str:
    text = re.sub(r"[\uf000-\uf0ff]", "", text or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def norm(text: str) -> str:
    text = clean(text).lower()
    return re.sub(r"[^\w\u0600-\u06FF\s]", "", text)


def similar(a: str, b: str) -> bool:
    aw = set(norm(a).split())
    bw = set(norm(b).split())
    if not aw or not bw:
        return False
    return len(aw & bw) / max(len(aw), len(bw)) > 0.58


def valid_pair(q: str, a: str) -> bool:
    if len(q) < 12 or len(q) > 220:
        return False
    if len(a) < 4 or len(a) > 400:
        return False
    if any(q.startswith(p) for p in SKIP_PREFIXES):
        return False
    if any(x in q for x in SKIP_CONTAINS):
        return False
    if re.search(r"\d+\s*\)\s*بالعبادة", q):
        return False
    q_words = ("ما ", "من ", "متى", "أين", "لماذا", "هل ", "كم ", "اذكر", "عرف", "بين", "س:")
    looks_like_question = q.endswith(("؟", "?")) or q.startswith(q_words)
    if not looks_like_question:
        return False
    if similar(q, a):
        return False
    return True


def extract_sa_ja(text: str) -> list[dict]:
    pairs = []
    for m in re.finditer(
        r"(?:^|\n)\s*س\s*[:：]\s*(.+?)\s*ج\s*[:：]\s*(.+?)(?=(?:\n\s*س\s*[:：])|\Z)",
        text,
        re.S,
    ):
        q = clean(m.group(1))
        a = clean(re.split(r"\s*س\s*[:：]", m.group(2))[0])
        q = q.split("؟")[0].strip()
        if "؟" not in q and "?" not in q:
            q += "؟"
        if valid_pair(q, a):
            pairs.append({"q": q, "a": a})
    return pairs


def extract_symbol_qa(text: str) -> list[dict]:
    pairs = []
    for m in re.finditer(
        r"\s*(.+?)\s*(?:الجواب|ج)\s*[:：]\s*(.+?)(?=\s*|\n\s*س\s*[:：]|\Z)",
        text,
        re.S,
    ):
        q = clean(m.group(1).split("\n")[0])
        a = clean(re.split(r"\n\s*(?:|س\s*[:：])", m.group(2))[0])
        if valid_pair(q, a):
            pairs.append({"q": q, "a": a})
    return pairs


def dedupe_pairs(pairs: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for p in pairs:
        key = norm(p["q"])
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def extract_nawawi_fawaid(text: str, db_chapters: list[str]) -> list[dict]:
    """Turn numbered فوائد under each hadith into true/false learning checks."""
    chunks = re.split(r"\s*وائ", text)
    items = []
    chapter_idx = 0
    for chunk in chunks[1:]:
        benefits = re.findall(r"\d+\)\s*(.+?)(?=\d+\)|\Z)", chunk, re.S)
        benefits = [clean(b) for b in benefits if 8 < len(clean(b)) < 180]
        if not benefits:
            continue
        chapter = db_chapters[min(chapter_idx, len(db_chapters) - 1)]
        chapter_idx += 1
        for b in benefits[:3]:
            stmt = clean(re.sub(r"^[:\s]+", "", b))
            if len(stmt) < 12:
                continue
            q = f"من فوائد الحديث ({chapter}): {stmt}"
            if not q.endswith(("؟", "?")):
                q = q.rstrip(".") + "؟"
            items.append({
                "q": q,
                "a": f"نعم، {stmt}",
                "chapter": chapter,
            })
    return items


def guess_chapter(book: str, q: str, a: str) -> str:
    t = norm(q + " " + a)
    if book == "tawheed":
        rules = [
            ("🕌 حق الله على العباد", ["حق العباد", "حق الله على", "معاذ", "الجن والإنس", "ليعبدون", "توحيد العبادة"]),
            ("🕌 حق الله", ["حق الله", "الثقلين"]),
            ("📖 لماذا خُلقنا", ["خلق", "الجن", "الإنس", "ليعبدون"]),
            ("🌟 فضل التوحيد", ["فضل التوحيد", "فضائل", "الموحد", "لا يشرك", "الشرك به"]),
            ("✅ تحقيق التوحيد", ["تحقيق التوحيد", "تصفيته", "البدع"]),
            ("⚠️ الخوف من الشرك", ["الخوف", "الاستعاذة"]),
            ("⚠️ الشرك", ["شرك", "أوثان", "تبرك", "أحجار", "أشجار"]),
            ("📿 الرقى والتمائم", ["رقى", "تمائم", "تعاويذ"]),
        ]
        for ch, keys in rules:
            if any(k in t for k in keys):
                return ch
        return "📚 مسائل متنوعة"
    if book == "usool":
        rules = [
            ("👤 المؤلف", ["مؤلف", "ولد", "توفي", "شيوخ", "مؤلفات", "عظيم", "تسمية", "نشأة"]),
            ("📖 الكتاب", ["الأصول الثلاثة", "القبر", "أربع مسائل", "تعريف العلم", "العلم قبل"]),
            ("📚 المسائل الأربع", ["أربع مسائل", "الدعوة", "الصبر على"]),
            ("🕌 الرب", ["ربك", "الرب", "خلقنا", "رزقنا", "من ربك"]),
            ("🙏 العبادة", ["العبادة", "لا يرضى", "يشرك معه"]),
            ("👤 النبي", ["نبيك", "النبي", "الرسول"]),
            ("📿 الدين", ["دينك", "الإسلام", "الإيمان", "الإحسان"]),
            ("🤲 الدعاء", ["الدعاء", "الذبح", "النذر"]),
            ("🛡️ التوكل", ["التوكل"]),
            ("🆘 الاستعانة", ["الاستعانة"]),
            ("📿 الاستعاذة", ["الاستعاذة"]),
        ]
        for ch, keys in rules:
            if any(k in t for k in keys):
                return ch
        return "📖 الكتاب"
    return "عام"


def in_db(q: str, book: str, db_rows: list[dict]) -> bool:
    for row in db_rows:
        if row["book"] != book:
            continue
        if similar(q, row["question_text"]):
            return True
        if row["type"] == "tf" and similar(q, row.get("explanation") or ""):
            return True
    return False


def make_mc(q: str, a: str, pool: list[str]) -> dict:
    correct = a.split(".")[0][:120]
    distractors = []
    for other in pool:
        if similar(other, correct):
            continue
        if 4 < len(other) < 90 and other not in distractors:
            distractors.append(other)
    random.shuffle(distractors)
    opts = [correct] + distractors[:3]
    while len(opts) < 4:
        opts.append("لا أعلم")
    random.shuffle(opts)
    return {
        "type": "mc",
        "question_text": q if q.endswith(("؟", "?")) else q + "؟",
        "options": opts[:4],
        "correct_index": opts[:4].index(correct),
        "explanation": a,
    }


def make_tf(q: str, a: str) -> dict | None:
    if len(a.split()) > 18:
        return None
    neg = any(w in norm(a) for w in ["لا ", "ليس", "محرم", "كفر", "شرك", "خطأ"])
    pos = any(w in norm(a) for w in ["نعم", "يجب", "واجب", "صحيح", "مشروع", "فضيلة", "يلزم"])
    if not (pos or neg):
        return None
    stmt = a if len(a) < 100 else a[:100]
    return {
        "type": "tf",
        "question_text": stmt if stmt.endswith(("؟", ".")) else stmt + ".",
        "is_true": pos and not neg,
        "explanation": a,
    }


CHAPTER_ORDER = {
    "tawheed": [
        "🕌 حق الله", "🕌 حق الله على العباد", "📖 لماذا خُلقنا", "🌟 فضل التوحيد",
        "✅ تحقيق التوحيد", "⚠️ الخوف من الشرك", "⚠️ الشرك", "📿 الرقى والتمائم", "📚 مسائل متنوعة",
    ],
    "usool": [
        "👤 المؤلف", "📖 الكتاب", "📚 المسائل الأربع", "📚 العلم", "🕌 الرب", "🙏 العبادة",
        "👤 النبي", "📿 الدين", "🤲 الدعاء", "🛡️ التوكل", "🆘 الاستعانة", "📿 الاستعاذة",
    ],
}


def chapter_sort_key(q: dict) -> tuple:
    order = CHAPTER_ORDER.get(q["book"], [])
    try:
        ci = order.index(q.get("chapter", ""))
    except ValueError:
        ci = 999
    lvl = {"easy": 0, "medium": 1, "hard": 2}.get(q.get("level", "easy"), 1)
    return (q["book"], ci, lvl, q.get("question_text", ""))


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def is_publishable(q: dict) -> bool:
    text = q.get("question_text", "")
    bad_starts = ("أول ما", "الدعوة إلى", "لأنه", "نعم،", "وهو إفراد", "نشأ في", "توفي")
    if text.startswith(bad_starts):
        return False
    if ":؟" in text or text.count("؟") > 2:
        return False
    if q["type"] == "tf" and similar(text, q.get("explanation", "")):
        # TF statement copied from answer without question form
        if not text.startswith(("هل", "من فوائد")):
            return False
    if len(text) < 15:
        return False
    return True
    return s.replace("'", "''")


def main():
    db = json.loads((EXTRACTED / "db_questions.json").read_text(encoding="utf-8"))
    naw_chapters = sorted(
        {q["chapter"] for q in db if q["book"] == "nawawi"},
        key=lambda x: int(re.findall(r"\d+", x)[0]) if re.findall(r"\d+", x) else 99,
    )

    pdf_pairs = {}
    for book in ("tawheed", "usool"):
        text = (EXTRACTED / f"{book}.txt").read_text(encoding="utf-8")
        pairs = dedupe_pairs(extract_sa_ja(text))
        if book == "usool":
            pairs = dedupe_pairs(pairs + extract_symbol_qa(text))
        pdf_pairs[book] = pairs

    naw_pairs = extract_nawawi_fawaid(
        (EXTRACTED / "nawawi.txt").read_text(encoding="utf-8"),
        [c for c in naw_chapters if re.match(r"\d+", c)],
    )

    new_questions = []
    audit = {"books": {}, "totals": {}}

    for book, pairs in {**pdf_pairs, "nawawi": naw_pairs}.items():
        pool = [p["a"] for p in pairs if p.get("a")]
        matched = 0
        for i, p in enumerate(pairs):
            if in_db(p["q"], book, db):
                matched += 1
                continue
            chapter = p.get("chapter") or guess_chapter(book, p["q"], p.get("a", ""))
            item = make_mc(p["q"], p.get("a", ""), pool)
            item.update({
                "book": book,
                "chapter": chapter,
                "level": "easy" if i % 3 == 0 else "medium" if i % 3 == 1 else "hard",
                "language": "ar",
            })
            new_questions.append(item)
        audit["books"][book] = {
            "pdf_pairs": len(pairs),
            "db_existing": len([q for q in db if q["book"] == book]),
            "covered_in_db": matched,
            "missing_new": len(pairs) - matched,
        }

    # dedupe new against each other, then quality filter
    seen = set()
    filtered = []
    for q in new_questions:
        k = (q["book"], norm(q["question_text"]))
        if k in seen:
            continue
        seen.add(k)
        filtered.append(q)
    new_questions = [q for q in filtered if is_publishable(q)]

    all_questions = [*db, *new_questions]
    all_questions.sort(key=chapter_sort_key)

    audit["totals"] = {
        "db_existing": len(db),
        "new_generated": len(new_questions),
        "combined_after_import": len(db) + len(new_questions),
    }

    (EXTRACTED / "new_questions.json").write_text(
        json.dumps(new_questions, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (EXTRACTED / "questions_arranged.json").write_text(
        json.dumps(all_questions, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (EXTRACTED / "extraction_audit.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    sql_lines = [
        "-- Run in Supabase SQL Editor after review",
        "-- Adds questions extracted from teacher PDF books (كتاب المعلم)",
        f"-- New rows: {len(new_questions)}",
        "",
    ]
    for q in new_questions:
        if q["type"] == "tf":
            sql_lines.append(
                "INSERT INTO questions (book, chapter, level, type, question_text, is_true, explanation, language) VALUES ("
                f"'{q['book']}', '{sql_escape(q['chapter'])}', '{q['level']}', 'tf', "
                f"'{sql_escape(q['question_text'])}', {str(q['is_true']).lower()}, "
                f"'{sql_escape(q['explanation'])}', 'ar');"
            )
        else:
            opts = json.dumps(q["options"], ensure_ascii=False).replace("'", "''")
            sql_lines.append(
                "INSERT INTO questions (book, chapter, level, type, question_text, options, correct_index, explanation, language) VALUES ("
                f"'{q['book']}', '{sql_escape(q['chapter'])}', '{q['level']}', 'mc', "
                f"'{sql_escape(q['question_text'])}', '{opts}'::jsonb, {q['correct_index']}, "
                f"'{sql_escape(q['explanation'])}', 'ar');"
            )

    (ROOT / "supabase_questions_import.sql").write_text("\n".join(sql_lines), encoding="utf-8")
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
