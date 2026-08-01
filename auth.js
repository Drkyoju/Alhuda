/* Student login: name + anonymous Supabase session.
 * Legacy name-hash credentials are derived on the Worker (/api/student-creds)
 * so the auth pepper is not shipped to every browser.
 */
(function () {
  const CONFIRM_MSG =
    'فعّل Anonymous sign-ins في Supabase: Authentication → Providers → Anonymous = ON';

  function normalizeName(name) {
    return String(name || '').trim().normalize('NFC');
  }

  async function fetchServerCredentials(name) {
    const res = await fetch('/api/student-creds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json?.email || !json?.password) return null;
    return { email: json.email, password: json.password };
  }

  function isConfirmError(err) {
    return /not confirmed|confirm your email|email.*confirm/i.test(err?.message || '');
  }
  function isAlreadyRegistered(err) {
    return /already|registered|exists/i.test(err?.message || '');
  }

  async function legacyNameAccountSignIn(name) {
    let creds = null;
    try {
      creds = await fetchServerCredentials(name);
    } catch {
      creds = null;
    }
    if (!creds) {
      return {
        error: {
          message: 'تعذّر تجهيز بيانات الدخول — استخدم/ي الوضع التجريبي أو فعّل Anonymous في Supabase',
        },
      };
    }

    let res = await db.auth.signInWithPassword({ email: creds.email, password: creds.password });
    if (!res.error) return res;

    let signUp = await db.auth.signUp({ email: creds.email, password: creds.password });
    if (signUp.error && isConfirmError(signUp.error)) return { error: { message: CONFIRM_MSG } };
    if (!signUp.error) {
      if (signUp.data?.session) return { data: signUp.data, error: null };
      res = await db.auth.signInWithPassword({ email: creds.email, password: creds.password });
      if (!res.error) return res;
    }
    if (signUp.error && isAlreadyRegistered(signUp.error)) {
      res = await db.auth.signInWithPassword({ email: creds.email, password: creds.password });
      if (!res.error) return res;
    }
    return { error: { message: signUp.error?.message || res.error?.message || 'تعذّر الدخول' } };
  }

  async function studentSignIn(name) {
    if (!normalizeName(name)) return { error: { message: 'اكتب/ي اسمك أولاً' } };

    try {
      const { data: { session } } = await db.auth.getSession();
      if (session?.user) {
        return { data: { user: session.user, session }, error: null };
      }

      const anon = await db.auth.signInAnonymously();
      if (!anon.error && anon.data?.user) {
        return { data: anon.data, error: null };
      }

      return legacyNameAccountSignIn(name);
    } catch (e) {
      return { error: { message: 'تعذّر الاتصال — تحقّق/ي من الإنترنت وحاول مجدداً' } };
    }
  }

  window.studentSignIn = studentSignIn;
})();
