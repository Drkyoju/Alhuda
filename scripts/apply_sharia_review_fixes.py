#!/usr/bin/env python3
"""Apply sharia question-bank fixes from extracted/sharia_question_bank_review.json."""
from __future__ import annotations

import json
import re
import copy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK_JSON = ROOT / "questions-bank.json"
BANK_JS = ROOT / "questions-bank.js"
REVIEW = ROOT / "extracted" / "sharia_question_bank_review.json"
OUT_REPORT = ROOT / "extracted" / "sharia_fixes_applied.json"
OUT_SQL = ROOT / "extracted" / "sharia_fixes_supabase.sql"

# Canonical Nawawi chapter labels used in this bank.
HADITH_CHAPTER = {
    1: "1- النية",
    2: "2- جبريل",
    3: "3- أركان الإسلام",
    4: "4- القدر",
    5: "5- البدعة",
    6: "6- الشبهات",
    7: "7- النصيحة",
    8: "8- الجهاد",
    9: "9- السؤال",
    10: "10- الحلال",
    11: "11- الورع",
    12: "12- الفضول",
    13: "13- المحبة",
    14: "14- الدماء",
    15: "15- الأخلاق",
    16: "16- الغضب",
    17: "17- الإحسان",
    18: "18- التقوى",
    19: "19- التوكل",
    20: "20- الحياء",
    21: "21- الاستقامة",
    22: "22- الجنة",
    23: "23- جوامع الخير",
    24: "24- فضل الله",
    25: "25- الصدقة",
    26: "26- الصدقة",
    27: "27- البر والإثم",
    28: "28- السنة",
    29: "29- اللسان",
    30: "30- الحدود",
    31: "31- الزهد",
    32: "32- الضرر",
    33: "33- القضاء",
    34: "34- إنكار المنكر",
    35: "35- الأخوة",
    36: "36- طلب العلم",
    37: "37- الحسنات",
    38: "38- الأولياء",
    39: "39- العفو",
    40: "40- الزهد",
}

