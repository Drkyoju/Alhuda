/* Student accounts: name only → stable Supabase user per name.
 * Minimizes auth API calls (1 for returning names) and auto-retries on rate limits.
 */
(function () {
  const PRIMARY_DOMAIN = 'alhuda.students.internal';
  const PEPPER = 'alhuda-integrity-v2-name';
  const CONFIRM_MSG =
    'أوقف تأكيد البريد في Supabase: Authentication → Email → Confirm email = OFF، ثم شغّل supabase_fix_student_auth.sql';
  const KNOWN_NAMES_KEY = 'alhudaKnownNames';

  try {
    sessionStorage.removeItem('alhudaLoginLockout');
  } catch (e) {}

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function normalizeName(name) {
    return String(name || '').trim().normalize('NFC');
  }

  function isKnownName(nameNorm) {
    try {
      const list = JSON.parse(localStorage.getItem(KNOWN_NAMES_KEY) || '[]');
      return list.includes(nameNorm);
    } catch (e) {
      return false;
    }
  }

  function markKnownName(nameNorm) {
    try {
      const set = new Set(JSON.parse(localStorage.getItem(KNOWN_NAMES_KEY) || '[]'));
      set.add(nameNorm);
      const list = [...set];
      localStorage.setItem(KNOWN_NAMES_KEY, JSON.stringify(list.slice(-200)));
    } catch (e) {}
  }

  async function nameOnlyCredentials(name) {
    const norm = normalizeName(name);
    const id = (await sha256Hex(`alhuda|${norm}|name-only|${PEPPER}`)).slice(0, 24);
    return {
      email: `alhuda.student.${id}@${PRIMARY_DOMAIN}`,
      password: `Ah!Nm#${id.slice(0, 14)}`,
    };
  }

  function isRateLimit(err) {
    const msg = err?.message || '';
    return /rate limit|too many|429|over_request_rate|slow down/i.test(msg) || err?.status === 429;
  }
  function isConfirmError(err) {
    return /not confirmed|confirm your email|email.*confirm/i.test(err?.message || '');
  }
  function isAlreadyRegistered(err) {
    return /already|registered|exists/i.test(err?.message || '');
  }
  function isInvalidCredentials(err) {
    return /invalid login credentials/i.test(err?.message || '');
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

  /* Retry auth calls when Supabase rate-limits (common in classrooms / shared Wi‑Fi). */
  async function authWithRetry(action, attempts) {
    const max = attempts || 3;
    let last = null;
    for (let i = 0; i < max; i++) {
      last = await action();
      const err = last?.error;
      if (!err || !isRateLimit(err)) return last;
      if (i < max - 1) await sleep(1500 + i * 2000);
    }
    return last;
  }

  async function studentSignIn(name) {
    if (!normalizeName(name)) return { error: { message: 'اكتب/ي اسمك أولاً' } };

    const nameNorm = normalizeName(name);

    try {
      const creds = await nameOnlyCredentials(name);
      const known = isKnownName(nameNorm);

      /* Returning name on this device → single sign-in call */
      if (known) {
        const res = await authWithRetry(() => signInOnly(creds));
        if (res.error && isRateLimit(res.error)) return serverBusyErr();
        if (!res.error) {
          markKnownName(nameNorm);
          return res;
        }
        if (!isInvalidCredentials(res.error)) {
          return { error: { message: res.error?.message || 'تعذّر الدخول' } };
        }
      }

      /* New name → sign-up first (avoids failed sign-in + sign-up = 2 wasted calls) */
      let signUp = await authWithRetry(() => signUpOnly(creds));
      if (signUp.error && isRateLimit(signUp.error)) return serverBusyErr();
      if (signUp.error && isConfirmError(signUp.error)) return { error: { message: CONFIRM_MSG } };
      if (!signUp.error) {
        if (signUp.data?.session) {
          markKnownName(nameNorm);
          return { data: signUp.data, error: null };
        }
        const res = await authWithRetry(() => signInOnly(creds));
        if (res.error && isRateLimit(res.error)) return serverBusyErr();
        if (!res.error) {
          markKnownName(nameNorm);
          return res;
        }
      }

      if (signUp.error && isAlreadyRegistered(signUp.error)) {
        const res = await authWithRetry(() => signInOnly(creds));
        if (res.error && isRateLimit(res.error)) return serverBusyErr();
        if (!res.error) {
          markKnownName(nameNorm);
          return res;
        }
        return { error: { message: 'تعذّر الدخول — حاول/ي مجدداً بعد لحظات' } };
      }

      return { error: { message: signUp.error?.message || 'تعذّر الدخول' } };
    } catch (e) {
      return { error: { message: 'تعذّر الاتصال — تحقّق/ي من الإنترنت وحاول مجدداً' } };
    }
  }

  window.studentSignIn = studentSignIn;
  window.markKnownStudentName = markKnownName;
  window.clearLoginLockout = function () {
    try {
      sessionStorage.removeItem('alhudaLoginLockout');
    } catch (e) {}
  };
})();
