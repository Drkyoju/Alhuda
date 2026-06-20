/* Student accounts: name only → stable Supabase user per name on this device.
 *
 * Credentials are derived deterministically from the normalized name (no PIN).
 * Supabase session persists in the browser; localStorage keeps the last name
 * for quick return visits. Teachers still use email + password (see app.js).
 */
(function () {
  const PRIMARY_DOMAIN = 'alhuda.students.internal';
  const PEPPER = 'alhuda-integrity-v2-name';
  const CONFIRM_MSG =
    'أوقف تأكيد البريد في Supabase: Authentication → Email → Confirm email = OFF، ثم شغّل supabase_fix_student_auth.sql';

  try {
    sessionStorage.removeItem('alhudaLoginLockout');
  } catch (e) {}

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
    return /rate limit|too many|429/i.test(msg) || err?.status === 429;
  }
  function isConfirmError(err) {
    return /not confirmed|confirm your email|email.*confirm/i.test(err?.message || '');
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

  async function studentSignIn(name) {
    if (!normalizeName(name)) return { error: { message: 'اكتب/ي اسمك أولاً' } };

    try {
      const creds = await nameOnlyCredentials(name);

      let res = await signInOnly(creds);
      if (res.error && isRateLimit(res.error)) return serverBusyErr();
      if (!res.error) return res;

      let signUp = await signUpOnly(creds);
      if (signUp.error && isRateLimit(signUp.error)) return serverBusyErr();
      if (signUp.error && isConfirmError(signUp.error)) return { error: { message: CONFIRM_MSG } };
      if (!signUp.error) {
        if (signUp.data?.session) return { data: signUp.data, error: null };
        res = await signInOnly(creds);
        if (res.error && isRateLimit(res.error)) return serverBusyErr();
        if (!res.error) return res;
      }
      if (signUp.error && isAlreadyRegistered(signUp.error)) {
        return { error: { message: 'تعذّر الدخول — حاول/ي مجدداً بعد لحظات' } };
      }

      return { error: { message: signUp.error?.message || 'تعذّر الدخول' } };
    } catch (e) {
      return { error: { message: 'تعذّر الاتصال — تحقّق/ي من الإنترنت وحاول مجدداً' } };
    }
  }

  window.studentSignIn = studentSignIn;
  window.clearLoginLockout = function () {
    try {
      sessionStorage.removeItem('alhudaLoginLockout');
    } catch (e) {}
  };
})();
