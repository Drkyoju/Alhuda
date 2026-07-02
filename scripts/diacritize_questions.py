#!/usr/bin/env python3
"""Auto-diacritize every question field for TTS.

Pipeline per field:
  1. If a verified manual/DB well-formed tashkeel exists -> keep it (handled in .mjs).
  2. Else run mishkal, then override known religious terms with verified pausal forms.

Writes extracted/diacritized_speech.json consumed by build_speech_diacritics_map.mjs.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    import mishkal.tashkeel
except Exception as exc:  # pragma: no cover
    sys.stderr.write(f"mishkal not available: {exc}\n")
    sys.exit(1)

HARAKAT = "\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0670"
HARAKAT_RE = re.compile(f"[{HARAKAT}]")
ARABIC_LETTER_RE = re.compile(r"[\u0621-\u064A\u0671]")
TOKEN_RE = re.compile(r"[\u0621-\u064A\u0671\u064B-\u065F\u0670]+")

# Verified pausal forms for frequent religious terms mishkal mis-vocalizes.
# Final letter left bare (pausa) so it fits any grammatical position.
CORRECTIONS = {
    "الله": "اللَّه",
    "لله": "لِلَّه",
    "بالله": "بِاللَّه",
    "والله": "وَاللَّه",
    "لغير": "لِغَيْر",
    "بغير": "بِغَيْر",
    "غير": "غَيْر",
    "الشرك": "الشِّرْك",
    "شرك": "شِرْك",
    "بالشرك": "بِالشِّرْك",
    "والشرك": "وَالشِّرْك",
    "الأكبر": "الْأَكْبَر",
    "أكبر": "أَكْبَر",
    "الأصغر": "الْأَصْغَر",
    "أصغر": "أَصْغَر",
    "التوحيد": "التَّوْحِيد",
    "توحيد": "تَوْحِيد",
    "بالتوحيد": "بِالتَّوْحِيد",
    "والتوحيد": "وَالتَّوْحِيد",
    "الربوبية": "الرُّبُوبِيَّة",
    "الألوهية": "الْأُلُوهِيَّة",
    "العبادة": "الْعِبَادَة",
    "عبادة": "عِبَادَة",
    "بالعبادة": "بِالْعِبَادَة",
    "الصلاة": "الصَّلَاة",
    "صلاة": "صَلَاة",
    "الزكاة": "الزَّكَاة",
    "زكاة": "زَكَاة",
    "والزكاة": "وَالزَّكَاة",
    "الصيام": "الصِّيَام",
    "الصوم": "الصَّوْم",
    "الحج": "الْحَجّ",
    "الصدقة": "الصَّدَقَة",
    "النبي": "النَّبِيّ",
    "نبي": "نَبِيّ",
    "النبيّ": "النَّبِيّ",
    "الإسلام": "الْإِسْلَام",
    "إسلام": "إِسْلَام",
    "الإيمان": "الْإِيمَان",
    "إيمان": "إِيمَان",
    "الإحسان": "الْإِحْسَان",
    "الدين": "الدِّين",
    "دين": "دِين",
    "الدعاء": "الدُّعَاء",
    "دعاء": "دُعَاء",
    "الدهر": "الدَّهْر",
    "دهر": "دَهْر",
    "العلم": "الْعِلْم",
    "علم": "عِلْم",
    "العمل": "الْعَمَل",
    "عمل": "عَمَل",
    "والعمل": "وَالْعَمَل",
    "الأعمال": "الْأَعْمَال",
    "أعمال": "أَعْمَال",
    "المال": "الْمَال",
    "مال": "مَال",
    "الناس": "النَّاس",
    "ناس": "نَاس",
    "النار": "النَّار",
    "نار": "نَار",
    "الجنة": "الْجَنَّة",
    "جنة": "جَنَّة",
    "القرآن": "الْقُرْآن",
    "قرآن": "قُرْآن",
    "السنة": "السُّنَّة",
    "سنة": "سُنَّة",
    "الملائكة": "الْمَلَائِكَة",
    "ملائكة": "مَلَائِكَة",
    "الجن": "الْجِنّ",
    "جن": "جِنّ",
    "الإنس": "الْإِنْس",
    "السحر": "السِّحْر",
    "سحر": "سِحْر",
    "الذبح": "الذَّبْح",
    "ذبح": "ذَبْح",
    "لعن": "لَعَنَ",
    "الحلف": "الْحَلِف",
    "حلف": "حَلَفَ",
    "النذر": "النَّذْر",
    "نذر": "نَذْر",
    "التمائم": "التَّمَائِم",
    "تميمة": "تَمِيمَة",
    "الرقية": "الرُّقْيَة",
    "رقية": "رُقْيَة",
    "الرقى": "الرُّقَى",
    "التبرك": "التَّبَرُّك",
    "النشرة": "النُّشْرَة",
    "الطيرة": "الطِّيَرَة",
    "طيرة": "طِيَرَة",
    "التطير": "التَّطَيُّر",
    "النجوم": "النُّجُوم",
    "الريح": "الرِّيح",
    "الرياء": "الرِّيَاء",
    "رياء": "رِيَاء",
    "الطاغوت": "الطَّاغُوت",
    "الأصنام": "الْأَصْنَام",
    "صنم": "صَنَم",
    "الأوثان": "الْأَوْثَان",
    "الكفر": "الْكُفْر",
    "كفر": "كُفْر",
    "الطاعة": "الطَّاعَة",
    "طاعة": "طَاعَة",
    "الخوف": "الْخَوْف",
    "خوف": "خَوْف",
    "الصبر": "الصَّبْر",
    "صبر": "صَبْر",
    "التوكل": "التَّوَكُّل",
    "الرجاء": "الرَّجَاء",
    "المحبة": "الْمَحَبَّة",
    "الإخلاص": "الْإِخْلَاص",
    "معرفة": "مَعْرِفَة",
    "المعرفة": "الْمَعْرِفَة",
    "معنى": "مَعْنَى",
    "حكم": "حُكْم",
    "الحكم": "الْحُكْم",
    "مكروه": "مَكْرُوه",
    "مباح": "مُبَاح",
    "جائز": "جَائِز",
    "مستحب": "مُسْتَحَبّ",
    "واجب": "وَاجِب",
    "حرام": "حَرَام",
    "محرم": "مُحَرَّم",
    "دليل": "دَلِيل",
    "الثلاثة": "الثَّلَاثَة",
    "ثلاثة": "ثَلَاثَة",
    "الأربعة": "الْأَرْبَعَة",
    "قوله": "قَوْلُه",
    "قال": "قَالَ",
    "تعالى": "تَعَالَى",
    "سبحانه": "سُبْحَانَه",
    "الحديث": "الْحَدِيث",
    "حديث": "حَدِيث",
    "رسول": "رَسُول",
    "الرسول": "الرَّسُول",
    "عبد": "عَبْد",
    "العبد": "الْعَبْد",
    "وحده": "وَحْدَه",
    "شريك": "شَرِيك",
    "أول": "أَوَّل",
    "دخل": "دَخَلَ",
    "مات": "مَاتَ",
    "يجوز": "يَجُوز",
    "الأموات": "الْأَمْوَات",
    "الغائبين": "الْغَائِبِين",
    "إله": "إِلَه",
    "الإله": "الْإِلَه",
    "واحد": "وَاحِد",
    "الكبائر": "الْكَبَائِر",
    "كبيرة": "كَبِيرَة",
    "الذنوب": "الذُّنُوب",
    "ذنب": "ذَنْب",
    "التقوى": "التَّقْوَى",
    "البدعة": "الْبِدْعَة",
    "بدعة": "بِدْعَة",
    "الضلالة": "الضَّلَالَة",
    "السفر": "السَّفَر",
    "كثرة": "كَثْرَة",
}


def strip_harakat(text):
    return HARAKAT_RE.sub("", text or "")


def has_wellformed(text):
    if not text:
        return False
    letters = len(ARABIC_LETTER_RE.findall(text))
    marks = len(HARAKAT_RE.findall(text))
    return letters >= 4 and marks / max(1, letters) >= 0.12


def apply_corrections(diac_text):
    """Replace each token with a verified form when its bare form is known."""
    def repl(match):
        tok = match.group(0)
        bare = strip_harakat(tok)
        return CORRECTIONS.get(bare, tok)

    return TOKEN_RE.sub(repl, diac_text)


def main():
    with open(os.path.join(ROOT, "extracted/db_questions_live.json"), encoding="utf-8") as fh:
        db = json.load(fh)
    snap_path = os.path.join(ROOT, "extracted/questions_live_snapshot.json")
    snap = {}
    if os.path.exists(snap_path):
        with open(snap_path, encoding="utf-8") as fh:
            snap = {r["id"]: r for r in json.load(fh)}

    vocalizer = mishkal.tashkeel.TashkeelClass()

    def diacritize(raw):
        raw = (raw or "").strip()
        if not raw:
            return ""
        # Already well-formed in DB -> trust it.
        if has_wellformed(raw):
            return raw
        try:
            out = vocalizer.tashkeel(raw)
        except Exception:
            out = raw
        out = apply_corrections(out)
        return re.sub(r"\s+", " ", out).strip()

    # bare word -> {diac form -> count} to pick the most common vocalization.
    word_votes = {}

    def learn_words(raw, diac):
        if not raw or not diac:
            return
        bare_tokens = TOKEN_RE.findall(strip_harakat(raw))
        diac_tokens = TOKEN_RE.findall(diac)
        if len(bare_tokens) != len(diac_tokens):
            return
        for bare, form in zip(bare_tokens, diac_tokens):
            if len(bare) < 3 or not HARAKAT_RE.search(form):
                continue
            word_votes.setdefault(bare, {})
            word_votes[bare][form] = word_votes[bare].get(form, 0) + 1

    result = {}
    for row in db:
        s = snap.get(row["id"], {})
        entry = {}
        pairs = []
        q_raw = row.get("question_text") or s.get("question_text")
        q = diacritize(q_raw)
        if q:
            entry["q"] = q
            pairs.append((q_raw, q))
        exp_raw = row.get("explanation") or s.get("explanation")
        exp = diacritize(exp_raw)
        if exp:
            entry["exp"] = exp
            pairs.append((exp_raw, exp))
        quote_raw = row.get("source_quote") or s.get("source_quote")
        quote = diacritize(quote_raw)
        if quote:
            entry["quote"] = re.sub(r"^«|»$", "", quote).strip()
            pairs.append((quote_raw, quote))
        for i, opt in enumerate(row.get("options") or []):
            t = diacritize(opt)
            if t:
                entry[f"a{i}"] = t
                pairs.append((opt, t))
        if entry:
            result[row["id"]] = entry
        for raw, diac in pairs:
            learn_words(raw, diac)

    # Corrections always win.
    word_map = {}
    for bare, votes in word_votes.items():
        word_map[bare] = max(votes.items(), key=lambda kv: kv[1])[0]
    for bare, form in CORRECTIONS.items():
        word_map[bare] = form

    out_path = os.path.join(ROOT, "extracted/diacritized_speech.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=0)
    words_path = os.path.join(ROOT, "extracted/diacritized_words.json")
    with open(words_path, "w", encoding="utf-8") as fh:
        json.dump(word_map, fh, ensure_ascii=False, indent=0)
    print(f"diacritized_speech.json: {len(result)} questions")
    print(f"diacritized_words.json: {len(word_map)} words")


if __name__ == "__main__":
    main()
