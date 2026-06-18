#!/usr/bin/env python3
"""Audit Supabase questions: duplicates, near-duplicates, and Arabic quality issues."""
from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_JSON = ROOT / "extracted" / "db_questions_live.json"
OUT_REPORT = ROOT / "extracted" / "audit_report.json"
OUT_FIXES = ROOT / "extracted" / "questions_fixes.json"
OUT_SIMILAR = ROOT / "extracted" / "similar_pairs_review.json"
OUT_CSV = ROOT / "extracted" / "questions_review.csv"
OUT_SQL = ROOT / "supabase_questions_cleanup.sql"

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
    (r"هذالكتاب", "هذا الكتاب"),
    (r"هذهالتسمية", "هذه التسمية"),
    (r"لماذاهذا", "لماذا هذا"),
    (r"منأين", "من أين"),
    (r"فيأي", "في أي"),
    (r"كيفكانت", "كيف كانت"),
    (r"ما أهممؤلفات", "ما أهم مؤلفات"),
    (r"متى كانتوفا", "متى كانت وفاة"),
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

BAD_PATTERNS = [
    (r"[\uf000-\uf0ff]", "حرف خاص من PDF"),
    (r"رتبي الكلمات", "تمرين ترتيب كلمات وليس سؤالاً"),
    (r"أكملي الفراغ", "تمرين إكمال فراغ"),
    (r"ضعي الكلمة", "تمرين مطابقة"),
    (r"صلي الكلمة", "تمرين مطابقة"),
    (r"اختاريالمعنى", "تمرين اختيار معنى"),
    (r"اذكريمناسبة", "سؤال مناسبة للمعلمة"),
    (r"اكتبي أهم", "سؤال كتابة حرة"),
    (r"كوني من", "تمرين صياغة"),
    (r"معاني الكلمات", "قسم معاني كلمات"),
    (r"[a-zA-Z]{3,}", "نص إنجليزي"),
    (r"ﭽ|ﭼ|ﭑ|ﱥ", "رموز قرآنية مشوهة من PDF"),
    (r".{280,}", "نص طويل جداً (غالباً ملخّص أو فقرة)"),
    (r"\s{3,}", "مسافات زائدة"),
    (r"؟\s*س:", "سؤالان ملتصقان"),
    (r"ج:\s*.{0,3}$", "إجابة ناقصة جداً"),
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


def is_near_duplicate(a: str, b: str) -> bool:
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if token_overlap(a, b) >= 0.88:
        return True
    if len(na) > 20 and (na in nb or nb in na):
        return True
    if len(na) > 18 and len(nb) > 18 and na[:30] == nb[:30]:
        return True
    return False


def fix_question(text: str) -> str:
    text = clean(text)
    text = re.sub(r":؟\s*$", ":", text)
    text = re.sub(r":\s*؟\s*$", ":", text)
    if text and not text.endswith(("؟", "?", ".", ":")):
        if text.startswith(("ما ", "من ", "متى", "أين", "لماذا", "هل ", "كم ", "أ ", "اذكر", "عرف", "بين")):
            text += "؟"
    return text


def fix_explanation(text: str) -> str:
    return clean(text or "")


def fix_options(options: list | None) -> list[str] | None:
    if not options:
        return None
    out = [clean(o) for o in options if clean(o)]
    if not out:
        return None
    while len(out) < 4:
        out.append("لا أعلم")
    return out[:4]


def detect_issues(q: dict) -> list[dict]:
    issues = []
    text = q.get("question_text") or ""
    for pat, label in BAD_PATTERNS:
        if re.search(pat, text):
            issues.append({"type": "quality", "label": label, "field": "question_text"})
    fixed_q = fix_question(text)
    if fixed_q != text:
        issues.append({"type": "fix", "field": "question_text", "before": text, "after": fixed_q})
    exp = q.get("explanation") or ""
    fixed_exp = fix_explanation(exp)
    if fixed_exp != exp:
        issues.append({"type": "fix", "field": "explanation", "before": exp, "after": fixed_exp})
    if q.get("type") == "mc":
        opts = q.get("options") or []
        fixed_opts = fix_options(opts)
        if fixed_opts and fixed_opts != opts:
            issues.append({"type": "fix", "field": "options", "before": opts, "after": fixed_opts})
        if fixed_opts and q.get("correct_index") is not None:
            ci = int(q["correct_index"])
            if ci < 0 or ci >= len(fixed_opts):
                issues.append({"type": "error", "label": "correct_index خارج الخيارات", "field": "correct_index"})
    if len(text) < 8:
        issues.append({"type": "error", "label": "سؤال قصير جداً", "field": "question_text"})
    return issues


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def choose_keep_id(group: list[dict]) -> str:
    """Keep the clearest row when texts are truly identical after normalization."""
    def score(q: dict) -> tuple:
        text = q.get("question_text") or ""
        exp_len = len(q.get("explanation") or "")
        opts_ok = 1 if q.get("type") == "tf" or (q.get("options") and len(q["options"]) >= 2) else 0
        has_q = 1 if "؟" in text or "?" in text else 0
        return (-opts_ok, -has_q, -exp_len, -len(text), q.get("created_at") or "", q["id"])

    return sorted(group, key=score)[0]["id"]


def is_true_duplicate(a: dict, b: dict) -> bool:
    if a["book"] != b["book"]:
        return False
    if norm(a["question_text"]) == norm(b["question_text"]):
        return True
    if a.get("type") != b.get("type"):
        return False
    return token_overlap(a["question_text"], b["question_text"]) >= 0.95


def main():
    db = json.loads(DB_JSON.read_text(encoding="utf-8"))
    by_norm = defaultdict(list)
    for q in db:
        by_norm[(q["book"], norm(q["question_text"]))].append(q)

    exact_dupes = [g for g in by_norm.values() if len(g) > 1]

    near_groups: list[list[dict]] = []
    true_dup_groups: list[list[dict]] = []
    seen_ids = set()
    by_book = defaultdict(list)
    for q in db:
        by_book[q["book"]].append(q)
    for book, rows in by_book.items():
        for i, a in enumerate(rows):
            if a["id"] in seen_ids:
                continue
            group = [a]
            for b in rows[i + 1 :]:
                if b["id"] in seen_ids:
                    continue
                if is_true_duplicate(a, b):
                    group.append(b)
                elif is_near_duplicate(a["question_text"], b["question_text"]):
                    near_groups.append([a, b])
            if len(group) > 1:
                for g in group:
                    seen_ids.add(g["id"])
                true_dup_groups.append(group)

    fixes = []
    quality_flags = []
    for q in db:
        issues = detect_issues(q)
        if not issues:
            continue
        entry = {"id": q["id"], "book": q["book"], "question_text": q["question_text"], "issues": issues}
        if any(i["type"] in ("quality", "error") for i in issues):
            quality_flags.append(entry)
        if any(i["type"] == "fix" for i in issues):
            fixes.append(entry)

    delete_ids = []
    for g in exact_dupes + true_dup_groups:
        keep = choose_keep_id(g)
        for q in g:
            if q["id"] != keep:
                delete_ids.append(q["id"])
    delete_ids = sorted(set(delete_ids))

    sql_lines = [
        "-- مراجعة الأسئلة: حذف التكرار + تصحيح لغوي",
        f"-- الأسئلة الحالية: {len(db)}",
        f"-- حذف تكرار: {len(delete_ids)}",
        f"-- تحديث نصوص: {len(fixes)}",
        "",
        "BEGIN;",
        "",
    ]
    for qid in delete_ids:
        sql_lines.append(f"DELETE FROM questions WHERE id = '{qid}';")

    update_count = 0
    for item in fixes:
        q = next(x for x in db if x["id"] == item["id"])
        if item["id"] in delete_ids:
            continue
        new_q = fix_question(q["question_text"])
        new_exp = fix_explanation(q.get("explanation") or "")
        new_opts = fix_options(q.get("options"))
        changed = new_q != q["question_text"] or new_exp != (q.get("explanation") or "")
        if q.get("type") == "mc" and new_opts and new_opts != q.get("options"):
            changed = True
        if not changed:
            continue
        update_count += 1
        if q.get("type") == "mc" and new_opts:
            opts = json.dumps(new_opts, ensure_ascii=False).replace("'", "''")
            sql_lines.append(
                "UPDATE questions SET "
                f"question_text = '{sql_escape(new_q)}', "
                f"explanation = '{sql_escape(new_exp)}', "
                f"options = '{opts}'::jsonb "
                f"WHERE id = '{item['id']}';"
            )
        else:
            sql_lines.append(
                "UPDATE questions SET "
                f"question_text = '{sql_escape(new_q)}', "
                f"explanation = '{sql_escape(new_exp)}' "
                f"WHERE id = '{item['id']}';"
            )
    sql_lines.extend(["", "COMMIT;", "", f"-- SELECT COUNT(*) FROM questions WHERE language = 'ar';"])

    report = {
        "total": len(db),
        "by_book": dict(Counter(q["book"] for q in db)),
        "exact_duplicate_groups": len(exact_dupes),
        "true_duplicate_groups": len(true_dup_groups),
        "exact_duplicate_rows_to_delete": sum(len(g) - 1 for g in exact_dupes),
        "true_duplicate_rows_to_delete": sum(len(g) - 1 for g in true_dup_groups),
        "similar_pairs_for_review": len(near_groups),
        "total_delete_ids": len(delete_ids),
        "generic_explanation_count": sum(
            1
            for q in db
            if any(
                x in (q.get("explanation") or "")
                for x in ("هي الإجابة المطابقة", "هو الموضع الصحيح", "هو ما ثبت في لفظ الحديث")
            )
        ),
        "colon_question_mark_fixes": sum(
            1 for q in db if re.search(r":؟", q.get("question_text") or "")
        ),
        "linguistic_fixes": len(fixes),
        "quality_flags": len(quality_flags),
        "after_cleanup_estimate": len(db) - len(delete_ids),
        "exact_dupe_samples": [
            {"book": g[0]["book"], "text": g[0]["question_text"][:80], "count": len(g)}
            for g in exact_dupes[:15]
        ],
        "similar_review_samples": [
            {
                "book": g[0]["book"],
                "a": g[0]["question_text"][:90],
                "b": g[1]["question_text"][:90],
                "id_a": g[0]["id"],
                "id_b": g[1]["id"],
            }
            for g in near_groups[:25]
        ],
        "quality_samples": [
            {
                "id": x["id"],
                "book": x["book"],
                "text": x["question_text"][:90],
                "issues": [i.get("label") or i.get("field") for i in x["issues"]],
            }
            for x in quality_flags[:25]
        ],
        "fix_samples": [
            {
                "id": x["id"],
                "before": x["question_text"][:70],
                "after": next(i["after"][:70] for i in x["issues"] if i["type"] == "fix" and i["field"] == "question_text"),
            }
            for x in fixes
            if any(i["type"] == "fix" and i["field"] == "question_text" for i in x["issues"])
        ][:20],
    }

    OUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_FIXES.write_text(json.dumps({"fixes": fixes, "quality_flags": quality_flags}, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_SIMILAR.write_text(
        json.dumps(
            [
                {
                    "book": g[0]["book"],
                    "question_a": g[0]["question_text"],
                    "question_b": g[1]["question_text"],
                    "id_a": g[0]["id"],
                    "id_b": g[1]["id"],
                    "type_a": g[0].get("type"),
                    "type_b": g[1].get("type"),
                }
                for g in near_groups
            ],
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    csv_lines = ["id,book,chapter,level,type,question_text,explanation,notes"]
    for q in sorted(db, key=lambda x: (x["book"], x.get("chapter") or "", x["question_text"])):
        notes = []
        if re.search(r":؟", q.get("question_text") or ""):
            notes.append("تصحيح علامة :؟")
        if any(
            x in (q.get("explanation") or "")
            for x in ("هي الإجابة المطابقة", "هو الموضع الصحيح", "هو ما ثبت في لفظ الحديث")
        ):
            notes.append("شرح عام")
        csv_lines.append(
            ",".join(
                [
                    q["id"],
                    q["book"],
                    (q.get("chapter") or "").replace(",", " "),
                    q.get("level") or "",
                    q.get("type") or "",
                    '"' + (q.get("question_text") or "").replace('"', '""') + '"',
                    '"' + (q.get("explanation") or "").replace('"', '""') + '"',
                    '"' + " | ".join(notes) + '"',
                ]
            )
        )
    OUT_CSV.write_text("\n".join(csv_lines), encoding="utf-8-sig")
    OUT_SQL.write_text("\n".join(sql_lines), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
