/* Stable student accounts: name + PIN → same Supabase user every time.
 *
 * SECURITY NOTES (read before modifying):
 *  - New accounts use SHA-256(name|pin|pepper) credentials on an internal
 *    pseudo-domain (alhuda.students.internal) that cannot be externally
 *    registered or read by anyone other than the Supabase project owner.
 *  - Legacy accounts (djb2 hash + mailinator/example/test domains) are still
 *    accepted via fallback so existing students are NOT locked out.
 *  - A client-side lockout (8 wrong PIN attempts / 3 min) supplements Supabase's
 *    per-IP rate limiting. Auth hints cache successful scheme per name so repeat
 *    logins use a single API call instead of 8+.
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

  const MAX_ATTEMPTS = 8;
  const LOCKOUT_MS = 3 * 60 * 1000;
  const LOCKOUT_KEY = 'alhudaLoginLockout';
  const HINT_KEY = 'alhudaAuthHints';

  /* ---------- Client-side lockout (defense-in-depth) ---------- */
  function readLockout() {
    try {
      const raw = sessionStorage.getItem(LOCKOUT_KEY);
      return raw ? JSON.parse(raw) : { attempts: 0, until: 0 };
    } catch (e) {
      return { attempts: 0, until: 0 };
    }
  }
  function writeLockout(s) {
    try {
      sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(s));
    } catch (e) {}
  }
  function bumpAttempt() {
    const s = readLockout();
    s.attempts = (s.attempts || 0) + 1;
    if (s.attempts >= MAX_ATTEMPTS) s.until = Date.now() + LOCKOUT_MS;
    writeLockout(s);
    return s;
  }
  function clearLockout() {
    writeLockout({ attempts: 0, until: 0 });
  }
  function isLockedOut() {
    const s = readLockout();
    if (!s.until) return false;
    if (Date.now() < s.until) return true;
    clearLockout();
    return false;
  }
  function lockoutMinutesRemaining() {
    const s = readLockout();
    return s.until ? Math.max(1, Math.ceil((s.until - Date.now()) / 60000)) : 0;
  }

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
  async function signUpAndIn(creds) {
    const signUp = await db.auth.signUp({ email: creds.email, password: creds.password });
    if (signUp.error) {
      const msg = signUp.error.message || '';
      if (/confirm|verified/i.test(msg)) return { error: { message: CONFIRM_MSG } };
      if (isAlreadyRegistered(signUp.error)) {
        const res = await signInOnly(creds);
        if (res.error && isConfirmError(res.error)) return { error: { message: CONFIRM_MSG } };
        return res;
      }
      return { error: signUp.error };
    }
    if (signUp.data?.session) return { data: signUp.data, error: null };
    const res = await signInOnly(creds);
    if (res.error && isConfirmError(res.error)) return { error: { message: CONFIRM_MSG } };
    return res;
  }

  function clientLockoutErr() {
    const mins = lockoutMinutesRemaining();
    return { error: { message: `محاولات كثيرة — انتظر ${mins} دقيقة وحاول مجدداً` } };
  }
  function serverBusyErr() {
    return { error: { message: 'الخادم مشغول — انتظر دقيقة واحدة وحاول مجدداً' } };
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
    if (isLockedOut()) return clientLockoutErr();

    const nameNorm = normalizeName(name);
    const hint = getAuthHint(nameNorm);

    try {
      /* Fast path: one API call when we already know this student's scheme */
      if (hint?.scheme === 'new') {
        const creds = await newCredentials(name, pin);
        const { res, rateLimited } = await trySignIn(creds);
        if (rateLimited) return serverBusyErr();
        if (!res.error) {
          clearLockout();
          return res;
        }
        bumpAttempt();
        return isLockedOut() ? clientLockoutErr() : { error: { message: 'اسم أو رمز غير صحيح' } };
      }
      if (hint?.scheme === 'legacy' && hint.domain) {
        const creds = legacyCredentials(name, pin, hint.domain);
        const { res, rateLimited } = await trySignIn(creds);
        if (rateLimited) return serverBusyErr();
        if (!res.error) {
          clearLockout();
          return res;
        }
        /* Hint may be stale — continue with full discovery below */
      }

      const newCreds = await newCredentials(name, pin);

      /* 1) New scheme sign-in */
      let { res, rateLimited } = await trySignIn(newCreds);
      if (rateLimited) return serverBusyErr();
      if (!res.error) {
        setAuthHint(nameNorm, { scheme: 'new' });
        clearLockout();
        return res;
      }

      /* 2) Legacy sign-in for existing accounts (max 3 calls) */
      for (const domain of LEGACY_DOMAINS) {
        const legacyCreds = legacyCredentials(name, pin, domain);
        ({ res, rateLimited } = await trySignIn(legacyCreds));
        if (rateLimited) return serverBusyErr();
        if (!res.error) {
          setAuthHint(nameNorm, { scheme: 'legacy', domain });
          clearLockout();
          return res;
        }
      }

      /* 3) New account — single sign-up path (not 6+ round-trips) */
      res = await signUpAndIn(newCreds);
      if (res.error && isRateLimit(res.error)) return serverBusyErr();
      if (res.error && isConfirmError(res.error)) return { error: { message: CONFIRM_MSG } };
      if (!res.error) {
        setAuthHint(nameNorm, { scheme: 'new' });
        clearLockout();
        return res;
      }

      /* Account exists on new email but sign-in failed → wrong PIN */
      if (isAlreadyRegistered(res.error)) {
        bumpAttempt();
        return isLockedOut() ? clientLockoutErr() : { error: { message: 'اسم أو رمز غير صحيح' } };
      }

      /* 4) Rare: internal domain rejected — one legacy sign-up only */
      if (isInvalidCredentials(res.error)) {
        const legacyCreds = legacyCredentials(name, pin, LEGACY_DOMAINS[0]);
        res = await signUpAndIn(legacyCreds);
        if (res.error && isRateLimit(res.error)) return serverBusyErr();
        if (!res.error) {
          setAuthHint(nameNorm, { scheme: 'legacy', domain: LEGACY_DOMAINS[0] });
          clearLockout();
          return res;
        }
      }

      bumpAttempt();
      if (isLockedOut()) return clientLockoutErr();
      return {
        error: {
          message: isInvalidCredentials(res.error)
            ? 'اسم أو رمز غير صحيح'
            : res.error?.message || 'تعذّر الدخول',
        },
      };
    } catch (e) {
      return { error: { message: 'تعذّر الاتصال — تحقّق/ي من الإنترنت وحاول مجدداً' } };
    }
  }

  /* ---------- Public API ---------- */
  window.studentSignIn = studentSignIn;
  window.clearLoginLockout = clearLockout;

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
