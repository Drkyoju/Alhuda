/** Microsoft Edge neural TTS (Worker-native fallback when Azure key is absent). */

export const DEFAULT_ARABIC_VOICE = 'ar-SA-ZariyahNeural';
export const FALLBACK_ARABIC_VOICE = 'ar-SA-HamedNeural';

const READALOUD_BASE = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SYNTHESIS_URL = `https://${READALOUD_BASE}/edge/v1`;
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

const BASE_HEADERS = {
  'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
  'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.8',
};

const UPGRADE_HEADERS = {
  ...BASE_HEADERS,
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
  'Sec-WebSocket-Version': '13',
  Upgrade: 'websocket',
};

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

function removeInvalidXmlCharacters(text) {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
}

function makeConnectionId(crypto) {
  return crypto.randomUUID().replace(/-/g, '');
}

function makeMuid(crypto) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function makeSecMsGec(crypto) {
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
  const url = new URL(SYNTHESIS_URL);
  url.searchParams.set('TrustedClientToken', TRUSTED_CLIENT_TOKEN);
  url.searchParams.set('Sec-MS-GEC', secMsGec);
  url.searchParams.set('Sec-MS-GEC-Version', SEC_MS_GEC_VERSION);
  url.searchParams.set('ConnectionId', connectionId);
  return url.toString();
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
  const hasHarakat = /[\u064B-\u065F\u0670]/.test(text);
  const rate = hasHarakat ? '-12%' : '-8%';
  const parts = String(text || '').split(/([،.؟!؛\n]+)/);
  let body = '';
  for (const part of parts) {
    if (!part) continue;
    if (/^[،.؟!؛\n]+$/.test(part)) {
      body += escapeXml(part) + "<break time='260ms'/>";
    } else {
      body += escapeXml(removeInvalidXmlCharacters(part));
    }
  }
  const ssml =
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ar-SA'>" +
    `<voice name='${voice}'>` +
    `<prosody rate="${rate}" pitch="+0%">${body}</prosody>` +
    '</voice></speak>';
  return (
    `X-RequestId:${requestId}\r\n` +
    'Content-Type:application/ssml+xml\r\n' +
    `X-Timestamp:${timestamp()}Z\r\n` +
    'Path:ssml\r\n\r\n' +
    ssml
  );
}

function parseTextHeaders(message) {
  const separator = message.indexOf('\r\n\r\n');
  const headerText = separator >= 0 ? message.slice(0, separator) : message;
  const headers = {};
  for (const line of headerText.split('\r\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;
    headers[line.slice(0, colonIndex)] = line.slice(colonIndex + 1).trim();
  }
  return headers;
}

function parseBinaryAudioFrame(data) {
  const headerLength = (data[0] << 8) | data[1];
  const headerText = new TextDecoder().decode(data.slice(2, 2 + headerLength));
  const headers = {};
  for (const line of headerText.split('\r\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;
    headers[line.slice(0, colonIndex)] = line.slice(colonIndex + 1).trim();
  }
  return { headers, body: data.slice(2 + headerLength) };
}

async function toUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  return null;
}

function createReadableAudioStream(socket, text, voice, requestId) {
  let controllerRef = null;
  let audioReceived = false;
  let settled = false;

  const cleanup = () => {
    socket.removeEventListener('message', onMessage);
    socket.removeEventListener('close', onClose);
    socket.removeEventListener('error', onError);
  };

  const finishWithError = (error) => {
    if (settled) return;
    settled = true;
    cleanup();
    controllerRef?.error(error instanceof Error ? error : new Error(String(error)));
  };

  const finish = () => {
    if (settled) return;
    settled = true;
    cleanup();
    controllerRef?.close();
  };

  const onMessage = (event) => {
    if (settled) return;
    const { data } = event;

    if (typeof data === 'string') {
      const headers = parseTextHeaders(data);
      if (headers.Path === 'turn.end') {
        try { socket.close(); } catch { finish(); }
        return;
      }
      if (headers.Path === 'response' || headers.Path === 'turn.start' || headers.Path === 'audio.metadata') return;
      finishWithError(new Error(`unexpected path: ${headers.Path}`));
      return;
    }

    Promise.resolve(toUint8Array(data)).then((binary) => {
      if (!binary || settled) return;
      const { headers, body } = parseBinaryAudioFrame(binary);
      if (headers.Path !== 'audio') throw new Error(`unexpected binary path: ${headers.Path}`);
      if (headers['Content-Type'] !== 'audio/mpeg' && body.length > 0) {
        throw new Error(`unexpected content type: ${headers['Content-Type']}`);
      }
      if (body.length) {
        audioReceived = true;
        controllerRef?.enqueue(body);
      }
    }).catch(finishWithError);
  };

  const onClose = () => {
    if (!audioReceived) finishWithError(new Error('no audio received'));
    else finish();
  };

  const onError = (event) => finishWithError(event);

  return new ReadableStream({
    start(controller) {
      controllerRef = controller;
      socket.addEventListener('message', onMessage);
      socket.addEventListener('close', onClose);
      socket.addEventListener('error', onError);
      socket.accept();
      socket.send(buildSpeechConfigMessage());
      socket.send(buildSsmlMessage(requestId, voice, text));
    },
    cancel() {
      settled = true;
      cleanup();
      try { socket.close(1000, 'cancelled'); } catch { /* ignore */ }
    },
  });
}

export async function synthesizeArabicSpeech(text, voiceShortName = DEFAULT_ARABIC_VOICE) {
  const crypto = globalThis.crypto;
  const secMsGec = await makeSecMsGec(crypto);
  const connectionId = makeConnectionId(crypto);
  const websocketUrl = buildSynthesisUrl(secMsGec, connectionId);
  const response = await fetch(websocketUrl, {
    headers: {
      ...UPGRADE_HEADERS,
      Cookie: `muid=${makeMuid(crypto)};`,
    },
  });

  if (response.status !== 101 || !response.webSocket) {
    throw new Error(`WebSocket upgrade failed: ${response.status}`);
  }

  return createReadableAudioStream(
    response.webSocket,
    text,
    normalizeVoiceName(voiceShortName),
    makeConnectionId(crypto),
  );
}
