/** Save ElevenLabs Yousef MP3 to disk (for one-time bake script). */
import { writeFileSync } from 'fs';
import {
  DEFAULT_ELEVENLABS_VOICE_ID,
  normalizeForElevenLabs,
  synthesizeElevenLabsArabicSpeech,
} from '../elevenlabs-tts.js';

export async function elevenLabsTtsSave(text, filePath, env = process.env) {
  const stream = await synthesizeElevenLabsArabicSpeech(text, DEFAULT_ELEVENLABS_VOICE_ID, env);
  const reader = stream.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) chunks.push(value);
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  if (buf.length < 500) throw new Error('empty audio');
  writeFileSync(filePath, buf);
}

/** Same normalization the live Worker uses before synthesis. */
export function normalizeBakeText(text) {
  return normalizeForElevenLabs(text);
}
