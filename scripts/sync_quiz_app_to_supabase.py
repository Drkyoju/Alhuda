#!/usr/bin/env python3
"""Compare quiz_app.html with Supabase, fix Arabic, dedupe, and build import SQL."""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUIZ_HTML = Path("/Users/aibi/Downloads/quiz_app.html")
DB_JSON = ROOT / "extracted" / "db_questions.json"
OUT_SQL = ROOT / "supabase_questions_sync.sql"
OUT_REPORT = ROOT / "extracted" / "sync_report.json"
OUT_NEW = ROOT / "extracted" / "questions_to_add.json"
OUT_UPDATE = ROOT / "extracted" / "questions_to_update.json"

BOOK_MAP = {
    "كتاب التوحيد": "tawheed",
    "الأصول الثلاثة": "usool",
    "الأربعون النووية": "nawawi",
}

CHAPTER_MAP = {
    "tawheed": [
        ("🕌 حق الله", ["حق الله", "حق العباد", "الثقلين", "ليعبدون", "معاذ"]),
        ("📖 لماذا خُلقنا", ["خلق الجن", "الحكمة من خلق", "ليعبدون"]),
        ("🌟 فضل التوحيد", ["فضل التوحيد", "فضائل التوحيد", "الموحد", "لا يشرك"]),
        ("✅ تحقيق التوحيد", ["تحقيق التوحيد", "تصفية", "البدع"]),
        ("⚠️ الخوف من الشرك", ["الخوف من الشرك", "الاستعاذة"]),
        ("⚠️ الشرك", ["شرك", "أبواب الشرك", "الأوثان", "التبرك بالأشجار", "الأحجار"]),
        ("📿 الرقى والتمائم", ["الرقى", "التمائم", "التولة", "السحر", "الكهانة", "التنجيم"]),
        ("🕌 الغلو والحلف", ["الغلو", "القبور", "الحلف", "النذر"]),
        ("📚 مسائل متنوعة", []),
    ],
    "usool": [
        ("👤 المؤلف", ["المؤلف", "ولد", "توفي", "شيوخ"]),
        ("📖 الكتاب", ["الأصول الثلاثة", "القبر", "أربع مسائل"]),
        ("📚 العلم", ["تعريف العلم", "العلم قبل"]),
        ("🕌 الرب", ["ربك", "من ربك", "الرب"]),
        ("🙏 العبادة", ["العبادة", "لا يرضى", "يشرك معه"]),
        ("👤 النبي", ["نبيك", "من نبيك", "النبي"]),
        ("📿 الدين", ["دينك", "الإسلام", "الإيمان", "الإحسان"]),
        ("🤲 الدعاء", ["الدعاء", "الذبح", "النذر"]),
        ("🛡️ التوكل", ["التوكل"]),
        ("🆘 الاستعانة", ["الاستعانة"]),
        ("📿 الاستعاذة", ["الاستعاذة"]),
    ],
    "nawawi": [
        ("1- النية", ["النية", "الأعمال بالنيات", "الحديث الأول"]),
        ("2- جبريل", ["جبريل", "الإسلام والإيمان", "الإحسان", "الحديث الثاني"]),
        ("3- الإسلام", ["أركان الإسلام", "الحديث الثالث", "بني الإسلام"]),
        ("4- أركان الإسلام", ["أركان الإسلام", "الحديث الرابع"]),
        ("5- البدعة", ["البدعة", "الحديث الخامس", "محدثات"]),
        ("6- الشبهات", ["الشبهات", "الحديث السادس", "الحلال والحرام"]),
        ("7- الدين النصيحة", ["الدين النصيحة", "الحديث السابع"]),
    ],
}

ARABIC_FIXES = [
    (r"\s+", " "),
    (r"؟\s*؟+", "؟"),
    (r"\?\s*\?+", "؟"),
    (r"هوال", "هو ال"),
    (r"للامرئ", "للأمرئ"),
    (r"فضيلال", "فضل ال"),
    (r"كيفكانت", "كيف كانت"),
    (r"متىكانت", "متى كانت"),
    (r"ماهي", "ما هي"),
    (r"ماهو", "ما هو"),
    (r"لماذاthis", "لماذا"),
    (r"الاص ول", "الأصول"),
    (r"الث لاثة", "الثلاثة"),
    (r"النووية", "النووية"),
    (r"", ""),
    (r"", ""),
    (r"", ""),
    (r"", ""),
    (r"", ""),
    (r"", ""),
    (r"", ""),
    (r"", ""),
    (r"", ""),
    (r"", ""),
    (r"", ""),
]


