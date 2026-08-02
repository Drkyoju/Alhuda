/** Save Fish Audio MP3 to disk (for one-time bake script). */
import { writeFileSync } from 'fs';
import {
  DEFAULT_FISH_VOICE_ID,
  synthesizeFishArabicSpeech,
} from '../fish-audio-tts.js';

export async function fishAudioTtsSave(text, filePath, env = process.env) {
  const stream = await synthesizeFishArabicSpeech(
    text,
    env.FISH_VOICE_ID || DEFAULT_FISH_VOICE_ID,
    env
  );
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