# Benefit text (normalized contains) → hadith number. First match wins; order matters.
BENEFIT_TO_HADITH: list[tuple[str, int]] = [
    ("التزهيد في الدنيا", 40),
    ("دار إقامة", 40),
    ("الإيمان بالقضاء والقدر", 4),
    ("كتب الحسنات والسيئات", 37),
    ("كتبه الله تعالى في اللوح", 37),
    ("اللوح المحفوظ", 37),
    ("معاداة أولياء الله", 38),
    ("أولياء الله", 38),
    ("رفع عنهم الإثم", 39),
    ("الوجوه الثلاثة", 39),
    ("الخطأ والنسيان", 39),
    ("لا ضرر", 32),
    ("الضرر يزال", 32),
    ("تغي ي المنكر", 34),
    ("تغيي المنكر", 34),
    ("تغيير المنكر", 34),
    ("إنكار المنكر", 34),
    ("تنفيس الكرب", 36),
    ("معونة الرجل أخاه", 36),
    ("الجزاء من جنس العمل", 36),
    ("يوم القيامة وأن فيها كربا", 36),
    ("كربا عظيمة", 36),
    ("بدع وكل بدعة", 5),
    ("دين اتباع لا دين ابتداع", 5),
    ("اتباع لا دين ابتداع", 5),
    ("الحلال بيّن", 6),
    ("الحلال بين", 6),
    ("منزلة بين الحلال والحرام", 6),
    ("يبني أحكامه وأمور حياته على اليقين", 6),
    ("على اليقين", 6),
    ("وجوب النصيحة", 7),
    ("يحب المسلم الخي", 13),
    ("يحب لأخيه", 13),
    ("المؤمنون إخوة", 13),
    ("احترام دماء", 14),
    ("حفظ العراض", 14),
    ("حفظ الأعراض", 14),
    ("ماله ودمه وعرضه", 8),
    ("الحلم والتأني", 16),
    ("ضد الغضب", 16),
    ("لا تغضب", 16),
    ("العمل الصالح سبب لدخول الجنة", 22),
    ("ما يدخل الجنة ويبعد عن النار", 22),
    ("علو همة الصحابة", 22),
    ("فضل الذكر", 23),
    ("الصلاة؛ لأنها نور", 23),
    ("الاكثار من الصلاة", 23),
    ("الإكثار من الصلاة", 23),
    ("منزه عن الظلم", 24),
    ("حرمه على عباده", 24),
    ("لا تنفعه طاعة الطائعين", 24),
    ("ضعف المخلوقين", 24),
    ("افتقارهم إلى الله", 24),
    ("فرض فرائض", 30),
    ("حرم أشياء فلا يجوز", 30),
    ("الأمر بالأكل من الطيبات", 10),
    ("لا يقبل من عباده إلا الصالح", 10),
    ("الصالح الطيب من العمل", 10),
    ("الزهد في الدنيا من أسباب محبة الله", 31),
    ("يحبك الله", 31),
    ("لا يحكم لأحد بمجرد دعواه", 33),
    ("بمجرد دعواه", 33),
    ("ضرب المثال", 33),
    ("ضرب الأمثال", 33),
    ("حسن تعليم النبي", 2),
    ("استعمال التفصيل بعد الإجمال", 2),
    ("الثبات على الإيمان", 21),
    ("قل آمنت بالله", 21),
    ("الاستقامة", 21),
    ("السمع والطاعة لولي", 28),
    ("ولي المر", 28),
    ("ولي الأمر", 28),
    ("تقوى الله تعالى", 18),
    ("الصبر عن معصية الله", 18),
    ("الصبر على طاعة الله", 18),
    ("راقب الله", 19),
    ("سؤاله واستعانته بالله", 19),
    ("حفظ اللسان", 29),
    ("الصمت خير من الكلام", 15),
    ("الكلام الطيب", 15),
    ("إكرام الجار والضيف", 15),
    ("خلق الحياء", 20),
    ("الحياء", 20),
    ("حسن الخلق", 27),
    ("علامات الإثم", 27),
    ("يكره اطلاع الناس", 27),
    ("الإصلاح بين الناس", 26),
    ("الحث على الصدقة", 25),
    ("تنافس الصحابة في عمل الخيرات", 25),
    ("رحمة الإسلام شملت كل شيء حتى الحيوان", 17),
    ("الإحسان إلى كل الخلق", 17),
    ("الرفق بهم", 17),
    ("كثرة السؤال", 9),
    ("اجتناب ما نهى", 9),
    ("امتثال أمر الرسول", 9),
    ("ما نهيتكم", 9),
    ("يشتغل بما فيه صلاحه", 12),
    ("تركه ما لا يعنيه", 12),
    ("الحث على الإخلاص", 1),
    ("فضل الهجرة", 1),
    ("الإيمان بوجوده", 2),
    ("أنزل على رسوله الكتاب", 30),
    ("مشروعية الموعظة", 28),
    ("حرص الصحابة على العلم", 2),
    ("حرص الصحابة على وصايا", 28),
    ("ينبغي على من جهل أمرا", 2),
]


