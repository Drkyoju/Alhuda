/** Azure Cognitive Services Speech — Neural TTS (Free F0: 0.5M chars/month). */

export const DEFAULT_AZURE_ARABIC_VOICE = 'ar-SA-HamedNeural';
export const FALLBACK_AZURE_ARABIC_VOICE = 'ar-EG-SalmaNeural';

const OUTPUT_FORMAT = 'audio-16khz-128kbitrate-mono-mp3';

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSsml(text, voice, rate = '-5%') {
  const lang = String(voice).startsWith('ar-EG') ? 'ar-EG' : 'ar-SA';
  const safe = escapeXml(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  // Slightly slower helps diacritics and religious terms land clearly.
  return (
    `<speak version="1.0" xml:lang="${lang}">` +
    `<voice name="${escapeXml(voice)}">` +
    `<prosody rate="${rate}">${safe}</prosody>` +
    `</voice></speak>`
  );
}

/**
 * Synthesize Arabic speech via Azure Speech REST.
 * Requires env: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (e.g. eastus, westeurope).
 * Free F0 tier: 500,000 characters / month.
 */
export async function synthesizeAzureArabicSpeech(text, voiceShortName, env) {
  const key = env?.AZURE_SPEECH_KEY;
  const region = env?.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error('Azure Speech not configured (missing AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)');
  }
  const voice = (voiceShortName || DEFAULT_AZURE_ARABIC_VOICE).trim() || DEFAULT_AZURE_ARABIC_VOICE;
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
      'User-Agent': 'AlhudaApp',
    },
    body: buildSsml(text, voice),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Azure TTS ${res.status}: ${detail.slice(0, 180)}`);
  }
  return res.body;
}

export function azureSpeechConfigured(env) {
  return !!(env?.AZURE_SPEECH_KEY && env?.AZURE_SPEECH_REGION);
}
