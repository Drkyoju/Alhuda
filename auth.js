/* Student login: name only — no lockouts, no rate-limit blocking messages.
 * Uses one anonymous Supabase session per device visit (fast, no password auth storm).
 * Falls back to legacy name-hash account only if anonymous sign-in is disabled in Supabase.
 */
(function () {
  const PRIMARY_DOMAIN = 'alhuda.students.internal';
  const PEPPER = 'alhuda-integrity-v2-name';
  const CONFIRM_MSG =
    'فعّل Anonymous sign-ins في Supabase: Authentication → Providers → Anonymous = ON';

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

  function isConfirmError(err) {
    return /not confirmed|confirm your email|email.*confirm/i.test(err?.message || '');
  }
  function isAlreadyRegistered(err) {
    return /already|registered|exists/i.test(err?.message || '');
  }

  async function legacyNameAccountSignIn(name) {
    const creds = await nameOnlyCredentials(name);
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