OCR_REPLACEMENTS = [
    (r"تغي ي", "تغيير"),
    (r"لتغيي(?!ر)", "لتغيير"),
    (r"تغيي(?!ر)", "تغيير"),
    (r"فلا يغيه", "فلا يغيّره"),
    (r"يغيه", "يغيّره"),
    (r"لغي حاجة", "لغير حاجة"),
    (r"جميع ا", "جميعاً"),
    (r"يفيدهمفي", "يفيدهم في"),
    (r"العراض", "الأعراض"),
    (r"ولي المر(?!ء)", "ولي الأمر"),
    (r"ايمان الكامل", "الإيمان الكامل"),
    (r"الخي لخيه", "الخير لأخيه"),
    (r"للأم ة", "للأمة"),
    (r"الأم ة", "الأمة"),
    (r"أم ة", "أمة"),
    (r"وب فيه", "وبيّن فيه"),
    (r"اختلط فيها المران", "اختلط فيها الأمران"),
    (r"تشتبه اختلط", "تشتبه؛ اختلط"),
    (r"المثال المقنعة\s*\d+\s*لأبي زكريا محيي الدين النووي", "الأمثال المقنعة"),
    (r"ضرب المثال المقنعة", "ضرب الأمثال المقنعة"),
    (r"الموعظة للناس\s*\d+\s*الأربعون النووية-?\s*للمبتدئين", "الموعظة للناس"),
    (r"وحمله البلق", "وحمله بالحق"),
    (r"الن ي", "النبي"),
    (r"الب ضع", "البضع"),
    (r"يبأحكامه", "يبني أحكامه"),
    (r"وأ مور", "وأمور"),
    (r"كثي من الحكام", "كثير من الأحكام"),
    (r"ا منزه", "الله منزّه"),
    (r"رحمة ا ", "رحمة الله "),
    (r"سعة رحمة ا ", "سعة رحمة الله "),
    (r"(?<![األ])\bا منزه", "الله منزّه"),
]


def norm_ar(s: str) -> str:
    s = s or ""
    s = re.sub(r"[\u064B-\u065F\u0670]", "", s)
    s = s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ة", "ه").replace("ى", "ي")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def fix_ocr(text: str) -> str:
    if not text:
        return text
    out = text
    for pat, repl in OCR_REPLACEMENTS:
        out = re.sub(pat, repl, out)
    # Fix lone "ا" standing for الله in benefit phrases
    out = re.sub(r"(?<![اأإآلل])\bا\b(?=\s*منز)", "الله", out)
    out = re.sub(r"رحمة\s+ا\b", "رحمة الله", out)
    out = re.sub(r"سعة رحمة\s+ا\b", "سعة رحمة الله", out)
    return out


def parse_fawaid(qtext: str):
    m = re.match(r"من فوائد الحديث\s*\(([^)]+)\)\s*:\s*(.+?)\s*\؟?\s*$", (qtext or "").strip())
    if not m:
        return None, None
    return m.group(1).strip(), m.group(2).strip().rstrip("؟").strip()


def detect_hadith_num(benefit: str, current_ref: str | None) -> int | None:
    nb = norm_ar(benefit)
    for needle, num in BENEFIT_TO_HADITH:
        if norm_ar(needle) in nb:
            return num
    # fallback: keep current number if parseable and benefit seems generic enough
    if current_ref:
        m = re.match(r"(\d+)", current_ref.strip())
        if m:
            return int(m.group(1))
    return None


def rebuild_fawaid_question(num: int, benefit: str) -> tuple[str, str]:
    ch = HADITH_CHAPTER[num]
    # chapter label without leading number for paren form: use full ch
    q = f"من فوائد الحديث ({ch}): {benefit}؟"
    return ch, q


