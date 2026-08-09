# Lemma TTS clips (Fish Hakim, Whisper-verified)

Short pre-recorded MP3s for lemmas where **live** Fish Hakim is unreliable:

- ذباب → دباب/دبّابة (ذ/د mix)
- لا ضرر ولا ضرار → Whisper «اللاضر» (لا+ضرر merge)

- Served by `server.mjs` `/api/tts` when the request bare-key matches `manifest.json`.
- UI display text is unchanged; iʿrāb on spoken form stays نصب (ضررَ / ضرارَ).
- Regenerate: `node scripts/harvest_dhubab_lemma_clips.mjs --local-fish`
  and `node scripts/harvest_darar_lemma_clip.mjs --local-fish`

Do **not** put secrets here. Clips are voice audio only.
