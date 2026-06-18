#!/usr/bin/env python3
"""Apply full question cleanup: punctuation, dedupe similar pairs, improve explanations."""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_JSON = ROOT / "extracted" / "db_questions_live.json"
# Allow override via CLI arg or env var; fall back to a sibling of the project.
QUIZ_HTML = Path(os.environ.get("QUIZ_HTML", sys.argv[1] if len(sys.argv) > 1 else ROOT / "quiz_app.html"))
URL = os.environ.get("SUPABASE_URL", "https://smcyaqwxbmhshhhhdece.supabase.co") + "/rest/v1/questions"
KEY = os.environ.get("SUPABASE_KEY")
if not KEY:
    sys.exit("ERROR: set SUPABASE_KEY (and optionally SUPABASE_URL) in the environment or a local .env file. Aborting.")

BOOK_MAP = {
    "كتاب التوحيد": "tawheed",
    "الأصول الثلاثة": "usool",
    "الأربعون النووية": "nawawi",
}

# Weaker / redundant row in each reviewed similar pair (keep the other).
SIMILAR_DELETE_IDS = [
    "a4997115-269f-437f-bdbb-f393597b0f46",  # الشرك الأصغر: (fragment)
    "42ab81f2-d523-4e25-a128-98c944d8fc6c",  # اتق without و
    "1a7b6639-b25e-4419-a5bb-2a0caffc42e8",  # duplicate تميمة stem
    "fec71e86-130a-4576-9c53-1dbcb76841ff",  # duplicate غلو قبور
    "8656fd46-d3eb-4258-b8db-a49ed6e9cc23",  # shorter يؤذيني ابن آدم
    "b9fe149e-ec16-4b58-8881-6940034cc090",  # incomplete الرقى fragment
    "7a5da56b-30ad-4a96-8e01-894c68b852cc",  # duplicate رواه
    "25a287ee-24bd-40b9-b1ad-2480a3f59f7a",  # duplicate تولة
    "e1350226-7eb6-4b90-b83f-08a97168589c",  # generic تميمة قرآن
    "54b981f4-97c4-43db-a2a5-8b76352eac34",  # duplicate دهر (shorter)
    "00013168-f35c-4502-85ff-0e53e0375135",  # علّق vs تعلّق (keep تعلّق)
    "77a0eee2-619b-43ca-8c3c-79e1544d7749",  # shorter كهانة stem
    "252ce3f2-3c0d-43a8-8ffa-50e044a42208",  # half جهل/علم question
    "aee4ceb2-d468-41be-829b-40c0e2752b5f",  # أركان الإسلام: count only
    "ce01929d-e694-4b0e-a92e-dbe2bc15d203",  # أركان الإيمان: count only
    "19778392-ac11-407e-ad74-782ae19dc9c2",  # exact duplicate سعيد بن جبير
]

MANUAL_FIXES = {
    "c07d02bc-50b6-4351-8058-63e0c96dc0b2": {
        "explanation": "الخطأ في الحديث: ما فعل العبد من عمل وهو يخطئ فيه أو يقع فيه خطأ دون قصد.",
    },
    "ba832db3-dd15-4230-976e-0b8522a3d3eb": {
        "explanation": "النسيان في الحديث: ما فعل العبد من عمل ثم نسيه بعد ذلك، فُرِّغ عنه.",
    },
}

GENERIC_MARKERS = (
    "هي الإجابة المطابقة",
    "هو الموضع الصحيح",
    "هو ما ثبت في لفظ الحديث",
)


def headers(extra=None):
    h = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    if extra:
        h.update(extra)
    return h


