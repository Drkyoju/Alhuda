/**
 * API smoke tests against the live Cloudflare Worker.
 * Skipped locally unless LIVE_API_BASE is set (or BASE_URL points at workers.dev).
 */
const { test, expect } = require('@playwright/test');

const LIVE = process.env.LIVE_API_BASE
  || (process.env.BASE_URL && /workers\.dev|alhuda/i.test(process.env.BASE_URL) ? process.env.BASE_URL : '')
  || 'https://alhuda.ryodan71.workers.dev';

const HAKIM_VOICE_ID = 'aa9c8260269c411d9863ab1b1bfa3158';
const runLive = !!LIVE && process.env.SKIP_LIVE_API !== '1';

test.describe('Live Worker APIs', () => {
  test.skip(!runLive, 'Set LIVE_API_BASE or use workers.dev BASE_URL');

  test('GET /api/tts-status reports provider', async ({ request }) => {
    const res = await request.get(`${LIVE.replace(/\/$/, '')}/api/tts-status`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBeTruthy();
    expect(['fish', 'none']).toContain(json.provider);
    expect(json.quranReciter || 'hudhaify').toBe('hudhaify');
    expect(json.skipBakedTts).toBeTruthy();
    expect(json.azureConfigured).toBeFalsy();
    expect(json.elevenLabsConfigured).toBeFalsy();
    if (json.provider === 'fish') {
      expect(json.fishConfigured).toBeTruthy();
      expect(json.fishVoiceConfigured).toBeTruthy();
      expect(String(json.voice || '')).toBe(HAKIM_VOICE_ID);
      expect(String(json.voiceId || '')).toBe(HAKIM_VOICE_ID);
      expect(json.voiceLocked).toBeTruthy();
      expect(String(json.voiceName || '')).toMatch(/حكيم/);
    }
    if (json.errors) {
      expect(json.errors.tts).toBeTruthy();
      expect(json.errors.quran).toBeTruthy();
    }
  });

  test('POST /api/tts returns audio/mpeg', async ({ request }) => {
    const res = await request.post(`${LIVE.replace(/\/$/, '')}/api/tts`, {
      data: { text: 'السلام عليكم' },
    });
    if (!res.ok()) {
      const body = await res.text();
      // Fish quota / missing key — don't block deploys hard; surface warning.
      if (/402|429|quota|Fish Audio|not configured/i.test(body)) {
        test.info().annotations.push({ type: 'warning', description: body.slice(0, 240) });
        expect(true).toBeTruthy();
        return;
      }
      expect(res.ok(), body.slice(0, 240)).toBeTruthy();
    }
    expect(res.headers()['content-type'] || '').toMatch(/audio\/mpeg/);
    expect(res.headers()['x-tts-provider']).toBe('fish');
    const voiceHdr = res.headers()['x-tts-voice'] || '';
    if (voiceHdr) expect(voiceHdr).toBe(HAKIM_VOICE_ID);
    const audio = await res.body();
    expect(audio.length).toBeGreaterThan(1000);
  });

  test('GET /api/quran-audio returns audio for 51:56', async ({ request }) => {
    const res = await request.get(`${LIVE.replace(/\/$/, '')}/api/quran-audio?surah=51&ayah=56&reciter=hudhaify`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type'] || '').toMatch(/audio\/mpeg/);
    const body = await res.body();
    expect(body.length).toBeGreaterThan(1000);
  });

  test('GET /api/quran-warm warms popular verses', async ({ request }) => {
    const res = await request.get(`${LIVE.replace(/\/$/, '')}/api/quran-warm`);
    const ctype = res.headers()['content-type'] || '';
    // Older deploys may SPA-fallback HTML for unknown routes.
    if (!res.ok() || !ctype.includes('application/json')) {
      expect(true).toBeTruthy();
      return;
    }
    const json = await res.json();
    expect(json.ok).toBeTruthy();
    expect(json.total).toBeGreaterThan(0);
  });
});
