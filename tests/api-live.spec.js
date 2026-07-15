/**
 * API smoke tests against the live Cloudflare Worker.
 * Skipped locally unless LIVE_API_BASE is set (or BASE_URL points at workers.dev).
 */
const { test, expect } = require('@playwright/test');

const LIVE = process.env.LIVE_API_BASE
  || (process.env.BASE_URL && /workers\.dev|alhuda/i.test(process.env.BASE_URL) ? process.env.BASE_URL : '')
  || 'https://alhuda.ryodan71.workers.dev';

const runLive = !!LIVE && process.env.SKIP_LIVE_API !== '1';

test.describe('Live Worker APIs', () => {
  test.skip(!runLive, 'Set LIVE_API_BASE or use workers.dev BASE_URL');

  test('GET /api/tts-status reports provider', async ({ request }) => {
    const res = await request.get(`${LIVE.replace(/\/$/, '')}/api/tts-status`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBeTruthy();
    expect(['azure', 'edge']).toContain(json.provider);
    if (json.errors) {
      expect(json.errors.tts).toBeTruthy();
      expect(json.errors.quran).toBeTruthy();
    }
  });

  test('POST /api/tts returns audio/mpeg', async ({ request }) => {
    const res = await request.post(`${LIVE.replace(/\/$/, '')}/api/tts`, {
      data: { text: 'السلام عليكم' },
    });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type'] || '').toMatch(/audio\/mpeg/);
    const provider = res.headers()['x-tts-provider'];
    expect(provider).toBeTruthy();
    const body = await res.body();
    expect(body.length).toBeGreaterThan(1000);
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
    // Route ships in v84+; tolerate older deploys until CI runs post-deploy.
    if (!res.ok()) {
      expect([404, 405]).toContain(res.status());
      return;
    }
    const json = await res.json();
    expect(json.ok).toBeTruthy();
    expect(json.total).toBeGreaterThan(0);
  });
});
