/* Student login: name only (no PIN). Stable account via Worker-derived credentials
 * so the same name always maps to the same Supabase user across devices/sessions.
 * Anonymous is a last-resort guest fallback only.
 */
(function () {
  const CONFIRM_MSG =
    'تعذّر إنشاء الحساب — تأكد/ي من الإنترنت أو فعّل تأكيد البريد في Supabase للمستخدمين الجدد';

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

  async function nameAccountSignIn(name) {
    let creds = null;
    try {
      creds = await fetchServerCredentials(name);
    } catch {
      creds = null;
    }
    if (!creds) {
      return {
        error: {
          message: 'تعذّر تجهيز الدخول بالاسم — تحقّق/ي من الإنترنت وحاول مجدداً',
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
    const norm = normalizeName(name);
    if (!norm) return { error: { message: 'اكتب/ي اسمك أولاً' } };

    const localFallback = () => {
      // Stable local identity when Supabase is unreachable — play + progress still work on-device.
      let h = 2166136261;
      for (let i = 0; i < norm.length; i++) {
        h ^= norm.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const id = `local-${(h >>> 0).toString(16)}`;
      return {
        data: {
          user: { id, email: null, is_anonymous: true, app_metadata: { provider: 'local' } },
          session: null,
          local: true,
        },
        error: null,
      };
    };

    try {
      if (typeof db === 'undefined' || !db?.auth) return localFallback();

      const { data: { session } } = await db.auth.getSession();
      if (session?.user) {
        const { data: profile } = await db.from('profiles').select('name').eq('id', session.user.id).maybeSingle();
        if (profile?.name && profile.name === norm) {
          return { data: { user: session.user, session }, error: null };
        }
        await db.auth.signOut().catch(() => {});
      }

      const named = await nameAccountSignIn(norm);
      if (!named.error) return named;

      const anon = await db.auth.signInAnonymously();
      if (!anon.error && anon.data?.user) {
        return { data: anon.data, error: null };
      }

      // Cloud auth unavailable — continue locally so the student can still play.
      console.warn('cloud login failed, using local session', named.error?.message);
      return localFallback();
    } catch (e) {
      console.warn('studentSignIn fallback local', e);
      return localFallback();
    }
  }

  window.studentSignIn = studentSignIn;
  window.normalizeStudentName = normalizeName;
})();