def sql_escape(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def sql_json(obj) -> str:
    if obj is None:
        return "NULL"
    return sql_escape(json.dumps(obj, ensure_ascii=False))


def main():
    bank = json.loads(BANK_JSON.read_text(encoding="utf-8"))
    review = json.loads(REVIEW.read_text(encoding="utf-8"))
    mismatched_ids = set()
    for f in review.get("findings", []):
        if f.get("id") == "GROUP:nawawi_fawaid_mismatch":
            mismatched_ids = set(f.get("related_ids") or [])

    by_id = {q["id"]: q for arr in bank.values() for q in arr}
    changes: list[dict] = []
    deleted: list[dict] = []
    left_for_scholar: list[dict] = []

    def record(qid: str, action: str, **kwargs):
        before = kwargs.pop("before", None)
        after = kwargs.pop("after", None)
        entry = {"id": qid, "action": action, **kwargs}
        if before is not None:
            entry["before"] = before
        if after is not None:
            entry["after"] = after
        changes.append(entry)

    # ---------- HIGH: الأنواء ----------
    q = by_id["13d43d42-9990-4713-b002-fb1a5a675b9c"]
    before = {"options": list(q["options"]), "explanation": q.get("explanation")}
    q["options"] = [
        "شرك أكبر إن اعتقد أن النوء ينشئ المطر استقلالاً، وشرك أصغر إن نسبه للنجم مع اعتقاد أن الله الخالق",
        "جائز مطلقاً",
        "مستحب",
        "سنة",
    ]
    q["correct_index"] = 0
    q["explanation"] = (
        "إن اعتقد أن النجم فاعل مستقل فهو كفر/شرك أكبر في الربوبية؛ "
        "وإن نسب المطر للنجم عادةً مع اعتقاد أن الله الخالق فهو شرك أصغر."
    )
    record(q["id"], "fix_anwaa_classification", book="tawheed", severity="high", before=before,
           after={"options": q["options"], "explanation": q["explanation"]})

    q = by_id["3eceeead-10fc-43d9-8d95-773316ea05e3"]
    before = {"options": list(q["options"]), "explanation": q.get("explanation")}
    q["options"] = [
        "شرك أكبر أو أصغر بحسب الاعتقاد (فاعل مستقل = أكبر)",
        "مباح",
        "سنة",
        "مستحب",
    ]
    q["correct_index"] = 0
    q["explanation"] = (
        "نسبة المطر إلى الأنواء شرك: أكبر إن اعتقد فاعلية النوء استقلالاً، "
        "وأصغر إن نسبه عادةً مع توحيد الخالق."
    )
    record(q["id"], "align_anwaa_wording", book="tawheed", severity="high", before=before,
           after={"options": q["options"], "explanation": q["explanation"]})

    q = by_id["ee4c83d6-8ff1-1228-fd34-13c6dfb4de41"]
    before = {"explanation": q.get("explanation")}
    q["explanation"] = "اعتقاد أن النوء فاعل مستقل كفر أكبر؛ وهذا موافق لتقرير كتاب التوحيد."
    record(q["id"], "clarify_anwaa_explanation", book="tawheed", severity="high", before=before,
           after={"explanation": q["explanation"]})

    # ---------- HIGH: المدثر / نبوة ----------
    q = by_id["57609348-66fa-19c8-6db5-4f13174e5c6e"]
    before = {"question_text": q["question_text"], "explanation": q.get("explanation")}
    q["question_text"] = "الدليل على رسالة محمد ﷺ سورة:"
    q["explanation"] = (
        "في تقرير الأصول: «اقرأ» جعلته نبياً، و«يا أيها المدثر قم فأنذر» جعلته رسولاً؛ "
        "فسورة المدثر دليل الرسالة."
    )
    record(q["id"], "fix_nubuwwa_risala_wording", book="usool", severity="high", before=before,
           after={"question_text": q["question_text"], "explanation": q["explanation"]})

    # ---------- HIGH/MEDIUM: فوايد النووية — remap + OCR + التزهيد ----------
    def normalize_benefit(raw: str) -> str:
        b = fix_ocr(raw)
        if "التزهيد في الدنيا" in b and "دار إقامة" in b:
            if "ألا يتخذها" not in b and "وأن لا" not in b:
                b2 = re.sub(
                    r"وأن يتخذها الإنسان دار إقامة",
                    "وألا يتخذها الإنسان دار إقامة",
                    b,
                )
                b = b2 if b2 != b else "التزهيد في الدنيا وألا يتخذها الإنسان دار إقامة"
        return b.strip().rstrip(".").strip()

    parsed_fawaid = []
    for q in bank["nawawi"]:
        qt = q.get("question_text") or ""
        if "من فوائد الحديث" not in qt:
            continue
        ref, benefit = parse_fawaid(qt)
        if benefit is None:
            continue
        benefit_fixed = normalize_benefit(benefit)
        num = detect_hadith_num(benefit_fixed, ref)
        cur_num = None
        if ref:
            m = re.match(r"(\d+)", ref.strip())
            if m:
                cur_num = int(m.group(1))
        parsed_fawaid.append((q, ref, benefit, benefit_fixed, num, cur_num))

    benefit_pool = sorted({b for _, _, _, b, num, _ in parsed_fawaid if num is not None and b})

    fawaid_fixed = 0
    fawaid_remapped = 0
    fawaid_ocr = 0
    for q, ref, benefit, benefit_fixed, num, cur_num in parsed_fawaid:
        qt = q.get("question_text") or ""
        original = {
            "question_text": qt,
            "chapter": q.get("chapter"),
            "options": copy.deepcopy(q.get("options")),
            "correct_index": q.get("correct_index"),
            "explanation": q.get("explanation"),
        }
        if num is None:
            deleted.append({"id": q["id"], "reason": "fawaid_unmappable", "question_text": qt})
            continue

        ch, new_q = rebuild_fawaid_question(num, benefit_fixed)
        distractors = [b for b in benefit_pool if b != benefit_fixed]
        seed = sum(ord(c) for c in q["id"]) % max(1, len(distractors) or 1)
        uniq = []
        i = seed
        while len(uniq) < 3 and distractors:
            cand = distractors[i % len(distractors)]
            if cand not in uniq:
                uniq.append(cand)
            i += 1
            if i - seed > len(distractors) + 5:
                break
        while len(uniq) < 3:
            uniq.append("ليست من فوائد هذا الحديث")
        new_opts = [f"نعم، {benefit_fixed}"] + [f"لا؛ بل: {p}" for p in uniq[:3]]

        q["chapter"] = ch
        q["question_text"] = new_q
        q["options"] = new_opts
        q["correct_index"] = 0
        q["is_true"] = None
        q["explanation"] = f"هذه من فوائد حديث ({ch})."

        ocr_changed = benefit_fixed != benefit
        remap_changed = cur_num != num
        action = "rebuild_fawaid"
        if "التزهيد" in benefit or "دار إقامة" in benefit:
            action = "fix_tazeheed_and_remap_fawaid"
        elif remap_changed and q["id"] in mismatched_ids:
            action = "remap_fawaid"
            fawaid_remapped += 1
        elif ocr_changed:
            action = "ocr_fix_fawaid"
            fawaid_ocr += 1
        elif remap_changed:
            action = "remap_fawaid"
            fawaid_remapped += 1
        fawaid_fixed += 1
        record(
            q["id"],
            action,
            book="nawawi",
            severity="high",
            from_hadith=cur_num,
            to_hadith=num,
            before=original,
            after={
                "question_text": q["question_text"],
                "chapter": q["chapter"],
                "options": q.get("options"),
                "correct_index": q.get("correct_index"),
                "explanation": q.get("explanation"),
            },
        )

    if deleted:
        del_ids = {d["id"] for d in deleted}
        bank["nawawi"] = [q for q in bank["nawawi"] if q["id"] not in del_ids]
        by_id = {q["id"]: q for arr in bank.values() for q in arr}

    # Sweep remaining OCR in ALL nawawi/usool text fields
    ocr_field_fixes = 0
    for book_key, arr in bank.items():
        for q in arr:
            touched = {}
            for field in ("question_text", "explanation", "source_quote"):
                val = q.get(field)
                if isinstance(val, str):
                    fixed = fix_ocr(val)
                    # extra usool-specific
                    fixed = fixed.replace("حقوق الن ي", "حقوق النبي").replace("الب ضع", "البضع")
                    if fixed != val:
                        touched[field] = {"before": val, "after": fixed}
                        q[field] = fixed
            if q.get("options") and isinstance(q["options"], list):
                new_opts = []
                changed_opts = False
                for o in q["options"]:
                    if isinstance(o, str):
                        fo = fix_ocr(o).replace("حقوق الن ي", "حقوق النبي").replace("الن ي", "النبي")
                        if fo != o:
                            changed_opts = True
                        new_opts.append(fo)
                    else:
                        new_opts.append(o)
                if changed_opts:
                    touched["options"] = {"before": q["options"], "after": new_opts}
                    q["options"] = new_opts
            if touched and not any(c["id"] == q["id"] for c in changes):
                ocr_field_fixes += 1
                record(q["id"], "ocr_cleanup", book=book_key, severity="medium", fields=touched)

    # ---------- MEDIUM: unambiguous content ----------
    # التوحيد يكفر — clearer explanation (keep is_true=False)
    q = by_id["535f5711-195b-4edd-aa2b-c64b651895f0"]
    before = {"explanation": q.get("explanation")}
    q["explanation"] = (
        "إطلاق «يكفّر الذنوب جميعاً بدون توبة» غير صحيح؛ التوحيد لا يسقط حقوق العباد، "
        "ولا يغني بإطلاق عن التوبة من المعاصي، مع فضل «من مات لا يشرك بالله شيئاً» بفهم أهل العلم."
    )
    record(q["id"], "clarify_explanation", book="tawheed", severity="medium", before=before,
           after={"explanation": q["explanation"]}, note="answer unchanged (false)")

    # سب الدهر — clarify not identity with time
    q = by_id["c54d1682-3662-427d-a959-c54766568898"]
    before = {"explanation": q.get("explanation")}
    q["explanation"] = (
        "لقوله في الحديث القدسي: «يؤذيني ابن آدم يسب الدهر وأنا الدهر»؛ "
        "والمراد أن الله مصرّف الزمان ومدبّر الليل والنهار، لا أن الله هو الزمان نفسه."
    )
    record(q["id"], "clarify_dahr_explanation", book="tawheed", severity="medium", before=before,
           after={"explanation": q["explanation"]})

    # قاضي القضاة
    q = by_id["72ab80d0-d4f0-4667-9ccf-2ba887973b8d"]
    before = {"explanation": q.get("explanation")}
    q["explanation"] = (
        "ممنوع للمبالغة بما يضاهي تعظيم الرب (كقاضي القضاة/ملك الملوك)، "
        "لا لنفي ولاية القضاء الشرعية عن القضاة."
    )
    record(q["id"], "clarify_explanation", book="tawheed", severity="medium", before=before,
           after={"explanation": q["explanation"]})

    # ذات أنواط
    q = by_id["470ab1f1-7138-41d9-9bea-539f78397d5c"]
    before = {"explanation": q.get("explanation")}
    q["explanation"] = (
        "طلب مشابهة المشركين في التعليق/التعظيم وسيلة إلى الشرك فأنكره النبي ﷺ عليهم تحذيراً "
        "قبل أن يفعلوا؛ وليس المراد اتهام الصحابة بوقوع الشرك."
    )
    record(q["id"], "clarify_explanation", book="tawheed", severity="medium", before=before,
           after={"explanation": q["explanation"]})

    # ما شاء الله وشئت — align as أصغر/لفظي
    q = by_id["2575946e-70ba-2e7c-3daa-f8d1b649a992"]
    before = {"options": list(q["options"]), "explanation": q.get("explanation")}
    q["options"] = [
        "شرك أصغر (لفظي)",
        "شرك أكبر يخرج من الملة",
        "جائز",
        "مستحب",
    ]
    q["correct_index"] = 0
    q["explanation"] = (
        "هو شرك أصغر/لفظي؛ والصواب: ما شاء الله ثم شئت. "
        "وذكر ابن عباس آية الأنداد من باب التحذير لا تكفير كل قائل."
    )
    record(q["id"], "align_asghar_terminology", book="tawheed", severity="medium", before=before,
           after={"options": q["options"], "explanation": q["explanation"]})

    # الله يغفر الذنوب — qualify explanation, keep True in hadith context
    q = by_id["d8425a0c-a97f-41a0-a601-876587f77f94"]
    before = {"explanation": q.get("explanation"), "question_text": q["question_text"]}
    q["question_text"] = "في الحديث القدسي: الله يغفر الذنوب جميعا ولا يبالي (لمن تاب ولم يشرك)."
    q["explanation"] = (
        "من ألفاظ حديث «يا عبادي…» في سعة المغفرة؛ والمراد مع التوبة وعدم الإشراك، "
        "لا إسقاط التكاليف ولا الإرجاء."
    )
    record(q["id"], "qualify_maghfira_tf", book="nawawi", severity="medium", before=before,
           after={"question_text": q["question_text"], "explanation": q["explanation"]})

    # حقوق النبي — rebuild options
    q = by_id["9daed191-d0b4-ab7b-83e4-47a315fdd750"]
    before = {"options": list(q["options"]), "explanation": q.get("explanation"), "chapter": q.get("chapter")}
    q["chapter"] = "👤 النبي"
    q["options"] = [
        "الإيمان بنبوته ورسالته، ومحبته، وطاعته، وتصديقه، واجتناب نهيه، والذبّ عن سنته",
        "الهجرة فقط من بلد الشرك",
        "محبته دون طاعته",
        "تصديقه في الأخبار دون الأوامر",
    ]
    q["correct_index"] = 0
    q["explanation"] = (
        "حقوق النبي ﷺ في الأصول: 1) الإيمان بنبوته ورسالته 2) محبته أكثر من النفس والأهل والمال "
        "3) طاعته فيما أمر 4) تصديقه فيما أخبر 5) اجتناب ما نهى عنه وزجر "
        "6) ألا يُعبد الله إلا بما شرع."
    )
    record(q["id"], "rebuild_options_ocr", book="usool", severity="medium", before=before,
           after={"options": q["options"], "explanation": q["explanation"], "chapter": q["chapter"]})

    # البضع — clean distractors
    q = by_id["6055629a-ed13-0e3b-c6f4-a94bc014ceb0"]
    before = {"options": list(q["options"]), "explanation": q.get("explanation")}
    q["options"] = [
        "العدد من الثلاثة إلى التسعة",
        "الطريق المائل عن الشرك إلى التوحيد",
        "القصد والتوجه",
        "طريقة النبي الدينية",
    ]
    q["correct_index"] = 0
    q["explanation"] = "البضع بكسر الباء: العدد من الثلاثة إلى التسعة."
    record(q["id"], "rebuild_options_ocr", book="usool", severity="medium", before=before,
           after={"options": q["options"], "explanation": q["explanation"]})

    # الهجرة — collect texts in explanation
    q = by_id["d3e5d0d4-711f-46ac-b7a3-840b9258f67c"]
    before = {"explanation": q.get("explanation")}
    q["explanation"] = (
        "لا هجرة من مكة بعد الفتح؛ وتبقى الهجرة من بلد الشرك إلى بلد الإسلام إلى قيام الساعة "
        "كما في حديث «لا تنقطع الهجرة حتى تنقطع التوبة»."
    )
    record(q["id"], "clarify_hijra_collection", book="usool", severity="low", before=before,
           after={"explanation": q["explanation"]})

    # ---------- Controversial / scholar-only: leave curriculum answer, note ----------
    scholar_leave = [
        ("30e67e81-85f8-44e0-abee-f4c482fa9a03", "تصوير ذوات الأرواح — حكم «حرام» وفق منهج كتاب التوحيد؛ خلاف الصور غير المجسّمة معاصر لم يُغيَّر."),
        ("34f0da6e-4ab8-4721-b1eb-1105c59d76f2", "التوسل بجاه النبي — «بدعة لا تجوز» وفق مقرر المنهج النجدي؛ خلاف مذهبي معروف تُرك."),
        ("6b5e357b-2337-4685-ae2c-804d957878ea", "تقسيم البدعة حسنة/سيئة — نفيه متسق مع «كل بدعة ضلالة» في المقرر؛ تُرك."),
        ("213fc1f9-d919-4153-b28a-6e53cb13acce", "تعلّم السحر كفر — موافق لباب الكتاب؛ تفصيل أنواع السحر للمراجع."),
    ]
    for qid, note in scholar_leave:
        left_for_scholar.append({"id": qid, "note_ar": note, "action": "left_unchanged"})

    # Also note الحكم بغير ما أنزل الله if present
    for q in bank["tawheed"]:
        t = q.get("question_text") or ""
        if "بغير ما أنزل" in t or "الحكم بغير" in t:
            left_for_scholar.append({
                "id": q["id"],
                "note_ar": "مسألة الحكم بغير ما أنزل الله — لم تُغيَّر؛ تحتاج ضبطاً عند الاشتباه أكبر/أصغر مع مراجع.",
                "action": "left_unchanged",
                "question_snippet": t[:120],
            })

    # ---------- Write bank files ----------
    BANK_JSON.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    BANK_JS.write_text(
        "window.QUESTIONS_BANK = " + json.dumps(bank, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )

    # ---------- SQL for cloud (no service_role in env) ----------
    changed_ids = {c["id"] for c in changes}
    sql_lines = [
        "-- Sharia content fixes — apply with service_role / SQL editor",
        "-- Generated by scripts/apply_sharia_review_fixes.py",
        "BEGIN;",
    ]
    for d in deleted:
        sql_lines.append(f"DELETE FROM questions WHERE id = {sql_escape(d['id'])};")
    for qid in sorted(changed_ids):
        q = by_id.get(qid)
        if not q:
            continue
        sql_lines.append(
            "UPDATE questions SET "
            f"question_text = {sql_escape(q.get('question_text'))}, "
            f"chapter = {sql_escape(q.get('chapter'))}, "
            f"options = {sql_json(q.get('options'))}::jsonb, "
            f"correct_index = {q['correct_index'] if q.get('correct_index') is not None else 'NULL'}, "
            f"is_true = {str(q['is_true']).lower() if q.get('is_true') is not None else 'NULL'}, "
            f"explanation = {sql_escape(q.get('explanation'))} "
            f"WHERE id = {sql_escape(qid)};"
        )
    sql_lines.append("COMMIT;")
    OUT_SQL.write_text("\n".join(sql_lines) + "\n", encoding="utf-8")

    report = {
        "generated": "2026-08-09",
        "source_review": "extracted/sharia_question_bank_review.json",
        "summary": {
            "changes": len(changes),
            "deleted": len(deleted),
            "left_for_scholar": len(left_for_scholar),
            "fawaid_fixed": fawaid_fixed,
            "fawaid_remapped": fawaid_remapped,
            "fawaid_ocr": fawaid_ocr,
            "ocr_field_fixes": ocr_field_fixes,
            "bank_counts": {k: len(v) for k, v in bank.items()},
            "bank_total": sum(len(v) for v in bank.values()),
            "supabase": "sql_prepared_no_service_role",
            "sql_path": str(OUT_SQL.relative_to(ROOT)),
        },
        "deleted": deleted,
        "left_for_scholar": left_for_scholar,
        "changes": changes,
    }
    OUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"wrote {OUT_REPORT}")
    print(f"wrote {OUT_SQL}")
    print(f"deleted={len(deleted)} changes={len(changes)} scholar_left={len(left_for_scholar)}")


if __name__ == "__main__":
    main()