def clean(text: str) -> str:
    text = re.sub(r"[\uf000-\uf0ff]", "", text or "")
    for pat, repl in ARABIC_FIXES:
        text = re.sub(pat, repl, text)
    return text.strip()


def norm(text: str) -> str:
    text = clean(text).lower()
    text = re.sub(r"[\u064B-\u065F\u0670]", "", text)
    text = re.sub(r"[^\w\u0600-\u06FF\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def token_overlap(a: str, b: str) -> float:
    aw = set(norm(a).split())
    bw = set(norm(b).split())
    if not aw or not bw:
        return 0.0
    return len(aw & bw) / max(len(aw), len(bw))


def is_exact_duplicate(a: str, b: str) -> bool:
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    return token_overlap(a, b) >= 0.92


def is_same_question(a: str, b: str) -> bool:
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if is_exact_duplicate(a, b):
        return True
    if len(na) > 18 and (na[:28] == nb[:28] or na in nb or nb in na):
        return True
    overlap = token_overlap(a, b)
    if overlap >= 0.72:
        return True
    # Topic match only when wording is already close
    key_sets = [
        {"خلق", "الجن", "الإنس"},
        {"حق", "الله", "العباد"},
        {"حق", "العباد", "الله"},
        {"النية", "الأعمال"},
        {"الإسلام", "الإيمان", "الإحسان"},
    ]
    aw = set(na.split())
    bw = set(nb.split())
    for keys in key_sets:
        if keys.issubset(aw) and keys.issubset(bw) and overlap >= 0.55:
            return True
    return False


def fix_question(text: str) -> str:
    text = clean(text)
    if text and not text.endswith(("؟", "?", ".")):
        if text.startswith(("ما ", "من ", "متى", "أين", "لماذا", "هل ", "كم ", "أ ", "اذكر", "عرف")):
            text += "؟"
    return text


def fix_options(options: list[str]) -> list[str]:
    out = [clean(o) for o in options if clean(o)]
    while len(out) < 4:
        out.append("لا أعلم")
    return out[:4]


def guess_chapter(book: str, section: str, question: str) -> str:
    blob = clean(section + " " + question)
    rules = CHAPTER_MAP.get(book, [])
    for chapter, keys in rules:
        if any(k in blob for k in keys):
            return chapter
    if book == "nawawi":
        m = re.search(r"(\d+)", section)
        if m:
            n = int(m.group(1))
            return f"{n}- حديث"
    if " — " in section:
        tail = section.split(" — ", 1)[1]
        emoji = {"الشرك": "⚠️", "الرقى": "📿", "الغلو": "🕌", "الحلف": "🕌", "تفصيلية": "📚"}.get(
            next((k for k in ["الشرك", "الرقى", "الغلو", "الحلف", "تفصيلية"] if k in tail), ""),
            "📚",
        )
        return f"{emoji} {tail[:40]}"
    return section[:50] if section else "عام"


def assign_level(book: str, section: str, idx: int) -> str:
    s = section.lower()
    if any(x in s for x in ["مؤلف", "الكتاب", "حق الله", "النية", "مبتدئ", "تعريف"]):
        return "easy"
    if any(x in s for x in ["تفصيلية", "شرك", "غلو", "سحر", "متقدم"]):
        return "hard"
    return ["easy", "medium", "hard"][idx % 3]


def load_quiz_app() -> list[dict]:
    text = QUIZ_HTML.read_text(encoding="utf-8")
    data = json.loads(re.search(r"const DATA = (\{.*?\});\s*\n", text, re.S).group(1))
    rows = []
    for book_obj in data["books"]:
        book_name = book_obj["name"]
        book = BOOK_MAP[book_name]
        for i, q in enumerate(book_obj["questions"]):
            question = fix_question(q["q"])
            options = fix_options(q.get("options") or [])
            correct = int(q.get("correct", 0))
            if correct >= len(options):
                correct = 0
            explanation = clean(q.get("correctExpl") or "")
            if not explanation:
                explanation = f"الإجابة الصحيحة: {options[correct]}"
            rows.append(
                {
                    "book": book,
                    "chapter": guess_chapter(book, q.get("section", ""), question),
                    "level": assign_level(book, q.get("section", ""), i),
                    "type": "mc",
                    "question_text": question,
                    "options": options,
                    "correct_index": correct,
                    "explanation": explanation,
                    "language": "ar",
                    "source_section": q.get("section", ""),
                }
            )
    return rows


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def main():
    db = json.loads(DB_JSON.read_text(encoding="utf-8"))
    quiz_rows = load_quiz_app()

    # Dedupe within quiz_app
    seen = set()
    quiz_unique = []
    quiz_dupes = []
    for q in quiz_rows:
        key = norm(q["question_text"])
        if key in seen:
            quiz_dupes.append(q["question_text"])
            continue
        seen.add(key)
        quiz_unique.append(q)

    # Compare with DB
    db_by_book = defaultdict(list)
    for q in db:
        db_by_book[q["book"]].append(q)

    to_add = []
    to_update = []
    already_in_db = []
    matched_db_ids = set()
    for q in quiz_unique:
        match = None
        for dq in db_by_book[q["book"]]:
            if is_same_question(q["question_text"], dq["question_text"]):
                match = dq
                break
        if match:
            matched_db_ids.add(match["id"])
            already_in_db.append({"quiz": q["question_text"], "db": match["question_text"]})
            # Update if quiz version has better text/options
            if (
                q["question_text"] != match["question_text"]
                or q.get("options") != match.get("options")
                or q.get("explanation") != match.get("explanation")
            ):
                to_update.append({**q, "id": match["id"]})
        else:
            to_add.append(q)

    # Find duplicates within existing DB
    db_dupes = []
    checked = set()
    for i, a in enumerate(db):
        for j, b in enumerate(db):
            if i >= j or a["book"] != b["book"]:
                continue
            if is_exact_duplicate(a["question_text"], b["question_text"]):
                pair = tuple(sorted([a["id"], b["id"]]))
                if pair not in checked:
                    checked.add(pair)
                    db_dupes.append(
                        {
                            "id_keep": a["id"],
                            "id_remove": b["id"],
                            "text_a": a["question_text"],
                            "text_b": b["question_text"],
                        }
                    )

    report = {
        "quiz_app_total": len(quiz_rows),
        "quiz_app_unique": len(quiz_unique),
        "quiz_app_internal_dupes": len(quiz_dupes),
        "db_existing": len(db),
        "already_in_db": len(already_in_db),
        "to_update": len(to_update),
        "to_add": len(to_add),
        "db_internal_dupes": len(db_dupes),
        "after_import_total_estimate": len(db) - len(db_dupes) + len(to_add),
        "by_book_to_add": dict(Counter(q["book"] for q in to_add)),
        "by_book_to_update": dict(Counter(q["book"] for q in to_update)),
        "db_dupe_samples": db_dupes[:10],
        "quiz_dupe_samples": quiz_dupes[:10],
    }

    OUT_NEW.write_text(json.dumps(to_add, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_UPDATE.write_text(json.dumps(to_update, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "-- Sync quiz_app.html -> Supabase questions",
        f"-- Updates {len(to_update)} | Adds {len(to_add)} | Deletes {len(db_dupes)} DB duplicates",
        "",
    ]

    for d in db_dupes:
        lines.append(f"DELETE FROM questions WHERE id = '{d['id_remove']}';")

    for q in to_update:
        opts = json.dumps(q["options"], ensure_ascii=False).replace("'", "''")
        lines.append(
            "UPDATE questions SET "
            f"chapter = '{sql_escape(q['chapter'])}', "
            f"level = '{q['level']}', "
            f"type = 'mc', "
            f"question_text = '{sql_escape(q['question_text'])}', "
            f"options = '{opts}'::jsonb, "
            f"correct_index = {q['correct_index']}, "
            f"explanation = '{sql_escape(q['explanation'])}' "
            f"WHERE id = '{q['id']}';"
        )

    for q in to_add:
        opts = json.dumps(q["options"], ensure_ascii=False).replace("'", "''")
        lines.append(
            "INSERT INTO questions (book, chapter, level, type, question_text, options, correct_index, explanation, language) VALUES ("
            f"'{q['book']}', '{sql_escape(q['chapter'])}', '{q['level']}', 'mc', "
            f"'{sql_escape(q['question_text'])}', '{opts}'::jsonb, {q['correct_index']}, "
            f"'{sql_escape(q['explanation'])}', 'ar');"
        )

    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