def request(method: str, path: str, body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(f"{URL}{path}", data=data, headers=headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def clean(text: str) -> str:
    text = re.sub(r"[\uf000-\uf0ff]", "", text or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def norm(text: str) -> str:
    text = clean(text).lower()
    text = re.sub(r"[\u064B-\u065F\u0670]", "", text)
    text = re.sub(r"[^\w\u0600-\u06FF\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def fix_question_text(text: str) -> str:
    text = clean(text)
    text = re.sub(r":؟\s*$", ":", text)
    return text


def is_generic_explanation(text: str) -> bool:
    return any(m in (text or "") for m in GENERIC_MARKERS)


def build_better_explanation(q: dict, quiz_row: dict | None) -> str | None:
    if quiz_row:
        expl = clean(quiz_row.get("correctExpl") or "")
        if expl and not is_generic_explanation(expl):
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


def load_quiz_index() -> dict[tuple[str, str], dict]:
    if not QUIZ_HTML.exists():
        return {}
    text = QUIZ_HTML.read_text(encoding="utf-8")
    data = json.loads(re.search(r"const DATA = (\{.*?\});\s*\n", text, re.S).group(1))
    index = {}
    for book_obj in data["books"]:
        book = BOOK_MAP[book_obj["name"]]
        for q in book_obj["questions"]:
            key = (book, norm(q["q"]))
            index[key] = q
    return index


def token_overlap(a: str, b: str) -> float:
    aw = set(norm(a).split())
    bw = set(norm(b).split())
    if not aw or not bw:
        return 0.0
    return len(aw & bw) / max(len(aw), len(bw))


def find_quiz_match(q: dict, quiz_index: dict) -> dict | None:
    key = (q["book"], norm(q["question_text"]))
    if key in quiz_index:
        return quiz_index[key]
    best = None
    best_score = 0.0
    for (book, _), row in quiz_index.items():
        if book != q["book"]:
            continue
        score = token_overlap(q["question_text"], row["q"])
        if score > best_score:
            best_score = score
            best = row
    return best if best_score >= 0.82 else None


def parse_cleanup_updates() -> dict[str, dict]:
    sql = (ROOT / "supabase_questions_cleanup.sql").read_text(encoding="utf-8")
    updates = {}
    for m in re.finditer(
        r"UPDATE questions SET question_text = '((?:''|[^'])*)', explanation = '((?:''|[^'])*)'(?:, options = '((?:''|[^'])*)'::jsonb)? WHERE id = '([^']+)';",
        sql,
    ):
        qtext = m.group(1).replace("''", "'")
        expl = m.group(2).replace("''", "'")
        opts_raw = m.group(3)
        qid = m.group(4)
        payload = {"question_text": qtext, "explanation": expl}
        if opts_raw:
            payload["options"] = json.loads(opts_raw.replace("''", "'"))
        updates[qid] = payload
    return updates


def main():
    db = json.loads(DB_JSON.read_text(encoding="utf-8"))
    by_id = {q["id"]: q for q in db}
    quiz_index = load_quiz_index()
    punctuation_updates = parse_cleanup_updates()

    delete_ids = sorted(set(SIMILAR_DELETE_IDS))
    deleted = 0
    for qid in delete_ids:
        if qid not in by_id:
            continue
        code, body = request("DELETE", f"?id=eq.{qid}")
        if code in (200, 204):
            deleted += 1
        else:
            print("DELETE FAIL", qid, code, body[:200])

    punct_fixed = 0
    for qid, payload in punctuation_updates.items():
        if qid in delete_ids or qid not in by_id:
            continue
        code, body = request("PATCH", f"?id=eq.{qid}", payload)
        if code in (200, 204):
            punct_fixed += 1
        else:
            print("PUNCT FAIL", qid, code, body[:200])

    manual_fixed = 0
    for qid, payload in MANUAL_FIXES.items():
        if qid in delete_ids:
            continue
        code, body = request("PATCH", f"?id=eq.{qid}", payload)
        if code in (200, 204):
            manual_fixed += 1
        else:
            print("MANUAL FAIL", qid, code, body[:200])

    expl_improved = 0
    expl_skipped = 0
    for q in db:
        qid = q["id"]
        if qid in delete_ids:
            continue
        if qid in MANUAL_FIXES:
            continue
        if not is_generic_explanation(q.get("explanation") or ""):
            continue
        quiz_row = find_quiz_match(q, quiz_index)
        new_expl = build_better_explanation(q, quiz_row)
        if not new_expl or new_expl == q.get("explanation"):
            expl_skipped += 1
            continue
        code, body = request("PATCH", f"?id=eq.{qid}", {"explanation": new_expl})
        if code in (200, 204):
            expl_improved += 1
        else:
            print("EXPL FAIL", qid, code, body[:200])

    code, body = request("GET", "?select=id&language=eq.ar")
    final_count = len(json.loads(body)) if code == 200 else "?"

    result = {
        "deleted_similar_and_dupes": deleted,
        "punctuation_fixed": punct_fixed,
        "manual_explanation_fixed": manual_fixed,
        "explanations_improved": expl_improved,
        "generic_explanations_remaining_estimate": expl_skipped,
        "final_question_count": final_count,
    }
    (ROOT / "extracted" / "cleanup_apply_report.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
