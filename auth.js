/* Stable student accounts: name + PIN → same Supabase user every time */
(function () {
  const DOMAINS = ['mailinator.com', 'example.com', 'test.com'];
  const CONFIRM_MSG =
    'أوقف تأكيد البريد في Supabase: Authentication → Email → Confirm email = OFF، ثم شغّل supabase_fix_student_auth.sql';

  function hashKey(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36) + str.length.toString(36);
  }

  function studentCredentials(name, pin, domain) {
    const key = `alhuda|${String(name || '').trim()}|${String(pin || '').trim()}`;
    const id = hashKey(key);
    const host = domain || DOMAINS[0];
    return {
      email: `alhuda.student.${id}@${host}`,
      password: `Ah!${pin}#${id.slice(0, 14)}`,
    };
  }

  function isRateLimit(err) {
    return /rate limit|too many/i.test(err?.message || '');
  }

  function isInvalidEmail(err) {
    const msg = err?.message || '';
    return /invalid/i.test(msg) && !/credentials|password/i.test(msg);
  }

  function isConfirmError(err) {
    return /not confirmed|confirm your email|email.*confirm/i.test(err?.message || '');
  }

  async function signInOnly(creds) {
    return db.auth.signInWithPassword({ email: creds.email, password: creds.password });
  }

  async function signUpAndIn(creds) {
    const signUp = await db.auth.signUp({ email: creds.email, password: creds.password });
    if (signUp.error) {
      if (/confirm|verified/i.test(signUp.error.message || '')) {
        return { error: { message: CONFIRM_MSG } };
      }
      if (/already|registered|exists/i.test(signUp.error.message || '')) {
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

  async function studentSignIn(name, pin) {
    if (!/^\d{4,6}$/.test(String(pin || ''))) {
      return { error: { message: 'رمز الدخول ٤–٦ أرقام' } };
    }

    let lastError = null;
    for (const domain of DOMAINS) {
      const creds = studentCredentials(name, pin, domain);
      let res = await signInOnly(creds);
      if (!res.error) return res;

      lastError = res.error;
      if (isRateLimit(res.error)) {
        return { error: { message: 'محاولات كثيرة — انتظر ٥ دقائق وحاول مجدداً' } };
      }
      if (isConfirmError(res.error)) {
        return { error: { message: CONFIRM_MSG } };
      }
      if (isInvalidEmail(res.error)) continue;

      res = await signUpAndIn(creds);
      if (!res.error) return res;

      lastError = res.error;
      if (isRateLimit(res.error)) {
        return { error: { message: 'محاولات كثيرة — انتظر ٥ دقائق وحاول مجدداً' } };
      }
      if (isConfirmError(res.error) || isConfirmError(lastError)) {
        return { error: { message: CONFIRM_MSG } };
      }
      if (isInvalidEmail(res.error)) continue;
      return res;
    }

    return {
      error: {
        message: isInvalidEmail(lastError)
          ? 'تعذّر إنشاء الحساب — راجع إعدادات البريد في Supabase'
          : (lastError?.message || 'تعذّر الدخول'),
      },
    };
  }

  window.studentSignIn = studentSignIn;
})();
