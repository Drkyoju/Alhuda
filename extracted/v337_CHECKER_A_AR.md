# Checker A — v337: تمريرة بقايا الاستشهادات (89)

## الحكم
| البند | النتيجة |
|------|---------|
| استعادة من مصادر كتاب فقط (نسخ المعلم/الطالب + OCR) | **نعم** — بلا اختراع |
| سحب صياغات مركّبة غير متجاورة | **نعم** (أُبطلت) |
| KEEP أرسل / سنين + صح/خطأ | **محفوظ** |
| Mute TTS للاستشهاد | **محفوظ** |
| HEARTS_ENABLED | false |
| expectQuestionId | موجود |
| Supabase | PATCH عبر مطابقة نص السؤال → معرف السحابة |
| النشر | v337 CranL |

## الأرقام (من أصل 89 بقايا v335)
- **مُستعاد بثقة عالية:** **53**
- **ما زال متعذراً بلا مصدر متجاور موثوق:** **36**
- صالح للعرض تقريباً: ~559 / 595

## مصادر
- `extracted/{tawheed,usool,nawawi}.txt` + pages
- طبعات PDF معلم/طالب (`extracted/v337_pdf_editions/`)
- تحقق تغطية كلمات + صلة بالسؤال/الجواب؛ رفض النوافذ غير المتطابقة

## ملفات
- `extracted/v337_citation_updates.json`
- `extracted/v337_residual_impossible.json`
- `extracted/v337_restore_report.json`
- `extracted/v337_supabase_sync_report.json`
- `citation-canonical-v337.js` (كسر كاش Bunny)
