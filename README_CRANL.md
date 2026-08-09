# CranL cutover — جاهزية الإنتاج (Cloudflare ما زال احتياطياً)

<!-- العربية أولاً -->

## الحالة الآن

| البيئة | الرابط | الدور |
|--------|--------|--------|
| **CranL (المستهدف)** | https://alhuda-zi6bbd.cranl.net/ | جاهز للتحقق — TTS / قرآن / student-creds / Supabase |
| **Cloudflare (حي حتى القطع)** | https://alhuda.ryodan71.workers.dev | لا تُحذف حتى اكتمال قائمة التحقق أدناه |

**لا تحذف حساب/Worker Cloudflare في هذه المرحلة.** بعد القائمة الخضراء اطلب تأكيداً صريحاً ثم احذف.

---

## ما تم إنجازه

1. **تكافؤ API:** `server.mjs` يغطي كل مسارات `worker.js` الحرجة:
   - `POST /api/tts` (Fish «راوٍ عربي حكيم»)
   - `GET /api/tts-status` (`runtime: "cranl-node"`)
   - `GET /api/quran-audio` + `GET /api/quran-warm` (كاش في الذاكرة بدل Cache API لـ CF)
   - `POST /api/student-creds` (`AUTH_NAME_PEPPER`)
   - ملفات ثابتة + SPA + `service-worker.js`
2. **أسرار CranL (مضبوطة مسبقاً في الواجهة، ليست في Git):**
   - `FISH_API_KEY` · `FISH_VOICE_ID` (حكيم) · `AUTH_NAME_PEPPER`
3. **Supabase:** العميل يستخدم `SUPABASE_URL` + مفتاح anon داخل `app.js` مباشرةً (RLS). لا حاجة لبروكسي على CranL. مفتاح `service_role` للسكربتات المحلية فقط — لا يُرفع لـ CranL Environment إلا إن احتجت سكربتات سيرفر لاحقاً.
4. **العميل:** رابط المشاركة يستخدم `location.origin` (يعمل على `*.cranl.net` أو دومين مخصص).
5. **CI:** أُضيف `.github/workflows/deploy-cranl.yml` (يتطلب أسرار GH). سير عمل Cloudflare **ما زال مفعّلاً** حتى القطع.
6. **اختبارات:** `npm run test:api:cranl` — تم التحقق محلياً ضد CranL (TTS + قرآن + warm + student-creds).

### تحقق سريع (نُفّذ ضد CranL)

| فحص | نتيجة |
|------|--------|
| `/api/tts-status` | `fishConfigured: true`, صوت حكيم |
| `POST /api/tts` | 200 audio/mpeg |
| `/api/quran-audio?surah=1&ayah=1` | 200 audio/mpeg |
| `/api/quran-warm` | ok |
| `POST /api/student-creds` | نفس البريد/كلمة المرور مثل Cloudflare (pepper متطابق) |
| Supabase REST `questions` | 200 (anon) |
| `version.js` | `alhuda-v302` |

---

## ربط دومين مخصص بـ CranL

1. افتح التطبيق في https://app.cranl.com/ → **Domains** → **Add Domain**
2. أدخل الدومين (مثلاً `quiz.example.com` أو الجذر)
3. عند مزوّد DNS:
   - **فرعي:** `CNAME` → القيمة `alhuda-zi6bbd.cranl.net`
   - **جذر:** `A` / `ALIAS` / `ANAME` حسب دعم المزوّد (انظر [Domains & SSL](https://docs.cranl.com/platform/domains-ssl.html))
4. انتظر تفعيل SSL في تبويب Domains (`active` خلال دقائق عادةً)
5. افتح الدومين الجديد وجرّب TTS + دخول بالاسم + اختيار كتاب

API النسبية (`/api/...`) تعمل تلقائياً على أي أصل. لا حاجة لضبط base URL في العميل.

---

## CI / أسرار GitHub لـ CranL

في المستودع → Settings → Secrets and variables → Actions أضف:

| Secret | القيمة |
|--------|--------|
| `CRANL_API_KEY` | من CranL → Settings → API Keys (`cranl_sk_…`) |
| `CRANL_APP_ID` | UUID التطبيق (`cranl apps list` أو صفحة التطبيق) |
| اختياري `CRANL_LIVE_URL` | الافتراضي `https://alhuda-zi6bbd.cranl.net` |

بدون هذه الأسرار: الـ workflow يمرّر التحذيرات ويتخطّى استدعاء Deploy API — قد يبقى النشر التلقائي من ربط GitHub داخل CranL يعمل عند الدفع لـ `main`.

CLI محلياً:

```bash
curl -fsSL https://cranl.com/install.sh | bash
cranl login
cranl apps list
cranl apps deploy <CRANL_APP_ID>
```

---

## متى يُسمح بحذف Cloudflare؟ (قائمة تحقق)

علّم كل بند قبل طلب الحذف النهائي:

- [ ] CranL يخدم الإنتاج (أو الدومين المخصص) لأيام بدون أعطال حرجة
- [ ] TTS Fish حكيم يعمل من الدومين النهائي
- [ ] قرآن (هذيفي) عبر `/api/quran-audio`
- [ ] دخول بالاسم (`student-creds` + Auth Supabase) بنفس الحسابات القديمة
- [ ] بنك الأسئلة / مزامنة Supabase من أصل CranL
- [ ] Service Worker يحدّث الكاش على `*.cranl.net` أو الدومين المخصص (hard refresh مرة)
- [ ] روابط المشاركة تشير للأصل الحالي (ليس `workers.dev`)
- [ ] `deploy-cranl.yml` يعمل أو النشر من لوحة CranL موثوق
- [ ] أُوقف أو عُطّل `deploy-cloudflare.yml` بعد التأكيد (لا قبله)
- [ ] لا تبعيات خارجية ما زالت تشير لـ `alhuda.ryodan71.workers.dev` (بحث في الوثائق/الرسائل/المفضلة)
- [ ] **تأكيد صريح منك:** «احذف Cloudflare الآن»

بعدها فقط: احذف الـ Worker من لوحة CF وألغِ أسرار `CLOUDFLARE_*` من GitHub إن رغبت.

### فروقات متوقعة (ليست حواجز قطع)

- كاش الآيات: في الذاكرة على Node وليس `caches.default` على الحافة
- لا يوجد `CF-Connecting-IP` — يعتمد `X-Forwarded-For`
- Azure/ElevenLabs/Google معطّلة عمداً على المسارين

---

## English (short)

**CranL:** https://alhuda-zi6bbd.cranl.net/ — APIs + Fish + pepper parity verified.  
**CF:** keep until checklist above is green + explicit OK.  
**Custom domain:** CranL Domains tab → CNAME to `alhuda-zi6bbd.cranl.net`.  
**GH secrets for CI:** `CRANL_API_KEY`, `CRANL_APP_ID`.  
Supabase anon stays in the client; no server proxy required.
