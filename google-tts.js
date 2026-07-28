/** Google Cloud Text-to-Speech (paid; primary fallback candidate for Allah). */

export const DEFAULT_GOOGLE_ARABIC_VOICE = 'ar-XA-Chirp3-HD-Achernar';
export const FALLBACK_GOOGLE_ARABIC_VOICE = 'ar-XA-Wavenet-B';

const GOOGLE_TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripTtsPunctuation(text) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildGoogleSsml(text) {
  const clean = stripTtsPunctuation(text);
  return (
    `<speak version="1.0" xml:lang="ar-XA">` +
    `<prosody rate="92%">${escapeXml(clean)}</prosody>` +
    `</speak>`
  );
}

export function googleTtsConfigured(env) {
  return !!String(env?.GOOGLE_TTS_API_KEY || '').trim();
}

export async function synthesizeGoogleArabicSpeech(text, voiceName, env) {
  const apiKey = String(env?.GOOGLE_TTS_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Google TTS not configured (missing GOOGLE_TTS_API_KEY)');
  }

  const voice = String(voiceName || DEFAULT_GOOGLE_ARABIC_VOICE).trim() || DEFAULT_GOOGLE_ARABIC_VOICE;
  const url = `${GOOGLE_TTS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    input: { ssml: buildGoogleSsml(text) },
    voice: {
      languageCode: voice.startsWith('ar-') ? voice.split('-').slice(0, 2).join('-') : 'ar-XA',
      name: voice,
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.92,
      pitch: 0,
      effectsProfileId: ['small-bluetooth-speaker-class-device'],
    },
    advancedVoiceOptions: {
      lowLatencyJourneySynthesis: false,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Google TTS ${res.status}: ${detail.slice(0, 220)}`);
  }

  const json = await res.json();
  const audio = String(json?.audioContent || '');
  if (!audio) {
    throw new Error('Google TTS returned empty audioContent');
  }

  const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
