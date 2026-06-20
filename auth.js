/* Stable student accounts: name + PIN → same Supabase user every time.
 *
 * SECURITY NOTES (read before modifying):
 *  - New accounts use SHA-256(name|pin|pepper) credentials on an internal
 *    pseudo-domain (alhuda.students.internal) that cannot be externally
 *    registered or read by anyone other than the Supabase project owner.
 *  - Legacy accounts (djb2 hash + mailinator/example/test domains) are still
 *    accepted via fallback so existing students are NOT locked out.
 *  - Supabase enforces per-IP auth rate limits; we minimize calls per attempt
 *    (auth hints + short discovery path) so normal use does not hit them.
 *  - The PEPPER constant is defense-in-depth only; for full hardening, move
 *    credential derivation into a Supabase Edge Function so the pepper and
 *    hash algorithm never ship to the client. See MIGRATION at the bottom.
 */
(function () {
  const PRIMARY_DOMAIN = 'alhuda.students.internal';
  const LEGACY_DOMAINS = ['mailinator.com', 'example.com', 'test.com'];
  const PEPPER = 'alhuda-integrity-v1';
  const CONFIRM_MSG =
    'أوقف تأكيد البريد في Supabase: Authentication → Email → Confirm email = OFF، ثم شغّل supabase_fix_student_auth.sql';
  const HINT_KEY = 'alhudaAuthHints';

  /* Drop any old client-side lockout from previous versions */
  try {
    sessionStorage.removeItem('alhudaLoginLockout');
  } catch (e) {}

  /* ---------- Per-name auth hint (fewer Supabase calls) ---------- */
  function getAuthHint(nameNorm) {
    try {
      const map = JSON.parse(localStorage.getItem(HINT_KEY) || '{}');
      return map[nameNorm] || null;
    } catch (e) {
      return null;
    }
  }
  function setAuthHint(nameNorm, hint) {
    try {
      const map = JSON.parse(localStorage.getItem(HINT_KEY) || '{}');
      map[nameNorm] = hint;
      const keys = Object.keys(map);
      while (keys.length > 80) {
        delete map[keys.shift()];
      }
      localStorage.setItem(HINT_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  /* ---------- Hashing ---------- */
  async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  function legacyHashKey(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36) + str.length.toString(36);
  }
  function normalizeName(name) {
    return String(name || '').trim().normalize('NFC');
  }

  async function newCredentials(name, pin, domain) {
    const norm = normalizeName(name);
    const pinStr = String(pin || '').trim();
    const id = (await sha256Hex(`alhuda|${norm}|${pinStr}|${PEPPER}`)).slice(0, 24);
    return {
      email: `alhuda.student.${id}@${domain || PRIMARY_DOMAIN}`,
      password: `Ah!${pinStr}#${id.slice(0, 14)}`,
    };
  }
  function legacyCredentials(name, pin, domain) {
    const norm = normalizeName(name);
    const pinStr = String(pin || '').trim();
    const id = legacyHashKey(`alhuda|${norm}|${pinStr}`);
    return {
      email: `alhuda.student.${id}@${domain || LEGACY_DOMAINS[0]}`,
      password: `Ah!${pinStr}#${id.slice(0, 14)}`,
    };
  }

  /* ---------- Error classification ---------- */
  function isRateLimit(err) {
    const msg = err?.message || '';
    return /rate limit|too many|429/i.test(msg) || err?.status === 429;
  }
  function isConfirmError(err) {
    return /not confirmed|confirm your email|email.*confirm/i.test(err?.message || '');
  }
  function isInvalidCredentials(err) {
    const msg = err?.message || '';
    if (/invalid login credentials/i.test(msg)) return true;
    if (/invalid/i.test(msg) && !/credentials|password/i.test(msg)) return true;
    return false;
  }
  function isAlreadyRegistered(err) {
    return /already|registered|exists/i.test(err?.message || '');
  }

  async function signInOnly(creds) {
    return db.auth.signInWithPassword({ email: creds.email, password: creds.password });
  }
  async function signUpOnly(creds) {
    return db.auth.signUp({ email: creds.email, password: creds.password });
  }

  function serverBusyErr() {
    return { error: { message: 'الخادم مشغول — انتظر ٣٠ ثانية وحاول مجدداً' } };
  }

  function validatePin(pin) {
    const s = String(pin || '').trim();
    if (!/^\d{4,6}$/.test(s)) return 'رمز الدخول ٤–٦ أرقام';
    return null;
  }

  async function trySignIn(creds) {
    const res = await signInOnly(creds);
    if (res.error && isRateLimit(res.error)) return { res, rateLimited: true };
    return { res, rateLimited: false };
  }

  async function studentSignIn(name, pin) {
    if (!normalizeName(name)) return { error: { message: 'اكتب/ي اسمك أولاً' } };
    const pinErr = validatePin(pin);
    if (pinErr) return { error: { message: pinErr } };

    const nameNorm = normalizeName(name);
    const hint = getAuthHint(nameNorm);

    try {
      /* Fast path: one API call when we already know this student's scheme */
      if (hint?.scheme === 'new') {
        const creds = await newCredentials(name, pin);
        const { res, rateLimited } = await trySignIn(creds);
        if (rateLimited) return serverBusyErr();
        if (!res.error) return res;
        return { error: { message: 'اسم أو رمز غير صحيح' } };
      }
      if (hint?.scheme === 'legacy' && hint.domain) {
        const creds = legacyCredentials(name, pin, hint.domain);
        const { res, rateLimited } = await trySignIn(creds);
        if (rateLimited) return serverBusyErr();
        if (!res.error) return res;
      }

      const newCreds = await newCredentials(name, pin);

      /* 1) New scheme sign-in */
      let { res, rateLimited } = await trySignIn(newCreds);
      if (rateLimited) return serverBusyErr();
      if (!res.error) {
        setAuthHint(nameNorm, { scheme: 'new' });
        return res;
      }

      /* 2) Legacy sign-in for existing accounts (max 3 calls) */
      for (const domain of LEGACY_DOMAINS) {
        const legacyCreds = legacyCredentials(name, pin, domain);
        ({ res, rateLimited } = await trySignIn(legacyCreds));
        if (rateLimited) return serverBusyErr();
        if (!res.error) {
          setAuthHint(nameNorm, { scheme: 'legacy', domain });
          return res;
        }
      }

      /* 3) New account — sign-up only (no redundant sign-in round-trip) */
      let signUp = await signUpOnly(newCreds);
      if (signUp.error && isRateLimit(signUp.error)) return serverBusyErr();
      if (signUp.error && isConfirmError(signUp.error)) return { error: { message: CONFIRM_MSG } };
      if (!signUp.error) {
        if (signUp.data?.session) {
          setAuthHint(nameNorm, { scheme: 'new' });
          return { data: signUp.data, error: null };
        }
        res = await signInOnly(newCreds);
        if (res.error && isRateLimit(res.error)) return serverBusyErr();
        if (!res.error) {
          setAuthHint(nameNorm, { scheme: 'new' });
          return res;
        }
      }
      if (signUp.error && isAlreadyRegistered(signUp.error)) {
        return { error: { message: 'اسم أو رمز غير صحيح' } };
      }

      /* 4) Rare: internal domain rejected — one legacy sign-up only */
      if (signUp.error && isInvalidCredentials(signUp.error)) {
        const legacyCreds = legacyCredentials(name, pin, LEGACY_DOMAINS[0]);
        signUp = await signUpOnly(legacyCreds);
        if (signUp.error && isRateLimit(signUp.error)) return serverBusyErr();
        if (!signUp.error) {
          if (signUp.data?.session) {
            setAuthHint(nameNorm, { scheme: 'legacy', domain: LEGACY_DOMAINS[0] });
            return { data: signUp.data, error: null };
          }
          res = await signInOnly(legacyCreds);
          if (res.error && isRateLimit(res.error)) return serverBusyErr();
          if (!res.error) {
            setAuthHint(nameNorm, { scheme: 'legacy', domain: LEGACY_DOMAINS[0] });
            return res;
          }
        }
      }

      return {
        error: {
          message: isInvalidCredentials(signUp.error)
            ? 'اسم أو رمز غير صحيح'
            : signUp.error?.message || 'تعذّر الدخول',
        },
      };
    } catch (e) {
      return { error: { message: 'تعذّر الاتصال — تحقّق/ي من الإنترنت وحاول مجدداً' } };
    }
  }

  /* ---------- Public API ---------- */
  window.studentSignIn = studentSignIn;
  window.clearLoginLockout = function () {
    try {
      sessionStorage.removeItem('alhudaLoginLockout');
    } catch (e) {}
  };

  /* MIGRATION (optional, future):
   *  1. Add a Supabase Edge Function `student-auth` that accepts name+pin over
   *     HTTPS, performs the SHA-256+pepper derivation server-side using a real
   *     secret stored in Supabase Vault, and returns a session token.
   *  2. Replace the body of `studentSignIn` with a single `fetch('/functions/v1/student-auth', ...)`.
   *  3. Once all active students have logged in at least once after the edge
   *     function is live, drop the LEGACY_DOMAINS fallback chain.
   *  4. Rotate PEPPER (and any legacy mailinator accounts) at the same time.
   */
})();
