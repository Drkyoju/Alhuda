/* Stable student accounts: name + PIN → same Supabase user every time.
 *
 * SECURITY NOTES (read before modifying):
 *  - New accounts use SHA-256(name|pin|pepper) credentials on an internal
 *    pseudo-domain (alhuda.students.internal) that cannot be externally
 *    registered or read by anyone other than the Supabase project owner.
 *  - Legacy accounts (djb2 hash + mailinator/example/test domains) are still
 *    accepted via fallback so existing students are NOT locked out.
 *  - A client-side lockout (5 attempts / 5 min) supplements Supabase's
 *    per-IP rate limiting to make brute-force impractical.
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

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 5 * 60 * 1000;
  const LOCKOUT_KEY = 'alhudaLoginLockout';

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
    return /rate limit|too many/i.test(err?.message || '');
  }
  function isConfirmError(err) {
    return /not confirmed|confirm your email|email.*confirm/i.test(err?.message || '');
  }
  // FIXED: the original `isInvalidEmail` could never be true for Supabase's
  // canonical "Invalid login credentials" error (which contains both
  // "invalid" and "credentials"). The multi-domain fallback loop was therefore
  // dead code. This now correctly detects that error.
  function isInvalidCredentials(err) {
    const msg = err?.message || '';
    if (/invalid login credentials/i.test(msg)) return true;
    if (/invalid/i.test(msg) && !/credentials|password/i.test(msg)) return true;
    return false;
  }

  async function signInOnly(creds) {
    return db.auth.signInWithPassword({ email: creds.email, password: creds.password });
  }
  async function signUpAndIn(creds) {
    const signUp = await db.auth.signUp({ email: creds.email, password: creds.password });
    if (signUp.error) {
      const msg = signUp.error.message || '';
      if (/confirm|verified/i.test(msg)) return { error: { message: CONFIRM_MSG } };
      if (/already|registered|exists/i.test(msg)) {
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

  function rateLimitErr() {
    return { error: { message: 'محاولات كثيرة — انتظر ٥ دقائق وحاول مجدداً' } };
  }

  function validatePin(pin) {
    const s = String(pin || '').trim();
    if (!/^\d{4,6}$/.test(s)) return 'رمز الدخول ٤–٦ أرقام';
    return null;
  }

  async function studentSignIn(name, pin) {
    if (!normalizeName(name)) return { error: { message: 'اكتب/ي اسمك أولاً' } };
    const pinErr = validatePin(pin);
    if (pinErr) return { error: { message: pinErr } };
    if (isLockedOut()) {
      return { error: { message: `محاولات كثيرة — انتظر ${lockoutMinutesRemaining()} دقيقة وحاول مجدداً` } };
    }

    try {
      // 1) Try NEW SHA-256 credentials on the internal pseudo-domain.
      const newCreds = await newCredentials(name, pin);
      let res = await signInOnly(newCreds);
      if (!res.error) {
        clearLockout();
        return res;
      }
      if (isRateLimit(res.error)) return rateLimitErr();
      if (isConfirmError(res.error)) return { error: { message: CONFIRM_MSG } };

      // 2) Try LEGACY djb2 credentials across historical domains (existing accounts).
      for (const domain of LEGACY_DOMAINS) {
        const legacyCreds = legacyCredentials(name, pin, domain);
        res = await signInOnly(legacyCreds);
        if (!res.error) {
          clearLockout();
          return res;
        }
        if (isRateLimit(res.error)) return rateLimitErr();
        if (isConfirmError(res.error)) return { error: { message: CONFIRM_MSG } };
      }

      // 3) No existing account → SIGN UP a new one with the secure SHA-256 scheme.
      res = await signUpAndIn(newCreds);
      if (!res.error) {
        clearLockout();
        return res;
      }
      if (isRateLimit(res.error)) return rateLimitErr();

      // 4) Last-resort fallback: legacy signUp on legacy domains (covers the rare
      //    case where the primary pseudo-domain is rejected by project config).
      if (isInvalidCredentials(res.error) || /already|registered|exists/i.test(res.error.message || '')) {
        for (const domain of LEGACY_DOMAINS) {
          const legacyCreds = legacyCredentials(name, pin, domain);
          res = await signUpAndIn(legacyCreds);
          if (!res.error) {
            clearLockout();
            return res;
          }
          if (isRateLimit(res.error)) return rateLimitErr();
        }
      }

      // All paths failed — bump the lockout counter.
      const lockState = bumpAttempt();
      if (lockState.until) return rateLimitErr();
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
