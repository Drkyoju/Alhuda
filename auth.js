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

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(label || 'timeout')), ms);
      }),
    ]);
  }

  async function fetchServerCredentials(name) {
    const res = await withTimeout(
      fetch('/api/student-creds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
      8000,
      'student-creds timeout'
    );
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

    let res;
    try {
      res = await withTimeout(
        db.auth.signInWithPassword({ email: creds.email, password: creds.password }),
        8000,
        'signIn timeout'
      );
    } catch (e) {
      return { error: { message: e?.message || 'signIn failed' } };
    }
    if (!res.error) return res;

    let signUp;
    try {
      signUp = await withTimeout(
        db.auth.signUp({ email: creds.email, password: creds.password }),
        8000,
        'signUp timeout'
      );
    } catch (e) {
      return { error: { message: e?.message || 'signUp failed' } };
    }
    if (signUp.error && isConfirmError(signUp.error)) return { error: { message: CONFIRM_MSG } };
    if (!signUp.error) {
      if (signUp.data?.session) return { data: signUp.data, error: null };
      try {
        res = await withTimeout(
          db.auth.signInWithPassword({ email: creds.email, password: creds.password }),
          8000,
          'signIn after signup timeout'
        );
      } catch (e) {
        return { error: { message: e?.message || 'signIn failed' } };
      }
      if (!res.error) return res;
    }
    if (signUp.error && isAlreadyRegistered(signUp.error)) {
      try {
        res = await withTimeout(
          db.auth.signInWithPassword({ email: creds.email, password: creds.password }),
          8000,
          'signIn existing timeout'
        );
      } catch (e) {
        return { error: { message: e?.message || 'signIn failed' } };
      }
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

      let session = null;
      try {
        const sessRes = await withTimeout(db.auth.getSession(), 4000, 'getSession timeout');
        session = sessRes?.data?.session || null;
      } catch {
        session = null;
      }
      if (session?.user) {
        try {
          const { data: profile } = await withTimeout(
            db.from('profiles').select('name').eq('id', session.user.id).maybeSingle(),
            4000,
            'profile timeout'
          );
          if (profile?.name && profile.name === norm) {
            return { data: { user: session.user, session }, error: null };
          }
        } catch { /* ignore */ }
        await db.auth.signOut().catch(() => {});
      }

      const named = await nameAccountSignIn(norm);
      if (!named.error) return named;

      try {
        const anon = await withTimeout(db.auth.signInAnonymously(), 5000, 'anon timeout');
        if (!anon.error && anon.data?.user) {
          return { data: anon.data, error: null };
        }
      } catch { /* ignore */ }

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
