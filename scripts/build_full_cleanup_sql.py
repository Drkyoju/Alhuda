#!/usr/bin/env python3
"""Build supabase_questions_full_cleanup.sql for SQL Editor."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_JSON = ROOT / "extracted" / "db_questions_live.json"
QUIZ_HTML = Path(os.environ.get("QUIZ_HTML", sys.argv[1] if len(sys.argv) > 1 else ROOT / "quiz_app.html"))
OUT_SQL = ROOT / "supabase_questions_full_cleanup.sql"

BOOK_MAP = {
    "كتاب التوحيد": "tawheed",
    "الأصول الثلاثة": "usool",
    "الأربعون النووية": "nawawi",
}

DELETE_IDS = [
    "a4997115-269f-437f-bdbb-f393597b0f46",
    "42ab81f2-d523-4e25-a128-98c944d8fc6c",
    "1a7b6639-b25e-4419-a5bb-2a0caffc42e8",
    "fec71e86-130a-4576-9c53-1dbcb76841ff",
    "8656fd46-d3eb-4258-b8db-a49ed6e9cc23",
    "b9fe149e-ec16-4b58-8881-6940034cc090",
    "7a5da56b-30ad-4a96-8e01-894c68b852cc",
    "25a287ee-24bd-40b9-b1ad-2480a3f59f7a",
    "e1350226-7eb6-4b90-b83f-08a97168589c",
    "54b981f4-97c4-43db-a2a5-8b76352eac34",
    "00013168-f35c-4502-85ff-0e53e0375135",
    "77a0eee2-619b-43ca-8c3c-79e1544d7749",
    "252ce3f2-3c0d-43a8-8ffa-50e044a42208",
    "aee4ceb2-d468-41be-829b-40c0e2752b5f",
    "ce01929d-e694-4b0e-a92e-dbe2bc15d203",
    "19778392-ac11-407e-ad74-782ae19dc9c2",
]

MANUAL = {
    "c07d02bc-50b6-4351-8058-63e0c96dc0b2": "الخطأ في الحديث: ما فعل العبد من عمل وهو يخطئ فيه أو يقع فيه خطأ دون قصد.",
    "ba832db3-dd15-4230-976e-0b8522a3d3eb": "النسيان في الحديث: ما فعل العبد من عمل ثم نسيه بعد ذلك، فُرِّغ عنه.",
}

GENERIC = ("هي الإجابة المطابقة", "هو الموضع الصحيح", "هو ما ثبت في لفظ الحديث")


def clean(text: str) -> str:
    text = re.sub(r"[\uf000-\uf0ff]", "", text or "")
    return re.sub(r"\s+", " ", text).strip()


def norm(text: str) -> str:
    text = clean(text).lower()
    text = re.sub(r"[\u064B-\u065F\u0670]", "", text)
    text = re.sub(r"[^\w\u0600-\u06FF\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def sql_escape(s: str) -> str:
    return (s or "").replace("'", "''")


def token_overlap(a: str, b: str) -> float:
    aw = set(norm(a).split())
    bw = set(norm(b).split())
    if not aw or not bw:
        return 0.0
    return len(aw & bw) / max(len(aw), len(bw))


def load_quiz_index() -> dict:
    text = QUIZ_HTML.read_text(encoding="utf-8")
    data = json.loads(re.search(r"const DATA = (\{.*?\});\s*\n", text, re.S).group(1))
    index = {}
    for book_obj in data["books"]:
        book = BOOK_MAP[book_obj["name"]]
        for q in book_obj["questions"]:
            index[(book, norm(q["q"]))] = q
    return index


def find_quiz(q: dict, index: dict) -> dict | None:
    key = (q["book"], norm(q["question_text"]))
    if key in index:
        return index[key]
    best = None
    score = 0.0
    for (book, _), row in index.items():
        if book != q["book"]:
            continue
        s = token_overlap(q["question_text"], row["q"])
        if s > score:
            score = s
            best = row
    return best if score >= 0.82 else None


def better_explanation(q: dict, quiz_row: dict | None) -> str | None:
    if quiz_row:
        expl = clean(quiz_row.get("correctExpl") or "")
        if expl and not any(m in expl for m in GENERIC):
            return expl
        opts = quiz_row.get("options") or []
        correct = int(quiz_row.get("correct", 0))
        if opts and 0 <= correct < len(opts):
            ans = clean(opts[correct])
            if ans and ans != "لا أعلم":
                return f"الإجابة الصحيحة: {ans}"
    if q.get("type") == "mc":
        opts = q.get("options") or []
        ci = q.get("correct_index")
        if opts and ci is not None and 0 <= int(ci) < len(opts):
            ans = clean(opts[int(ci)])
            if ans and ans != "لا أعلم":
                return f"الإجابة الصحيحة: {ans}"
    if q.get("type") == "tf":
        return "صحيح." if q.get("is_true") else "خطأ."
    return None


def main():
    db = json.loads(DB_JSON.read_text(encoding="utf-8"))
    quiz_index = load_quiz_index()
    delete_set = set(DELETE_IDS)

    lines = [
        "-- مراجعة شاملة للأسئلة: حذف تكرار + تصحيح لغوي + تحسين الشروح",
        "-- شغّل هذا الملف في Supabase SQL Editor",
        f"-- قبل: {len(db)} | حذف: {len(DELETE_IDS)} | متوقع بعد: {len(db) - len(DELETE_IDS)}",
        "",
        "BEGIN;",
        "",
    ]
    for qid in DELETE_IDS:
        lines.append(f"DELETE FROM questions WHERE id = '{qid}';")

    punct = 0
    expl = 0
    for q in db:
        qid = q["id"]
        if qid in delete_set:
            continue
        fields = {}
        fixed_text = clean(q["question_text"])
        if re.search(r":؟", fixed_text):
            fixed_text = re.sub(r":؟\s*$", ":", fixed_text)
            fields["question_text"] = fixed_text
            punct += 1
        if qid in MANUAL:
            fields["explanation"] = MANUAL[qid]
            expl += 1
        elif any(m in (q.get("explanation") or "") for m in GENERIC):
            row = find_quiz(q, quiz_index)
            new_expl = better_explanation(q, row)
            if new_expl:
                fields["explanation"] = new_expl
                expl += 1
        if not fields:
            continue
        sets = []
        if "question_text" in fields:
            sets.append(f"question_text = '{sql_escape(fields['question_text'])}'")
        if "explanation" in fields:
            sets.append(f"explanation = '{sql_escape(fields['explanation'])}'")
        lines.append(f"UPDATE questions SET {', '.join(sets)} WHERE id = '{qid}';")

    lines.extend(["", "COMMIT;", "", "-- SELECT COUNT(*) FROM questions WHERE language = 'ar';"])
    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")
    print({"punctuation": punct, "explanations": expl, "deletes": len(DELETE_IDS), "lines": len(lines)})


if __name__ == "__main__":
    main()
