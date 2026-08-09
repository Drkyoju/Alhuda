# CranL staging (parallel) — Cloudflare live stays primary

<!-- Arabic first, then English. -->

## العربية

هذا المسار **تجريبي موازٍ** على [CranL](https://docs.cranl.com/) لتجربة التطبيق بدون قطع الإنتاج على Cloudflare Workers.

| البيئة | الرابط | الحالة |
|--------|--------|--------|
| **الإنتاج (لا تلمسه)** | https://alhuda.ryodan71.workers.dev | GitHub Actions → Wrangler — **الافتراضي** |
| **تجربة CranL** | `https://<app-name>-<id>.cranl.net` | بعد تسجيل الدخول وربط GitHub |

`wrangler.toml` و`.github/workflows/deploy-cloudflare.yml` **لم يتغيّرا**. النشر الافتراضي يبقى Cloudflare.

### ماذا أُعدّ؟

| ملف | الدور |
|-----|--------|
| `Dockerfile` | بناء Node 20 + تشغيل `server.mjs` على المنفذ `3000` |
| `server.mjs` | SPA ثابت + `/api/tts` و`/api/tts-status` و`/api/quran-audio` (+ warm / student-creds) |
| `.dockerignore` | يستبعد `extracted/` و`.venv` والأسرار من صورة Docker |
| هذا الملف | خطوات الربط والنشر |

### ما الذي يُنقل من `worker.js`؟

يجب أن يعمل على CranL (Node):

- `POST /api/tts` — Fish Audio (سر `FISH_API_KEY`)
- `GET /api/tts-status`
- `GET /api/quran-audio` — هذيفي (كاش في الذاكرة بدل `caches.default`)
- `GET /api/quran-warm`
- `POST /api/student-creds` — سر `AUTH_NAME_PEPPER`
- ملفات الواجهة الثابتة + `service-worker.js` + سقوط SPA إلى `index.html`

اختلافات متوقعة عن Workers: لا يوجد كاش حافة Cloudflare للآيات؛ الكاش محلي في العملية.

### خطواتك التالية (حساب CranL مطلوب)

1. سجّل في https://app.cranl.com/
2. من الشريط الجانبي: **GitHub** → **Connect GitHub** وامنح الوصول للمستودع
3. **Projects** → مشروع جديد إن لزم
4. **Applications** → **New Application**:
   - المستودع + الفرع `main`
   - **Build Type:** `Dockerfile` (مهم)
   - **Port:** `3000`
   - Region حسب تفضيلك
5. **Environment** → أضف الأسرار (نفس قيم Cloudflare تقريباً):

```
FISH_API_KEY=...
AUTH_NAME_PEPPER=...
PORT=3000
```

6. بعد نجاح البناء افتح رابط `*.cranl.net` من صفحة التطبيق
7. تحقق سريع: `/api/tts-status` يجب أن يظهر `"fishConfigured": true` و`"runtime": "cranl-node"`

### CLI (اختياري)

```bash
curl -fsSL https://cranl.com/install.sh | bash
cranl login          # يحتاج API key من لوحة CranL → Settings → API Keys
cranl whoami
# ثم من لوحة التحكم أو: cranl apps create / cranl apps deploy
```

**لا توجد بيانات دخول CranL في هذه الجلسة** — توقّفنا عند ملفات جاهزة للنشر. الخطوة التالية: أنت تسجّل الدخول وتربط المستودع.

### تشغيل محلي (Docker)

```bash
docker build -t alhuda-cranl .
docker run --rm -p 3000:3000 \
  -e FISH_API_KEY="$FISH_API_KEY" \
  -e AUTH_NAME_PEPPER="$AUTH_NAME_PEPPER" \
  alhuda-cranl
# ثم: http://localhost:3000  و  http://localhost:3000/api/tts-status
```

بدون مفاتيح: الواجهة تعمل؛ TTS يعيد 503 حتى تضبط `FISH_API_KEY`.

---

## English

This is a **parallel staging path** on [CranL](https://docs.cranl.com/) so you can try the app **without cutting** Cloudflare production.

| Environment | URL | Status |
|-------------|-----|--------|
| **Production (untouched)** | https://alhuda.ryodan71.workers.dev | GH Actions → Wrangler — **primary** |
| **CranL preview** | `https://<app-name>-<id>.cranl.net` | After you log in + connect GitHub |

`wrangler.toml` and the Cloudflare workflow are **unchanged**. Default production deploy stays on Cloudflare.

### Artifacts

- `Dockerfile` — Node 20 Alpine, `CMD node server.mjs`, port **3000**, bind `0.0.0.0`
- `server.mjs` — Express static SPA + same critical APIs as `worker.js`
- `.dockerignore` — keeps image small (no `extracted/`, `.venv`, secrets)

### Port from `worker.js`

Must work on CranL: `/api/tts`, `/api/tts-status`, `/api/quran-audio`, `/api/quran-warm`, `/api/student-creds`, static assets + SW + SPA fallback.

Secrets (set in CranL **Environment** tab, never commit): `FISH_API_KEY`, `AUTH_NAME_PEPPER`. Optional Fish tuning: `FISH_TTS_SPEED`, `FISH_TTS_VOLUME`, etc. (same as `fish-audio-tts.js`).

### Your next steps (login required)

1. Sign up / log in at https://app.cranl.com/
2. Connect GitHub → select this repo
3. Create Application with **Build Type = Dockerfile**, **Port = 3000**
4. Set env secrets → deploy → open `*.cranl.net`
5. Smoke: `GET /api/tts-status` → `fishConfigured: true`, `runtime: "cranl-node"`

**Blocker:** no CranL CLI credentials in this environment. Files are ready; you log into CranL and connect the repo to get a live preview URL.

### Docs

- Quickstart: https://docs.cranl.com/getting-started/quickstart.html
- Dockerfile: https://docs.cranl.com/platform/applications.html#configuring-a-dockerfile
- Env vars: https://docs.cranl.com/platform/environment-variables.html
- Domains: https://docs.cranl.com/platform/domains-ssl.html (`*.cranl.net`)
