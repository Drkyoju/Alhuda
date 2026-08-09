# Lemma TTS clips (Fish Hakim, Whisper-verified)

Short pre-recorded MP3s for lemmas where **live** Fish Hakim randomly mixes ذ/د
(especially ذباب → دباب/دبّابة).

- Served by `server.mjs` `/api/tts` when the request bare-key matches `manifest.json`.
- UI display text is unchanged.
- Regenerate: `node scripts/harvest_dhubab_lemma_clips.mjs --local-fish`

Do **not** put secrets here. Clips are voice audio only.
