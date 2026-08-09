# CranL — المضيف الوحيد للإنتاج

<!-- العربية أولاً -->

## الحالة

| البيئة | الرابط | الدور |
|--------|--------|--------|
| **CranL (الإنتاج)** | https://alhuda-zi6bbd.cranl.net/ | المضيف الوحيد — TTS / قرآن / student-creds / Supabase |

**Cloudflare Workers حُذف نهائياً (2026-08-09).** لا يوجد نشر عبر Wrangler. الأرشيف في `archive/cloudflare/`.

---

## ما تم إنجازه

1. **تكافؤ API:** `server.mjs` يغطي المسارات الحرجة:
   - `POST /api/tts` (Fish «راوٍ عربي حكيم»)
   - `GET /api/tts-status` (`runtime: "cranl-node"`)
   - `GET /api/quran-audio` + `GET /api/quran-warm` (كاش في الذاكرة)
   - `POST /api/student-creds` (`AUTH_NAME_PEPPER`)
   - ملفات ثابتة + SPA + `service-worker.js`
2. **أسرار CranL (في الواجهة، ليست في Git):**
   - `FISH_API_KEY` · `FISH_VOICE_ID` (حكيم) · `AUTH_NAME_PEPPER`
3. **Supabase:** العميل يستخدم `SUPABASE_URL` + مفتاح anon داخل `app.js` (RLS).
4. **CI:** `.github/workflows/deploy-cranl.yml` فقط للنشر. سير عمل Cloudflare مُعطّل ومؤرشف.
5. **اختبارات:** `npm run test:api:cranl`

### تحقق سريع

| فحص | نتيجة متوقعة |
|------|--------|
| `/` | 200 |
| `/version.js` | 200 |
| `/api/tts-status` | `fishConfigured: true`, صوت حكيم |
| `/api/quran-audio?surah=1&ayah=1` | 200 audio/mpeg |

---

## ربط دومين مخصص بـ CranL

1. افتح التطبيق في https://app.cranl.com/ → **Domains** → **Add Domain**
2. أدخل الدومين
3. عند مزوّد DNS:
   - **فرعي:** `CNAME` → `alhuda-zi6bbd.cranl.net`
   - **جذر:** `A` / `ALIAS` / `ANAME` حسب دعم المزوّد ([Domains & SSL](https://docs.cranl.com/platform/domains-ssl.html))
4. انتظر تفعيل SSL ثم جرّب TTS + دخول بالاسم

API النسبية (`/api/...`) تعمل تلقائياً على أي أصل.

---

## CI / أسرار GitHub لـ CranL

| Secret | القيمة |
|--------|--------|
| `CRANL_API_KEY` | من CranL → Settings → API Keys (`cranl_sk_…`) |
| `CRANL_APP_ID` | UUID التطبيق |
| اختياري `CRANL_LIVE_URL` | الافتراضي `https://alhuda-zi6bbd.cranl.net` |

```bash
curl -fsSL https://cranl.com/install.sh | bash
cranl login
cranl apps list
cranl apps deploy <CRANL_APP_ID>
```

---

## English (short)

**Sole host:** https://alhuda-zi6bbd.cranl.net/  
**Cloudflare Workers:** permanently removed; see `archive/cloudflare/`.  
**GH deploy:** `deploy-cranl.yml` only. Secrets: `CRANL_API_KEY`, `CRANL_APP_ID`.
