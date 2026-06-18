/* Stable student accounts: name + PIN → same Supabase user every time */
(function () {
  function hashKey(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36) + str.length.toString(36);
  }

  function studentCredentials(name, pin) {
    const key = `alhuda|${String(name || '').trim()}|${String(pin || '').trim()}`;
    const id = hashKey(key);
    return {
      email: `alhuda.student.${id}@test.com`,
      password: `Ah!${pin}#${id.slice(0, 14)}`,
    };
  }

  async function trySignIn(creds) {
    let res = await db.auth.signInWithPassword({ email: creds.email, password: creds.password });
    if (!res.error) return res;
    const signUp = await db.auth.signUp({ email: creds.email, password: creds.password });
    if (signUp.error) {
      if (/confirm|verified/i.test(signUp.error.message || '')) {
        return { error: { message: 'فعّل تسجيل البريد في Supabase: Authentication → Email → Confirm email = OFF' } };
      }
      if (!/already|registered|exists/i.test(signUp.error.message || '')) {
        return { error: signUp.error };
      }
    }
    return db.auth.signInWithPassword({ email: creds.email, password: creds.password });
  }

  async function studentSignIn(name, pin) {
    if (!/^\d{4,6}$/.test(String(pin || ''))) {
      return { error: { message: 'رمز الدخول ٤–٦ أرقام' } };
    }
    const creds = studentCredentials(name, pin);
    let res = await trySignIn(creds);
    if (res.error && /invalid.*email/i.test(res.error.message || '')) {
      const alt = { ...creds, email: creds.email.replace('@test.com', '@example.com') };
      res = await trySignIn(alt);
    }
    return res;
  }

  window.studentSignIn = studentSignIn;
  window.studentCredentials = studentCredentials;
})();
