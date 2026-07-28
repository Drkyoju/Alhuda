/**
 * Node Edge TTS (same protocol as edge-tts.js worker) — free, no API key.
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { webcrypto } from 'crypto';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const READALOUD_BASE = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const crypto = webcrypto;

function normalizeVoiceName(voice) {
  const trimmed = voice.trim();
  const shortMatch = /^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/.exec(trimmed);
  if (!shortMatch) return trimmed;
  const [, lang, region, name] = shortMatch;
  return `Microsoft Server Speech Text to Speech Voice (${lang}-${region}, ${name})`;
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeConnectionId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function makeMuid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function makeSecMsGec() {
  const winEpoch = 11644473600;
  const secondsToNs = 1e9;
  let ticks = Date.now() / 1000;
  ticks += winEpoch;
  ticks -= ticks % 300;
  ticks *= secondsToNs / 100;
  const payload = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function buildSynthesisUrl(secMsGec, connectionId) {
  return (
    `wss://${READALOUD_BASE}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`
  );
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, -1);
}

function buildSpeechConfigMessage() {
  return (
    `X-Timestamp:${timestamp()}\r\n` +
    'Content-Type:application/json; charset=utf-8\r\n' +
    'Path:speech.config\r\n\r\n' +
    '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
  );
}

function buildSsmlMessage(requestId, voice, text) {
  const body = escapeXml(
    String(text || '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
      .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
  const ssml =
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ar-SA'>" +
    `<voice name='${voice}'>` +
    `<prosody rate="-3%">${body}</prosody>` +
    '</voice></speak>';
  return (
    `X-RequestId:${requestId}\r\n` +
    'Content-Type:application/ssml+xml\r\n' +
    `X-Timestamp:${timestamp()}Z\r\n` +
    'Path:ssml\r\n\r\n' +
    ssml
  );
}

export async function edgeTtsToBuffer(text, voiceShortName = 'ar-SA-HamedNeural') {
  const secMsGec = await makeSecMsGec();
  const connectionId = makeConnectionId();
  const voice = normalizeVoiceName(voiceShortName);
  const url = buildSynthesisUrl(secMsGec, connectionId);
  const requestId = makeConnectionId();

  return new Promise((resolve, reject) => {
    const chunks = [];
    const ws = new WebSocket(url, {
      headers: {
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
        'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.8',
        Cookie: `muid=${makeMuid()};`,
      },
    });

    ws.on('open', () => {
      ws.send(buildSpeechConfigMessage());
      ws.send(buildSsmlMessage(requestId, voice, text));
    });

    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        if (data.toString('utf8').includes('turn.end')) {
          ws.close();
          resolve(Buffer.concat(chunks));
        }
        return;
      }
      const buf = Buffer.from(data);
      const marker = Buffer.from('Path:audio\r\n');
      const idx = buf.indexOf(marker);
      if (idx >= 0) chunks.push(buf.subarray(idx + marker.length));
    });

    ws.on('error', reject);
    ws.on('close', () => {
      if (chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error('no audio received'));
    });
  });
}

export async function edgeTtsSave(text, filePath, voice = 'ar-SA-HamedNeural') {
  const buf = await edgeTtsToBuffer(text, voice);
  writeFileSync(filePath, buf);
}
